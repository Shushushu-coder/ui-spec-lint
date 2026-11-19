#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, severityOf, type Severity, type UiSpecConfig } from "./config.js";
import { formatJson, formatText, shouldFail, type FailOn } from "./report.js";
import { projectChecks, rules, type Ctx, type Finding } from "./rules.js";
import { collectDocs } from "./scan.js";

const HELP = `ui-spec-lint — design-system contract linter

Usage:
  ui-spec-lint [dir] [options]

Options:
  --init                  Write a ui-spec.config.json with detected defaults.
  --force                 Overwrite an existing config with --init.
  --config <path>         Config file path (default: ./ui-spec.config.json).
  --format <text|json>    Output format. Default: text
  --fail-on <level>       error | warn | info | never. Default: error
  --max-duration <ms>     Motion budget in ms. Default: 300
  --max-arbitrary <n>     Max arbitrary Tailwind values per file. Default: 12
  --token-source <path>   CSS file that holds design tokens (exempt from
                          hardcoded-color checks). Auto-detected otherwise.
  --toast-wrapper <frag>  Path fragment allowed to import toast libs directly.
                          Repeatable.
  -h, --help              Show this help.

Per-rule severity lives in ui-spec.config.json → "rules": { "<id>": "off|info|warn|error" }.
`;

function writeInitConfig(dir: string, force: boolean): number {
  const path = join(dir, "ui-spec.config.json");
  if (existsSync(path) && !force) {
    console.error(`error: ${path} already exists (pass --force to overwrite)`);
    return 2;
  }
  const config = loadConfig(dir);
  const tokenRel = config.tokenSource?.startsWith(dir)
    ? config.tokenSource.slice(dir.length + 1)
    : config.tokenSource;
  const skeleton = {
    ...(tokenRel ? { tokenSource: tokenRel.replace(/\\/g, "/") } : {}),
    toastWrapper: config.toastWrapper,
    maxDurationMs: config.maxDurationMs,
    maxArbitraryPerFile: config.maxArbitraryPerFile,
    rules: {},
  };
  writeFileSync(path, JSON.stringify(skeleton, null, 2) + "\n", "utf8");
  console.log(`wrote ${path}`);
  return 0;
}

function main(): number {
  const { values, positionals } = parseArgs({
    options: {
      init: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      config: { type: "string" },
      format: { type: "string", default: "text" },
      "fail-on": { type: "string", default: "error" },
      "max-duration": { type: "string" },
      "max-arbitrary": { type: "string" },
      "token-source": { type: "string" },
      "toast-wrapper": { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const dir = resolve(positionals[0] ?? ".");
  if (values.init) return writeInitConfig(dir, values.force ?? false);

  const config: UiSpecConfig = loadConfig(dir);
  if (values["max-duration"]) config.maxDurationMs = Number(values["max-duration"]);
  if (values["max-arbitrary"]) {
    config.maxArbitraryPerFile = Number(values["max-arbitrary"]);
  }
  if (values["token-source"]) {
    config.tokenSource = resolve(dir, values["token-source"]);
  } else if (config.tokenSource && !isAbsolute(config.tokenSource)) {
    config.tokenSource = resolve(dir, config.tokenSource);
  }
  if (values["toast-wrapper"]?.length) {
    config.toastWrapper = values["toast-wrapper"];
  }

  const docs = collectDocs(dir);
  const ctx: Ctx = { config, docs };
  const findings: Finding[] = [];

  for (const doc of docs) {
    for (const rule of rules) {
      const sev = severityOf(config, rule.id, rule.severity);
      if (sev === "off") continue;
      for (const f of rule.run(doc, ctx)) {
        findings.push({ ...f, severity: sev });
      }
    }
  }
  findings.push(...projectChecks(ctx));

  if ((values.format ?? "text") === "json") {
    console.log(formatJson(findings));
  } else {
    console.log(formatText(findings));
  }

  return shouldFail(findings, (values["fail-on"] ?? "error") as FailOn) ? 1 : 0;
}

process.exitCode = main();
