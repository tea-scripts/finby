# Mobile Phase 5e — Subscription & Plans (display layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pushed mobile Subscription screen showing the current plan + all plans (from shared `TIER_LIMITS`/`TIER_PRICING`/`PLAN_FEATURES`), handing upgrade/manage off to the web (`Linking`) — no in-app purchase.

**Architecture:** All plan display data comes from `@finby/shared` (`TIER_LIMITS`, `TIER_PRICING`/`formatTierPrice`, `TIER_HIGHLIGHTS`, and the hoisted `PLAN_FEATURES`/`condensedFeatures`), so the only network calls are `getSubscription` (current plan) and `openPortal` (Stripe portal for paid users). Upgrade/Change → `Linking.openURL(WEB_BILLING_URL)`. Reached from a Settings row + the tappable chat upgrade notice.

> **Deviation from the spec (deliberate, simpler):** the spec mentioned `getPlans()` for pricing. `formatTierPrice`/`TIER_PRICING` are already in `@finby/shared`, so this plan uses those constants and makes **no `getPlans` call** — one fewer network round-trip, same numbers. If live/region pricing is wanted later, `getPlans` is still available.

**Tech Stack:** Expo SDK 54, RN 0.81, NativeWind. No new deps (`Linking` is built in). Tests: Vitest (shared/pure) + jest-expo/RNTL.

## Global Constraints

- **Branch:** all work on `feat/mobile-phase5e-subscription` (this working tree). Re-orient git state before each task.
- **No in-app purchase** — mobile never calls `startCheckout`/`changePlan`/`cancel`/`resume`. Upgrade/Change → `Linking.openURL`; Manage → `openPortal` → `Linking.openURL`.
- **⚠️ Compliance:** the external upgrade link (`WEB_BILLING_URL = 'https://chat.finby.app/settings'`) is an App Store 3.1.1 "steering" **pre-submission stopgap** — must be revisited before App Store submission. Distinct domain from marketing `finby.app`.
- **Rebuild `@finby/shared` after Task 1** before any consumer test/tsc (`pnpm --filter @finby/shared build`).
- **Mock native-backed modules in tests** — tests pulling `react-native-svg`/`expo-blur` etc. mock them; mock RN `Linking` where asserted; `useTabBarSpace` pulls `expo-blur` (mock it in the screen test).
- **RNTL is async** — `await render(...)`, `await fireEvent.*(...)`, `waitFor`.
- **typedRoutes** — after adding the `subscription` route, regenerate `apps/mobile/.expo/types/router.d.ts`: `cd apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 timeout 90 npx expo start --port 8099` (writes types then exits; Ctrl-C/timeout is fine). Then `router.push('/subscription')` typechecks.
- **Strict tsconfig** `noUncheckedIndexedAccess`; eslint flat config has no react-hooks plugin (no exhaustive-deps disable).
- **Theme tokens** (`src/theme/tokens.ts`): canvas `#06101f`, surface `#0b1626`, surface-2 `#11203a`, line `#1c2c46`, accent `#1d6ef5`, ink `#e8eef7`, muted `#8da3c0`, faint `#5b6f8c`, success `#1fae6a`, warn `#f5a524`, danger `#ef4444`.
- **Commit style (HARD RULE):** no AI-attribution trailers; atomic commits.
- **Gate:** `pnpm --filter @finby/shared test` · `pnpm --filter finby-mobile test` (pristine) · `pnpm --filter finby-mobile exec tsc --noEmit` · `pnpm lint` (0 errors; pre-existing `sw.js` `_e` warning OK). Per-task: `npx eslint <changed files>`.

---

### Task 1: Hoist `plan-features` into `@finby/shared`

The plan feature copy is pure (only imports `SubscriptionTier`) and is needed by both web and mobile.

**Files:**
- Create: `packages/shared/src/plan-features.ts`, `packages/shared/src/plan-features.test.ts`
- Modify: `packages/shared/src/index.ts` (add export)
- Modify: `apps/web/src/lib/plan-features.ts` (replace body with a re-export shim)

