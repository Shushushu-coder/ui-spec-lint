# ui-spec-lint

**Design-system contract linter.** It checks the rules a design system actually
rests on — token discipline, component reuse, interaction-state contracts and
motion budget — not just class ordering.

Two-layer design:

- **Engine** (this CLI): the mechanical rules an AST can decide. Zero-config on a
  Next.js/Tailwind codebase, JSON output for CI.
- **Skill layer** ([`SKILL.md`](./SKILL.md)): judgment rules for agents —
  emphasis hierarchy, async-state contracts, shared-component bypass,
  unsaved-state guards. Install this repo's `SKILL.md` as an agent skill and
  the agent runs the CLI first, then applies the J-rules on top.

## Usage

```bash
npx ui-spec-lint              # scan the current project, zero config
npx ui-spec-lint src/         # scan a subtree
npx ui-spec-lint --init       # write ui-spec.config.json with detected defaults
npx ui-spec-lint --format json --fail-on warn
```

Example output:

```
src/components/ProviderCard.tsx
   42:7   error   no-hardcoded-color       hardcoded color #F5F5F5 — use a semantic token instead
   58:11  warn    motion-budget            duration-500 exceeds the 300ms motion budget
   87:5   error   clickable-needs-a11y     <div> with onClick is not keyboard-accessible — add role/tabIndex/onKeyDown, or use <button>

✖ 3 problems (2 errors, 1 warning, 0 info)
```

## Engine rules

| Rule | Default | What it catches |
| --- | --- | --- |
| `no-hardcoded-color` | error | `#hex`/`rgb()`/`hsl()`/`oklch()` literals in strings and CSS (token-source CSS file exempt, `--var:` declarations exempt); `bg-white`/`text-black` named neutrals that bypass tokens. |
| `arbitrary-value-limit` | warn | More than `maxArbitraryPerFile` `[347px]`-style escapes in one file. |
| `no-layout-animation` | warn | `transition-all`, `transition-[width …]` on layout properties, and framer-motion attributes animating `width`/`height`/`top`/`margin` etc. |
| `motion-budget` | warn | `duration-N` classes, framer `transition={{ duration }}` and CSS transition/animation durations over `maxDurationMs` (default 300). |
| `clickable-needs-a11y` | error | `onClick` on non-interactive elements (`div`, `span`, `li`…) without `role`/`tabIndex`/key handler. |
| `icon-button-needs-name` | warn | `<button>` rendering only icon elements with no `aria-label`/`title`. |
| `no-raw-toast` | warn | Direct `sonner`/toast-lib imports outside the shared wrapper paths (`toastWrapper`). |
| `reduced-motion-missing` | info | Project ships motion but nothing honors `prefers-reduced-motion`. |

Judgment rules (`single-emphasis-action`, `async-state-contract`,
`shared-component-bypass`, `unsaved-state-guard`, `hierarchy-by-structure`)
live in `SKILL.md` — they need semantic reading, so agents apply them.

## Config

`ui-spec.config.json` (all keys optional, `--init` scaffolds it):

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

- `tokenSource` is auto-detected from common globals.css locations when unset.
- `rules` maps rule id → `"off" | "info" | "warn" | "error"`.

## Why a separate tool

`jsx-a11y` covers accessibility, `eslint-plugin-tailwindcss` covers class order,
Stylelint plugins cover token syntax. None of them check the *behavioral
contract* layer — one primary action per view, async actions that expose their
lifecycle, motion staying inside a budget, shared components not being
re-implemented locally. `ui-spec-lint` treats the design doc as executable
rules: the design system is the spec, the linter is the enforcement.

## Notes & limits

- React/JSX + Tailwind-oriented; rule set tuned for utility-class codebases.
  CSS rules apply to any `.css` file.
- Heuristics prefer silence over noise: spread attributes, non-literal children
  and dynamic expressions skip checks rather than guess.
- Not a substitute for design review — it encodes the floor, not the ceiling.

## License

MIT
