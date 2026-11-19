import type { Severity } from "./config.js";
import type { Finding } from "./rules.js";

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
const RANK: Record<Severity, number> = { error: 3, warn: 2, info: 1 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    a.file === b.file
      ? a.line === b.line
        ? ORDER[a.severity] - ORDER[b.severity] || a.rule.localeCompare(b.rule)
        : a.line - b.line
      : a.file < b.file
        ? -1
        : 1,
  );
}

export function countBySeverity(
  findings: Finding[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function formatText(findings: Finding[]): string {
  const lines: string[] = [];
  let file = "";
  for (const f of sortFindings(findings)) {
    if (f.file !== file) {
      file = f.file;
      lines.push("", file);
    }
    lines.push(
      `  ${String(f.line).padStart(4)}:${String(f.col).padEnd(4)} ${f.severity.padEnd(6)} ${f.rule.padEnd(24)} ${f.message}`,
    );
  }
  const c = countBySeverity(findings);
  lines.push(
    "",
    `✖ ${findings.length} problem${findings.length === 1 ? "" : "s"} (${c.error} error${c.error === 1 ? "" : "s"}, ${c.warn} warning${c.warn === 1 ? "" : "s"}, ${c.info} info)`,
  );
  return lines.join("\n").trimStart();
}

export function formatJson(findings: Finding[]): string {
  return JSON.stringify(
    { findings: sortFindings(findings), summary: countBySeverity(findings) },
    null,
    2,
  );
}

export type FailOn = Severity | "never";

export function shouldFail(findings: Finding[], failOn: FailOn): boolean {
  if (failOn === "never") return false;
  return findings.some((f) => RANK[f.severity] >= RANK[failOn]);
}
