export { loadConfig, severityOf, DEFAULT_CONFIG, detectTokenSource } from "./config.js";
export type { Severity, UiSpecConfig } from "./config.js";
export { collectDocs, classStrings, jsxElements, walkNodes } from "./scan.js";
export type { ClassString, SourceDoc } from "./scan.js";
export { projectChecks, rules } from "./rules.js";
export type { Ctx, Finding, Rule } from "./rules.js";
export {
  countBySeverity,
  formatJson,
  formatText,
  shouldFail,
  sortFindings,
} from "./report.js";
export type { FailOn } from "./report.js";
