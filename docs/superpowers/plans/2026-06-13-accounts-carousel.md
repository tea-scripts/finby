# Accounts Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only accounts list on the Dashboard with a swipeable carousel of per-account balance cards, each shown in its own currency with a circular currency flag and pagination dots.

**Architecture:** Two new generic, reusable UI primitives (`Carousel`, `CurrencyFlag`) plus two account-aware dashboard components (`AccountCard`, `AccountCarousel`). The carousel and flag know nothing about accounts; only the dashboard pieces do. Currency flags are vendored circular SVGs served from `public/flags/`, with a graceful symbol-badge fallback on load error. No backend/API/data-model changes — the existing `SectionState<AccountView[]>` flows straight through.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Tailwind CSS, Vitest + Testing Library (`@testing-library/react` `fireEvent` — note: `user-event` is NOT a dependency, use `fireEvent`).

---

## Conventions (read before starting)

- All work is under `apps/web/`. Run commands from `apps/web/` unless noted.
- Test runner: `npm run test` (= `vitest run`). Run a single file with `npx vitest run <path>`.
- Money is a decimal **string**; never parse it for storage. Display via `useFormatters().formatMoney(balance, currency)`.
- `AccountView` shape (`src/lib/types.ts`): `{ id, name, currency, accountType, balance, color: string|null, icon: string|null, isArchived }`.
- Custom-UI hard-rule: no native controls; build primitives in `src/components/ui/`.
- Tailwind tokens in play: `surface`, `surface-2`, `line`, `accent`, `ink`, `muted`, `faint`, `danger`.

---

## File Structure

New:
- `apps/web/public/flags/*.svg` — vendored circular flag set (16 files).
- `apps/web/src/components/ui/currency-flag.tsx` — `CurrencyFlag` primitive + currency→country map.
- `apps/web/src/components/ui/currency-flag.test.tsx`
- `apps/web/src/components/ui/carousel.tsx` — generic `Carousel` (swipe + dots + keyboard).
- `apps/web/src/components/ui/carousel.test.tsx`
- `apps/web/src/components/dashboard/account-card.tsx` — one gradient-tint slide.
- `apps/web/src/components/dashboard/account-card.test.tsx`
- `apps/web/src/components/dashboard/account-carousel.tsx` — dashboard glue + states.
- `apps/web/src/components/dashboard/account-carousel.test.tsx`

Modified:
- `apps/web/src/app/(app)/dashboard/page.tsx` — swap `AccountList` → `AccountCarousel`.

Removed:
- `apps/web/src/components/dashboard/account-list.tsx`
- `apps/web/src/components/dashboard/account-list.test.tsx`

---

## Task 1: Vendor the circular flag SVGs

**Files:**
- Create: `apps/web/public/flags/{us,ph,eu,gb,ng,ke,gh,za,bw,ca,au,in,jp,sg,ae,cn}.svg`

