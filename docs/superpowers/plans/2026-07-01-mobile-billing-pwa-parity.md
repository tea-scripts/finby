# Mobile Billing — PWA-parity redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile dedicated subscription page with the PWA pattern — current plan shown inline in Settings, and a swipeable carousel (all plans, current marked) behind Upgrade/Change — with purchase still handed off to the web.

**Architecture:** New billing components under `apps/mobile/src/components/billing/`: `CurrentPlanCard` (inline, extends the 5e `CurrentPlan`), `CompareTable`, `PlanDeckCard` (extends the 5e `PlanCard`), and `PlanCarouselSheet` (a `BottomSheet` wrapping a peek-carousel built on the dashboard `AccountCarousel` pattern). Settings owns the `getSubscription` fetch + `openPortal`; the chat 429 notice opens the same sheet. The dedicated `subscription` screen/route is deleted. Display data comes from `@finby/shared` constants (no `getPlans`); every purchase CTA hands off to the web via `Linking` (App Store 3.1.1 stopgap).

**Tech Stack:** Expo SDK 54, RN 0.81, NativeWind 4. No new deps (`Linking` built in). Tests: Vitest (pure) + jest-expo/RNTL (async).

## Global Constraints

- **Branch:** all work on `feat/mobile-billing-pwa-parity` (this working tree). Re-orient git before each task.
- **No in-app purchase:** mobile never calls `startCheckout`/`changePlan`/`cancel`/`resume`. Upgrade/Switch → close sheet + `Linking.openURL(WEB_BILLING_URL)`; Manage → `openPortal` → `Linking.openURL(url)`.
- **⚠️ Compliance:** `WEB_BILLING_URL = 'https://chat.finby.app/settings'` (exact) is an App Store 3.1.1 "steering" **pre-submission stopgap** — must be revisited before submission. Distinct domain from marketing `finby.app`.
- **Pricing/features from `@finby/shared`:** `TIER_PRICING`/`formatTierPrice` (paid only; FREE renders 'Free'), `PLAN_FEATURES`/`condensedFeatures`, `TIER_LIMITS`. No `getPlans` call.
- **Only network calls:** `api.billing.getSubscription(workspaceId)`, `api.billing.openPortal(workspaceId)`.
- **Carousel content:** all four tiers FREE/PRO/PREMIUM/FAMILY; the `currentTier` card is marked "Current plan" & disabled. CTA verb by rank (FREE<PRO<PREMIUM<FAMILY): above current → "Upgrade to {Tier}", below → "Switch to {Tier}". No proration note.
- **RNTL is async:** `await render`, `await fireEvent.*`, `waitFor`. `getByText('X')` matches a host `<Text>`'s FULL concatenated descendant text — wrap an asserted string in its own inner `<Text>`; never a sibling `<Text>` in a column View/Pressable (they stack). jest.mock factory vars referencing an outer const must be `mock`-prefixed. Any test whose tree pulls `expo-blur` (the sheet/tab bar) must `jest.mock('expo-blur', ...)`. Pristine gate (only the benign act() string is filtered by `apps/mobile/jest.setup.js`).
- **Strict tsconfig** `noUncheckedIndexedAccess`; eslint flat config has no react-hooks plugin (no exhaustive-deps disable).
- **Theme tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`.
- **Commit style (HARD RULE):** no AI-attribution trailers; atomic commits.
- **Gate:** `pnpm --filter finby-mobile test` (pristine) · `pnpm --filter finby-mobile exec tsc --noEmit` · `pnpm lint` (0 errors; pre-existing `sw.js` `_e` warning OK). Per-task: `npx eslint <changed files>`.

---

### Task 1: `billing-links.ts` — web hand-off + tier display maps

Foundational: the web-billing URL + opener, and the tier name/rank maps reused by the new billing components (DRY — replaces the per-file `TIER_NAME` maps in the new files).

**Files:**
- Create: `apps/mobile/src/lib/billing-links.ts`, `apps/mobile/src/lib/billing-links.test.ts`

**Interfaces:**
- Produces: `WEB_BILLING_URL: string`; `openWebBilling(): void`; `TIER_NAME: Record<SubscriptionTier, string>`; `TIER_RANK: Record<SubscriptionTier, number>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/billing-links.test.ts
import { describe, expect, it, vi } from 'vitest';
import { WEB_BILLING_URL, TIER_NAME, TIER_RANK } from './billing-links';