**Interfaces:**
- Produces (from `@finby/shared`): `FeatureBadgeKind`, `PlanFeature`, `PlanFeatureSet`, `PLAN_FEATURES: Record<SubscriptionTier, PlanFeatureSet>`, `condensedFeatures(tier: SubscriptionTier): PlanFeature[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/plan-features.test.ts
import { describe, expect, it } from 'vitest';
import { PLAN_FEATURES, condensedFeatures } from './plan-features';

describe('plan-features', () => {
  it('exposes a feature set per tier with the Free limitation note', () => {
    expect(PLAN_FEATURES.FREE.features.length).toBeGreaterThan(0);
    expect(PLAN_FEATURES.FREE.limitation).toContain('20-message memory window');
    expect(PLAN_FEATURES.PRO.features.some((f) => f.label.includes('90-day'))).toBe(true);
  });

  it('condensedFeatures returns up to 3, skipping the "Everything in" roll-up', () => {
    const pro = condensedFeatures('PRO');
    expect(pro.length).toBeLessThanOrEqual(3);
    expect(pro.every((f) => !f.label.startsWith('Everything in'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @finby/shared exec vitest run src/plan-features.test.ts`
Expected: FAIL — cannot find module `./plan-features`.

- [ ] **Step 3: Create the shared module** — copy `apps/web/src/lib/plan-features.ts` verbatim, changing only the import to the shared types path:

```ts
// packages/shared/src/plan-features.ts
import type { SubscriptionTier } from './types';

/** Frontend-owned plan feature copy for the pricing surfaces (shared by web +
 *  mobile). The `/billing/plans` endpoint stays the source of truth for pricing,
 *  checkout, and tier-gate logic; this module owns display structure only. */
export type FeatureBadgeKind = 'beta' | 'soon';

export interface PlanFeature {
  label: string;
  note?: string;
  subtext?: string;
  badge?: FeatureBadgeKind;
}

export interface PlanFeatureSet {
  features: PlanFeature[];
  limitation?: string;
}

export const PLAN_FEATURES: Record<SubscriptionTier, PlanFeatureSet> = {
  FREE: {
    features: [
      { label: 'Chat-based expense logging' },
      { label: '20-message memory window' },
      { label: 'Basic dashboard & analytics' },
      { label: 'Budget tracking', note: 'up to 3 budgets' },
      { label: 'Single currency' },
      { label: 'Spending streak' },
    ],
    limitation:
      'Free users have a 20-message memory window — the AI remembers your last 20 messages only.',
  },
  PRO: {
    features: [
      { label: 'Everything in Free' },
      { label: '90-day conversation memory' },
      { label: 'Unlimited currencies & accounts' },
      { label: 'Receipt scanning', note: '20 scans/day' },
      { label: 'Advanced analytics' },
      { label: 'Budget alerts & daily spending summary' },
      { label: 'Streak repair', note: 'recover a missed day, once' },
      { label: 'Voice chat', badge: 'beta' },
      { label: 'Priority support' },
    ],
  },
  PREMIUM: {
    features: [
      { label: 'Everything in Pro' },
      { label: 'Permanent memory dossier', subtext: 'the agent remembers your full financial history — forever' },
      { label: 'Receipt scanning', note: '50 scans/day' },
      { label: 'AI coaching & proactive spending insights' },
      { label: 'Monthly budget review with AI' },
      { label: 'Streak repair', note: 'recover a missed day, once' },
    ],
  },
  FAMILY: {
    features: [
      { label: 'Everything in Premium' },
      { label: 'Up to 5 members' },
      { label: 'Shared workspace' },
      { label: 'Per-member spending views' },
    ],
  },
};

/** The three most distinctive features for a tier (for the current-plan card),
 *  skipping the "Everything in X" roll-up row. */
export function condensedFeatures(tier: SubscriptionTier): PlanFeature[] {
  return PLAN_FEATURES[tier].features
    .filter((f) => !f.label.startsWith('Everything in'))
    .slice(0, 3);
}
```

- [ ] **Step 4: Export from the shared index** — add to `packages/shared/src/index.ts`:

```ts
export * from './plan-features';
```

- [ ] **Step 5: Replace the web file with a shim** — overwrite `apps/web/src/lib/plan-features.ts` entirely:

```ts
export { PLAN_FEATURES, condensedFeatures } from '@finby/shared';
export type { FeatureBadgeKind, PlanFeature, PlanFeatureSet } from '@finby/shared';
```

- [ ] **Step 6: Build shared, run shared test + web typecheck**