Source: [HatScripts/circle-flags](https://github.com/HatScripts/circle-flags) (MIT). We copy only the 16 files we need. The UI degrades to a symbol badge if any file is missing (Task 2), so this step is best-effort but should fetch all 16.

- [ ] **Step 1: Download the 16 circular flag SVGs**

Run from `apps/web/`:

```bash
mkdir -p public/flags
base="https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags"
# output-name -> source-name (EU file is named european_union in the source repo)
for pair in us:us ph:ph eu:european_union gb:gb ng:ng ke:ke gh:gh za:za bw:bw ca:ca au:au in:in jp:jp sg:sg ae:ae cn:cn; do
  out="${pair%%:*}"; src="${pair##*:}"
  curl -fsSL "$base/$src.svg" -o "public/flags/$out.svg" \
    && echo "ok  $out.svg" || echo "MISS $out.svg"
done
```

- [ ] **Step 2: Verify the files exist and are SVGs**

Run:

```bash
ls public/flags/ | sort | tr '\n' ' '; echo
head -c 60 public/flags/us.svg; echo
grep -l "<svg" public/flags/*.svg | wc -l
```

Expected: 16 filenames listed; `us.svg` begins with an SVG/XML tag; the `<svg` count is `16`. If any printed `MISS`, that currency will fall back to a symbol badge — acceptable, but retry the failed ones if you can.

- [ ] **Step 3: Commit**

```bash
git add public/flags
git commit -m "feat(web): vendor circular currency flag svgs"
```

---

## Task 2: `CurrencyFlag` primitive

A client component: maps a currency code to a vendored circular flag, falling back to the currency symbol (in a circle) when the code is unmapped **or** the image fails to load.

**Files:**
- Create: `apps/web/src/components/ui/currency-flag.tsx`
- Test: `apps/web/src/components/ui/currency-flag.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/ui/currency-flag.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencyFlag } from './currency-flag';

describe('CurrencyFlag', () => {
  it('renders the mapped circle-flag image for a known currency', () => {
    const { container } = render(<CurrencyFlag currency="USD" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/flags/us.svg');
  });

  it('falls back to the currency symbol when the flag image fails to load', () => {
    const { container } = render(<CurrencyFlag currency="USD" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('falls back to the code for an unmapped currency', () => {
    const { container } = render(<CurrencyFlag currency="XAF" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('XAF')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/currency-flag.test.tsx`
Expected: FAIL — `Failed to resolve import './currency-flag'`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/ui/currency-flag.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CURRENCIES } from '@finby/shared';

/** Currency code → ISO-3166 alpha-2 (or `eu`) for the vendored circle flags in /public/flags. */
const CURRENCY_COUNTRY: Record<string, string> = {
  USD: 'us', PHP: 'ph', EUR: 'eu', GBP: 'gb', NGN: 'ng', KES: 'ke',
  GHS: 'gh', ZAR: 'za', BWP: 'bw', CAD: 'ca', AUD: 'au', INR: 'in',
  JPY: 'jp', SGD: 'sg', AED: 'ae', CNY: 'cn',
};

/**
 * Circular currency flag. Renders a vendored SVG when the currency is mapped and the
 * asset loads; otherwise falls back to the currency symbol (or code) in a circle.
 * Decorative only — `aria-hidden`; the currency code is shown as text alongside it.
 */
