# Category Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every category a branded icon (defaults) or emoji (everything else) rendered as a reusable colored avatar, wired into mobile Transaction rows and Budget rows.

**Architecture:** A renderer-agnostic resolver in `@finby/shared` maps `{ name, icon, color }` → `{ kind, glyph, color }`. The API is widened to expose the DB's `icon`/`color` on the two category-bearing view shapes. Mobile renders the resolver output with a small `CategoryAvatar` (Ionicons for known icon keys, emoji `Text` otherwise).

**Tech Stack:** TypeScript, NestJS + Prisma (API), React Native + `@expo/vector-icons` (mobile). Tests: Vitest (`@finby/shared`, mobile logic), Jest + React Native Testing Library (mobile components).

## Global Constraints

- Custom UI only — no new UI dependencies. Mobile icons come from the already-installed `@expo/vector-icons` (Ionicons). (Finby UI hard-rule.)
- The shared resolver must have **zero renderer dependencies** (no React, no icon libs) — pure data/logic.
- Scope is **mobile only, rows-first**: Transaction rows + Budget rows. Do not touch web, the edit/filter sheets, or the dashboard donut.
- Package manager is **pnpm** (v10, turbo). Run `pnpm test`, `pnpm lint`, and `pnpm build` before the final commit. Prefer per-task commits.
- Workspace names for `--filter`: `@finby/shared`, `finby-mobile`, `finby-api` (NOT `@finby/mobile`/`@finby/api`).
- Commit messages: no AI-attribution trailers.

---

### Task 1: Shared category-visuals resolver

**Files:**
- Create: `packages/shared/src/category-visuals.ts`
- Modify: `packages/shared/src/index.ts` (add one export line)
- Test: `packages/shared/src/category-visuals.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_CATEGORIES` from `packages/shared/src/constants.ts` (`{ name, icon, color }[]`).
- Produces:
  - `type IconKey = 'cart'|'utensils'|'car'|'film'|'bag'|'heart'|'bolt'|'home'|'book'|'ellipsis'`
  - `type CategoryVisual = { kind: 'icon'; iconKey: IconKey; color: string } | { kind: 'emoji'; char: string; color: string }`
  - `interface CategoryVisualInput { name: string; icon?: string | null; color?: string | null }`
  - `function resolveCategoryVisual(input: CategoryVisualInput): CategoryVisual`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/category-visuals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveCategoryVisual, type CategoryVisual } from './category-visuals';

