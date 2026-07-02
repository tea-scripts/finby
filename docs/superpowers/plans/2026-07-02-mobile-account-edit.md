# Inline Account Edit (mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OWNER/CO_MANAGER rename + recolor an existing account on the mobile Accounts screen, reusing the add form as one shared add/edit BottomSheet, and add a thousands/decimal formatter to the opening-balance field.

**Architecture:** Extend `apps/mobile/src/screens/settings/accounts-screen.tsx`. Replace the `adding` boolean with a `sheet` mode (`{mode:'add'} | {mode:'edit', account} | null`); the same sheet shows name + color in both modes, and type/currency/opening-balance only in add mode. A new pure `formatAmountInput` helper normalizes the opening-balance input.

**Tech Stack:** Expo/React Native, existing UI primitives (`BottomSheet`, `Input`, `Field`, `Dropdown`, `ColorPicker`, `Button`), `api.accounts` (`@finby/core`). Tests: **vitest** (pure helper) + **jest** (screen).

## Global Constraints

- Editable fields when EDITING = **name + color only** (type/currency/opening-balance are add-only; fixed after creation).
- One shared add/edit `BottomSheet` (not two sheets).
- Edit affordance shown only when `canManage` (`role !== 'VIEWER'`), matching the existing Archive gating.
- Mutations narrow errors with `if (!(e instanceof ApiError)) throw e;`; `busy` guards double-submit; the sheet stays open on failure (no optimistic close).
- Opening-balance formatter: strip non-numeric, single decimal point, ≤2 decimals, strip leading zeros (keep single `0` / `0.xx`), group integer part with commas; strip commas on submit (`initialBalance.replace(/,/g,'')`, screen already falls back to `'0'`).
- NEVER use native form controls — reuse the primitives. Keep the file under 500 lines.
- Commit messages: NO AI-attribution trailer, NO "Generated with" boilerplate; atomic; stage explicitly.

## Reference: current screen (do not re-derive)

`accounts-screen.tsx` today: state `adding/name/type/currency/initialBalance/addColor/busy`,
`archiveTarget`; `addAccount()` calls `api.accounts.createAccount(workspaceId, { name, accountType, currency, initialBalance, color? })`; `toggleArchive()` calls `api.accounts.updateAccount(workspaceId, accountId, { isArchived })`; `upsert(acc)` replaces/appends by id. The add `BottomSheet` has Name/Type/Currency/Opening-balance/Color + an "Add" button. Each manageable row shows an "Archive"/"Unarchive" text button. `api.accounts.updateAccount` accepts `{ name?, color?: string | null, isArchived? }`.

---

## Task 1: `formatAmountInput` pure helper

**Files:**
- Create: `apps/mobile/src/lib/format-amount-input.ts`
- Test: `apps/mobile/src/lib/format-amount-input.test.ts`

**Interfaces:**
- Produces: `formatAmountInput(text: string): string` — normalizes a raw input string to a grouped, ≤2-decimal, leading-zero-stripped amount string. Consumed by the Accounts screen's opening-balance `Input` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/format-amount-input.test.ts
import { describe, it, expect } from 'vitest';
import { formatAmountInput } from './format-amount-input';

