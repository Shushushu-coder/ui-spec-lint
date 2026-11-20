[English](#ui-spec-lint) | [中文](#ui-spec-lint-中文)

---

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

## Notes & limits

- React / JSX + Tailwind-oriented; rule set tuned for utility-class codebases. CSS rules apply to any `.css` file.
- Heuristics prefer silence over noise: spread attributes, non-literal children and dynamic expressions skip checks rather than guess.
- Not a substitute for design review — it encodes the floor, not the ceiling.

## License

MIT

---

[English](#ui-spec-lint) | [中文](#ui-spec-lint-中文)

---

# ui-spec-lint 中文

**设计系统契约检查器。** 检查设计系统真正依赖的规则——Token 纪律、组件复用、交互状态契约和动效预算——而不仅仅是类名排序。

双层设计：

- **引擎层**（本 CLI）：AST 可以判断的机械性规则。在 Next.js / Tailwind 项目上零配置开箱即用，支持 JSON 输出用于 CI。
- **技能层**（[`SKILL.md`](./SKILL.md)）：供 Agent 使用的判断规则——强调层级、异步状态契约、共享组件绕行、未保存状态守卫。将 `SKILL.md` 安装为 Agent 技能，Agent 会先运行 CLI，再叠加应用 J 规则。

## 环境要求

- Node.js ≥ 20
- 待扫描的 TypeScript / TSX / JSX / CSS 文件（适配 React + Tailwind 技术栈）

## 安装

```bash
npm install -D ui-spec-lint
# 或
pnpm add -D ui-spec-lint
```

无需安装直接运行：

```bash
npx ui-spec-lint
```

## 使用方法

```bash
ui-spec-lint                          # 扫描当前项目，零配置
ui-spec-lint src/                     # 扫描子目录
ui-spec-lint --init                   # 生成 ui-spec.config.json（自动检测默认值）
ui-spec-lint --format json            # JSON 输出（用于 CI / 下游工具）
ui-spec-lint --fail-on warn           # 有任何警告或错误时退出码为 1
ui-spec-lint --max-duration 200       # 本次运行覆盖动效预算
ui-spec-lint --token-source src/app/globals.css
```

输出示例：

```
src/components/ProviderCard.tsx
   42:7   error   no-hardcoded-color       hardcoded color #F5F5F5 — use a semantic token instead
   58:11  warn    motion-budget            duration-500 exceeds the 300ms motion budget
   87:5   error   clickable-needs-a11y     <div> with onClick is not keyboard-accessible — add role/tabIndex/onKeyDown, or use <button>

✖ 3 problems (2 errors, 1 warning, 0 info)
```

当没有发现达到 `--fail-on` 阈值（默认 `error`）的问题时退出码为 `0`，否则为 `1`。

## 引擎规则

| 规则 | 默认级别 | 检测内容 |
|---|---|---|
| `no-hardcoded-color` | error | 字符串和 CSS 中的 `#hex` / `rgb()` / `hsl()` / `oklch()` 字面量。Token 源 CSS 文件豁免；`--var:` 声明豁免。绕过 Token 的命名中性色（如 `bg-white` / `text-black`）。 |
| `arbitrary-value-limit` | warn | 单个文件中超过 `maxArbitraryPerFile`（默认 12）个 `[347px]` 式任意值。 |
| `no-layout-animation` | warn | `transition-all`、布局属性上的 `transition-[width …]`、framer-motion 属性中对 `width` / `height` / `margin` 等的动画。 |
| `motion-budget` | warn | `duration-N` 类名、framer `transition={{ duration }}`，以及 CSS 过渡 / 动画时长超过 `maxDurationMs`（默认 300 ms）。无限循环 CSS 动画豁免。 |
| `clickable-needs-a11y` | error | 非交互元素（`div`、`span`、`li` 等）上有 `onClick` 但缺少 `role` / `tabIndex` / 键盘事件处理。有展开属性的元素跳过。 |
| `icon-button-needs-name` | warn | `<button>` 只渲染图标元素，没有 `aria-label` / `aria-labelledby` / `title`。 |
| `no-raw-toast` | warn | 在共享包装路径（`toastWrapper`）之外直接导入 `sonner` / toast 库。 |
| `reduced-motion-missing` | info | 项目包含动效，但未找到任何 `prefers-reduced-motion` / `useReducedMotion` / `reducedMotion` 相关代码。 |

判断规则（`single-emphasis-action`、`async-state-contract`、`shared-component-bypass`、`unsaved-state-guard`、`hierarchy-by-structure`）位于 `SKILL.md`——需要语义理解，由 Agent 负责应用。

## 配置

运行 `ui-spec-lint --init` 生成带自动检测默认值的 `ui-spec.config.json`。所有字段均为可选。

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

| 字段 | 默认值 | 说明 |
|---|---|---|
| `tokenSource` | 自动检测 | 存放设计 Token 的 CSS 文件；对 hardcoded-color 检查豁免。未设置时从常见 `globals.css` 路径自动检测。 |
| `toastWrapper` | `["lib/toast", "ui/toast", "components/toast", "toast.ts"]` | 标识共享 Toast 包装器的路径片段。匹配任意片段的文件可直接导入 toast 库。 |
| `sharedComponents` | — | 共享组件目录（供技能层使用）。 |
| `maxDurationMs` | `300` | 动效预算，单位毫秒。 |
| `maxArbitraryPerFile` | `12` | `arbitrary-value-limit` 的阈值。 |
| `rules` | `{}` | 单规则严重级别覆盖：`"off" \| "info" \| "warn" \| "error"`。 |

### CLI 参数

```
--token-source <path>      覆盖 tokenSource
--max-duration <ms>        覆盖 maxDurationMs
--max-arbitrary <n>        覆盖 maxArbitraryPerFile
--toast-wrapper <frag>     添加 toastWrapper 片段（可重复使用）
--format text|json         输出格式（默认：text）
--fail-on error|warn|info|never   退出码阈值（默认：error）
--config <path>            配置文件路径（默认：ui-spec.config.json）
--init [--force]           生成配置文件
```

## CI 集成

```yaml
# .github/workflows/lint.yml
- run: npx ui-spec-lint --format json --fail-on warn > ui-spec-report.json || true
- uses: actions/upload-artifact@v4
  with:
    name: ui-spec-report
    path: ui-spec-report.json
```

或直接让构建失败：

```yaml
- run: npx ui-spec-lint --fail-on error
```

## 为什么需要单独的工具

`jsx-a11y` 覆盖无障碍，`eslint-plugin-tailwindcss` 覆盖类名排序，Stylelint 插件覆盖 Token 语法。但它们都不检查*行为契约*层——每个视图只有一个主操作、异步操作暴露其生命周期、动效控制在预算内、共享组件不在本地重新实现。`ui-spec-lint` 将设计文档变成可执行规则：设计系统是规格说明，检查器是执行者。

## 开发

```bash
pnpm install
pnpm build          # tsc → dist/
```

## 注意事项与限制

- 面向 React / JSX + Tailwind；规则集针对工具类 CSS 代码库调优。CSS 规则适用于任何 `.css` 文件。
- 启发式规则倾向于沉默而非误报：展开属性、非字面量子节点和动态表达式会跳过检查，而不是猜测。
- 不能替代设计评审——它编码的是底线，而非上限。

## 许可证

MIT