Run:
```bash
pnpm --filter @finby/shared build
pnpm --filter @finby/shared exec vitest run src/plan-features.test.ts
pnpm --filter finby-web exec tsc --noEmit
```
Expected: shared builds; shared test passes; web typecheck clean (PlanCard/UpgradeModal import the same names from the shim).

- [ ] **Step 7: Lint + commit**

```bash
cd /home/unicorn/Documents/finby
npx eslint packages/shared/src/plan-features.ts packages/shared/src/plan-features.test.ts apps/web/src/lib/plan-features.ts
git add packages/shared/src/plan-features.ts packages/shared/src/plan-features.test.ts packages/shared/src/index.ts apps/web/src/lib/plan-features.ts
git commit -m "refactor(shared): hoist plan-features copy into @finby/shared"
```

---

### Task 2: `PlanFeatureRow` component

Renders one `PlanFeature` (label + optional note/subtext/badge).

**Files:**
- Create: `apps/mobile/src/components/billing/plan-feature-row.tsx`, `apps/mobile/src/components/billing/plan-feature-row.test.tsx`

**Interfaces:**
- Consumes: `PlanFeature` from `@finby/shared`.
- Produces: `PlanFeatureRow({ feature: PlanFeature })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/plan-feature-row.test.tsx
import { render, screen } from '@testing-library/react-native';
import { PlanFeatureRow } from './plan-feature-row';

describe('PlanFeatureRow', () => {
  it('renders the label, note, subtext and badge', async () => {
    await render(
      <PlanFeatureRow feature={{ label: 'Receipt scanning', note: '20 scans/day', subtext: 'OCR powered', badge: 'beta' }} />,
    );
    expect(screen.getByText('Receipt scanning')).toBeTruthy();
    expect(screen.getByText(/20 scans\/day/)).toBeTruthy();
    expect(screen.getByText('OCR powered')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
  });

  it('renders just the label when there are no extras', async () => {
    await render(<PlanFeatureRow feature={{ label: 'Spending streak' }} />);
    expect(screen.getByText('Spending streak')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-feature-row.test.tsx`
Expected: FAIL — cannot find module `./plan-feature-row`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/plan-feature-row.tsx
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanFeature } from '@finby/shared';

/** One plan feature line: a check, the label (+ optional muted note + badge),
 *  and an optional lighter subtext beneath. */
