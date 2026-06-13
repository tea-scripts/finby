# Finby — Project Instructions

## UI Components (HARD RULE)

- ALWAYS use our custom UI components from `apps/web/src/components/ui/` first.
- NEVER use native form controls directly in feature code. Specifically:
  - Native `<select>` → use `Dropdown` (`@/components/ui/dropdown`)
  - Native `<input type="date">` → use `DatePicker` (`@/components/ui/date-picker`)
  - Native `<input type="checkbox">` / `role="switch"` toggles → use our `Toggle` component
  - Native `<input>` / `<textarea>` → use `Input` (`@/components/ui/input`)
- If a needed custom component does not exist yet, BUILD it in `components/ui/` (following the
  `Dropdown`/`DatePicker` patterns: accessible, keyboard-navigable, no external UI deps) and use it —
  do not fall back to a native control.
- Rationale: consistent cross-browser/OS rendering, design-system fidelity, and full control over
  accessibility and behavior. Native controls render inconsistently and break the visual language.

## Tests

- New components are built test-first (Vitest + Testing Library), mirroring existing `*.test.tsx`.
- Run `npm run test`, `npm run lint`, and the build before committing.
