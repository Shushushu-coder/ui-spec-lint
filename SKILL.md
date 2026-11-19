---
name: ui-spec-lint
description: Enforce design-system contracts in UI code. Runs the ui-spec-lint CLI for mechanical checks (tokens, a11y, motion budget, raw toast imports), then applies the judgment rules that static analysis cannot decide — emphasis hierarchy, async state contracts, shared-component bypass and unsaved-state guards. Use when reviewing or building React/Tailwind UI against a design system.
---

# UI Spec Lint — agent layer

The CLI handles what an AST can decide. This skill covers what requires reading
the component like a reviewer. Run the engine first; do not re-derive its findings.

## Procedure

1. Run `npx ui-spec-lint --format json` in the project root (or the repo's local
   install). Collect `findings`.
2. Read `ui-spec.config.json` if present — `sharedComponents`, `tokenSource` and
   `toastWrapper` describe the project's own contracts.
3. Triage engine findings: confirm real violations, drop false positives, apply
   rule-level fixes.
4. Apply the judgment rules below to the same files the engine scanned.
5. Report in the engine's finding shape so results compose:

```
<file>:<line>:<col>  <severity>  <rule-id>  <message — what, why, suggested fix>
```

## Judgment rules

### J1 · single-emphasis-action

A view should keep **one** high-emphasis (solid, brand-colored) action. Color is
priority signal, not decoration; two primaries in one view fight each other.

- Scope = the smallest region the user treats as one surface: a card, a dialog,
  a toolbar row, a form section — not the whole page.
- Count visually dominant buttons within each scope: `variant="default"` /
  solid filled styles / brand-accent backgrounds. Ghost, outline, link and
  subtle styles do not count.
- More than one → `warn`, rule `single-emphasis-action`, naming the competing
  actions and which one should demote to a quieter variant.

### J2 · async-state-contract

User-triggered async work must expose its lifecycle in the UI. An action is not
complete when the click handler returns.

- For each submit/save/switch/delete handler that awaits or mutates: locate the
  `pending`/`isLoading`/`disabled` branch and the error path in rendered UI.
- Missing pending state, or success asserted before the promise resolves →
  `error`, rule `async-state-contract`.
- Flag the "fake complete" pattern hardest: state written as if success already
  happened while the request is in flight (optimistic UI without rollback is a
  narrower case — `warn`, still this rule).

### J3 · shared-component-bypass

The shared component exists to own a behavioral contract; rebuilding the pattern
locally forks it.

- Read `ui-spec.config.json → sharedComponents` (default guess: `components/ui`
  or `src/components/ui`) and list its exports.
- Flag locally re-implemented equivalents: raw `<button>` carrying
  variant-looking class stacks when a `Button` exists; hand-rolled overlay /
  `createPortal` + backdrop + Esc handling when a `Dialog`/`Sheet` exists;
  custom tooltip/hover-card markup beside a shared one → `warn`,
  `shared-component-bypass`.
- Do not flag one-off visuals that share no contract with a shared component —
  the rule covers behavioral contracts, not any visual overlap.

### J4 · unsaved-state-guard

Navigation that can discard entered content must confirm first.

- For form/edit surfaces with local dirty state (`useState` values the user
  typed, draft flags): check whether route changes, tab switches, dialog closes
  or unmounts can happen while dirty without a confirm → `warn`,
  `unsaved-state-guard`.
- Read-only or fully controlled/server-persisted state does not trigger this.

### J5 · hierarchy-by-structure

Information hierarchy should come from layout structure first, decoration second.

- When a surface needs >1 visual devices to separate siblings (border + shadow +
  tinted background on every card), note it as `info`,
  `hierarchy-by-structure` — usually a spacing/typography problem dressed as
  decoration. Report as a suggestion, not a violation.

## Dedup & exit

- Drop judgment findings that duplicate an engine finding at the same location.
- Finish with the same summary line as the engine:
  `✖ N problems (E errors, W warnings, I info)`.