export function PlanFeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <View className="flex-row items-start gap-2 py-1">
      <Ionicons name="checkmark-circle" size={16} color="#1fae6a" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-sm text-ink">
          {feature.label}
          {feature.note ? <Text className="text-muted"> ({feature.note})</Text> : null}
          {feature.badge ? <Text className="text-xs font-semibold text-accent"> {feature.badge}</Text> : null}
        </Text>
        {feature.subtext ? <Text className="text-xs text-muted">{feature.subtext}</Text> : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-feature-row.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/plan-feature-row.tsx src/components/billing/plan-feature-row.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/plan-feature-row.tsx apps/mobile/src/components/billing/plan-feature-row.test.tsx
git commit -m "feat(mobile): PlanFeatureRow (label, note, subtext, badge)"
```

---

### Task 3: `PlanCard` component

One tier's card: name, price (from shared `formatTierPrice`), its features, and a "Current plan" marker.

**Files:**
- Create: `apps/mobile/src/components/billing/plan-card.tsx`, `apps/mobile/src/components/billing/plan-card.test.tsx`

**Interfaces:**
- Consumes: `PLAN_FEATURES`, `formatTierPrice`, `SubscriptionTier` from `@finby/shared`; `PlanFeatureRow` from `./plan-feature-row`.
- Produces: `PlanCard({ tier: SubscriptionTier; current: boolean })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/plan-card.test.tsx
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { PlanCard } from './plan-card';

describe('PlanCard', () => {
  it('shows a paid tier name, monthly price and features', async () => {
    await render(<PlanCard tier="PRO" current={false} />);
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('$4.99/mo')).toBeTruthy();
    expect(screen.getByText('90-day conversation memory')).toBeTruthy();
  });

  it('shows Free with no price and a Current marker when current', async () => {
    await render(<PlanCard tier="FREE" current />);
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Current plan')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-card.test.tsx`
Expected: FAIL — cannot find module `./plan-card`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/plan-card.tsx
import { Text, View } from 'react-native';
import { PLAN_FEATURES, formatTierPrice, type SubscriptionTier } from '@finby/shared';
import { PlanFeatureRow } from './plan-feature-row';

const TIER_NAME: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

/** A single plan's card: name, monthly price (paid tiers), feature list, and a
 *  "Current plan" marker for the user's tier. Pure display — pricing/features
 *  come from @finby/shared. */
export function PlanCard({ tier, current }: { tier: SubscriptionTier; current: boolean }) {
  const price = tier === 'FREE' ? 'Free' : `${formatTierPrice(tier)}/mo`;
  return (
    <View className={`gap-2 rounded-2xl border bg-surface p-4 ${current ? 'border-accent' : 'border-line'}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{TIER_NAME[tier]}</Text>
        {current ? (
          <Text className="text-xs font-semibold text-accent">Current plan</Text>
        ) : (
          <Text className="text-sm font-semibold text-ink">{price}</Text>
        )}
      </View>
      <View>
        {PLAN_FEATURES[tier].features.map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/plan-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/plan-card.tsx src/components/billing/plan-card.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/plan-card.tsx apps/mobile/src/components/billing/plan-card.test.tsx
git commit -m "feat(mobile): PlanCard (tier name, price, features)"
```

---

### Task 4: `CurrentPlan` component

The current-plan summary: tier + status + billing dates + condensed features + CTAs.

**Files:**
- Create: `apps/mobile/src/components/billing/current-plan.tsx`, `apps/mobile/src/components/billing/current-plan.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionView`, `condensedFeatures` from `@finby/shared`; `PlanFeatureRow` from `./plan-feature-row`; `Button` from `../ui/button`.
- Produces: `CurrentPlan({ sub: SubscriptionView; onUpgrade: () => void; onManage: () => void; managing: boolean })`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/billing/current-plan.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import type { SubscriptionView } from '@finby/shared';
import { CurrentPlan } from './current-plan';

const sub = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null,
  cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null, ...over,
});

describe('CurrentPlan', () => {
  it('FREE: shows an Upgrade button, no Manage', async () => {
    const onUpgrade = jest.fn();
    await render(<CurrentPlan sub={sub()} onUpgrade={onUpgrade} onManage={jest.fn()} managing={false} />);
    expect(screen.getByText('Free')).toBeTruthy();
    await fireEvent.press(screen.getByText('Upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Manage billing')).toBeNull();
  });

  it('paid + Stripe: shows billing date, Change plan and Manage billing', async () => {
    const onManage = jest.fn();
    await render(
      <CurrentPlan
        sub={sub({ tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' })}
        onUpgrade={jest.fn()}
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

Run: `cd apps/mobile && pnpm exec jest src/components/billing/current-plan.test.tsx`
Expected: FAIL — cannot find module `./current-plan`.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/mobile/src/components/billing/current-plan.tsx
import { Text, View } from 'react-native';
import { condensedFeatures, type SubscriptionTier, type SubscriptionView } from '@finby/shared';
import { Button } from '../ui/button';
import { PlanFeatureRow } from './plan-feature-row';

const TIER_NAME: Record<SubscriptionTier, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium', FAMILY: 'Family' };

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Current-plan summary: tier + status + billing context + condensed features,
 *  with the Upgrade/Change CTA and (paid + Stripe) Manage billing. */
export function CurrentPlan({
  sub,
  onUpgrade,
  onManage,
  managing,
}: {
  sub: SubscriptionView;
  onUpgrade: () => void;
  onManage: () => void;
  managing: boolean;
}) {
  const isFree = sub.tier === 'FREE';
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Current plan</Text>
        <Text className="text-base font-semibold text-ink">{TIER_NAME[sub.tier]}</Text>
      </View>

      <View>
        {condensedFeatures(sub.tier).map((f) => (
          <PlanFeatureRow key={f.label} feature={f} />
        ))}
      </View>

      {!isFree ? (
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
      ) : null}

      <View className="gap-2">
        <Button onPress={onUpgrade}>{isFree ? 'Upgrade' : 'Change plan'}</Button>
        {!isFree && sub.billingProvider === 'STRIPE' ? (
          <Button variant="ghost" loading={managing} onPress={onManage}>
            Manage billing
          </Button>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/billing/current-plan.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/components/billing/current-plan.tsx src/components/billing/current-plan.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/components/billing/current-plan.tsx apps/mobile/src/components/billing/current-plan.test.tsx
git commit -m "feat(mobile): CurrentPlan summary (status, dates, features, CTAs)"
```

---

### Task 5: SubscriptionScreen + route registration

Compose `CurrentPlan` + a list of `PlanCard`, fetch `getSubscription`, wire `openPortal` + `Linking`.

**Files:**
- Create: `apps/mobile/src/screens/subscription-screen.tsx`, `apps/mobile/src/screens/subscription-screen.test.tsx`
- Create: `apps/mobile/app/(app)/subscription.tsx` (route)
- Modify: `apps/mobile/app/(app)/_layout.tsx` (register hidden `subscription` screen)

**Interfaces:**
- Consumes: `CurrentPlan` (`../components/billing/current-plan`), `PlanCard` (`../components/billing/plan-card`), `SectionCard`/`SectionLoading`/`SectionError`/`SectionState` (`../components/dashboard/section-card`), `useTabBarSpace` (`../components/nav/floating-tab-bar`), `useAuthStore`, `api`, `useRouter` (expo-router), RN `Linking`. `SubscriptionView`, `SubscriptionTier` from `@finby/shared`.
- Produces: `SubscriptionScreen()` (default export from the route file). `WEB_BILLING_URL = 'https://chat.finby.app/settings'`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/screens/subscription-screen.test.tsx
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const authState = { workspace: { id: 'w1' } };
jest.mock('../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));
jest.mock('../lib/runtime.native', () => ({
  api: { billing: { getSubscription: jest.fn(), openPortal: jest.fn() } },
}));
const back = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back, push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: { children: unknown }) => children }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Text', null, name),
}));

import { api } from '../lib/runtime.native';
import { SubscriptionScreen } from './subscription-screen';

const billing = api.billing as unknown as { getSubscription: jest.Mock; openPortal: jest.Mock };
const FREE = { tier: 'FREE', status: 'ACTIVE', billingProvider: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingTier: null, pendingTierEffectiveAt: null };
const PRO = { ...FREE, tier: 'PRO', billingProvider: 'STRIPE', currentPeriodEnd: '2026-08-01T00:00:00Z' };

beforeEach(() => {
  back.mockReset();
  billing.getSubscription.mockReset();
  billing.openPortal.mockReset().mockResolvedValue({ url: 'https://portal.stripe/x' });
});

describe('SubscriptionScreen', () => {
  it('FREE: Upgrade opens the web billing page', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    billing.getSubscription.mockResolvedValue(FREE);
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByText('Upgrade')).toBeTruthy());
    await fireEvent.press(screen.getByText('Upgrade'));
    expect(spy).toHaveBeenCalledWith('https://chat.finby.app/settings');
    spy.mockRestore();
  });

  it('paid: Manage billing opens the Stripe portal url', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    billing.getSubscription.mockResolvedValue(PRO);
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByText('Manage billing')).toBeTruthy());
    await fireEvent.press(screen.getByText('Manage billing'));
    await waitFor(() => expect(billing.openPortal).toHaveBeenCalledWith('w1'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('https://portal.stripe/x'));
    spy.mockRestore();
  });

  it('shows an error + retry when the subscription fails to load', async () => {
    billing.getSubscription.mockRejectedValue(new Error('nope'));
    await render(<SubscriptionScreen />);
    await waitFor(() => expect(screen.getByTestId('section-retry')).toBeTruthy());
  });

  it('goes back from the header', async () => {
    billing.getSubscription.mockResolvedValue(FREE);
    await render(<SubscriptionScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/subscription-screen.test.tsx`
Expected: FAIL — cannot find module `./subscription-screen`.

- [ ] **Step 3: Write the screen**

```tsx
// apps/mobile/src/screens/subscription-screen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@finby/core';
import type { SubscriptionTier, SubscriptionView } from '@finby/shared';
import { useAuthStore } from '../lib/use-auth-store';
import { api } from '../lib/runtime.native';
import { SectionCard, SectionError, SectionLoading, type SectionState } from '../components/dashboard/section-card';
import { CurrentPlan } from '../components/billing/current-plan';
import { PlanCard } from '../components/billing/plan-card';
import { useTabBarSpace } from '../components/nav/floating-tab-bar';

export const WEB_BILLING_URL = 'https://chat.finby.app/settings';
const ALL_TIERS: SubscriptionTier[] = ['FREE', 'PRO', 'PREMIUM', 'FAMILY'];
const LOADING = { data: null, loading: true, error: null } as const;
function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not load your plan.';
}

export function SubscriptionScreen() {
  const workspace = useAuthStore((s) => s.workspace);
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const [sub, setSub] = useState<SectionState<SubscriptionView>>(LOADING);
  const [managing, setManaging] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return Promise.resolve();
    setSub(LOADING);
    return api.billing
      .getSubscription(workspace.id)
      .then((d) => setSub({ data: d, loading: false, error: null }))
      .catch((e) => setSub({ data: null, loading: false, error: errMsg(e) }));
  }, [workspace]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!workspace || initialized.current) return;
    initialized.current = true;
    void load();
  }, [workspace, load]);

  function openWebBilling() {
    void Linking.openURL(WEB_BILLING_URL).catch(() => {});
  }

  async function manage() {
    if (!workspace) return;
    setManaging(true);
    try {
      const { url } = await api.billing.openPortal(workspace.id);
      await Linking.openURL(url);
    } catch {
      /* best-effort; surfaced by the disabled state lifting */
    } finally {
      setManaging(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="flex-row items-center gap-2 border-b border-line px-4 py-3">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#e8eef7" />
        </Pressable>
        <Text className="text-lg font-semibold text-ink">Plan & Billing</Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-4 py-5" contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        <SectionCard title="Your plan">
          {sub.loading ? (
            <SectionLoading />
          ) : sub.error || !sub.data ? (
            <SectionError onRetry={load} />
          ) : (
            <CurrentPlan sub={sub.data} onUpgrade={openWebBilling} onManage={() => void manage()} managing={managing} />
          )}
        </SectionCard>

        <SectionCard title="All plans">
          <View className="gap-3">
            {ALL_TIERS.map((tier) => (
              <PlanCard key={tier} tier={tier} current={sub.data?.tier === tier} />
            ))}
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Create the route file**

```tsx
// apps/mobile/app/(app)/subscription.tsx
export { SubscriptionScreen as default } from '../../src/screens/subscription-screen';
```

- [ ] **Step 5: Register the hidden route** — in `apps/mobile/app/(app)/_layout.tsx`, add after the existing hidden `streaks` screen line:

```tsx
        <Tabs.Screen name="subscription" options={{ href: null }} />
```

- [ ] **Step 6: Regenerate typed routes, then run test + tsc**

Run:
```bash
cd apps/mobile && EXPO_NO_TELEMETRY=1 CI=1 timeout 90 npx expo start --port 8099 ; echo "(Ctrl-C if it didn't exit)"
pnpm exec jest src/screens/subscription-screen.test.tsx
pnpm exec tsc --noEmit
```
Expected: typegen writes the route types; the 4 screen tests pass; tsc clean.

- [ ] **Step 7: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/subscription-screen.tsx src/screens/subscription-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/subscription-screen.tsx apps/mobile/src/screens/subscription-screen.test.tsx "apps/mobile/app/(app)/subscription.tsx" "apps/mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): subscription screen (current plan + all plans) + hidden route"
```

---

### Task 6: Settings "Plan & Billing" row

**Files:**
- Modify: `apps/mobile/src/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/screens/settings-screen.test.tsx`

- [ ] **Step 1: Add a failing test** — inside the existing `describe` in `settings-screen.test.tsx`:

```tsx
  it('opens the subscription screen from the plan row', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Plan and billing'));
    expect(mockPush).toHaveBeenCalledWith('/subscription');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: FAIL — no element labelled `Plan and billing`.

- [ ] **Step 3: Add the row** — in `settings-screen.tsx`, add as the second child inside the `<View className="gap-6 p-6">` block (right after the streak `Pressable`):

```tsx
        <Pressable
          onPress={() => router.push('/subscription')}
          accessibilityRole="button"
          accessibilityLabel="Plan and billing"
          className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
        >
          <Text className="text-base text-ink">Plan &amp; Billing</Text>
          <Text className="text-sm font-medium text-accent">Manage →</Text>
        </Pressable>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings-screen.test.tsx`
Expected: PASS (existing + 1 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/settings-screen.tsx src/screens/settings-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/settings-screen.tsx apps/mobile/src/screens/settings-screen.test.tsx
git commit -m "feat(mobile): Settings Plan & Billing row → subscription screen"
```

---

### Task 7: Tappable chat upgrade notice

When the chat notice is an upgrade prompt (`notice.upgrade`), make it tap to the subscription screen.

**Files:**
- Modify: `apps/mobile/src/screens/chat-screen.tsx`
- Modify: `apps/mobile/src/screens/chat-screen.test.tsx`

**Interfaces:**
- Consumes: `useRouter` (expo-router) — add to `chat-screen` (it isn't used there yet).

- [ ] **Step 1: Add a failing test** to `chat-screen.test.tsx` (the file already mocks `expo-router` with a `mockPush`; reuse it):

```tsx
  it('routes the upgrade notice to the subscription screen on tap', async () => {
    mockChat.streamMessage.mockRejectedValue(
      new ApiError(429, 'LIMIT', 'Daily limit reached', { upgradeRequired: true }),
    );
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByTestId('composer-input'), 'hi');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByText('Daily limit reached')).toBeTruthy());
    await fireEvent.press(screen.getByText('Daily limit reached'));
    expect(mockPush).toHaveBeenCalledWith('/subscription');
  });
```

(`ApiError(status, code, message, details?)` — the 4th arg is `details` [confirmed in `packages/core/src/http.ts`]; `chat-notice` reads `details.upgradeRequired`, so a 429 with `{ upgradeRequired: true }` yields `{ kind:'limit', upgrade:true }`. `ApiError` is already imported at the top of `chat-screen.test.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: FAIL — pressing the notice text does nothing (it's not pressable).

- [ ] **Step 3: Wire the screen** — in `chat-screen.tsx`:

Add the import (with the other expo-router-free imports):

```tsx
import { useRouter } from 'expo-router';
```

Add the hook near the other hooks in `ChatScreen`:

```tsx
  const router = useRouter();
```

Replace the notice block (the `{notice ? ( … ) : null}` View) with a version that's pressable when it's an upgrade notice:

```tsx
        {notice ? (
          <Pressable
            disabled={!notice.upgrade}
            onPress={() => router.push('/subscription')}
            className={`mx-3 mb-2 rounded-xl border px-3.5 py-2.5 ${NOTICE_STYLES[notice.kind]}`}
          >
            <Text className={`text-sm ${notice.kind === 'error' ? 'text-danger' : 'text-warn'}`}>
              {notice.message}
              {notice.upgrade ? <Text className="font-medium"> — see plans →</Text> : null}
            </Text>
          </Pressable>
        ) : null}
```

(`Pressable` is already imported in `chat-screen.tsx`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/chat-screen.test.tsx`
Expected: PASS (existing + 1 new), pristine.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/mobile && npx eslint src/screens/chat-screen.tsx src/screens/chat-screen.test.tsx
cd /home/unicorn/Documents/finby
git add apps/mobile/src/screens/chat-screen.tsx apps/mobile/src/screens/chat-screen.test.tsx
git commit -m "feat(mobile): tap the chat upgrade notice to open plans"
```

---

### Task 8: Full gate + device validation

**Files:** none (verification only).

- [ ] **Step 1: Run the gate**

```bash
cd /home/unicorn/Documents/finby
pnpm --filter @finby/shared build
pnpm --filter @finby/shared test
pnpm --filter finby-mobile test
pnpm --filter finby-mobile exec tsc --noEmit
pnpm lint
```
Expected: shared builds + tests pass; mobile tests pass **pristine**; tsc clean; lint 0 errors (only the pre-existing `sw.js` `_e` warning).

- [ ] **Step 2: Device smoke (user, Expo Go)**

Run: `pnpm --filter finby-mobile start` → Settings → "Plan & Billing" opens the screen (current plan + all plans). On FREE: "Upgrade" opens `chat.finby.app/settings` in the browser. On a paid+Stripe account: "Manage billing" opens the Stripe portal. In chat, hit the daily limit (or simulate a 429) → the upgrade notice is tappable → opens the screen. Back works.

- [ ] **Step 3: No commit** (verification). Fix any issue under the relevant task and re-run the gate.

---

## Out of scope (the deferred IAP slice)

StoreKit/RevenueCat in-app purchases; in-app `startCheckout`/`changePlan`/`cancel`/`resume`; a native checkout/UpgradeModal; backend Apple-receipt validation; Google Play Billing — all blocked on the paid Apple Developer account + an EAS dev build.
