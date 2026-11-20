import ts from "typescript";
import type { Severity, UiSpecConfig } from "./config.js";
import {
  attrNames,
  classStrings,
  hasSpreadAttr,
  importDecls,
  jsxElements,
  openingOf,
  posOf,
  tagName,
  walkNodes,
  type SourceDoc,
} from "./scan.js";

export interface Finding {
  file: string;
  line: number;
  col: number;
  severity: Severity;
  rule: string;
  message: string;
}

export interface Ctx {
  config: UiSpecConfig;
  docs: SourceDoc[];
}

export interface Rule {
  id: string;
  severity: Severity;
  description: string;
  run(doc: SourceDoc, ctx: Ctx): Finding[];
}

const HEX_RE = /(?:^|[^\w])#(?:[0-9a-fA-F]{3,4}\b|[0-9a-fA-F]{6}\b|[0-9a-fA-F]{8}\b)/g;
const COLOR_FN_RE = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/gi;
const NAMED_NEUTRAL_RE =
  /(^|[\s"'`{(])(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|caret|accent|shadow)-(?:white|black)(?![\w-])/g;
const ARBITRARY_RE = /\[[^\s\]]*\d[^\s\]]*\]/g;
const TRANSITION_ALL_RE = /(^|\s)transition-all\b/g;
const TRANSITION_ARBITRARY_RE = /\btransition-\[([^\]]+)\]/g;
const DURATION_CLASS_RE = /\bduration-(\d{2,5})\b/g;
const CUSTOM_PROP_LINE_RE = /^\s*--[\w-]+\s*:/;

const LAYOUT_PROPS = new Set([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "left",
  "right",
  "bottom",
  "inset",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "flexGrow",
  "flexBasis",
  "size",
]);

const MOTION_ATTRS = new Set([
  "animate",
  "initial",
  "exit",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "variants",
  "transition",
]);

const NON_INTERACTIVE_TAGS = new Set([
  "div",
  "span",
  "p",
  "li",
  "ul",
  "ol",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "tr",
  "td",
  "th",
  "table",
  "figure",
  "figcaption",
  "dl",
  "dt",
  "dd",
]);

const CLICK_HANDLERS = new Set(["onClick", "onDoubleClick"]);

const KEY_HANDLERS = new Set(["onKeyDown", "onKeyUp", "onKeyPress"]);
const NAME_ATTRS = new Set(["aria-label", "aria-labelledby", "title"]);
const TOAST_MODULE_RE = /sonner|react-hot-toast|react-toastify|react-toast\b/;

function find(
  doc: SourceDoc,
  rule: string,
  severity: Severity,
  at: { line: number; col: number },
  message: string,
): Finding {
  return { file: doc.file, ...at, severity, rule, message };
}

function* literalNodes(doc: SourceDoc): Iterable<ts.Node> {
  if (!doc.sf) return;
  for (const node of walkNodes(doc.sf)) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      // Skip module specifiers — paths are not UI copy.
      const parent = node.parent;
      if (
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isImportTypeNode(parent)
      ) {
        continue;
      }
      yield node;
    }
  }
}

