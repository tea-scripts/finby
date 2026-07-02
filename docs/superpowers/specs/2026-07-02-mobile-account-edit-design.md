# Inline Account Edit (mobile) — Design

**Date:** 2026-07-02
**Status:** Approved design → ready for implementation plan
**Scope:** Let OWNER/CO_MANAGER rename and recolor an existing account on the mobile
Accounts screen (web parity), reusing the existing add form as one shared add/edit sheet.

## Goal

The mobile Accounts screen (`apps/mobile/src/screens/settings/accounts-screen.tsx`) does
list / add / archive today. The web also lets you edit an account's **name and color**. This
adds that to mobile. The backend `api.accounts.updateAccount(workspaceId, accountId, patch)`
already accepts `{ name?, color?: string | null }`. Type, currency, and opening balance are
fixed after creation (balance is ledger-derived), so **editable fields = name + color only**.

## Approach — one shared add/edit BottomSheet

The current screen has a dedicated "Add account" `BottomSheet`. Rather than a second sheet,
**reuse it for both add and edit** (user decision):

- A single sheet state drives it, e.g. `sheet: { mode: 'add' } | { mode: 'edit'; account: AccountView } | null`
  (null = closed). `open = sheet !== null`.
- **Title:** "Add account" (add) / "Edit account" (edit).
- **Fields:**
  - **Name** (`Input`) — both modes.
  - **Color** (`ColorPicker`, already supports "None" → `null`) — both modes.
  - **Type** (`Dropdown`), **Currency** (`Dropdown`), **Opening balance** (`Input`) — **add mode only**
    (hidden when editing, since they can't change after creation).
- **Submit button:** "Add" (add) / "Save" (edit); disabled while the name is empty; reuses the
  existing `busy` flag; `ApiError` narrowed like the screen's other mutations.
  - add → `api.accounts.createAccount(...)` (unchanged behavior).
  - edit → `api.accounts.updateAccount(workspace.id, account.id, { name: name.trim(), color })`.
  - Both → `upsert(updated)` then close/reset the sheet.

## UI change on the list

Each account row gains an **"Edit"** text affordance next to "Archive"/"Unarchive", shown only
when `canManage` (OWNER/CO_MANAGER) — matching the existing Archive gating. Opening it sets the
sheet to edit mode and prefills name + color from that account.

## State

Replace the current `adding` boolean with the `sheet` mode state above; keep the existing form
fields (`name`, `type`, `currency`, `initialBalance`, `color`). Opening in:
- **add** → reset fields to defaults (name '', type 'BANK', currency = base, balance '0', color null).
- **edit** → prefill `name`/`color` from the account (type/currency/balance are unused/hidden).

A single `submit()` branches on `sheet.mode` (create vs update). Keep the file focused; it's
~170 lines now and this stays well under 500.

## Opening-balance input formatting (add mode)

The opening-balance `Input` gets a number formatter so amounts read naturally as the user
types, and the default `"0"` disappears once they enter a real value. A pure helper
`formatAmountInput(text: string): string` (in `apps/mobile/src/lib/format-amount-input.ts`)
normalizes each keystroke:

1. Strip everything except digits and `.`; collapse to a single decimal point.
2. Truncate the fractional part to 2 digits; preserve a trailing `.` while typing (`"12."`).
3. Strip leading zeros from the integer part — `"05" → "5"`, `"00" → "0"` — but keep a single
   `"0"` for zero / `"0.xx"`.
4. Group the integer part with thousands commas (`"1234567" → "1,234,567"`, `"1234.5" → "1,234.5"`).

The field's `onChangeText` runs the value through this helper and stores the grouped string in
`initialBalance` state. Because leading zeros are stripped, the starting `"0"` is replaced as
soon as a nonzero digit is typed (`"0"` + `"5"` → `"05"` → `"5"`). On **submit**, commas are
stripped before sending: `initialBalance.replace(/,/g, '')` (the screen already falls back to
`'0'` when empty). This applies to the add flow only (opening balance isn't editable).

## Error handling

Mirror the screen's existing pattern: `try { … } catch (e) { if (!(e instanceof ApiError)) throw e; }`,
`busy` guards double-submit, sheet stays open on failure (no optimistic close before success).

## Testing

Extend `accounts-screen.test.tsx` (reuse existing mocks; RNTL v14 `await render/fireEvent`):
- **Edit:** tap "Edit" on the loaded account, change the name, press "Save" → assert
  `api.accounts.updateAccount` called with `{ name: <new>, color: <color> }` and the row shows the
  new name.
- Keep the existing add + list-on-load tests passing (the add path now flows through the shared sheet).
This also closes the thin-coverage note from the settings build-out's final review for this screen.

## Out of scope

- Editing type / currency / opening balance (fixed after creation).
- Inline in-row editing (web does this; mobile uses the sheet for phone ergonomics + DRY reuse).