describe('formatAmountInput', () => {
  it('passes through zero and empty', () => {
    expect(formatAmountInput('')).toBe('');
    expect(formatAmountInput('0')).toBe('0');
  });
  it('strips leading zeros once a real digit is entered', () => {
    expect(formatAmountInput('05')).toBe('5');
    expect(formatAmountInput('00')).toBe('0');
    expect(formatAmountInput('050')).toBe('50');
  });
  it('groups the integer part with commas', () => {
    expect(formatAmountInput('1000')).toBe('1,000');
    expect(formatAmountInput('1234567')).toBe('1,234,567');
  });
  it('keeps up to two decimals and one decimal point', () => {
    expect(formatAmountInput('1234.5')).toBe('1,234.5');
    expect(formatAmountInput('1234.567')).toBe('1,234.56');
    expect(formatAmountInput('1.2.3')).toBe('1.23');
    expect(formatAmountInput('0.5')).toBe('0.5');
  });
  it('preserves a trailing decimal point while typing', () => {
    expect(formatAmountInput('12.')).toBe('12.');
  });
  it('strips non-numeric characters and existing commas (idempotent)', () => {
    expect(formatAmountInput('abc12')).toBe('12');
    expect(formatAmountInput('1,234')).toBe('1,234');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/format-amount-input.test.ts`
Expected: FAIL — cannot find module `./format-amount-input`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/format-amount-input.ts
/** Normalize a raw amount-input string for display: digits + one decimal point,
 *  ≤2 decimals, leading zeros stripped (a lone "0" / "0.xx" kept), integer part
 *  grouped with thousands commas. A trailing "." is preserved so the user can
 *  keep typing decimals. Strip commas before sending to the API. */
export function formatAmountInput(text: string): string {
  // Keep only digits and dots, then collapse to a single decimal point.
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  let intPart = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot);
  const hasDot = firstDot !== -1;
  let decPart = hasDot ? cleaned.slice(firstDot + 1).replace(/\./g, '') : '';

  // Strip leading zeros from the integer part, keeping a single "0".
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = hasDot ? '0' : '';

  // Cap decimals at 2 places.
  decPart = decPart.slice(0, 2);

  // Group the integer part with thousands commas.
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (!hasDot) return grouped;
  return `${grouped}.${decPart}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/format-amount-input.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/format-amount-input.ts apps/mobile/src/lib/format-amount-input.test.ts
git commit -m "feat(mobile): amount-input formatter for account opening balance"
```

---

## Task 2: Unified add/edit sheet + Edit affordance + formatted opening balance

**Files:**
- Modify: `apps/mobile/src/screens/settings/accounts-screen.tsx`
- Test: `apps/mobile/src/screens/settings/accounts-screen.test.tsx`

**Interfaces:**
- Consumes: `formatAmountInput` (Task 1); `api.accounts.createAccount` / `updateAccount`.

- [ ] **Step 1: Write the failing test (extend the existing screen test)**

Add an edit test alongside the existing "lists accounts on load". The existing mock returns one account `ACC = { id: 'a1', name: 'BDO', currency: 'USD', accountType: 'BANK', balance: '100.00', color: null, isArchived: false }` and mocks `api.accounts.updateAccount`.

```tsx
it('edits an account name via the shared sheet', async () => {
  accounts.updateAccount.mockResolvedValue({ ...ACC, name: 'BDO 2' });
  render(<AccountsScreen />);
  await waitFor(() => expect(screen.getByText('BDO')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Edit BDO'));
  fireEvent.changeText(screen.getByLabelText('Account name'), 'BDO 2');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(accounts.updateAccount).toHaveBeenCalledWith('w1', 'a1', { name: 'BDO 2', color: null }),
  );
  await waitFor(() => expect(screen.getByText('BDO 2')).toBeTruthy());
});
```

(If the existing `accounts` mock handle in the test file lacks `updateAccount`, ensure the `jest.mock('../../lib/runtime.native', …)` includes `accounts: { createAccount: jest.fn(), updateAccount: jest.fn() }` — it already does from the settings build-out.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/accounts-screen.test.tsx`
Expected: FAIL — no element labelled `Edit BDO`.

- [ ] **Step 3: Implement — swap `adding` for a `sheet` mode, add openers + unified submit**

In `accounts-screen.tsx`, add the import:

```tsx
import { formatAmountInput } from '../../lib/format-amount-input';
```

Replace the `adding` state and the `addColor` name:

```tsx
  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'edit'; account: AccountView } | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('BANK');
  const [currency, setCurrency] = useState(workspace?.baseCurrency ?? 'USD');
  const [initialBalance, setInitialBalance] = useState('0');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
```

Replace `addAccount` with openers + a unified `submit`:

```tsx
  function openAdd() {
    setName('');
    setType('BANK');
    setCurrency(workspace?.baseCurrency ?? 'USD');
    setInitialBalance('0');
    setColor(null);
    setSheet({ mode: 'add' });
  }

  function openEdit(acc: AccountView) {
    setName(acc.name);
    setColor(acc.color);
    setSheet({ mode: 'edit', account: acc });
  }

  async function submit() {
    if (!workspace || !name.trim() || !sheet) return;
    setBusy(true);
    try {
      if (sheet.mode === 'add') {
        const acc = await api.accounts.createAccount(workspace.id, {
          name: name.trim(),
          accountType: type,
          currency,
          initialBalance: initialBalance.replace(/,/g, '').trim() || '0',
          ...(color ? { color } : {}),
        });
        upsert(acc);
      } else {
        const acc = await api.accounts.updateAccount(workspace.id, sheet.account.id, {
          name: name.trim(),
          color,
        });
        upsert(acc);
      }
      setSheet(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 4: Implement — the row Edit affordance, the Add button, and the shared sheet**

In the row's `canManage` block, replace the single Archive `Text` with an Edit + Archive pair:

```tsx
                  {canManage ? (
                    <View className="flex-row gap-3">
                      <Text onPress={() => openEdit(acc)} accessibilityRole="button" accessibilityLabel={`Edit ${acc.name}`} className="text-xs font-medium text-accent">
                        Edit
                      </Text>
                      <Text onPress={() => setArchiveTarget(acc)} accessibilityRole="button" className="text-xs font-medium text-accent">
                        {acc.isArchived ? 'Unarchive' : 'Archive'}
                      </Text>
                    </View>
                  ) : null}
```

Change the Add button to call `openAdd`:

```tsx
            {canManage ? (
              <Button variant="ghost" onPress={openAdd}>Add account</Button>
            ) : null}
```

Replace the add `BottomSheet` with the shared add/edit sheet (name + color always; type/currency/opening-balance add-only; opening balance uses the formatter):

```tsx
      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit account' : 'Add account'}>
        <View className="gap-4">
          <Field label="Name"><Input value={name} onChangeText={setName} placeholder="e.g. BDO Savings" accessibilityLabel="Account name" /></Field>
          {sheet?.mode === 'add' ? (
            <>
              <Field label="Type"><Dropdown value={type} options={TYPE_OPTIONS} accessibilityLabel="Account type" onSelect={setType} /></Field>
              <Field label="Currency"><Dropdown value={currency} options={currencyOptions} accessibilityLabel="Account currency" onSelect={setCurrency} /></Field>
              <Field label="Opening balance">
                <Input
                  value={initialBalance}
                  onChangeText={(t) => setInitialBalance(formatAmountInput(t))}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Opening balance"
                />
              </Field>
            </>
          ) : null}
          <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
          <Button disabled={!name.trim()} loading={busy} onPress={() => void submit()}>
            {sheet?.mode === 'edit' ? 'Save' : 'Add'}
          </Button>
        </View>
      </BottomSheet>
```

- [ ] **Step 5: Run the screen test + typecheck**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/accounts-screen.test.tsx`
Expected: PASS (existing list-on-load + the new edit test).
Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Full gate**

Run: `cd apps/mobile && pnpm run test`
Expected: vitest + jest all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/settings/accounts-screen.tsx apps/mobile/src/screens/settings/accounts-screen.test.tsx
git commit -m "feat(mobile): edit accounts (name + color) via the shared add/edit sheet"
```

---

## Self-Review

**Spec coverage:**
- Shared add/edit BottomSheet (mode add|edit) → Task 2 ✓
- Editable = name + color only; type/currency/balance add-only → Task 2 sheet conditionals + `submit` update branch ✓
- Edit affordance per row, `canManage`-gated → Task 2 Step 4 ✓
- Prefill name/color on edit; reset on add → `openEdit`/`openAdd` ✓
- Opening-balance formatter (leading-zero strip, grouping, ≤2 decimals, trailing dot) → Task 1 ✓
- Strip commas on submit → Task 2 `submit` (`initialBalance.replace(/,/g,'')`) ✓
- Error narrowing / busy / stay-open-on-failure → Task 2 `submit` ✓
- Test coverage (edit path + keeps list-on-load) → Task 2 Step 1 ✓
- Out of scope (type/currency/balance edit, inline-row) → not implemented ✓

**Placeholder scan:** none — every step carries concrete code/commands.

**Type consistency:** `sheet` union (`{mode:'add'} | {mode:'edit',account} | null`) used consistently; `color: string | null` matches `UpdateAccountInput.color` and `ColorPicker`'s `value`/`onChange`; `formatAmountInput(text: string): string` signature identical across Task 1 def/test and Task 2 call site. `addColor` renamed to `color` everywhere it was used (opener resets, sheet ColorPicker, add-mode `...(color ? {color} : {})`).

**Note:** the `color` state replaces the old `addColor`; verify no stray `addColor` reference remains after the edit (tsc in Step 5 will catch it).