export const rules: Rule[] = [
  {
    id: "no-hardcoded-color",
    severity: "error",
    description:
      "Raw color literals and named neutral utilities must come from design tokens.",
    run(doc, ctx) {
      const findings: Finding[] = [];
      const sev = this.severity;
      if (doc.isCss) {
        if (ctx.config.tokenSource && doc.file === ctx.config.tokenSource) {
          return findings;
        }
        const lines = doc.text.split("\n");
        lines.forEach((line, i) => {
          if (CUSTOM_PROP_LINE_RE.test(line) || line.trim().startsWith("//")) {
            return;
          }
          const hit = line.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/);
          if (hit) {
            findings.push(
              find(doc, this.id, sev, { line: i + 1, col: hit.index! + 1 },
                `hardcoded color "${hit[0]}" — move it behind a design token`),
            );
          }
        });
        return findings;
      }
      for (const node of literalNodes(doc)) {
        const text = node.getText();
        HEX_RE.lastIndex = 0;
        COLOR_FN_RE.lastIndex = 0;
        const hex = HEX_RE.exec(text);
        const fn = COLOR_FN_RE.exec(text);
        const hit = hex?.index !== undefined && (fn === null || hex.index <= fn.index)
          ? { value: hex[0].trimStart(), index: hex.index }
          : fn
            ? { value: fn[0], index: fn.index }
            : null;
        if (hit) {
          findings.push(
            find(doc, this.id, sev, posOf(doc.sf!, node.getStart()),
              `hardcoded color ${hit.value} — use a semantic token instead`),
          );
        }
      }
      for (const cs of classStrings(doc)) {
        NAMED_NEUTRAL_RE.lastIndex = 0;
        const m = NAMED_NEUTRAL_RE.exec(cs.text);
        if (m) {
          findings.push(
            find(doc, this.id, sev, { line: cs.line, col: cs.col },
              `named neutral utility "${m[0].trim()}" bypasses design tokens (bg-white/text-black etc. don't theme)`),
          );
        }
      }
      return findings;
    },
  },
  {
    id: "arbitrary-value-limit",
    severity: "warn",
    description:
      "Cap the number of arbitrary Tailwind values per file — escapes erode the token system.",
    run(doc, ctx) {
      if (doc.isCss) return [];
      let count = 0;
      let first: { line: number; col: number } | undefined;
      for (const cs of classStrings(doc)) {
        ARBITRARY_RE.lastIndex = 0;
        const hits = cs.text.match(ARBITRARY_RE);
        if (hits?.length) {
          count += hits.length;
          first ??= { line: cs.line, col: cs.col };
        }
      }
      const max = ctx.config.maxArbitraryPerFile;
      if (count > max) {
        return [
          find(doc, this.id, this.severity, first!,
            `${count} arbitrary values ([347px]-style) in this file — the design scale stops meaning anything past ${max}`),
        ];
      }
      return [];
    },
  },
  {
    id: "no-layout-animation",
    severity: "warn",
    description:
      "Animating layout properties causes reflow — animate transform/opacity instead.",
    run(doc) {
      const findings: Finding[] = [];
      if (doc.isCss) return findings;
      for (const cs of classStrings(doc)) {
        TRANSITION_ALL_RE.lastIndex = 0;
        if (TRANSITION_ALL_RE.test(cs.text)) {
          findings.push(
            find(doc, this.id, this.severity, { line: cs.line, col: cs.col },
              `"transition-all" animates layout properties implicitly — scope to transform/opacity/color`),
          );
        }
        TRANSITION_ARBITRARY_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = TRANSITION_ARBITRARY_RE.exec(cs.text))) {
          const props = m[1].split(/[\s,]+/).filter(Boolean);
          const bad = props.filter((p) =>
            /^(width|height|min-|max-|margin|padding|top|left|right|bottom|inset|gap|space|size)/.test(p),
          );
          if (bad.length) {
            findings.push(
              find(doc, this.id, this.severity, { line: cs.line, col: cs.col },
                `animating layout propert${bad.length === 1 ? "y" : "ies"} ${bad.join(", ")} triggers reflow — prefer transform/opacity`),
            );
          }
        }
      }
      for (const el of jsxElements(doc)) {
        const open = openingOf(el);
        for (const prop of open.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue;
          const name = prop.name.getText();
          if (!MOTION_ATTRS.has(name)) continue;
          const init = prop.initializer;
          if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
          for (const sub of walkNodes(init.expression)) {
            if (ts.isPropertyAssignment(sub)) {
              const key = sub.name.getText();
              if (LAYOUT_PROPS.has(key)) {
                findings.push(
                  find(doc, this.id, this.severity,
                    posOf(doc.sf!, sub.getStart()),
                    `motion property "${key}" in "${name}" animates layout — use transform (x/y/scale) instead`),
                );
              }
            }
          }
        }
      }
      return findings;
    },
  },
  {
    id: "motion-budget",
    severity: "warn",
    description: "Micro-interaction durations should stay inside the motion budget.",
    run(doc, ctx) {
      const findings: Finding[] = [];
      const maxMs = ctx.config.maxDurationMs;
      if (doc.isCss) {
        const lines = doc.text.split("\n");
        lines.forEach((line, i) => {
          if (!/(?:transition|animation)(-duration)?\s*:/.test(line)) return;
          // Ambient infinite loops are not interaction feedback — exempt.
          if (/\banimation/.test(line) && /\binfinite\b/.test(line)) return;
          for (const m of line.matchAll(/([\d.]+)(ms|s)\b/g)) {
            const ms = m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
            if (ms > maxMs) {
              findings.push(
                find(doc, this.id, this.severity,
                  { line: i + 1, col: (m.index ?? 0) + 1 },
                  `${m[0]} exceeds the ${maxMs}ms motion budget`),
              );
            }
          }
        });
        return findings;
      }
      for (const cs of classStrings(doc)) {
        DURATION_CLASS_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DURATION_CLASS_RE.exec(cs.text))) {
          if (Number(m[1]) > maxMs) {
            findings.push(
              find(doc, this.id, this.severity, { line: cs.line, col: cs.col },
                `duration-${m[1]} exceeds the ${maxMs}ms motion budget`),
            );
          }
        }
      }
      if (doc.sf) {
        const maxS = maxMs / 1000;
        for (const el of jsxElements(doc)) {
          for (const prop of openingOf(el).attributes.properties) {
            if (!ts.isJsxAttribute(prop)) continue;
            if (!MOTION_ATTRS.has(prop.name.getText())) continue;
            const init = prop.initializer;
            if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
            for (const sub of walkNodes(init.expression)) {
              if (
                ts.isPropertyAssignment(sub) &&
                sub.name.getText() === "duration" &&
                ts.isNumericLiteral(sub.initializer)
              ) {
                const secs = Number(sub.initializer.text);
                if (secs > maxS) {
                  findings.push(
                    find(doc, this.id, this.severity,
                      posOf(doc.sf!, sub.getStart()),
                      `duration ${secs}s exceeds the ${maxS}s motion budget`),
                  );
                }
              }
            }
          }
        }
      }
      return findings;
    },
  },
  {
    id: "clickable-needs-a11y",
    severity: "error",
    description:
      "Non-interactive elements with click handlers need role, tabIndex and keyboard support.",
    run(doc) {
      const findings: Finding[] = [];
      if (doc.isCss) return findings;
      for (const el of jsxElements(doc)) {
        const open = openingOf(el);
        const tag = tagName(open);
        if (!NON_INTERACTIVE_TAGS.has(tag)) continue;
        const attrs = attrNames(open);
        const click = [...CLICK_HANDLERS].find((h) => attrs.has(h));
        if (!click) continue;
        if (hasSpreadAttr(open)) continue;
        if (attrs.has("role")) continue;
        if (attrs.has("tabIndex") || attrs.has("tabindex")) continue;
        if ([...KEY_HANDLERS].some((h) => attrs.has(h))) continue;
        findings.push(
          find(doc, this.id, this.severity,
            posOf(doc.sf!, open.getStart()),
            `<${tag}> with ${click} is not keyboard-accessible — add role/tabIndex/onKeyDown, or use <button>`),
        );
      }
      return findings;
    },
  },
  {
    id: "icon-button-needs-name",
    severity: "warn",
    description:
      "Buttons rendering only icons need an accessible name (aria-label / title).",
    run(doc) {
      const findings: Finding[] = [];
      if (!doc.sf) return findings;
      for (const node of jsxElements(doc)) {
        const open = openingOf(node);
        if (tagName(open) !== "button") continue;
        const attrs = attrNames(open);
        if ([...NAME_ATTRS].some((a) => attrs.has(a))) continue;
        if (hasSpreadAttr(open)) continue;
        if (ts.isJsxSelfClosingElement(node)) {
          findings.push(
            find(doc, this.id, this.severity,
              posOf(doc.sf!, open.getStart()),
              `<button /> has no accessible name`),
          );
          continue;
        }
        // Any literal text or unverifiable expression child counts as named.
        let hasName = false;
        let unverifiable = false;
        for (const child of node.children) {
          if (ts.isJsxText(child) && child.getText().trim()) hasName = true;
          if (ts.isJsxExpression(child)) {
            const expr = child.expression;
            if (!expr) continue;
            if (ts.isStringLiteral(expr) && expr.text.trim()) hasName = true;
            else if (!ts.isJsxElement(expr) && !ts.isJsxSelfClosingElement(expr)) {
              unverifiable = true;
            }
          }
        }
        if (hasName || unverifiable) continue;
        findings.push(
          find(doc, this.id, this.severity,
            posOf(doc.sf!, open.getStart()),
            `<button> renders only icon elements — add aria-label or title`),
        );
      }
      return findings;
    },
  },
  {
    id: "no-raw-toast",
    severity: "warn",
    description:
      "Toast calls should go through the shared wrapper so dedup/semantics stay uniform.",
    run(doc, ctx) {
      const findings: Finding[] = [];
      if (doc.isCss) return findings;
      const normalized = doc.file.replace(/\\/g, "/");
      if (ctx.config.toastWrapper.some((frag) => normalized.includes(frag))) {
        return findings;
      }
      for (const imp of importDecls(doc)) {
        const mod = ts.isStringLiteral(imp.moduleSpecifier)
          ? imp.moduleSpecifier.text
          : "";
        if (TOAST_MODULE_RE.test(mod)) {
          findings.push(
            find(doc, this.id, this.severity,
              posOf(doc.sf!, imp.getStart()),
              `direct import from "${mod}" — route through the shared toast wrapper (configure toastWrapper)`),
          );
        }
      }
      return findings;
    },
  },
];

/** Project-level checks that need the full document set. */
export function projectChecks(ctx: Ctx): Finding[] {
  const findings: Finding[] = [];
  let motionDoc: SourceDoc | undefined;
  let hasReducedMotion = false;
  for (const doc of ctx.docs) {
    if (/(prefers-reduced-motion|useReducedMotion|reducedMotion)/.test(doc.text)) {
      hasReducedMotion = true;
    }
    if (!motionDoc && /(transition|animate|duration|animation)/.test(doc.text)) {
      motionDoc = doc;
    }
  }
  if (motionDoc && !hasReducedMotion) {
    findings.push({
      file: motionDoc.file,
      line: 1,
      col: 1,
      severity: "info",
      rule: "reduced-motion-missing",
      message:
        "project ships motion but no prefers-reduced-motion fallback was found — honor reduced-motion preferences",
    });
  }
  return findings;
}
