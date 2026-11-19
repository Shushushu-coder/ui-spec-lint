import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

export interface SourceDoc {
  file: string;
  text: string;
  isCss: boolean;
  sf?: ts.SourceFile;
}

const CODE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]);
const CSS_EXT = new Set([".css"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
]);

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx") || file.endsWith(".js")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

export function collectDocs(dir: string, out: SourceDoc[] = []): SourceDoc[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) collectDocs(full, out);
      continue;
    }
    const ext = extname(full);
    if (!CODE_EXT.has(ext) && !CSS_EXT.has(ext)) continue;
    const text = readFileSync(full, "utf8");
    const doc: SourceDoc = { file: full, text, isCss: CSS_EXT.has(ext) };
    if (!doc.isCss) {
      doc.sf = ts.createSourceFile(
        full,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(full),
      );
    }
    out.push(doc);
  }
  return out;
}

export function* walkNodes(root: ts.Node): Iterable<ts.Node> {
  yield root;
  for (const child of root.getChildren()) {
    yield* walkNodes(child);
  }
}

export function posOf(
  sf: ts.SourceFile,
  pos: number,
): { line: number; col: number } {
  const p = sf.getLineAndCharacterOfPosition(pos);
  return { line: p.line + 1, col: p.character + 1 };
}

export function lineOf(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let last = 0;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      last = i + 1;
    }
  }
  return { line, col: index - last + 1 };
}

const CLASS_ATTRS = new Set(["className", "class", "tw"]);
const CLASS_FNS = new Set([
  "clsx",
  "cn",
  "cva",
  "cx",
  "classNames",
  "classnames",
  "twMerge",
]);

export interface ClassString {
  text: string;
  line: number;
  col: number;
}

function literalText(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isTemplateExpression(expr)) return expr.getText();
  return null;
}

/** class-ish strings: className/class/tw attribute values + args of clsx/cn/cva/twMerge. */
export function classStrings(doc: SourceDoc): ClassString[] {
  if (!doc.sf) return [];
  const out: ClassString[] = [];
  const push = (text: string | null, pos: number): void => {
    if (text === null) return;
    const at = posOf(doc.sf!, pos);
    out.push({ text, ...at });
  };
  for (const node of walkNodes(doc.sf)) {
    if (ts.isJsxAttribute(node) && CLASS_ATTRS.has(node.name.getText())) {
      const init = node.initializer;
      if (!init) continue;
      if (ts.isStringLiteral(init)) push(init.text, init.getStart());
      else if (ts.isJsxExpression(init) && init.expression) {
        push(literalText(init.expression) ?? init.expression.getText(), init.getStart());
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CLASS_FNS.has(node.expression.text)
    ) {
      for (const arg of node.arguments) {
        push(literalText(arg) ?? arg.getText(), arg.getStart());
      }
    }
  }
  return out;
}

export function* jsxElements(
  doc: SourceDoc,
): Iterable<ts.JsxSelfClosingElement | ts.JsxElement> {
  if (!doc.sf) return;
  for (const node of walkNodes(doc.sf)) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      yield node;
    }
  }
}

export function openingOf(
  el: ts.JsxOpeningLikeElement | ts.JsxElement,
): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(el) ? el.openingElement : el;
}

export function tagName(el: ts.JsxOpeningLikeElement): string {
  return el.tagName.getText();
}

export function attrNames(el: ts.JsxOpeningLikeElement): Set<string> {
  const names = new Set<string>();
  for (const prop of el.attributes.properties) {
    if (ts.isJsxAttribute(prop)) names.add(prop.name.getText());
  }
  return names;
}

export function hasSpreadAttr(el: ts.JsxOpeningLikeElement): boolean {
  return el.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p));
}

export function getAttr(
  el: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const prop of el.attributes.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name) return prop;
  }
  return undefined;
}

export function* importDecls(
  doc: SourceDoc,
): Iterable<ts.ImportDeclaration> {
  if (!doc.sf) return;
  for (const stmt of doc.sf.statements) {
    if (ts.isImportDeclaration(stmt)) yield stmt;
  }
}
