# Category Visuals — Reusable Icon/Emoji System (mobile, rows-first)

**Date:** 2026-07-01
**Status:** Approved design (pending spec review)
**Area:** `packages/shared` (registry + types), `apps/api` (category selects), `apps/mobile` (avatar + rows)

## Summary

Give every category a **visual** — a branded vector icon for the known defaults, an emoji
fallback for everything else — and render it as a small colored avatar tile. The *data* (which
visual + color a category resolves to) lives in a shared, renderer-agnostic registry in
`@finby/shared`; each app renders it with its own icon library.

This is **Project B** of a two-part effort. It builds the reusable foundation that **Project A
(Dashboard = "money & insights in one")** will later consume for the spending-donut legend, and
that web + additional mobile surfaces can adopt as trivial follow-ups.

Scope this iteration: **mobile only, rows-first** — Transaction rows and Budget rows.

## Goals

- One shared, testable registry that maps a category → `{ glyph, color }`, usable by web and
  mobile without importing either app's icon library.
- Branded vector icons for the 10 seeded default categories; graceful emoji fallback for custom
  and income categories (which are user-created and not seeded).
- A reusable mobile `CategoryAvatar` primitive that other surfaces (donut legend, edit sheet,
  filters, web) can adopt later without changing call sites.
- Render the avatars exactly as the mockups show them in Transaction rows and Budget rows.

## Non-goals (out of scope this iteration)

- Emoji/icon **picker UI** or any category-management editor. The registry is designed so a
  stored per-category emoji override slots in later with no call-site changes.
- **Web** `CategoryAvatar` + web wiring.
- Additional mobile surfaces: the add/edit transaction sheet's category display, transaction
  filters, the `Category` filter/edit picker type.
- The Dashboard **donut chart + 6-month trend + insight text** — that is Project A, which will
  consume this registry.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Representation | **Hybrid** — SVG/vector for known defaults, emoji fallback for the rest |
| Assignment for custom/income | **Derive now, picker later** — keyword-derivation resolver, override-ready interface |
| Platform + surface scope | **Mobile only, rows-first** (Transaction rows + Budget rows) |
| Registry source of truth | **Expose `icon` + `color` from the API** so the resolver keys off the DB, not names |
| TransactionRow layout | **Subtitle refactor** to match mockup (`Merchant` / `Category · time`) |

## Architecture

### 1. Shared registry — `packages/shared/src/category-visuals.ts`

Pure data + logic, no renderer dependencies. Unit-tested with Vitest.

```ts
export type IconKey =
  | 'cart' | 'utensils' | 'car' | 'film' | 'bag'
  | 'heart' | 'bolt' | 'home' | 'book' | 'ellipsis';

export type CategoryVisual =
  | { kind: 'icon';  iconKey: IconKey; color: string }
  | { kind: 'emoji'; char: string;    color: string };

export interface CategoryVisualInput {
  name: string;
  icon?: string | null;
  color?: string | null;
}

export function resolveCategoryVisual(input: CategoryVisualInput): CategoryVisual;
```

**Resolution order** (this exact ordering is what makes "picker later" a drop-in — a stored
emoji lands at step 2 with no call-site changes):