describe('billing-links', () => {
  it('points at the web app settings (not marketing)', () => {
    expect(WEB_BILLING_URL).toBe('https://chat.finby.app/settings');
  });
  it('names and ranks every tier FREE<PRO<PREMIUM<FAMILY', () => {
    expect(TIER_NAME.PREMIUM).toBe('Premium');
    expect(TIER_RANK.FREE).toBeLessThan(TIER_RANK.PRO);
    expect(TIER_RANK.PRO).toBeLessThan(TIER_RANK.PREMIUM);
    expect(TIER_RANK.PREMIUM).toBeLessThan(TIER_RANK.FAMILY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile exec vitest run src/lib/billing-links.test.ts`
Expected: FAIL — cannot find module `./billing-links`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/lib/billing-links.ts
import { Linking } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';

/** The web app's billing surface (where the web UpgradeModal lives). NOTE: the web
 *  APP is chat.finby.app; marketing is finby.app — do not consolidate.
 *  ⚠️ Linking out to purchase is an App Store 3.1.1 pre-submission stopgap. */
export const WEB_BILLING_URL = 'https://chat.finby.app/settings';

/** Open the web billing page for upgrade/change (best-effort). */
export function openWebBilling(): void {
  void Linking.openURL(WEB_BILLING_URL).catch(() => {});
}

export const TIER_NAME: Record<SubscriptionTier, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  FAMILY: 'Family',
};

/** Rank used only to pick the Upgrade/Switch verb (never for pricing/enforcement). */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
  FAMILY: 3,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile exec vitest run src/lib/billing-links.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/lib/billing-links.ts src/lib/billing-links.test.ts
cd /home/unicorn/Documents/finby
git add apps/mobile/src/lib/billing-links.ts apps/mobile/src/lib/billing-links.test.ts
git commit -m "feat(mobile): billing-links (web hand-off URL + tier name/rank maps)"
```

---

### Task 2: `TierBadge` — subscription-tier pill

A small colored pill for the current-plan header + deck card headers (mobile has no subscription TierBadge; the streak `TierChip` is for achievement tiers and is NOT reused).

**Files:**
- Create: `apps/mobile/src/components/ui/tier-badge.tsx`, `apps/mobile/src/components/ui/tier-badge.test.tsx`

**Interfaces:**
- Consumes: `TIER_NAME` from `../../lib/billing-links`; `SubscriptionTier` from `@finby/shared`.
- Produces: `TierBadge({ tier }: { tier: SubscriptionTier })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/ui/tier-badge.test.tsx
import { render, screen } from '@testing-library/react-native';
import { TierBadge } from './tier-badge';

describe('TierBadge', () => {
  it('renders the tier label', async () => {
    await render(<TierBadge tier="PREMIUM" />);
    expect(screen.getByText('Premium')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/ui/tier-badge.test.tsx`
Expected: FAIL — cannot find module `./tier-badge`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/ui/tier-badge.tsx
import { Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';

// Per-tier accent (bg tint + text), mirroring the web TierBadge palette.
const TIER_STYLE: Record<SubscriptionTier, { bg: string; fg: string }> = {
  FREE: { bg: 'rgba(141,163,192,0.15)', fg: '#8da3c0' },
  PRO: { bg: 'rgba(29,110,245,0.15)', fg: '#1d6ef5' },
  PREMIUM: { bg: 'rgba(139,92,246,0.18)', fg: '#a78bfa' },
  FAMILY: { bg: 'rgba(31,174,106,0.18)', fg: '#1fae6a' },
};

/** A small colored pill naming a subscription tier. */
export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const s = TIER_STYLE[tier];
  return (
    <View style={{ backgroundColor: s.bg }} className="rounded-full px-2.5 py-0.5">
      <Text style={{ color: s.fg }} className="text-xs font-semibold">
        {TIER_NAME[tier]}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/ui/tier-badge.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/ui/tier-badge.tsx src/components/ui/tier-badge.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/ui/tier-badge.tsx apps/mobile/src/components/ui/tier-badge.test.tsx
git commit -m "feat(mobile): TierBadge subscription-tier pill"
```

---

### Task 3: `CompareTable` — collapsible feature grid

Ports the PWA `CompareTable`: a Free/Pro/Premium/Family × features grid from `TIER_LIMITS`. Horizontally scrollable for narrow screens.

**Files:**
- Create: `apps/mobile/src/components/billing/compare-table.tsx`, `apps/mobile/src/components/billing/compare-table.test.tsx`

**Interfaces:**
- Consumes: `TIER_LIMITS`, `SubscriptionTier` from `@finby/shared`.
- Produces: `CompareTable()`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/compare-table.test.tsx
import { render, screen } from '@testing-library/react-native';
import { CompareTable } from './compare-table';

describe('CompareTable', () => {
  it('renders tier columns and known feature rows/values', async () => {
    await render(<CompareTable />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('AI messages/day')).toBeTruthy();
    // FREE.chatMessagesPerDay = 20; PRO = null → 'Unlimited'
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0);
    // FREE.members = 1; FAMILY = 5
    expect(screen.getByText('Up to 5')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/compare-table.test.tsx`
Expected: FAIL — cannot find module `./compare-table`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/compare-table.tsx
import { ScrollView, Text, View } from 'react-native';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';

type Limits = (typeof TIER_LIMITS)['FREE'];
const TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const HEAD: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

const numOrUnlimited = (n: number | null, suffix = ''): string => (n === null ? 'Unlimited' : `${n}${suffix}`);
const yesNo = (b: boolean): string => (b ? '✓' : '—');

const ROWS: { feature: string; format: (l: Limits) => string }[] = [
  { feature: 'AI messages/day', format: (l) => numOrUnlimited(l.chatMessagesPerDay) },
  { feature: 'Currencies', format: (l) => numOrUnlimited(l.currencies) },
  { feature: 'History', format: (l) => numOrUnlimited(l.transactionHistoryDays, ' days') },
  { feature: 'Portfolio', format: (l) => yesNo(l.portfolio) },
  { feature: 'AI coaching', format: (l) => yesNo(l.proactiveCoaching) },
  { feature: 'Streak repair', format: (l) => yesNo(l.streakRepair) },
  { feature: 'Members', format: (l) => (l.maxMembers === 1 ? '1' : `Up to ${l.maxMembers}`) },
  { feature: 'Data export', format: (l) => yesNo(l.dataExport) },
];

/** Collapsible plan-comparison grid, values sourced from TIER_LIMITS (single source
 *  of truth). Horizontally scrollable so the four tier columns fit narrow screens. */
export function CompareTable() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1">
      <View className="min-w-full">
        {/* Header */}
        <View className="flex-row border-b border-line pb-1.5">
          <Text className="w-32 text-xs font-medium text-muted">Feature</Text>
          {TIERS.map((t) => (
            <Text key={t} className="w-20 text-center text-xs font-medium text-muted">
              {HEAD[t]}
            </Text>
          ))}
        </View>
        {/* Rows */}
        {ROWS.map(({ feature, format }) => (
          <View key={feature} className="flex-row border-b border-line/50 py-1.5">
            <Text className="w-32 text-xs text-muted">{feature}</Text>
            {TIERS.map((t) => (
              <Text key={t} className="w-20 text-center text-xs text-ink">
                {format(TIER_LIMITS[t])}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/compare-table.test.tsx`
Expected: PASS (1 test, all assertions).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/compare-table.tsx src/components/billing/compare-table.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/compare-table.tsx apps/mobile/src/components/billing/compare-table.test.tsx
git commit -m "feat(mobile): CompareTable plan-comparison grid from TIER_LIMITS"
```

---

### Task 4: `CurrentPlanCard` — inline current-plan card (Settings)

Extends the 5e `CurrentPlan` into the PWA `PlanCard`: FREE free-limit rows + limitation callout; paid condensed features + billing dates; Upgrade/Change + Manage CTAs; a Compare-plans toggle.

**Files:**
- Create: `apps/mobile/src/components/billing/current-plan-card.tsx`, `apps/mobile/src/components/billing/current-plan-card.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionView`, `SubscriptionTier`, `TIER_LIMITS`, `PLAN_FEATURES`, `condensedFeatures` from `@finby/shared`; `TIER_NAME` from `../../lib/billing-links`; `Button` from `../ui/button`; `TierBadge` from `../ui/tier-badge`; `PlanFeatureRow` from `./plan-feature-row`; `CompareTable` from `./compare-table`.
- Produces: `CurrentPlanCard({ sub, onChangePlan, onManage, managing }: { sub: SubscriptionView; onChangePlan: () => void; onManage: () => void; managing: boolean })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/current-plan-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import type { SubscriptionView } from '@finby/shared';
import { CurrentPlanCard } from './current-plan-card';

const sub = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null,
  cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null, ...over,
});

describe('CurrentPlanCard', () => {
  it('FREE: shows limit rows, an Upgrade button, and reveals the compare table on toggle', async () => {
    const onChangePlan = jest.fn();
    await render(
      <CurrentPlanCard sub={sub()} onChangePlan={onChangePlan} onManage={jest.fn()} managing={false} />,
    );
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('AI messages')).toBeTruthy(); // a free-limit row label
    expect(screen.queryByText('Manage billing')).toBeNull();
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    expect(onChangePlan).toHaveBeenCalledTimes(1);
    // Compare toggle
    expect(screen.queryByText('AI messages/day')).toBeNull(); // compare-table row hidden initially
    await fireEvent.press(screen.getByText('Compare plans'));
    expect(screen.getByText('AI messages/day')).toBeTruthy();
  });

  it('paid + Stripe: shows billing date, Change plan and Manage billing', async () => {
    const onManage = jest.fn();
    await render(
      <CurrentPlanCard
        sub={sub({ tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' })}
        onChangePlan={jest.fn()}
        onManage={onManage}
        managing={false}
      />,
    );
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText(/Next billing/)).toBeTruthy();
    expect(screen.getByText('Change plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Manage billing'));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/current-plan-card.test.tsx`
Expected: FAIL — cannot find module `./current-plan-card`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/current-plan-card.tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  condensedFeatures,
  PLAN_FEATURES,
  TIER_LIMITS,
  type SubscriptionView,
} from '@finby/shared';
import { TIER_NAME } from '../../lib/billing-links';
import { Button } from '../ui/button';
import { TierBadge } from '../ui/tier-badge';
import { PlanFeatureRow } from './plan-feature-row';
import { CompareTable } from './compare-table';

const FREE = TIER_LIMITS.FREE;
const FREE_LIMIT_ROWS: { label: string; value: string }[] = [
  { label: 'AI messages', value: FREE.chatMessagesPerDay !== null ? `${FREE.chatMessagesPerDay}/day` : 'Unlimited' },
  { label: 'Currencies', value: FREE.currencies !== null ? `${FREE.currencies} currency` : 'Unlimited' },
  { label: 'Transaction history', value: FREE.transactionHistoryDays !== null ? `${FREE.transactionHistoryDays}-day history` : 'Unlimited' },
  { label: 'Custom categories', value: FREE.customCategories !== null ? `${FREE.customCategories} categories` : 'Unlimited' },
  { label: 'Members', value: `${FREE.maxMembers} member` },
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Inline current-plan card (mirrors the web PlanCard): current tier + a limit/feature
 *  summary, billing context, the Upgrade/Change CTA (opens the carousel), Manage
 *  Billing (paid + Stripe), and a collapsible plan comparison. */
export function CurrentPlanCard({
  sub,
  onChangePlan,
  onManage,
  managing,
}: {
  sub: SubscriptionView;
  onChangePlan: () => void;
  onManage: () => void;
  managing: boolean;
}) {
  const isFree = sub.tier === 'FREE';
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Current plan</Text>
        <TierBadge tier={sub.tier} />
      </View>

      {isFree ? (
        <>
          <View className="gap-1.5">
            {FREE_LIMIT_ROWS.map((r) => (
              <View key={r.label} className="flex-row items-center justify-between">
                <Text className="text-sm text-muted">{r.label}</Text>
                <Text className="text-sm font-medium text-ink">{r.value}</Text>
              </View>
            ))}
          </View>
          <Text className="text-xs italic text-muted">{PLAN_FEATURES.FREE.limitation}</Text>
        </>
      ) : (
        <>
          <View>
            {condensedFeatures(sub.tier).map((f) => (
              <PlanFeatureRow key={f.label} feature={f} />
            ))}
          </View>
          <View className="gap-0.5">
            {sub.currentPeriodEnd ? (
              <Text className="text-sm text-muted">Next billing date: {shortDate(sub.currentPeriodEnd)}</Text>
            ) : null}
            {sub.cancelAtPeriodEnd ? (
              <Text className="text-sm text-warn">Your plan cancels at the end of the current period.</Text>
            ) : null}
            {sub.pendingTier && sub.pendingTierEffectiveAt ? (
              <Text className="text-sm text-warn">
                Changes to {TIER_NAME[sub.pendingTier]} on {shortDate(sub.pendingTierEffectiveAt)}.
              </Text>
            ) : null}
          </View>
        </>
      )}

      <View className="gap-2">
        <Button onPress={onChangePlan}>{isFree ? 'Upgrade to Pro' : 'Change plan'}</Button>
        {!isFree && sub.billingProvider === 'STRIPE' ? (
          <Button variant="ghost" loading={managing} onPress={onManage}>
            Manage billing
          </Button>
        ) : null}
      </View>

      <Pressable
        onPress={() => setCompareOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: compareOpen }}
        hitSlop={8}
      >
        <Text className="text-center text-xs font-medium text-accent">
          {compareOpen ? 'Hide plan comparison' : 'Compare plans'}
        </Text>
      </Pressable>
      {compareOpen ? <CompareTable /> : null}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/current-plan-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/current-plan-card.tsx src/components/billing/current-plan-card.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/current-plan-card.tsx apps/mobile/src/components/billing/current-plan-card.test.tsx
git commit -m "feat(mobile): CurrentPlanCard inline card (limits, features, dates, compare)"
```

---

### Task 5: `PlanDeckCard` — one carousel card

Extends the 5e `PlanCard` with focus styling + a per-tier CTA (Current / Upgrade / Switch) for the carousel deck.

**Files:**
- Create: `apps/mobile/src/components/billing/plan-deck-card.tsx`, `apps/mobile/src/components/billing/plan-deck-card.test.tsx`

**Interfaces:**
- Consumes: `PLAN_FEATURES`, `formatTierPrice`, `SubscriptionTier` from `@finby/shared`; `TIER_NAME`, `TIER_RANK` from `../../lib/billing-links`; `Button` from `../ui/button`; `PlanFeatureRow` from `./plan-feature-row`.
- Produces: `PlanDeckCard({ tier, currentTier, focused, onSelect }: { tier: SubscriptionTier; currentTier: SubscriptionTier; focused: boolean; onSelect: () => void })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/plan-deck-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { PlanDeckCard } from './plan-deck-card';

describe('PlanDeckCard', () => {
  it('a higher tier shows price + an Upgrade CTA that fires onSelect', async () => {
    const onSelect = jest.fn();
    await render(<PlanDeckCard tier="PREMIUM" currentTier="PRO" focused onSelect={onSelect} />);
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('$9.99/mo')).toBeTruthy();
    await fireEvent.press(screen.getByText('Upgrade to Premium'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a lower tier shows a Switch CTA (never "Upgrade to Free")', async () => {
    await render(<PlanDeckCard tier="FREE" currentTier="PRO" focused={false} onSelect={jest.fn()} />);
    expect(screen.getByText('Switch to Free')).toBeTruthy();
    expect(screen.queryByText('Upgrade to Free')).toBeNull();
  });

  it('the current tier shows a disabled "Current plan" marker', async () => {
    const onSelect = jest.fn();
    await render(<PlanDeckCard tier="PRO" currentTier="PRO" focused onSelect={onSelect} />);
    expect(screen.getByText('Current plan')).toBeTruthy();
    await fireEvent.press(screen.getByText('Current plan'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-deck-card.test.tsx`
Expected: FAIL — cannot find module `./plan-deck-card`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/plan-deck-card.tsx
import { Text, View } from 'react-native';
import { PLAN_FEATURES, formatTierPrice, type SubscriptionTier } from '@finby/shared';
import { TIER_NAME, TIER_RANK } from '../../lib/billing-links';
import { Button } from '../ui/button';
import { PlanFeatureRow } from './plan-feature-row';

/** One card in the plans carousel: tier name, price, feature list, focus styling,
 *  and a CTA derived from the tier's relationship to the current plan. */
export function PlanDeckCard({
  tier,
  currentTier,
  focused,
  onSelect,
}: {
  tier: SubscriptionTier;
  currentTier: SubscriptionTier;
  focused: boolean;
  onSelect: () => void;
}) {
  const isCurrent = tier === currentTier;
  const price = tier === 'FREE' ? 'Free' : `${formatTierPrice(tier)}/mo`;
  const ctaLabel = isCurrent
    ? 'Current plan'
    : TIER_RANK[tier] > TIER_RANK[currentTier]
      ? `Upgrade to ${TIER_NAME[tier]}`
      : `Switch to ${TIER_NAME[tier]}`;

  return (
    <View
      className={`gap-2 rounded-2xl border p-5 ${focused ? 'border-accent bg-surface-2' : 'border-line bg-surface'}`}
      style={{ opacity: focused ? 1 : 0.5 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{TIER_NAME[tier]}</Text>
        {isCurrent ? <Text className="text-xs font-semibold text-accent">Current plan</Text> : null}
      </View>
      <Text className="text-2xl font-semibold text-ink">{price}</Text>
      <View className="mb-1">
        {PLAN_FEATURES[tier].features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>
      <Button variant={isCurrent ? 'ghost' : 'primary'} disabled={isCurrent} onPress={onSelect}>
        {ctaLabel}
      </Button>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-deck-card.test.tsx`
Expected: PASS (3 tests). (If a `Button` with `disabled` still fires `onPress` in this codebase's Button, the third test will catch it — the current card must not call `onSelect`; the Button component disables press when `disabled`.)

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/plan-deck-card.tsx src/components/billing/plan-deck-card.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/plan-deck-card.tsx apps/mobile/src/components/billing/plan-deck-card.test.tsx
git commit -m "feat(mobile): PlanDeckCard carousel card (price, features, tier-aware CTA)"
```

---

### Task 6: `PlanCarouselSheet` — swipeable plans deck in a BottomSheet

The carousel: a `BottomSheet` wrapping a peek-carousel of all four `PlanDeckCard`s (built on the AccountCarousel pattern), with widening position dots + ‹ › arrows. Non-current CTA → close + `openWebBilling`.

**Files:**
- Create: `apps/mobile/src/components/billing/plan-carousel-sheet.tsx`, `apps/mobile/src/components/billing/plan-carousel-sheet.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionTier` from `@finby/shared`; `openWebBilling` from `../../lib/billing-links`; `BottomSheet` from `../ui/bottom-sheet`; `PlanDeckCard` from `./plan-deck-card`.
- Produces: `PlanCarouselSheet({ open, onClose, currentTier }: { open: boolean; onClose: () => void; currentTier: SubscriptionTier })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/plan-carousel-sheet.test.tsx
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { PlanCarouselSheet } from './plan-carousel-sheet';

describe('PlanCarouselSheet', () => {
  it('renders all four tiers and marks the current one', async () => {
    await render(<PlanCarouselSheet open onClose={jest.fn()} currentTier="FREE" />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
  });

  it('a non-current CTA closes the sheet and opens web billing', async () => {
    const onClose = jest.fn();
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<PlanCarouselSheet open onClose={onClose} currentTier="FREE" />);
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings'));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-carousel-sheet.test.tsx`
Expected: FAIL — cannot find module `./plan-carousel-sheet`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/plan-carousel-sheet.tsx
import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import type { SubscriptionTier } from '@finby/shared';
import { openWebBilling } from '../../lib/billing-links';
import { BottomSheet } from '../ui/bottom-sheet';
import { PlanDeckCard } from './plan-deck-card';

const TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const GAP = 12;

/** Position dots — the active dot widens (mirrors the dashboard/onboarding carousels). */
function Dots({ index, onDot }: { index: number; onDot: (i: number) => void }) {
  return (
    <View className="mt-3 flex-row items-center justify-center gap-2">
      <Pressable
        testID="deck-prev"
        disabled={index === 0}
        onPress={() => onDot(index - 1)}
        hitSlop={8}
        style={{ opacity: index === 0 ? 0.3 : 1 }}
      >
        <Text className="text-muted">‹</Text>
      </Pressable>
      {TIERS.map((t, i) => (
        <Pressable key={t} testID={`deck-dot-${i}`} onPress={() => onDot(i)} hitSlop={8}>
          <View className={`h-1.5 rounded-full ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-line'}`} />
        </Pressable>
      ))}
      <Pressable
        testID="deck-next"
        disabled={index === TIERS.length - 1}
        onPress={() => onDot(index + 1)}
        hitSlop={8}
        style={{ opacity: index === TIERS.length - 1 ? 0.3 : 1 }}
      >
        <Text className="text-muted">›</Text>
      </Pressable>
    </View>
  );
}

/** A BottomSheet holding a peek-carousel of all four plans (current marked). Any
 *  non-current CTA closes the sheet and hands off to the web (no in-app purchase). */
export function PlanCarouselSheet({
  open,
  onClose,
  currentTier,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: SubscriptionTier;
}) {
  const [containerW, setContainerW] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Focused card is 84% of the container; neighbours peek via symmetric side padding.
  // Fall back to 360 before the first onLayout — this also lets the deck render under
  // RNTL, which has no layout engine so onLayout never fires with a real width.
  const w = containerW || 360;
  const cardW = Math.round(w * 0.84);
  const sidePad = Math.round((w - cardW) / 2);
  const stride = cardW + GAP;

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(TIERS.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * stride, animated: true });
    setIndex(clamped);
  }

  function handleSelect() {
    onClose();
    openWebBilling();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose your plan">
      <View onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: sidePad, gap: GAP }}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / stride))}
        >
          {TIERS.map((tier, i) => (
            <View key={tier} style={{ width: cardW }}>
              <PlanDeckCard
                tier={tier}
                currentTier={currentTier}
                focused={i === index}
                onSelect={handleSelect}
              />
            </View>
          ))}
        </ScrollView>
        <Dots index={index} onDot={goTo} />
      </View>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-carousel-sheet.test.tsx`
Expected: PASS (2 tests). The fallback width (`containerW || 360`) ensures the four cards mount under RNTL even though `onLayout` never supplies a real width there.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/plan-carousel-sheet.tsx src/components/billing/plan-carousel-sheet.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/plan-carousel-sheet.tsx apps/mobile/src/components/billing/plan-carousel-sheet.test.tsx
git commit -m "feat(mobile): PlanCarouselSheet swipeable plans deck (all tiers, web hand-off)"
```

---

### Task 7: Wire Settings — inline card + carousel sheet

Replace the Settings "Plan & Billing" navigation row with the inline `CurrentPlanCard` (fetches `getSubscription`) + the `PlanCarouselSheet` + `openPortal` manage flow.

**Files:**
- Modify: `apps/mobile/src/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/screens/settings-screen.test.tsx`

**Interfaces:**
- Consumes: `CurrentPlanCard` (`../components/billing/current-plan-card`), `PlanCarouselSheet` (`../components/billing/plan-carousel-sheet`), `SectionCard`/`SectionLoading`/`SectionError`/`SectionState` (`../components/dashboard/section-card`), `useAuthStore`, `api` (`../lib/runtime.native`), RN `Linking`, `SubscriptionView` from `@finby/shared`.

- [ ] **Step 1: Rewrite the test** — replace the existing `'opens the subscription screen from the plan row'` test (added in Phase 5e) with the new inline behavior. Read the current `settings-screen.test.tsx` first; keep all OTHER existing tests. The file mocks `expo-router` with `mockPush`; ADD mocks for `../lib/runtime.native` and `expo-blur` (the sheet). New/updated tests:

```tsx
// Add near the other jest.mock calls at the top of settings-screen.test.tsx:
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('../lib/runtime.native', () => ({
  api: { billing: { getSubscription: jest.fn(), openPortal: jest.fn() } },
}));

// Add these imports with the others:
import { api } from '../lib/runtime.native';
import { waitFor } from '@testing-library/react-native';
const billing = api.billing as unknown as { getSubscription: jest.Mock; openPortal: jest.Mock };
const FREE_SUB = { tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null };

// Ensure the auth mock exposes a workspace with an id (match the file's existing auth-store mock shape).
// In beforeEach: billing.getSubscription.mockReset().mockResolvedValue(FREE_SUB);

// Replace the old '/subscription' navigation test with:
  it('shows the inline current plan and opens the carousel from the plan CTA', async () => {
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText('Free')).toBeTruthy());
    // No navigation row anymore
    expect(screen.queryByLabelText('Plan and billing')).toBeNull();
    // Opening the carousel reveals all tiers
    await fireEvent.press(screen.getByText('Upgrade to Pro'));
    await waitFor(() => expect(screen.getByText('Premium')).toBeTruthy());
  });
```

(If the existing auth-store mock in this file has no `workspace`, extend it to `{ workspace: { id: 'w1', tier: 'FREE' }, ... }` matching how other screen tests mock it — do NOT weaken unrelated assertions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: FAIL — no "Free" inline card yet (still the old nav row).

- [ ] **Step 3: Rewrite the screen** — replace the `Pressable` "Plan & Billing" nav row (the block with `accessibilityLabel="Plan and billing"`) with the inline section, and add the fetch + sheet state. Full new `settings-screen.tsx`:

```tsx
// apps/mobile/src/screens/settings-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ApiError } from '@finby/core';
import type { SubscriptionView } from '@finby/shared';
import { Button } from '../components/ui/button';
import { Toggle } from '../components/ui/toggle';
import {
  SectionCard,
  SectionError,
  SectionLoading,
  type SectionState,
} from '../components/dashboard/section-card';
import { CurrentPlanCard } from '../components/billing/current-plan-card';
import { PlanCarouselSheet } from '../components/billing/plan-carousel-sheet';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';

const LOADING = { data: null, loading: true, error: null } as const;

export function SettingsScreen() {
  const router = useRouter();
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetOnboarding = useAuthStore((s) => s.resetOnboarding);
  const lockEnabled = useAuthStore((s) => s.lockEnabled);
  const setLockEnabled = useAuthStore((s) => s.setLockEnabled);
  const currentStreak = useAuthStore((s) => s.user?.currentStreak ?? 0);

  const [sub, setSub] = useState<SectionState<SubscriptionView>>(LOADING);
  const [managing, setManaging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setSub(LOADING);
    return api.billing
      .getSubscription(workspace.id)
      .then((d) => setSub({ data: d, loading: false, error: null }))
      .catch((e) =>
        setSub({ data: null, loading: false, error: e instanceof ApiError ? e.message : 'Could not load your plan.' }),
      );
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void load();
  }, [workspace, load]);

  async function manage() {
    if (!workspace) return;
    setManaging(true);
    try {
      const { url } = await api.billing.openPortal(workspace.id);
      await Linking.openURL(url);
    } catch {
      /* best-effort */
    } finally {
      setManaging(false);
    }
  }

  async function replayOnboarding() {
    await resetOnboarding();
    await logout();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <View className="border-b border-line px-4 py-3">
        <Text className="text-lg font-semibold text-ink">Settings</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 p-6">
        <Pressable
          onPress={() => router.push('/streaks')}
          accessibilityRole="button"
          accessibilityLabel="View your streak progress"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">🔥 {currentStreak}-day streak</Text>
          <Text className="text-sm font-medium text-accent">View progress →</Text>
        </Pressable>

        <SectionCard title="Plan & Billing">
          {sub.loading ? (
            <SectionLoading />
          ) : sub.error || !sub.data ? (
            <SectionError onRetry={load} />
          ) : (
            <CurrentPlanCard
              sub={sub.data}
              onChangePlan={() => setSheetOpen(true)}
              onManage={() => void manage()}
              managing={managing}
            />
          )}
        </SectionCard>

        {user ? <Text className="text-muted">Signed in as {user.displayName}</Text> : null}

        <View className="flex-row items-center justify-between">
          <Text className="text-base text-ink">Biometric app lock</Text>
          <Toggle
            value={lockEnabled}
            onValueChange={(v) => void setLockEnabled(v)}
            accessibilityLabel="Biometric app lock"
          />
        </View>

        <Button variant="ghost" onPress={() => void logout()}>
          Log out
        </Button>

        {__DEV__ ? (
          <Button variant="ghost" onPress={() => void replayOnboarding()}>
            Replay onboarding (dev)
          </Button>
        ) : null}
      </ScrollView>

      <PlanCarouselSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        currentTier={sub.data?.tier ?? 'FREE'}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: PASS (existing tests + the new inline test), pristine.

- [ ] **Step 5: tsc + lint + commit**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && npx eslint src/screens/settings-screen.tsx src/screens/settings-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/settings-screen.tsx apps/mobile/src/screens/settings-screen.test.tsx
git commit -m "feat(mobile): inline current plan + carousel in Settings (replace nav row)"
```

---

### Task 8: Wire the chat upgrade notice to the carousel sheet

The 429 upgrade notice opens the `PlanCarouselSheet` instead of navigating to `/subscription`.

**Files:**
- Modify: `apps/mobile/src/screens/chat-screen.tsx`
- Modify: `apps/mobile/src/screens/chat-screen.test.tsx`

**Interfaces:**
- Consumes: `PlanCarouselSheet` (`../components/billing/plan-carousel-sheet`). `workspace.tier` from the cached auth-store workspace (fallback `'FREE'`).

- [ ] **Step 1: Update the failing test** — the chat test currently asserts the notice tap calls `mockPush('/subscription')`. Replace that assertion (read the file first; the test is `'routes the upgrade notice to the subscription screen on tap'`) with one asserting the carousel opens. Also ensure `expo-blur` is mocked in this test file (the sheet pulls it; add the mock if absent):

```tsx
// Ensure this mock exists at the top of chat-screen.test.tsx (add if missing):
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));

// Replace the old '/subscription' navigation test with:
  it('opens the plans carousel when the upgrade notice is tapped', async () => {
    mockChat.streamMessage.mockRejectedValue(
      new ApiError(429, 'LIMIT', 'Daily limit reached', { upgradeRequired: true }),
    );
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'hi');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByText('Daily limit reached')).toBeTruthy());
    await fireEvent.press(screen.getByText('Daily limit reached'));
    // The carousel deck is now visible (all four tiers render)
    await waitFor(() => expect(screen.getByText('Premium')).toBeTruthy());
    expect(screen.getByText('Family')).toBeTruthy();
  });
```

(If the test file's `useRouter` mock previously existed only for the `/subscription` push and `mockPush` becomes unused, leave the mock in place — `useRouter` is still used elsewhere in the screen. Do not remove `mockPush` if other tests reference it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: FAIL — tapping the notice still navigates; no carousel mounts.

- [ ] **Step 3: Wire the screen** — in `chat-screen.tsx`:

Add the import (with the other component imports):

```tsx
import { PlanCarouselSheet } from '../components/billing/plan-carousel-sheet';
```

Add sheet state near the other `useState` hooks (after `const [celebration, setCelebration] = useState<NewAchievement[]>([]);`):

```tsx
  const [plansOpen, setPlansOpen] = useState(false);
```

Change the notice `Pressable`'s `onPress` from `() => router.push('/subscription')` to `() => setPlansOpen(true)` (leave `disabled={!notice.upgrade}`, `accessibilityRole`, `accessibilityLabel`, className, and the inner `<Text>` structure exactly as-is):

```tsx
            onPress={() => setPlansOpen(true)}
```

Mount the sheet alongside the other sheets/modals near the bottom of the returned tree (next to the `StreakSheet`/`AchievementUnlockedModal` block):

```tsx
      <PlanCarouselSheet
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        currentTier={workspace?.tier ?? 'FREE'}
      />
```

(If removing the `/subscription` push makes `router` unused, keep `router`/`useRouter` only if still referenced elsewhere; if it becomes entirely unused, remove the now-dead `const router = useRouter();` and its import to keep lint clean. Check with `npx eslint` in Step 5.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: PASS (existing + updated), pristine.

- [ ] **Step 5: tsc + lint + commit**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && npx eslint src/screens/chat-screen.tsx src/screens/chat-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/chat-screen.tsx apps/mobile/src/screens/chat-screen.test.tsx
git commit -m "feat(mobile): chat upgrade notice opens the plans carousel"
```

---

### Task 9: Delete the dedicated subscription screen/route + orphaned 5e components; regen typed routes; full gate

Now that Settings + Chat use the inline card/carousel, retire the page and the 5e components it depended on.

**Files:**
- Delete: `apps/mobile/src/screens/subscription-screen.tsx`, `apps/mobile/src/screens/subscription-screen.test.tsx`
- Delete: `apps/mobile/app/(app)/subscription.tsx`
- Delete: `apps/mobile/src/components/billing/current-plan.tsx`, `apps/mobile/src/components/billing/current-plan.test.tsx` (superseded by `current-plan-card.tsx`)
- Delete: `apps/mobile/src/components/billing/plan-card.tsx`, `apps/mobile/src/components/billing/plan-card.test.tsx` (superseded by `plan-deck-card.tsx`)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (remove the hidden `subscription` Tabs.Screen line)

- [ ] **Step 1: Verify the orphans are unreferenced** — before deleting, confirm nothing still imports them:

```bash
cd /home/unicorn/Documents/finby
grep -rn "subscription-screen\|components/billing/current-plan'\|components/billing/plan-card'\|from './current-plan'\|from './plan-card'\|'/subscription'\|name=\"subscription\"" apps/mobile/src apps/mobile/app
```
Expected: matches ONLY inside the files being deleted and the `_layout.tsx` line being removed. If anything else references them, fix that first (it should already be rewired by Tasks 7–8).

- [ ] **Step 2: Delete the files + remove the layout registration**

```bash
cd /home/unicorn/Documents/finby
git rm apps/mobile/src/screens/subscription-screen.tsx apps/mobile/src/screens/subscription-screen.test.tsx \
  "apps/mobile/app/(app)/subscription.tsx" \
  apps/mobile/src/components/billing/current-plan.tsx apps/mobile/src/components/billing/current-plan.test.tsx \
  apps/mobile/src/components/billing/plan-card.tsx apps/mobile/src/components/billing/plan-card.test.tsx
```

Then edit `apps/mobile/app/(app)/_layout.tsx` and delete the line:

```tsx
        <Tabs.Screen name="subscription" options={{ href: null }} />
```

- [ ] **Step 3: Regenerate typed routes**

Run: `cd apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 timeout 90 npx expo start --port 8097 ; echo "(Ctrl-C if it didn't exit)"`
Expected: `.expo/types/router.d.ts` regenerates without `/subscription`. (Ctrl-C/timeout is fine; types write early.)

- [ ] **Step 4: Full gate**

```bash
cd /home/unicorn/Documents/finby
pnpm --filter finby-mobile test
pnpm --filter finby-mobile exec tsc --noEmit
pnpm lint
```
Expected: mobile tests pass **pristine** (subscription-screen/current-plan/plan-card suites gone; new billing suites present); tsc clean (no dangling `/subscription` Href or orphan imports); lint 0 errors (only the pre-existing `sw.js` `_e` warning).

- [ ] **Step 5: Commit**

```bash
cd /home/unicorn/Documents/finby
git add apps/mobile/app apps/mobile/src
git commit -m "refactor(mobile): retire the dedicated subscription page + orphaned 5e billing components"
```

---

### Task 10: Device validation (user, Expo Go)

**Files:** none (verification only).

- [ ] **Step 1:** `pnpm --filter finby-mobile start` → Settings shows the inline **Plan & Billing** card (current plan, limits/features). "Compare plans" toggles the grid. "Upgrade to Pro"/"Change plan" opens the **carousel** — swipe through Free/Pro/Premium/Family, current marked, dots + arrows work. A non-current CTA opens `chat.finby.app/settings` in the browser and closes the sheet. On a paid+Stripe account, "Manage billing" opens the Stripe portal. In chat, hit the daily limit (or simulate a 429) → the upgrade notice opens the same carousel.
- [ ] **Step 2:** No commit (verification). Fix any issue under the relevant task and re-run the gate.

---

## Out of scope (unchanged deferred IAP slice)

StoreKit/RevenueCat in-app purchases; in-app `startCheckout`/`changePlan`/`cancel`/`resume`; native checkout; backend Apple-receipt validation; Google Play Billing — all blocked on the paid Apple Developer account + an EAS dev build.