export function CurrencyFlag({
  currency,
  size = 26,
  className = '',
}: {
  currency: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const country = CURRENCY_COUNTRY[currency];

  if (country && !failed) {
    return (
      <img
        src={`/flags/${country}.svg`}
        alt=""
        aria-hidden
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-surface-2 font-semibold text-ink ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {symbol}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/currency-flag.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/currency-flag.tsx src/components/ui/currency-flag.test.tsx
git commit -m "feat(web): add CurrencyFlag primitive with symbol fallback"
```

---

## Task 3: `Carousel` primitive

Generic one-slide-at-a-time carousel: pointer/touch drag to swipe, clickable dots, ←/→ keyboard. Accessible roles + live region. No external library. Drag relies on layout measurement (`offsetWidth`) which jsdom can't provide, so **drag is verified manually**; automated tests cover dots, keyboard, and ARIA.

**Files:**
- Create: `apps/web/src/components/ui/carousel.tsx`
- Test: `apps/web/src/components/ui/carousel.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/ui/carousel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Carousel } from './carousel';

function slides(n: number) {
  return Array.from({ length: n }, (_, i) => <div key={i}>Slide {i + 1}</div>);
}

describe('Carousel', () => {
  it('renders one dot per slide with the first active', () => {
    render(<Carousel ariaLabel="Accounts">{slides(3)}</Carousel>);
    const dots = screen.getAllByRole('button', { name: /go to slide/i });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
  });

  it('jumps to a slide when its dot is clicked', () => {
    render(<Carousel ariaLabel="Accounts">{slides(3)}</Carousel>);
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 3' }));
    expect(screen.getByText('Slide 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to slide 3' })).toHaveAttribute('aria-current', 'true');
  });

  it('navigates with arrow keys and clamps at both ends', () => {
    render(<Carousel ariaLabel="Accounts">{slides(2)}</Carousel>);
    const group = screen.getByRole('group', { name: 'Accounts' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'ArrowRight' }); // clamp at end
    expect(screen.getByText('Slide 2 of 2')).toBeInTheDocument();
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByText('Slide 1 of 2')).toBeInTheDocument();
  });

  it('hides dots when showDots is false', () => {
    render(<Carousel ariaLabel="Accounts" showDots={false}>{slides(3)}</Carousel>);
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/carousel.test.tsx`
Expected: FAIL — `Failed to resolve import './carousel'`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/ui/carousel.tsx`:

```tsx
'use client';

import { useRef, useState, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react';

const SWIPE_RATIO = 0.25; // fraction of viewport width that commits a slide change

interface CarouselProps {
  children: ReactNode[];
  ariaLabel: string;
  showDots?: boolean;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}

/** Generic one-slide carousel: drag to swipe, click dots, ←/→ keys. No external deps. */
export function Carousel({
  children,
  ariaLabel,
  showDots = true,
  initialIndex = 0,
  onIndexChange,
}: CarouselProps) {
  const slides = Array.isArray(children) ? children : [children];
  const count = slides.length;
  const clamp = (n: number) => Math.min(Math.max(n, 0), Math.max(count - 1, 0));

  const [index, setIndex] = useState(() => clamp(initialIndex));
  const [drag, setDrag] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);

  function go(next: number) {
    const c = clamp(next);
    if (c !== index) {
      setIndex(c);
      onIndexChange?.(c);
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    startX.current = e.clientX;
    viewport.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current) setDrag(e.clientX - startX.current);
  }
  function onPointerEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    const width = viewport.current?.offsetWidth ?? 1;
    if (drag <= -width * SWIPE_RATIO) go(index + 1);
    else if (drag >= width * SWIPE_RATIO) go(index - 1);
    setDrag(0);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  }

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div
        ref={viewport}
        className="touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className={`flex ${dragging.current ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))` }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== index}
              className="w-full shrink-0"
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{`Slide ${index + 1} of ${count}`}</p>

      {showDots && count > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/carousel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/carousel.tsx src/components/ui/carousel.test.tsx
git commit -m "feat(web): add generic Carousel primitive"
```

---

## Task 4: `AccountCard` component

One gradient-tint slide. The gradient/border use the account's `color`; null/invalid color falls back to the app accent. A `data-tint` attribute exposes the resolved color for reliable testing (jsdom won't reliably serialize 8-digit-hex gradients).

**Files:**
- Create: `apps/web/src/components/dashboard/account-card.tsx`
- Test: `apps/web/src/components/dashboard/account-card.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/dashboard/account-card.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type UserPreferences } from '@finby/shared';
import { AccountCard } from './account-card';
import type { AccountView } from '@/lib/types';

// useFormatters reads useAuth((s) => s.user?.preferences); drive it per-test.
interface MockState {
  user: { preferences: UserPreferences } | null;
}
let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

const base: AccountView = {
  id: 'a1',
  name: 'Chase Checking',
  currency: 'USD',
  accountType: 'BANK',
  balance: '10000',
  color: '#14b8a6',
  icon: null,
  isArchived: false,
};

beforeEach(() => {
  state = { user: null };
});

describe('AccountCard', () => {
  it('renders the formatted balance, name·type, and currency code', () => {
    render(<AccountCard account={base} />);
    expect(screen.getByText('$10,000.00')).toBeInTheDocument();
    expect(screen.getByText('Chase Checking · Bank')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('uses the account color as the tint', () => {
    const { container } = render(<AccountCard account={base} />);
    expect(container.firstChild).toHaveAttribute('data-tint', '#14b8a6');
  });

  it('falls back to the accent color when color is null', () => {
    const { container } = render(<AccountCard account={{ ...base, color: null }} />);
    expect(container.firstChild).toHaveAttribute('data-tint', '#1d6ef5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/account-card.test.tsx`
Expected: FAIL — `Failed to resolve import './account-card'`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/dashboard/account-card.tsx`:

```tsx
'use client';

import { ACCOUNT_TYPE_LABELS, type AccountType } from '@finby/shared';
import { useFormatters } from '@/lib/use-formatters';
import type { AccountView } from '@/lib/types';
import { CurrencyFlag } from '@/components/ui/currency-flag';

const ACCENT = '#1d6ef5';

/** A valid #RRGGBB tint, or the app accent when missing/invalid. */
function tintColor(color: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : ACCENT;
}

/** A single account's balance card — one slide in the dashboard carousel. */
export function AccountCard({ account }: { account: AccountView }) {
  const { formatMoney } = useFormatters();
  const tint = tintColor(account.color);
  const typeLabel = ACCOUNT_TYPE_LABELS[account.accountType as AccountType] ?? account.accountType;

  return (
    <div
      data-tint={tint}
      className="relative min-h-[120px] overflow-hidden rounded-2xl border p-5"
      style={{
        background: `linear-gradient(135deg, ${tint}33 0%, rgb(11 22 38 / 0.95) 55%)`,
        borderColor: `${tint}73`,
      }}
    >
      <div className="absolute right-5 top-5 flex items-center gap-2 text-sm font-semibold text-ink">
        <CurrencyFlag currency={account.currency} size={26} />
        {account.currency}
      </div>
      <p className="text-xs font-medium text-muted">Balance</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink">
        {formatMoney(account.balance, account.currency)}
      </p>
      <p className="mt-1.5 truncate text-xs text-faint">
        {account.name} · {typeLabel}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/account-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/account-card.tsx src/components/dashboard/account-card.test.tsx
git commit -m "feat(web): add AccountCard balance slide"
```

---

## Task 5: `AccountCarousel` component

Dashboard glue: legend + state handling (loading / error / empty / single / multiple), filtering archived accounts.

**Files:**
- Create: `apps/web/src/components/dashboard/account-carousel.tsx`
- Test: `apps/web/src/components/dashboard/account-carousel.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/components/dashboard/account-carousel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { type UserPreferences } from '@finby/shared';
import { AccountCarousel } from './account-carousel';
import type { SectionState } from '@/lib/dashboard-api';
import type { AccountView } from '@/lib/types';

interface MockState {
  user: { preferences: UserPreferences } | null;
}
let state: MockState;

vi.mock('@/lib/store', () => ({
  useAuth: vi.fn((selector: (s: MockState) => unknown) => selector(state)),
}));

function acct(over: Partial<AccountView>): AccountView {
  return {
    id: 'a', name: 'A', currency: 'USD', accountType: 'BANK',
    balance: '1', color: null, icon: null, isArchived: false, ...over,
  };
}

function sec(over: Partial<SectionState<AccountView[]>>): SectionState<AccountView[]> {
  return { data: null, loading: false, error: null, ...over };
}

beforeEach(() => {
  state = { user: null };
});

describe('AccountCarousel', () => {
  it('shows a skeleton (no dots) while loading', () => {
    const { container } = render(<AccountCarousel state={sec({ loading: true })} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('shows the error message', () => {
    render(<AccountCarousel state={sec({ error: 'Boom' })} />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('shows an empty state when there are no active accounts', () => {
    render(<AccountCarousel state={sec({ data: [acct({ isArchived: true })] })} />);
    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('renders a single account without dots', () => {
    render(<AccountCarousel state={sec({ data: [acct({ id: '1', name: 'Solo' })] })} />);
    expect(screen.getByText('Solo · Bank')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });

  it('renders dots and all cards for multiple accounts, excluding archived', () => {
    render(
      <AccountCarousel
        state={sec({
          data: [
            acct({ id: '1', name: 'One' }),
            acct({ id: '2', name: 'Two', currency: 'EUR' }),
            acct({ id: '3', name: 'Gone', isArchived: true }),
          ],
        })}
      />,
    );
    expect(screen.getAllByRole('button', { name: /go to slide/i })).toHaveLength(2);
    expect(screen.getByText('One · Bank')).toBeInTheDocument();
    expect(screen.getByText('Two · Bank')).toBeInTheDocument();
    expect(screen.queryByText('Gone · Bank')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/account-carousel.test.tsx`
Expected: FAIL — `Failed to resolve import './account-carousel'`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/dashboard/account-carousel.tsx`:

```tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Carousel } from '@/components/ui/carousel';
import type { SectionState } from '@/lib/dashboard-api';
import type { AccountView } from '@/lib/types';
import { AccountCard } from './account-card';
import { SectionError } from './dashboard-card';

const LEGEND = 'font-display text-xs font-semibold uppercase tracking-wide text-muted';

/** Dashboard accounts view: a swipeable carousel of per-account balance cards. */
export function AccountCarousel({ state }: { state: SectionState<AccountView[]> }) {
  const accounts = state.data?.filter((a) => !a.isArchived) ?? [];

  return (
    <section className="space-y-3">
      <h2 className={LEGEND}>Accounts</h2>
      {state.loading ? (
        <Skeleton className="h-[120px] rounded-2xl" />
      ) : state.error ? (
        <SectionError message={state.error} />
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface/60 p-5">
          <p className="text-sm text-faint">No accounts yet.</p>
        </div>
      ) : accounts.length === 1 ? (
        <AccountCard account={accounts[0]} />
      ) : (
        <Carousel ariaLabel="Accounts">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </Carousel>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/account-carousel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/account-carousel.tsx src/components/dashboard/account-carousel.test.tsx
git commit -m "feat(web): add AccountCarousel dashboard section"
```

---

## Task 6: Wire into the Dashboard and remove `AccountList`

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx:4` and `:69`
- Remove: `apps/web/src/components/dashboard/account-list.tsx`, `apps/web/src/components/dashboard/account-list.test.tsx`

- [ ] **Step 1: Swap the import**

In `apps/web/src/app/(app)/dashboard/page.tsx`, replace line 4:

```tsx
import { AccountList } from '@/components/dashboard/account-list';
```

with:

```tsx
import { AccountCarousel } from '@/components/dashboard/account-carousel';
```

- [ ] **Step 2: Swap the usage**

In the same file, replace the line:

```tsx
          <AccountList state={accounts} />
```

with:

```tsx
          <AccountCarousel state={accounts} />
```

- [ ] **Step 3: Delete the old component and its test**

Run from `apps/web/`:

```bash
git rm src/components/dashboard/account-list.tsx src/components/dashboard/account-list.test.tsx
```

- [ ] **Step 4: Confirm nothing else references AccountList**

Run from `apps/web/`:

```bash
grep -rn "AccountList\|account-list" src || echo "no references remaining"
```

Expected: `no references remaining`.

- [ ] **Step 5: Run the full suite, lint, and build**

Run from `apps/web/`:

```bash
npm run test && npm run lint && npm run build
```

Expected: tests pass (including the four new files), lint clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(web): use AccountCarousel on the dashboard, remove AccountList"
```

---

## Self-Review (completed during plan authoring)

**Spec coverage:** one-card-per-account (Task 4/5), gradient tint from account color (Task 4), SVG circle flag + symbol fallback (Tasks 1–2), swipe+dots+keyboard navigation (Task 3), replace `AccountList` (Task 6), standalone hero card + uppercase legend (Task 5), loading/error/empty/single/archived handling (Task 5), test-first throughout, `account-list` removal (Task 6). Currency-grouping is explicitly out of scope. ✓

**Placeholder scan:** every code/command step contains complete content; no TBD/TODO. ✓

**Type consistency:** `CurrencyFlag({currency,size,className})`, `Carousel({children,ariaLabel,showDots,initialIndex,onIndexChange})`, `AccountCard({account})`, `AccountCarousel({state})`, and `tintColor`/`CURRENCY_COUNTRY` names are used identically across tasks. `AccountView` fixtures include all required fields (`color`/`icon`). `SectionState` matches `{data,loading,error}`. ✓

**Deviation from spec (noted):** flags are served from `public/flags/` via `<img>` (with `onError` symbol fallback) rather than inlined React SVGs — more maintainable, same consistent cross-OS rendering, and resilient to a missing asset.