describe('resolveCategoryVisual', () => {
  it('maps a known icon key to a branded icon visual with its default color', () => {
    expect(resolveCategoryVisual({ name: 'Groceries', icon: 'cart' })).toEqual<CategoryVisual>({
      kind: 'icon',
      iconKey: 'cart',
      color: '#1A7A4A',
    });
  });

  it('lets an explicit color override the icon default color', () => {
    const v = resolveCategoryVisual({ name: 'Groceries', icon: 'cart', color: '#123456' });
    expect(v).toEqual({ kind: 'icon', iconKey: 'cart', color: '#123456' });
  });

  it('treats a non-key icon string as a stored emoji override', () => {
    const v = resolveCategoryVisual({ name: 'Whatever', icon: '🎯' });
    expect(v.kind).toBe('emoji');
    expect(v).toMatchObject({ kind: 'emoji', char: '🎯' });
  });

  it('keyword-derives an emoji from the name when there is no icon', () => {
    expect(resolveCategoryVisual({ name: 'Monthly Payroll' }).char).toBe('💼');
    expect(resolveCategoryVisual({ name: 'Groceries' }).char).toBe('🛒');
    expect(resolveCategoryVisual({ name: 'Uber rides' }).char).toBe('🚕');
  });

  it('falls back to a generic emoji for an unrecognized name', () => {
    expect(resolveCategoryVisual({ name: 'Zorblax' }).char).toBe('🏷️');
  });

  it('derives a deterministic, palette-bounded color for emoji visuals', () => {
    const a = resolveCategoryVisual({ name: 'Zorblax' });
    const b = resolveCategoryVisual({ name: 'Zorblax' });
    expect(a.color).toBe(b.color);
    expect(a.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared test -- category-visuals`
Expected: FAIL — `Cannot find module './category-visuals'`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/category-visuals.ts`:

```ts
import { DEFAULT_CATEGORIES } from './constants';

export type IconKey =
  | 'cart' | 'utensils' | 'car' | 'film' | 'bag'
  | 'heart' | 'bolt' | 'home' | 'book' | 'ellipsis';

export type CategoryVisual =
  | { kind: 'icon'; iconKey: IconKey; color: string }
  | { kind: 'emoji'; char: string; color: string };

export interface CategoryVisualInput {
  name: string;
  icon?: string | null;
  color?: string | null;
}

const ICON_KEYS = new Set<string>(DEFAULT_CATEGORIES.map((c) => c.icon));

/** Per-icon-key default color, sourced from the seed table (DRY). */
const DEFAULT_ICON_COLOR = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.icon, c.color]),
) as Record<IconKey, string>;

/** Stable palette for derived colors. */
const PALETTE = DEFAULT_CATEGORIES.map((c) => c.color);

/** Ordered keyword → emoji table; first substring match wins. */
const KEYWORD_EMOJI: ReadonlyArray<readonly [readonly string[], string]> = [
  [['salary', 'payroll', 'wage', 'paycheck', 'income'], '💼'],
  [['rent', 'mortgage', 'housing'], '🏠'],
  [['grocery', 'groceries', 'supermarket'], '🛒'],
  [['coffee', 'cafe'], '☕'],
  [['dining', 'restaurant', 'food', 'eat'], '🍽️'],
  [['transport', 'transit', 'uber', 'taxi', 'bus', 'train', 'fuel', 'gas'], '🚕'],
  [['entertainment', 'movie', 'netflix', 'game'], '🎬'],
  [['shopping', 'clothes', 'clothing'], '🛍️'],
  [['health', 'pharmacy', 'doctor', 'medical'], '🩺'],
  [['utilit', 'electric', 'water', 'internet', 'phone'], '💡'],
  [['education', 'school', 'course', 'book'], '📚'],
  [['gift', 'donation'], '🎁'],
  [['travel', 'flight', 'hotel'], '✈️'],
  [['subscription', 'membership'], '🔁'],
  [['savings', 'invest'], '📈'],
];

const FALLBACK_EMOJI = '🏷️';

/** Deterministic hash of the name → an index into PALETTE. */
function deriveColor(name: string): string {
  const key = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function resolveCategoryVisual(input: CategoryVisualInput): CategoryVisual {
  const icon = input.icon?.trim();

  // 1. Known semantic key → branded icon.
  if (icon && ICON_KEYS.has(icon)) {
    const iconKey = icon as IconKey;
    return { kind: 'icon', iconKey, color: input.color ?? DEFAULT_ICON_COLOR[iconKey] };
  }

  const color = input.color ?? deriveColor(input.name);

  // 2. Non-key icon string → stored emoji (future picker output).
  if (icon) {
    return { kind: 'emoji', char: icon, color };
  }

  // 3. Keyword-derive from the name.
  const name = input.name.toLowerCase();
  for (const [keywords, emoji] of KEYWORD_EMOJI) {
    if (keywords.some((k) => name.includes(k))) {
      return { kind: 'emoji', char: emoji, color };
    }
  }

  // 4. Generic fallback.
  return { kind: 'emoji', char: FALLBACK_EMOJI, color };
}
```

- [ ] **Step 4: Export from the shared barrel**

In `packages/shared/src/index.ts`, add after the other exports:

```ts
export * from './category-visuals';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @finby/shared test -- category-visuals`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/category-visuals.ts packages/shared/src/category-visuals.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): category-visuals resolver (icon key or derived emoji + color)"
```

---

### Task 2: Expose `icon` + `color` on category view shapes (API + shared types)

**Files:**
- Modify: `packages/shared/src/api-types.ts` (`Transaction.category` ~line 196; `BudgetView.category` ~line 154)
- Modify: `apps/api/src/modules/transactions/transactions.service.ts` (`VIEW_INCLUDE` ~line 22; serializer ~line 462)
- Modify: `apps/api/src/modules/transactions/transactions.types.ts` (`category` ~line 46)
- Modify: `apps/api/src/modules/budgets/budgets.service.ts` (`toView` ~line 209)
- Modify: `apps/api/src/modules/budgets/budgets.types.ts` (`category` line 5)
- Test: `apps/api/src/modules/budgets/budgets.service.spec.ts` (fixtures ~line 30, 100)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Transaction.category` and `BudgetView.category` now carry `icon: string | null; color: string | null` (consumed by Tasks 4 & 5 via `@finby/shared`).

- [ ] **Step 1: Widen the shared types**

In `packages/shared/src/api-types.ts`, change the `Transaction` category field:

```ts
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
```

and the `BudgetView` category field:

```ts
  category: { id: string; name: string; icon: string | null; color: string | null };
```

- [ ] **Step 2: Write the failing backend test**

In `apps/api/src/modules/budgets/budgets.service.spec.ts`, update the category fixture at ~line 30 to include icon/color and add an assertion. Change the fixture object's `category` to:

```ts
  category: { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
```

Then, in the test that asserts the mapped view (the one calling `toView` / listing budgets), add:

```ts
    expect(result[0].category).toEqual({
      id: 'c1',
      name: 'Groceries',
      icon: 'cart',
      color: '#1A7A4A',
    });
```

(If the fixture at ~line 100 `{ id: 'c-other', name: 'Other' }` is a Prisma category mock, add `icon: 'ellipsis', color: '#6B7280'` to it so the mocks stay well-typed.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter finby-api test -- budgets.service`
Expected: FAIL — received `category` lacks `icon`/`color`.

- [ ] **Step 4: Widen the API selects, serializers, and backend types**

In `apps/api/src/modules/transactions/transactions.service.ts`, widen `VIEW_INCLUDE`:

```ts
const VIEW_INCLUDE = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  fromAccount: { select: { id: true, name: true } },
} as const;
```

and the serializer (~line 462):

```ts
      category: row.category
        ? { id: row.category.id, name: row.category.name, icon: row.category.icon, color: row.category.color }
        : null,
```

In `apps/api/src/modules/transactions/transactions.types.ts` (~line 46):

```ts
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
```

In `apps/api/src/modules/budgets/budgets.service.ts` `toView` (~line 209) — `budget.category` is the full model (`include: { category: true }`), so it already has `icon`/`color`:

```ts
      category: {
        id: budget.category.id,
        name: budget.category.name,
        icon: budget.category.icon,
        color: budget.category.color,
      },
```

In `apps/api/src/modules/budgets/budgets.types.ts` (line 5):

```ts
  category: { id: string; name: string; icon: string | null; color: string | null };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter finby-api test -- budgets.service transactions.service`
Expected: PASS. If the transactions spec asserts a `{ id, name }` category literal, add `icon`/`color` to that fixture + expectation the same way.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api-types.ts apps/api/src/modules/transactions/transactions.service.ts apps/api/src/modules/transactions/transactions.types.ts apps/api/src/modules/budgets/budgets.service.ts apps/api/src/modules/budgets/budgets.types.ts apps/api/src/modules/budgets/budgets.service.spec.ts
git commit -m "feat(api): expose category icon+color on transaction and budget views"
```

---

### Task 3: Mobile `CategoryAvatar` component + icon map

**Files:**
- Create: `apps/mobile/src/components/category/category-icon-map.ts`
- Create: `apps/mobile/src/components/category/category-avatar.tsx`
- Test: `apps/mobile/src/components/category/category-avatar.test.tsx`

**Interfaces:**
- Consumes: `resolveCategoryVisual`, `CategoryVisualInput`, `IconKey` from `@finby/shared` (Task 1).
- Produces: `CategoryAvatar({ category: CategoryVisualInput; size?: 'sm' | 'md' })` (consumed by Tasks 4 & 5).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/category/category-avatar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { Ionicons } from '@expo/vector-icons';
import { CategoryAvatar } from './category-avatar';

describe('CategoryAvatar', () => {
  it('renders an emoji for a custom category name', async () => {
    await render(<CategoryAvatar category={{ name: 'Monthly Payroll' }} />);
    expect(screen.getByText('💼')).toBeTruthy();
  });

  it('renders the fallback emoji for an unrecognized name', async () => {
    await render(<CategoryAvatar category={{ name: 'Zorblax' }} />);
    expect(screen.getByText('🏷️')).toBeTruthy();
  });

  it('renders an Ionicons glyph for a known icon key', async () => {
    const view = render(<CategoryAvatar category={{ name: 'Groceries', icon: 'cart' }} />);
    expect(view.UNSAFE_getByType(Ionicons).props.name).toBe('cart');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- category-avatar`
Expected: FAIL — cannot resolve `./category-avatar`.

- [ ] **Step 3: Write the icon map**

Create `apps/mobile/src/components/category/category-icon-map.ts`:

```ts
import type { Ionicons } from '@expo/vector-icons';
import type { IconKey } from '@finby/shared';

type Glyph = keyof typeof Ionicons.glyphMap;

/** Semantic icon key → Ionicons glyph. */
export const CATEGORY_ICON_GLYPH: Record<IconKey, Glyph> = {
  cart: 'cart',
  utensils: 'restaurant',
  car: 'car',
  film: 'film',
  bag: 'bag-handle',
  heart: 'heart',
  bolt: 'flash',
  home: 'home',
  book: 'book',
  ellipsis: 'ellipsis-horizontal',
};
```

- [ ] **Step 4: Write the component**

Create `apps/mobile/src/components/category/category-avatar.tsx`:

```tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveCategoryVisual, type CategoryVisualInput } from '@finby/shared';
import { CATEGORY_ICON_GLYPH } from './category-icon-map';

const SIZES = {
  sm: { box: 32, icon: 16, text: 15 },
  md: { box: 40, icon: 20, text: 18 },
} as const;

/** Decorative category tile: soft color-tinted background with an Ionicons glyph
 *  (known categories) or an emoji (everything else). The category name is always
 *  shown as adjacent text, so the avatar is hidden from the a11y tree. */
export function CategoryAvatar({
  category,
  size = 'sm',
}: {
  category: CategoryVisualInput;
  size?: 'sm' | 'md';
}) {
  const visual = resolveCategoryVisual(category);
  const s = SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: s.box,
        height: s.box,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${visual.color}22`,
      }}
    >
      {visual.kind === 'icon' ? (
        <Ionicons name={CATEGORY_ICON_GLYPH[visual.iconKey]} size={s.icon} color={visual.color} />
      ) : (
        <Text style={{ fontSize: s.text }}>{visual.char}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components -- category-avatar`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/category/
git commit -m "feat(mobile): CategoryAvatar (Ionicons for known keys, emoji fallback)"
```

---

### Task 4: Wire `CategoryAvatar` into the Transaction row (subtitle refactor)

**Files:**
- Modify: `apps/mobile/src/components/transactions/transaction-row.tsx`
- Test: `apps/mobile/src/components/transactions/transaction-row.test.tsx`

**Interfaces:**
- Consumes: `CategoryAvatar` (Task 3); widened `Transaction.category` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Update the test (fixture + avatar assertion)**

In `apps/mobile/src/components/transactions/transaction-row.test.tsx`, update the fixture `category` to the widened shape and add an avatar assertion. Change:

```ts
  category: { id: 'c1', name: 'Dining' }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
```

to:

```ts
  category: { id: 'c1', name: 'Dining', icon: null, color: null }, account: null, transactionDate: '2026-06-24T10:00:00.000Z',
```

Then inside the existing test body, after the amount assertion, add:

```ts
    expect(screen.getByText('🍽️')).toBeTruthy(); // 'Dining' derives the dining emoji
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- transaction-row`
Expected: FAIL — no element with text `🍽️` (avatar not rendered yet).

- [ ] **Step 3: Rewrite the row with the avatar + subtitle**

Replace the body of `apps/mobile/src/components/transactions/transaction-row.tsx` (keep the `MONO`, `tone`, `sign` helpers exactly as they are) with:

```tsx
import { Platform, Pressable, Text, View } from 'react-native';
import { money } from '@finby/core';
import type { Transaction } from '@finby/shared';
import { CategoryAvatar } from '../category/category-avatar';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function tone(type: string): string {
  if (type === 'INCOME') return 'text-success';
  if (type === 'EXPENSE') return 'text-ink';
  return 'text-muted';
}
function sign(type: string): string {
  if (type === 'INCOME') return '+';
  if (type === 'EXPENSE') return '−';
  return '';
}

export function TransactionRow({ tx, onPress }: { tx: Transaction; onPress: () => void }) {
  const title = tx.merchant ?? tx.description ?? 'Transaction';
  const categoryName = tx.category?.name ?? null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-1 py-3"
    >
      <CategoryAvatar
        category={{ name: categoryName ?? title, icon: tx.category?.icon, color: tx.category?.color }}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-ink" numberOfLines={1}>
          {title}
        </Text>
        {categoryName || tx.tags.length > 0 ? (
          <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
            {categoryName ? <Text className="text-xs text-muted">{categoryName}</Text> : null}
            {tx.tags.map((t) => (
              <Text
                key={t}
                className="rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent"
              >
                {t}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Text className={`shrink-0 text-sm font-semibold ${tone(tx.type)}`} style={{ fontFamily: MONO }}>
        {sign(tx.type)}
        {money(tx.amountOriginal, tx.currencyOriginal)}
      </Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components -- transaction-row`
Expected: PASS — merchant, category subtitle, amount, avatar emoji, and onPress all assert.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/transactions/transaction-row.tsx apps/mobile/src/components/transactions/transaction-row.test.tsx
git commit -m "feat(mobile): CategoryAvatar + subtitle layout in transaction rows"
```

---

### Task 5: Wire `CategoryAvatar` into Budget rows

**Files:**
- Modify: `apps/mobile/src/components/dashboard/budget-list.tsx` (`BudgetRow`)
- Test: `apps/mobile/src/components/dashboard/budget-list.test.tsx`

**Interfaces:**
- Consumes: `CategoryAvatar` (Task 3); widened `BudgetView.category` (Task 2).
- Produces: nothing downstream.

- [ ] **Step 1: Update the test (fixture + avatar assertion)**

Open `apps/mobile/src/components/dashboard/budget-list.test.tsx`. In each `BudgetView` fixture, change the `category` to the widened shape, e.g.:

```ts
    category: { id: 'c1', name: 'Groceries', icon: 'cart', color: '#1A7A4A' },
```

Add an assertion in the render test that the known-key avatar shows its Ionicons glyph:

```tsx
import { Ionicons } from '@expo/vector-icons';
// ...inside the "renders budgets" test, after existing assertions:
    expect(view.UNSAFE_getByType(Ionicons).props.name).toBe('cart');
```

(Capture the render result as `const view = render(...)` if the test currently uses `screen`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components -- budget-list`
Expected: FAIL — no `Ionicons` in the tree yet.

- [ ] **Step 3: Add the avatar to `BudgetRow`**

In `apps/mobile/src/components/dashboard/budget-list.tsx`, add the import:

```tsx
import { CategoryAvatar } from '../category/category-avatar';
```

and replace the `BudgetRow` header row (the `flex-row items-baseline justify-between` `View`) with an avatar + name + amount row:

```tsx
      <View className="flex-row items-center gap-2">
        <CategoryAvatar category={b.category} size="sm" />
        <Text className="min-w-0 flex-1 text-sm text-ink" numberOfLines={1}>
          {b.category.name}
        </Text>
        <Text className="text-xs text-muted" style={{ fontFamily: MONO }}>
          {money(b.amountSpent, b.currency)} / {money(b.amountLimit, b.currency)}
        </Text>
      </View>
```

Leave the progress-bar row below it unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components -- budget-list`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run:
```bash
pnpm test
pnpm lint
pnpm build
```
Expected: all pass. `CategoryAvatar` accepts `BudgetView.category` directly because that shape is a superset of `CategoryVisualInput` (`name` + optional `icon`/`color`).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/dashboard/budget-list.tsx apps/mobile/src/components/dashboard/budget-list.test.tsx
git commit -m "feat(mobile): CategoryAvatar in budget rows"
```

---

## Self-Review

**Spec coverage:**
- Shared registry (resolver, resolution order, keyword table, deriveColor) → Task 1. ✅
- API + type widening (`Transaction.category`, `BudgetView.category`, selects, serializers) → Task 2. ✅
- Mobile `category-icon-map` + `CategoryAvatar` (soft tint, decorative a11y) → Task 3. ✅
- TransactionRow subtitle refactor → Task 4. ✅
- Budget rows → Task 5. ✅
- Out-of-scope items (picker, web, extra surfaces, donut) → untouched. ✅

**Placeholder scan:** No TBD/TODO; every code step is complete. The one deferred detail in the spec (final keyword list) is fully materialized here in `KEYWORD_EMOJI`. ✅

**Type consistency:** `resolveCategoryVisual`, `CategoryVisual`, `CategoryVisualInput`, `IconKey` are defined in Task 1 and consumed with the same names/signatures in Tasks 3–5. `CATEGORY_ICON_GLYPH` keyed by `IconKey`. Widened `category` shape (`{ id, name, icon, color }`) is identical across api-types, backend types, serializers, and test fixtures. `BudgetView.category` is a structural superset of `CategoryVisualInput`, so it is passed directly in Task 5. ✅
