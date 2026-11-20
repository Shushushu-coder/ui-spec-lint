# ui-spec-lint

**Design-system contract linter.** Checks the rules a design system actually rests on — token discipline, component reuse, interaction-state contracts and motion budget — not just class ordering.

Two-layer design:

- **Engine** (this CLI): mechanical rules an AST can decide. Zero-config on a Next.js / Tailwind codebase, JSON output for CI.
- **Skill layer** ([`SKILL.md`](./SKILL.md)): judgment rules for agents — emphasis hierarchy, async-state contracts, shared-component bypass, unsaved-state guards. Install `SKILL.md` as an agent skill and the agent runs the CLI first, then applies the J-rules on top.

## Requirements

- Node.js ≥ 20
- TypeScript / TSX / JSX / CSS files to scan (React + Tailwind codebase assumed)

## Installation

```bash
npm install -D ui-spec-lint
# or
pnpm add -D ui-spec-lint
```

Or run without installing:

```bash
npx ui-spec-lint
```

## Usage

```bash
ui-spec-lint                          # scan the current project, zero config
ui-spec-lint src/                     # scan a subtree
ui-spec-lint --init                   # write ui-spec.config.json with detected defaults
ui-spec-lint --format json            # JSON output (for CI / downstream tools)
ui-spec-lint --fail-on warn           # exit 1 on any warning or error
ui-spec-lint --max-duration 200       # override motion budget for this run
ui-spec-lint --token-source src/app/globals.css
```

Example output:

```
src/components/ProviderCard.tsx
   42:7   error   no-hardcoded-color       hardcoded color #F5F5F5 — use a semantic token instead
   58:11  warn    motion-budget            duration-500 exceeds the 300ms motion budget
   87:5   error   clickable-needs-a11y     <div> with onClick is not keyboard-accessible — add role/tabIndex/onKeyDown, or use <button>

✖ 3 problems (2 errors, 1 warning, 0 info)
```

Exit code is `0` when no findings meet the `--fail-on` threshold (default: `error`), `1` otherwise.

## Engine rules

| Rule | Default | What it catches |
|---|---|---|
| `no-hardcoded-color` | error | `#hex` / `rgb()` / `hsl()` / `oklch()` literals in strings and CSS. Token-source CSS file exempt; `--var:` declarations exempt. `bg-white` / `text-black` named neutrals that bypass tokens. |
| `arbitrary-value-limit` | warn | More than `maxArbitraryPerFile` (default 12) `[347px]`-style escapes in one file. |
| `no-layout-animation` | warn | `transition-all`, `transition-[width …]` on layout properties, framer-motion attributes animating `width` / `height` / `margin` etc. |
| `motion-budget` | warn | `duration-N` classes, framer `transition={{ duration }}`, and CSS transition / animation durations over `maxDurationMs` (default 300 ms). Infinite CSS animations are exempt. |
| `clickable-needs-a11y` | error | `onClick` on non-interactive elements (`div`, `span`, `li` …) without `role` / `tabIndex` / key handler. Elements with spread attributes are skipped. |
| `icon-button-needs-name` | warn | `<button>` rendering only icon elements with no `aria-label` / `aria-labelledby` / `title`. |
| `no-raw-toast` | warn | Direct `sonner` / toast-lib imports outside the shared wrapper paths (`toastWrapper`). |
| `reduced-motion-missing` | info | Project ships motion but nothing matches `prefers-reduced-motion` / `useReducedMotion` / `reducedMotion`. |

Judgment rules (`single-emphasis-action`, `async-state-contract`, `shared-component-bypass`, `unsaved-state-guard`, `hierarchy-by-structure`) live in `SKILL.md` — they require semantic reading, so agents apply them.

## Config

Run `ui-spec-lint --init` to scaffold `ui-spec.config.json` with auto-detected defaults. All keys are optional.

```json
{
  "tokenSource": "src/app/globals.css",
  "toastWrapper": ["lib/toast", "ui/toast"],
  "sharedComponents": "src/components/ui",
  "maxDurationMs": 300,
  "maxArbitraryPerFile": 12,
  "rules": {
    "arbitrary-value-limit": "off",
    "motion-budget": "warn"
  }
}
```

| Key | Default | Description |
|---|---|---|
| `tokenSource` | auto-detected | CSS file holding design tokens; exempt from hardcoded-color checks. Auto-detected from common `globals.css` locations when unset. |
| `toastWrapper` | `["lib/toast", "ui/toast", "components/toast", "toast.ts"]` | Path fragments identifying the shared toast wrapper. Files matching any fragment may import toast libs directly. |
| `sharedComponents` | — | Shared component directory (used by the skill layer). |
| `maxDurationMs` | `300` | Motion budget in milliseconds. |
| `maxArbitraryPerFile` | `12` | Threshold for `arbitrary-value-limit`. |
| `rules` | `{}` | Per-rule severity overrides: `"off" \| "info" \| "warn" \| "error"`. |

### CLI flags

All config keys can be overridden per-run:

```
--token-source <path>      override tokenSource
--max-duration <ms>        override maxDurationMs
--max-arbitrary <n>        override maxArbitraryPerFile
--toast-wrapper <frag>     add a toastWrapper fragment (repeatable)
--format text|json         output format (default: text)
--fail-on error|warn|info|never   exit-code threshold (default: error)
--config <path>            path to config file (default: ui-spec.config.json)
--init [--force]           scaffold config file
```

## CI

```yaml
# .github/workflows/lint.yml
- run: npx ui-spec-lint --format json --fail-on warn > ui-spec-report.json || true
- uses: actions/upload-artifact@v4
  with:
    name: ui-spec-report
    path: ui-spec-report.json
```

Or fail the build directly:

```yaml
- run: npx ui-spec-lint --fail-on error
```

## Why a separate tool

`jsx-a11y` covers accessibility, `eslint-plugin-tailwindcss` covers class order, Stylelint plugins cover token syntax. None of them check the *behavioral contract* layer — one primary action per view, async actions that expose their lifecycle, motion staying inside a budget, shared components not being re-implemented locally. `ui-spec-lint` treats the design doc as executable rules: the design system is the spec, the linter is the enforcement.

## Development

```bash
pnpm install
pnpm build          # tsc → dist/
```

The build output lands in `dist/`. Source maps and `.d.ts` declarations are emitted alongside each `.js` file.

## Notes & limits

- React / JSX + Tailwind-oriented; rule set tuned for utility-class codebases. CSS rules apply to any `.css` file.
- Heuristics prefer silence over noise: spread attributes, non-literal children and dynamic expressions skip checks rather than guess.
- Not a substitute for design review — it encodes the floor, not the ceiling.

## License

MIT
