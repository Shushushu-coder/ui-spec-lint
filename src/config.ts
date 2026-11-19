import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Severity = "error" | "warn" | "info";

export interface UiSpecConfig {
  /** CSS file holding design tokens — exempt from hardcoded-color checks. */
  tokenSource?: string;
  /** Path fragments allowed to import toast libs directly. */
  toastWrapper: string[];
  /** Shared component directory (used by the skill layer). */
  sharedComponents?: string;
  /** Motion budget in ms for transition/animation durations. */
  maxDurationMs: number;
  /** Max arbitrary `[123px]` style values per file. */
  maxArbitraryPerFile: number;
  /** Per-rule severity overrides: "off" | "info" | "warn" | "error". */
  rules: Record<string, Severity | "off">;
}

export const DEFAULT_CONFIG: UiSpecConfig = {
  toastWrapper: ["lib/toast", "ui/toast", "components/toast", "toast.ts"],
  maxDurationMs: 300,
  maxArbitraryPerFile: 12,
  rules: {},
};

const TOKEN_CANDIDATES = [
  "src/app/globals.css",
  "app/globals.css",
  "src/index.css",
  "index.css",
  "src/styles/globals.css",
  "styles/globals.css",
  "src/globals.css",
  "globals.css",
];

export function detectTokenSource(dir: string): string | undefined {
  for (const rel of TOKEN_CANDIDATES) {
    const full = join(dir, rel);
    if (existsSync(full)) return full;
  }
  return undefined;
}

export function loadConfig(dir: string): UiSpecConfig {
  const configPath = join(dir, "ui-spec.config.json");
  let fileConfig: Partial<UiSpecConfig> = {};
  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, "utf8"));
  }
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    toastWrapper: fileConfig.toastWrapper ?? DEFAULT_CONFIG.toastWrapper,
    rules: fileConfig.rules ?? {},
    tokenSource:
      fileConfig.tokenSource !== undefined
        ? fileConfig.tokenSource
        : detectTokenSource(dir),
  };
}

export function severityOf(
  config: UiSpecConfig,
  ruleId: string,
  fallback: Severity,
): Severity | "off" {
  return config.rules[ruleId] ?? fallback;
}