1. `icon` is a **known `IconKey`** → `{ kind: 'icon', iconKey, color: input.color ?? DEFAULT_ICON_COLOR[iconKey] }`.
2. `icon` is a **non-empty string that is not a known key** (i.e. a stored emoji, the future
   picker's output) → `{ kind: 'emoji', char: icon, color: input.color ?? deriveColor(name) }`.
3. Else **keyword-derive** an emoji from `name` via `KEYWORD_EMOJI` → emoji visual.
4. Else **generic fallback** → `{ kind: 'emoji', char: '🏷️', color: input.color ?? deriveColor(name) }`.

**`DEFAULT_ICON_COLOR`** — the per-key colors already in `DEFAULT_CATEGORIES`
(`cart`→`#1A7A4A`, `utensils`→`#E2683C`, …), so a default with no explicit `color` still tints
correctly.

**`KEYWORD_EMOJI`** — a focused, ordered `[matcher, emoji][]` table (~15–20 entries), matched
case-insensitively against the category name. Seed set (final list refined during
implementation):

| Match (substring, case-insensitive) | Emoji |
|---|---|
| salary, payroll, pay, wage, income | 💼 |
| rent, mortgage, housing | 🏠 |
| grocery, groceries, supermarket | 🛒 |
| coffee, cafe | ☕ |
| dining, restaurant, food, eat | 🍽️ |
| transport, transit, uber, taxi, bus, train, fuel, gas | 🚕 |
| entertainment, movie, netflix, game | 🎬 |
| shopping, clothes, clothing | 🛍️ |
| health, pharmacy, doctor, medical | 🩺 |
| utilit, electric, water, internet, phone | 💡 |
| education, school, course, book | 📚 |
| gift, donation | 🎁 |
| travel, flight, hotel | ✈️ |
| subscription, membership | 🔁 |
| savings, invest | 📈 |

Order matters — first match wins. The final generic fallback (🏷️) covers anything unmatched.

**`deriveColor(name)`** — a stable string hash of the (lowercased, trimmed) name → index into a
fixed palette (the `DEFAULT_CATEGORIES` colors). Deterministic: the same category name always
yields the same color, so there is no flicker between renders.

### 2. API + shared-type widening

So the resolver can key off the DB rather than re-deriving from names:

- `packages/shared/src/api-types.ts`: widen `category` on **`Transaction`** and **`BudgetView`**
  from `{ id, name }` → `{ id, name, icon: string | null; color: string | null }`.
- `apps/api`: widen the Prisma `select` for the category relation from `{ id: true, name: true }`
  to also include `icon: true, color: true` in:
  - `transactions.service.ts` (the category select at ~line 23, used by list + detail),
  - the **budgets** serializer select,
  - the **dashboard** recent-transactions path (`listRecentTransactions`) if it selects
    independently.
  Update the corresponding backend types (`transactions.types.ts` `category` shape, budget view
  type) and affected service tests.
- The filter/edit picker `Category` type (`{ id, name, isArchived }`) is **unchanged** — not
  needed for rows-first.

### 3. Mobile render — `apps/mobile/src/components/category/`

- **`category-icon-map.ts`** — `Record<IconKey, keyof Ionicons.glyphMap>`:
  `cart`→`cart`, `utensils`→`restaurant`, `car`→`car`, `film`→`film`, `bag`→`bag-handle`,
  `heart`→`heart`, `bolt`→`flash`, `home`→`home`, `book`→`book`,
  `ellipsis`→`ellipsis-horizontal`. (Exact glyphs verified against the installed
  `@expo/vector-icons` during implementation.)
- **`category-avatar.tsx`** — `<CategoryAvatar category={{ name, icon?, color? }} size?='sm'|'md' />`:
  - Calls `resolveCategoryVisual`.
  - Renders a rounded-square tile with a **soft** background (the resolved `color` at low
    opacity) containing either `<Ionicons name={iconMap[iconKey]} color={color} />` (icon kind)
    or `<Text>{char}</Text>` (emoji kind).
  - Size tokens: `sm` ≈ 32px (rows), `md` ≈ 40px (future larger contexts).
  - **Decorative for accessibility** — the category name is always shown as adjacent text, so the
    avatar is hidden from the a11y tree (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`) to avoid double-announcing.
  - Built test-first (React Native Testing Library).

### 4. Wiring (rows only)

- **`transaction-row.tsx`** — subtitle refactor to match the mockup:
  - Left: `<CategoryAvatar size="sm">`.
  - Title: `merchant ?? description ?? 'Transaction'` (unchanged source).
  - Subtitle: category name (+ time if the row already has it), replacing the current bordered
    text chip. Tags handling preserved.
  - Amount on the right, unchanged (tone/sign helpers untouched).
- **`components/dashboard/budget-list.tsx`** — prepend `<CategoryAvatar size="sm">` before each
  budget's category name; layout otherwise unchanged.

## Data flow

```
DB category { name, icon, color }
  └─ API select widened → { id, name, icon, color }
       └─ @finby/shared api-types (Transaction.category / BudgetView.category)
            └─ resolveCategoryVisual({ name, icon, color })  [shared, pure]
                 └─ CategoryVisual { kind, glyph, color }
                      └─ mobile <CategoryAvatar>  (Ionicons | emoji Text)
                           └─ TransactionRow / budget-list rows
```

## Error handling / edge cases

- **Missing `icon` and `color`** (older rows, custom categories): resolver falls through to
  keyword-derivation and a deterministic derived color — always returns a valid visual.
- **Unknown/empty name**: generic 🏷️ fallback + derived color; never throws.
- **`icon` holds a legacy/unknown non-key string**: treated as an emoji override (step 2). If it
  is not actually an emoji it still renders as text — acceptable and non-crashing; the future
  picker will only ever write real emoji here.
- **A11y**: avatar decorative; no change to how rows are announced beyond the existing
  merchant/category text.

## Testing

- **Vitest — `resolveCategoryVisual`**: known key → icon visual with default color; explicit
  `color` overrides default; emoji-in-`icon` → emoji visual; each keyword branch → expected
  emoji (first-match-wins ordering); unmatched name → 🏷️; `deriveColor` deterministic and
  palette-bounded.
- **RNTL — `CategoryAvatar`**: renders an `Ionicons` glyph for a known key; renders emoji `Text`
  for a custom name; renders fallback for empty input; avatar is hidden from a11y tree.
- **Update existing**: `transaction-row.test.tsx` and `budget-list.test.tsx` for the new layout;
  backend service tests for the widened selects (assert `icon`/`color` present in serialized
  category).
- `npm run test`, `npm run lint`, and the build must pass before commit.

## Follow-ups enabled (not in this iteration)

- **Project A** donut legend consumes `resolveCategoryVisual` for its category swatches.
- Web `CategoryAvatar` (Phosphor glyph map) + web row wiring.
- Emoji picker in a future category editor → writes an emoji into `icon`, picked up at
  resolution step 2 automatically.
- Additional mobile surfaces (edit sheet, filters).
