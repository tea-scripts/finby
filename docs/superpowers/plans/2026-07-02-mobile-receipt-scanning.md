# Mobile Receipt Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add receipt scanning to the mobile chat screen — capture a receipt via camera or photo library, extract it with the existing vision endpoint, review/edit the draft, log it as a transaction, and post a confirmation note into chat.

**Architecture:** The backend (`POST /workspaces/:id/receipts/extract`), the `@finby/core` receipts/transactions/chat APIs, and the `@finby/shared` types already exist and are already bound on mobile (`api.receipts.extractReceipt`). This plan is purely mobile UI + image capture: a new `expo-image-picker` adapter, a `ReceiptScannerSheet` (BottomSheet state machine), a `ReceiptConfirmationCard`, a composer camera button, and chat-screen glue. No backend, `@finby/core`, or `@finby/shared` changes.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, expo-router, NativeWind, `expo-image-picker`. Tests: Vitest (`*.test.ts`, pure logic) + Jest/jest-expo + React Native Testing Library (`*.test.tsx`, components).

## Global Constraints

- **Custom UI only** — use `apps/mobile/src/components/ui/*` primitives (`Button`, `Input`, `Field`, `Dropdown`, `BottomSheet`); never native form controls in feature code.
- **Test split (never overlap):** pure logic → Vitest `*.test.ts` (node); components → Jest `*.test.tsx` (jest-expo). `jest.config.js` `testMatch` is `<rootDir>/src/**/*.test.tsx`; `vitest.config.ts` `include` is `src/**/*.test.ts`.
- **Run from `apps/mobile/`**: `npm run test:logic` (Vitest), `npm run test:components` (Jest), `npm run test` (both), `npm run typecheck`.
- **Tier gate:** receipt scanning is **PRO+**. Gate the UI with `UpgradeGate requiredTier="PRO"` using `workspace?.tier ?? 'FREE'`.
- **Endpoint contract (do not change):** multipart, field name `image`, ≤5 MB, `image/jpeg|png|webp|heic`; returns `ReceiptExtraction`. Backend enforces tier (403) + daily rate limit (429) and returns human-readable `ApiError.message` for all failures.
- **RN file seam:** `extractReceipt` types its arg as `File` (RN has none). Pass the picker's `{ uri, name, type }` object cast as `res.file as unknown as File`. Do NOT modify the core signature.
- **Commit style:** no AI-attribution trailers. One logical change per commit.
- **Line budget:** keep new files focused and under 500 lines.

---

### Task 1: Add `expo-image-picker` dependency + native permissions

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/app.json:26-31` (plugins) and `apps/mobile/app.json:18-22` (iOS infoPlist)

**Interfaces:**
- Consumes: nothing.
- Produces: `expo-image-picker` available to import; iOS `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` and Android camera permission declared.

- [ ] **Step 1: Install the library (version resolved by Expo)**

Run (from `apps/mobile/`):
```bash
npx expo install expo-image-picker
```
Expected: `expo-image-picker` added to `package.json` `dependencies` with an SDK-54-compatible version (`~17.x`).

- [ ] **Step 2: Register the config plugin with permission strings in `app.json`**

Replace the `plugins` array (currently `apps/mobile/app.json:26-31`) so it includes the image-picker plugin:

```json
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-localization",
      ["expo-notifications", { "color": "#1d6ef5" }],
      [
        "expo-image-picker",
        {
          "photosPermission": "Finby uses your photos so you can attach a receipt to log an expense.",
          "cameraPermission": "Finby uses the camera so you can photograph a receipt to log an expense."
        }
      ]
    ],
```

- [ ] **Step 3: Add the iOS usage strings to `infoPlist`**

Replace the iOS `infoPlist` block (currently `apps/mobile/app.json:18-22`) with:

```json
      "infoPlist": {
        "NSFaceIDUsageDescription": "Finby uses Face ID to unlock the app and keep your finances private.",
        "ITSAppUsesNonExemptEncryption": false,
        "NSCameraUsageDescription": "Finby uses the camera so you can photograph a receipt to log an expense.",
        "NSPhotoLibraryUsageDescription": "Finby uses your photos so you can attach a receipt to log an expense."
      },
```

- [ ] **Step 4: Verify config parses and the dep is present**

Run (from `apps/mobile/`):
```bash
node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('app.json OK')" && node -e "console.log(require('./package.json').dependencies['expo-image-picker'])"
```
Expected: `app.json OK` then a version string (e.g. `~17.0.x`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json ../../pnpm-lock.yaml
git commit -m "build(mobile): add expo-image-picker + camera/photo permissions"
```
(If `pnpm-lock.yaml` wasn't changed by `expo install`, drop it from the `git add`.)

---

### Task 2: Image picker adapter (`pickImage`)

**Files:**
- Create: `apps/mobile/src/lib/image-picker.ts`
- Test: `apps/mobile/src/lib/image-picker.test.ts`

**Interfaces:**
- Consumes: `expo-image-picker` (`requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`, `launchCameraAsync`, `launchImageLibraryAsync`).
- Produces:
  - `type PickedImage = { uri: string; name: string; type: string }`
  - `type PickResult = { status: 'picked'; file: PickedImage } | { status: 'denied' } | { status: 'canceled' }`
  - `function pickImage(source: 'camera' | 'library'): Promise<PickResult>`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/image-picker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: vi.mock is hoisted above imports, so its factory can't reference a
// plain outer `const` (temporal dead zone). hoisted() lifts the mock with it.
const mock = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock('expo-image-picker', () => mock);

import { pickImage } from './image-picker';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pickImage', () => {
  it('returns denied when camera permission is refused', async () => {
    mock.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    const res = await pickImage('camera');
    expect(res).toEqual({ status: 'denied' });
    expect(mock.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('returns canceled when the user backs out', async () => {
    mock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    const res = await pickImage('library');
    expect(res).toEqual({ status: 'canceled' });
  });

  it('maps a camera asset to a file object with sensible fallbacks', async () => {
    mock.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/abc.heic', fileName: 'abc.heic', mimeType: 'image/heic' }],
    });
    const res = await pickImage('camera');
    expect(res).toEqual({
      status: 'picked',
      file: { uri: 'file:///tmp/abc.heic', name: 'abc.heic', type: 'image/heic' },
    });
  });

  it('derives name from the uri and defaults the type when metadata is missing', async () => {
    mock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/xyz.jpg' }],
    });
    const res = await pickImage('library');
    expect(res).toEqual({
      status: 'picked',
      file: { uri: 'file:///tmp/xyz.jpg', name: 'xyz.jpg', type: 'image/jpeg' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile/`):
```bash
npm run test:logic -- image-picker
```
Expected: FAIL — `Failed to resolve import "./image-picker"` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/lib/image-picker.ts`:

```ts
import * as ImagePicker from 'expo-image-picker';

/** An image selected on-device, shaped for React Native's FormData multipart
 *  upload (`{ uri, name, type }`). RN has no `File`/`Blob`-from-uri. */
export type PickedImage = { uri: string; name: string; type: string };

export type PickResult =
  | { status: 'picked'; file: PickedImage }
  | { status: 'denied' }
  | { status: 'canceled' };

/** Request the relevant permission, launch the camera or library, and map the
 *  first asset to an RN file object. Never throws for the ordinary
 *  denied/canceled paths — the caller renders those as UI states. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return { status: 'canceled' };

  return {
    status: 'picked',
    file: {
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'receipt.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/mobile/`):
```bash
npm run test:logic -- image-picker
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/image-picker.ts apps/mobile/src/lib/image-picker.test.ts
git commit -m "feat(mobile): add expo-image-picker adapter for receipt capture"
```

---

### Task 3: Category resolution helper

**Files:**
- Create: `apps/mobile/src/components/receipts/receipt-category.ts`
- Test: `apps/mobile/src/components/receipts/receipt-category.test.ts`

**Interfaces:**
- Consumes: `Category` from `@finby/shared` (`{ id, name, isArchived, icon?, color? }`).
- Produces: `function resolveCategoryId(categories: Category[], name: string): string` — maps a model category name onto a workspace category id; unknown → the "Other" category's id, or `''` (uncategorized) if there is none. Ignores archived categories.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/receipts/receipt-category.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Category } from '@finby/shared';
import { resolveCategoryId } from './receipt-category';

const cats: Category[] = [
  { id: 'c-dining', name: 'Dining', isArchived: false },
  { id: 'c-other', name: 'Other', isArchived: false },
  { id: 'c-old', name: 'Groceries', isArchived: true },
];

describe('resolveCategoryId', () => {
  it('matches an active category by name, case-insensitively', () => {
    expect(resolveCategoryId(cats, 'dining')).toBe('c-dining');
  });

  it('falls back to "Other" for an unknown name', () => {
    expect(resolveCategoryId(cats, 'Spaceship Parts')).toBe('c-other');
  });

  it('ignores archived categories when matching', () => {
    // "Groceries" exists but is archived → no match → falls back to Other.
    expect(resolveCategoryId(cats, 'Groceries')).toBe('c-other');
  });

  it('returns "" (uncategorized) when neither a match nor "Other" exists', () => {
    expect(resolveCategoryId([{ id: 'c-dining', name: 'Dining', isArchived: false }], 'Nope')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile/`):
```bash
npm run test:logic -- receipt-category
```
Expected: FAIL — cannot resolve `./receipt-category`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/components/receipts/receipt-category.ts`:

```ts
import type { Category } from '@finby/shared';

/** Map the model's category name onto the workspace's real categories; unknown
 *  names land on "Other" (or uncategorized `''` if that's missing too). */
export function resolveCategoryId(categories: Category[], name: string): string {
  const active = categories.filter((c) => !c.isArchived);
  const match = active.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  return active.find((c) => c.name.toLowerCase() === 'other')?.id ?? '';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/mobile/`):
```bash
npm run test:logic -- receipt-category
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/receipts/receipt-category.ts apps/mobile/src/components/receipts/receipt-category.test.ts
git commit -m "feat(mobile): add receipt category resolution helper"
```

---

### Task 4: `ReceiptConfirmationCard` component

**Files:**
- Create: `apps/mobile/src/components/receipts/receipt-confirmation-card.tsx`
- Test: `apps/mobile/src/components/receipts/receipt-confirmation-card.test.tsx`

**Interfaces:**
- Consumes: `resolveCategoryId` (Task 3); `Category`, `ReceiptExtraction` from `@finby/shared`; UI `Button`, `Dropdown`, `Field`, `Input`.
- Produces:
  - `interface ReceiptConfirmInput { total: string; merchant: string; categoryId: string | null }`
  - `function ReceiptConfirmationCard(props: { extraction: ReceiptExtraction; categories: Category[]; confirming: boolean; onConfirm: (input: ReceiptConfirmInput) => void; onCancel: () => void })`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/receipts/receipt-confirmation-card.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import type { Category, ReceiptExtraction } from '@finby/shared';
import { ReceiptConfirmationCard } from './receipt-confirmation-card';

const categories: Category[] = [
  { id: 'c-dining', name: 'Dining', isArchived: false },
  { id: 'c-other', name: 'Other', isArchived: false },
];

function extraction(over: Partial<ReceiptExtraction> = {}): ReceiptExtraction {
  return {
    merchant: 'Cafe Roma',
    total: 24.5,
    currency: 'USD',
    date: '2026-07-01',
    category: 'Dining',
    lineItems: [{ name: 'Latte', amount: 4.5 }],
    confidence: 0.9,
    isMixedCategories: false,
    showLineItems: false,
    notes: null,
    ...over,
  };
}

describe('ReceiptConfirmationCard', () => {
  it('prefills the merchant and total from the extraction', () => {
    render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Cafe Roma')).toBeTruthy();
    expect(screen.getByDisplayValue('24.5')).toBeTruthy();
  });

  it('emits the trimmed values and resolved category on confirm', () => {
    const onConfirm = jest.fn();
    render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Log Transaction'));
    expect(onConfirm).toHaveBeenCalledWith({ total: '24.5', merchant: 'Cafe Roma', categoryId: 'c-dining' });
  });

  it('disables confirm when the total is not a positive number', () => {
    const onConfirm = jest.fn();
    render(
      <ReceiptConfirmationCard
        extraction={extraction()}
        categories={categories}
        confirming={false}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByTestId('receipt-total'), '0');
    fireEvent.press(screen.getByText('Log Transaction'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows line items when showLineItems is set', () => {
    render(
      <ReceiptConfirmationCard
        extraction={extraction({ showLineItems: true })}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText('Latte')).toBeTruthy();
  });

  it('warns when confidence is low', () => {
    render(
      <ReceiptConfirmationCard
        extraction={extraction({ confidence: 0.3 })}
        categories={categories}
        confirming={false}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText(/not fully confident/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile/`):
```bash
npm run test:components -- receipt-confirmation-card
```
Expected: FAIL — cannot resolve `./receipt-confirmation-card`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/components/receipts/receipt-confirmation-card.tsx`:

```tsx
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Category, ReceiptExtraction } from '@finby/shared';
import { Button } from '../ui/button';
import { Dropdown } from '../ui/dropdown';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { resolveCategoryId } from './receipt-category';

export interface ReceiptConfirmInput {
  /** The (possibly user-corrected) total as a decimal string. */
  total: string;
  /** The (possibly user-corrected) merchant name — '' when cleared. */
  merchant: string;
  categoryId: string | null;
}

/**
 * Review step between extraction and logging. Total and merchant are editable
 * (vision confidence is imperfect, and receipts often print the franchise
 * corporation instead of the brand) and the category can be corrected — nothing
 * is logged until the user confirms.
 */
export function ReceiptConfirmationCard({
  extraction,
  categories,
  confirming,
  onConfirm,
  onCancel,
}: {
  extraction: ReceiptExtraction;
  categories: Category[];
  confirming: boolean;
  onConfirm: (input: ReceiptConfirmInput) => void;
  onCancel: () => void;
}) {
  const [total, setTotal] = useState(String(extraction.total));
  const [merchant, setMerchant] = useState(extraction.merchant);
  const [categoryId, setCategoryId] = useState(() => resolveCategoryId(categories, extraction.category));

  const categoryOptions = [
    { value: '', label: 'Uncategorized' },
    ...categories.filter((c) => !c.isArchived).map((c) => ({ value: c.id, label: c.name })),
  ];

  const totalValid = /^\d+(\.\d+)?$/.test(total.trim()) && Number(total) > 0;

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-muted">{extraction.date}</Text>
        <Text className="font-mono text-sm text-muted">{extraction.currency}</Text>
      </View>

      <Field
        label="Merchant"
        hint="Receipts often show the franchise company — rename it to what you'll remember."
      >
        <Input
          testID="receipt-merchant"
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Where was this?"
        />
      </Field>

      <Field label={`Total (${extraction.currency})`}>
        <Input
          testID="receipt-total"
          keyboardType="decimal-pad"
          value={total}
          invalid={!totalValid}
          onChangeText={setTotal}
        />
      </Field>

      <Field label="Category">
        <Dropdown
          accessibilityLabel="Category"
          value={categoryId}
          onSelect={setCategoryId}
          options={categoryOptions}
        />
      </Field>

      {extraction.showLineItems && extraction.lineItems.length > 0 ? (
        <View className="gap-1.5 rounded-xl border border-line bg-canvas/40 p-3">
          {extraction.lineItems.map((item, i) => (
            <View key={`${item.name}-${i}`} className="flex-row justify-between gap-3">
              <Text className="flex-1 text-sm text-muted" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="font-mono text-sm text-ink">{item.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {extraction.confidence < 0.5 ? (
        <Text className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          ⚠️ We're not fully confident in this total — please verify.
        </Text>
      ) : null}

      {extraction.notes ? <Text className="text-xs text-faint">{extraction.notes}</Text> : null}

      <View className="flex-row gap-2 pt-1">
        <View className="flex-1">
          <Button variant="ghost" onPress={onCancel} disabled={confirming}>
            Cancel
          </Button>
        </View>
        <View className="flex-1">
          <Button
            onPress={() =>
              onConfirm({ total: total.trim(), merchant: merchant.trim(), categoryId: categoryId || null })
            }
            loading={confirming}
            disabled={!totalValid}
          >
            Log Transaction
          </Button>
        </View>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/mobile/`):
```bash
npm run test:components -- receipt-confirmation-card
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/receipts/receipt-confirmation-card.tsx apps/mobile/src/components/receipts/receipt-confirmation-card.test.tsx
git commit -m "feat(mobile): add receipt confirmation card"
```

---

### Task 5: `ReceiptScannerSheet` component

**Files:**
- Create: `apps/mobile/src/components/receipts/receipt-scanner-sheet.tsx`
- Test: `apps/mobile/src/components/receipts/receipt-scanner-sheet.test.tsx`

**Interfaces:**
- Consumes: `pickImage`/`PickResult` (Task 2); `ReceiptConfirmationCard`/`ReceiptConfirmInput` (Task 4); `api` from `../../lib/runtime.native` (`api.receipts.extractReceipt`, `api.transactions.listCategories`, `api.transactions.createTransaction`); `useAuthStore`; `ApiError` from `@finby/core`; UI `BottomSheet`, `Button`, `UpgradeGate`; `Transaction`, `ReceiptExtraction` from `@finby/shared`.
- Produces: `function ReceiptScannerSheet(props: { open: boolean; onClose: () => void; onLogged: (tx: Transaction, extraction: ReceiptExtraction) => void })`. Fires `onLogged` after the transaction is created; auto-closes ~1.2 s after success.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/receipts/receipt-scanner-sheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ApiError } from '@finby/core';

const authState = { workspace: { id: 'w1', tier: 'PRO' } };
jest.mock('../../lib/use-auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(authState),
}));

jest.mock('../../lib/image-picker', () => ({ pickImage: jest.fn() }));

jest.mock('../../lib/runtime.native', () => ({
  api: {
    receipts: { extractReceipt: jest.fn() },
    transactions: { listCategories: jest.fn(), createTransaction: jest.fn() },
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Isolate the unit from the billing carousel that UpgradeGate renders for FREE.
jest.mock('../billing/plan-carousel-sheet', () => ({ PlanCarouselSheet: () => null }));

import { pickImage } from '../../lib/image-picker';
import { api } from '../../lib/runtime.native';
import { ReceiptScannerSheet } from './receipt-scanner-sheet';

const mockPick = pickImage as jest.Mock;
const mockApi = api as unknown as {
  receipts: { extractReceipt: jest.Mock };
  transactions: { listCategories: jest.Mock; createTransaction: jest.Mock };
};

const extraction = {
  merchant: 'Cafe Roma',
  total: 24.5,
  currency: 'USD',
  date: '2026-07-01',
  category: 'Dining',
  lineItems: [],
  confidence: 0.9,
  isMixedCategories: false,
  showLineItems: false,
  notes: null,
};

beforeEach(() => {
  mockPick.mockReset();
  mockApi.receipts.extractReceipt.mockReset();
  mockApi.transactions.listCategories.mockReset().mockResolvedValue([
    { id: 'c-dining', name: 'Dining', isArchived: false },
  ]);
  mockApi.transactions.createTransaction.mockReset();
});

describe('ReceiptScannerSheet', () => {
  it('extracts then logs a transaction and fires onLogged', async () => {
    mockPick.mockResolvedValue({ status: 'picked', file: { uri: 'file://a.jpg', name: 'a.jpg', type: 'image/jpeg' } });
    mockApi.receipts.extractReceipt.mockResolvedValue(extraction);
    const tx = { id: 't1' };
    mockApi.transactions.createTransaction.mockResolvedValue(tx);
    const onLogged = jest.fn();

    render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={onLogged} />);

    fireEvent.press(screen.getByText('Take photo'));
    await waitFor(() => expect(screen.getByText('Log Transaction')).toBeTruthy());
    fireEvent.press(screen.getByText('Log Transaction'));

    await waitFor(() => expect(mockApi.transactions.createTransaction).toHaveBeenCalledWith('w1', expect.objectContaining({
      type: 'EXPENSE',
      amountOriginal: '24.5',
      currencyOriginal: 'USD',
      categoryId: 'c-dining',
      merchant: 'Cafe Roma',
      transactionDate: '2026-07-01',
    })));
    expect(onLogged).toHaveBeenCalledWith(tx, extraction);
  });

  it('surfaces the backend error message when extraction fails', async () => {
    mockPick.mockResolvedValue({ status: 'picked', file: { uri: 'file://a.jpg', name: 'a.jpg', type: 'image/jpeg' } });
    mockApi.receipts.extractReceipt.mockRejectedValue(
      new ApiError(422, 'BAD', 'Could not read receipt — please try a clearer photo'),
    );

    render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    fireEvent.press(screen.getByText('Take photo'));

    await waitFor(() => expect(screen.getByText(/Could not read receipt/)).toBeTruthy());
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('shows a permission hint when the picker is denied and makes no API call', async () => {
    mockPick.mockResolvedValue({ status: 'denied' });

    render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    fireEvent.press(screen.getByText('Choose from library'));

    await waitFor(() => expect(screen.getByText(/enable.*Settings/i)).toBeTruthy());
    expect(mockApi.receipts.extractReceipt).not.toHaveBeenCalled();
  });

  it('gates FREE tier behind the upgrade prompt and never picks', () => {
    authState.workspace.tier = 'FREE';
    render(<ReceiptScannerSheet open onClose={jest.fn()} onLogged={jest.fn()} />);
    expect(screen.getByText('This is a Pro feature.')).toBeTruthy();
    expect(screen.queryByText('Take photo')).toBeNull();
    authState.workspace.tier = 'PRO'; // restore for other tests
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile/`):
```bash
npm run test:components -- receipt-scanner-sheet
```
Expected: FAIL — cannot resolve `./receipt-scanner-sheet`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/components/receipts/receipt-scanner-sheet.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError } from '@finby/core';
import type { Category, ReceiptExtraction, SubscriptionTier, Transaction } from '@finby/shared';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { UpgradeGate } from '../settings/upgrade-gate';
import { useAuthStore } from '../../lib/use-auth-store';
import { api } from '../../lib/runtime.native';
import { pickImage } from '../../lib/image-picker';
import { ReceiptConfirmationCard, type ReceiptConfirmInput } from './receipt-confirmation-card';

type Phase =
  | { step: 'select' }
  | { step: 'uploading' }
  | { step: 'confirm'; extraction: ReceiptExtraction }
  | { step: 'error'; message: string }
  | { step: 'success' };

const SUCCESS_DISMISS_MS = 1200;

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Full mobile receipt flow: pick/photograph an image → extract → review → log
 * via the existing transactions endpoint. Tier-gated to PRO+ at the UI level
 * (UpgradeGate renders instead of the flow for FREE — no API call is made).
 */
export function ReceiptScannerSheet({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after the transaction is logged (chat handles the follow-up note). */
  onLogged: (tx: Transaction, extraction: ReceiptExtraction) => void;
}) {
  const workspace = useAuthStore((s) => s.workspace);
  const tier = (workspace?.tier ?? 'FREE') as SubscriptionTier;
  const [phase, setPhase] = useState<Phase>({ step: 'select' });
  const [permDenied, setPermDenied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open) {
      setPhase({ step: 'select' });
      setPermDenied(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    [],
  );

  // Categories feed the confirmation dropdown — skip entirely for FREE tier.
  useEffect(() => {
    if (!open || !workspace || tier === 'FREE') return;
    api.transactions
      .listCategories(workspace.id)
      .then(setCategories)
      .catch(() => undefined);
  }, [open, workspace, tier]);

  async function choose(source: 'camera' | 'library') {
    if (!workspace) return;
    setPermDenied(false);
    const res = await pickImage(source);
    if (res.status === 'denied') {
      setPermDenied(true);
      return;
    }
    if (res.status === 'canceled') return;
    setPhase({ step: 'uploading' });
    try {
      // RN has no File; the picker object is the multipart body (see image-picker).
      const extraction = await api.receipts.extractReceipt(workspace.id, res.file as unknown as File);
      setPhase({ step: 'confirm', extraction });
    } catch (err) {
      setPhase({ step: 'error', message: errorMessage(err) });
    }
  }

  async function confirm(extraction: ReceiptExtraction, input: ReceiptConfirmInput) {
    if (!workspace || confirming) return;
    setConfirming(true);
    try {
      const tx = await api.transactions.createTransaction(workspace.id, {
        type: 'EXPENSE',
        amountOriginal: input.total,
        currencyOriginal: extraction.currency,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.merchant ? { merchant: input.merchant } : {}),
        ...(extraction.notes ? { description: extraction.notes } : {}),
        transactionDate: extraction.date,
      });
      setPhase({ step: 'success' });
      onLogged(tx, extraction);
      successTimer.current = setTimeout(onClose, SUCCESS_DISMISS_MS);
    } catch (err) {
      setPhase({ step: 'error', message: errorMessage(err) });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Scan a receipt">
      <UpgradeGate currentTier={tier} requiredTier="PRO">
        {phase.step === 'select' ? (
          <View className="gap-3 py-2">
            <Text className="text-center text-sm text-muted">
              Photograph the receipt or choose a photo — Finby reads the merchant, total and
              category for you to confirm.
            </Text>
            <Button onPress={() => void choose('camera')}>Take photo</Button>
            <Button variant="ghost" onPress={() => void choose('library')}>
              Choose from library
            </Button>
            {permDenied ? (
              <Text className="text-center text-sm text-warn">
                Permission needed — please enable camera/photos access for Finby in Settings.
              </Text>
            ) : null}
          </View>
        ) : null}

        {phase.step === 'uploading' ? (
          <View className="items-center gap-3 py-8">
            <ActivityIndicator color="#1d6ef5" />
            <Text className="text-sm text-muted">Reading your receipt…</Text>
          </View>
        ) : null}

        {phase.step === 'confirm' ? (
          <ReceiptConfirmationCard
            extraction={phase.extraction}
            categories={categories}
            confirming={confirming}
            onCancel={onClose}
            onConfirm={(input) => void confirm(phase.extraction, input)}
          />
        ) : null}

        {phase.step === 'error' ? (
          <View className="gap-4">
            <Text className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {phase.message}
            </Text>
            <View className="flex-row justify-end gap-2">
              <View className="flex-1">
                <Button variant="ghost" onPress={onClose}>
                  Close
                </Button>
              </View>
              <View className="flex-1">
                <Button onPress={() => setPhase({ step: 'select' })}>Try again</Button>
              </View>
            </View>
          </View>
        ) : null}

        {phase.step === 'success' ? (
          <Text className="py-8 text-center text-sm font-medium text-ink">Receipt logged ✅</Text>
        ) : null}
      </UpgradeGate>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/mobile/`):
```bash
npm run test:components -- receipt-scanner-sheet
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/receipts/receipt-scanner-sheet.tsx apps/mobile/src/components/receipts/receipt-scanner-sheet.test.tsx
git commit -m "feat(mobile): add receipt scanner bottom sheet"
```

---

### Task 6: Composer camera button

**Files:**
- Modify: `apps/mobile/src/components/chat/composer.tsx:7` (props) and `:33-34` (row)
- Test: `apps/mobile/src/components/chat/composer.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Composer` now accepts optional `onScanReceipt?: () => void`; when present, renders a `testID="composer-scan"` camera button that calls it.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/chat/composer.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Composer } from './composer';

describe('Composer', () => {
  it('renders the scan button and fires onScanReceipt when provided', () => {
    const onScanReceipt = jest.fn();
    render(<Composer disabled={false} onSend={jest.fn()} onScanReceipt={onScanReceipt} />);
    fireEvent.press(screen.getByTestId('composer-scan'));
    expect(onScanReceipt).toHaveBeenCalled();
  });

  it('omits the scan button when onScanReceipt is not provided', () => {
    render(<Composer disabled={false} onSend={jest.fn()} />);
    expect(screen.queryByTestId('composer-scan')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile/`):
```bash
npm run test:components -- chat/composer
```
Expected: FAIL — `composer-scan` not found (button doesn't exist yet).

- [ ] **Step 3: Update the props signature**

In `apps/mobile/src/components/chat/composer.tsx`, replace the function signature (line 7):

```tsx
export function Composer({
  disabled,
  onSend,
  onScanReceipt,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onScanReceipt?: () => void;
}) {
```

- [ ] **Step 4: Add the camera button as the first child of the input row**

In the same file, replace the opening of the returned row (the `<View className="flex-row items-end gap-2 …">` and the `<TextInput …>` that immediately follows) so the scan button is inserted before the `TextInput`:

```tsx
    <View className="flex-row items-end gap-2 border-t border-line bg-canvas px-3 py-2">
      {onScanReceipt ? (
        <Pressable
          testID="composer-scan"
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt"
          onPress={onScanReceipt}
          disabled={disabled}
          className="h-11 w-11 items-center justify-center rounded-full border border-line bg-surface"
        >
          <Ionicons name="camera-outline" size={22} color="#5b6f8c" />
        </Pressable>
      ) : null}
      <TextInput
        testID="composer-input"
```

(Leave the rest of the `TextInput` and the send `Pressable` unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

Run (from `apps/mobile/`):
```bash
npm run test:components -- chat/composer
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/chat/composer.tsx apps/mobile/src/components/chat/composer.test.tsx
git commit -m "feat(mobile): add receipt-scan camera button to chat composer"
```

---

### Task 7: Wire the scanner into the chat screen

**Files:**
- Modify: `apps/mobile/src/screens/chat-screen.tsx` (imports, state, composer prop, handler, sheet render)
- Test: `apps/mobile/src/screens/chat-screen.test.tsx` (add cases + tier/mock updates)

**Interfaces:**
- Consumes: `ReceiptScannerSheet` (Task 5); `money` from `@finby/core`; `Transaction`, `ReceiptExtraction` from `@finby/shared`; `api.chat.appendAssistantNote`.
- Produces: no exports; the chat screen owns `scannerOpen` state and a `handleReceiptLogged(tx, extraction)` that persists+appends an assistant note.

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/src/screens/chat-screen.test.tsx`:

(a) Add `tier: 'PRO'` to the mocked workspace so the sheet renders past the gate — change the `authState` near the top:

```tsx
const authState = {
  workspace: { id: 'w1', tier: 'PRO' },
  user: { id: 'u1', displayName: 'Tee', currentStreak: 7 },
};
```

(b) Add `appendAssistantNote` to the mocked `api.chat` inside the `jest.mock('../lib/runtime.native', …)` factory (add the line alongside the existing chat mocks):

```tsx
      appendAssistantNote: jest.fn(),
```

(c) Stub the scanner sheet so the chat test isolates the glue from the picker/native internals — add this mock alongside the other `jest.mock(...)` calls:

```tsx
jest.mock('../components/receipts/receipt-scanner-sheet', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ReceiptScannerSheet: ({
      open,
      onLogged,
    }: {
      open: boolean;
      onLogged: (tx: unknown, extraction: unknown) => void;
    }) =>
      open ? (
        <Pressable
          testID="mock-scanner-log"
          onPress={() =>
            onLogged(
              { id: 't1', amountOriginal: '24.50', currencyOriginal: 'USD', merchant: 'Cafe Roma', category: { name: 'Dining' } },
              { currency: 'USD' },
            )
          }
        >
          <Text>scanner-open</Text>
        </Pressable>
      ) : null,
  };
});
```

(d) Extend the `mockChat` type + `beforeEach` reset to include `appendAssistantNote`:

```tsx
const mockChat = api.chat as unknown as {
  listConversations: jest.Mock;
  createConversation: jest.Mock;
  listMessages: jest.Mock;
  streamMessage: jest.Mock;
  appendAssistantNote: jest.Mock;
};
```
```tsx
  mockChat.appendAssistantNote.mockReset();
```

(e) Add two test cases inside `describe('ChatScreen', …)`:

```tsx
  it('opens the receipt scanner from the composer camera button', async () => {
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('composer-scan'));
    expect(screen.getByText('scanner-open')).toBeTruthy();
  });

  it('appends an assistant note after a receipt is logged', async () => {
    mockChat.appendAssistantNote.mockResolvedValue({
      id: 'note1',
      role: 'ASSISTANT',
      content: 'Got it — logged $24.50 at Cafe Roma under Dining from your receipt 🧾',
      createdAt: '2026-07-02T00:00:00Z',
    });
    await render(<ChatScreen />);
    await waitFor(() => expect(mockChat.listMessages).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('composer-scan'));
    await fireEvent.press(screen.getByTestId('mock-scanner-log'));

    await waitFor(() =>
      expect(mockChat.appendAssistantNote).toHaveBeenCalledWith(
        'w1',
        'c1',
        'Got it — logged $24.50 at Cafe Roma under Dining from your receipt 🧾',
      ),
    );
    await waitFor(() => expect(screen.getByText(/logged \$24\.50 at Cafe Roma under Dining/)).toBeTruthy());
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/mobile/`):
```bash
npm run test:components -- chat-screen
```
Expected: FAIL — `composer-scan` not found / `handleReceiptLogged` not wired (the screen doesn't render the scanner or pass the prop yet).

- [ ] **Step 3: Add imports to the chat screen**

In `apps/mobile/src/screens/chat-screen.tsx`, add these imports (next to the existing ones):

```tsx
import { money } from '@finby/core';
import type { ReceiptExtraction, Transaction } from '@finby/shared';
import { ReceiptScannerSheet } from '../components/receipts/receipt-scanner-sheet';
```

(Extend the existing `import type { ChatAction, ChatMessageView, NewAchievement, PendingConfirmation } from '@finby/shared';` line or add a second type-import line — either is fine.)

- [ ] **Step 4: Add the `scannerOpen` state**

In `apps/mobile/src/screens/chat-screen.tsx`, alongside the other `useState` hooks (near line 60):

```tsx
  const [scannerOpen, setScannerOpen] = useState(false);
```

- [ ] **Step 5: Add the `handleReceiptLogged` handler**

In `apps/mobile/src/screens/chat-screen.tsx`, add this function after `newChat()` (around line 165). It composes the note from the returned transaction and persists it, falling back to a local-only bubble if the note endpoint fails:

```tsx
  async function handleReceiptLogged(tx: Transaction, _extraction: ReceiptExtraction) {
    if (!workspace || !conversationId) return;
    const amount = money(tx.amountOriginal, tx.currencyOriginal);
    const merchant = tx.merchant ?? 'this merchant';
    const category = tx.category?.name ?? 'Uncategorized';
    const content = `Got it — logged ${amount} at ${merchant} under ${category} from your receipt 🧾`;
    try {
      const note = await api.chat.appendAssistantNote(workspace.id, conversationId, content);
      setMessages((m) => [
        ...m,
        { id: note.id, role: note.role, content: note.content, createdAt: note.createdAt },
      ]);
    } catch {
      // Persistence failed — still show the confirmation locally for the session.
      setMessages((m) => [
        ...m,
        { id: genId(), role: 'ASSISTANT', content, createdAt: new Date().toISOString() },
      ]);
    }
  }
```

- [ ] **Step 6: Pass the scan handler to the composer**

In `apps/mobile/src/screens/chat-screen.tsx`, update the `<Composer …>` usage (line 255):

```tsx
          <Composer disabled={sending} onSend={send} onScanReceipt={() => setScannerOpen(true)} />
```

- [ ] **Step 7: Render the scanner sheet**

In `apps/mobile/src/screens/chat-screen.tsx`, add the sheet next to the other `workspace ? (…)` sheets (near the `StreakSheet` render, ~line 258):

```tsx
      {workspace ? (
        <ReceiptScannerSheet
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onLogged={(tx, extraction) => void handleReceiptLogged(tx, extraction)}
        />
      ) : null}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run (from `apps/mobile/`):
```bash
npm run test:components -- chat-screen
```
Expected: PASS (all existing cases + the 2 new ones).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/screens/chat-screen.tsx apps/mobile/src/screens/chat-screen.test.tsx
git commit -m "feat(mobile): wire receipt scanner into chat screen"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run (from `apps/mobile/`):
```bash
npm run typecheck
```
Expected: no errors. (If the `res.file as unknown as File` cast or a NativeWind `className` surfaces an error, fix it before proceeding.)

- [ ] **Step 2: Run the full mobile test suite**

Run (from `apps/mobile/`):
```bash
npm run test
```
Expected: Vitest (logic, incl. `image-picker`, `receipt-category`) and Jest (components, incl. the four new/updated files) both pass.

- [ ] **Step 3: Lint (if configured at the repo root)**

Run (from the repo root):
```bash
npm run lint
```
Expected: passes, or no new violations in the touched files.

- [ ] **Step 4: Manual smoke (device/dev-client) — optional but recommended**

Because Task 1 added a native module, a dev-client rebuild is required to exercise the camera on-device:
```bash
npx expo run:ios   # or: npx expo run:android  / eas build --profile development
```
Then: open chat → tap the camera button → "Take photo"/"Choose from library" → confirm the extracted draft → verify the transaction logs and the assistant note appears.

---

## Notes for the implementer

- **Do not** modify `packages/core` or `packages/api`. The `File` type mismatch is handled at the mobile call site with `res.file as unknown as File` (Task 5, Step 3).
- **Test runner split matters:** `resolveCategoryId` and `image-picker` are `*.test.ts` (Vitest); every component is `*.test.tsx` (Jest). Putting a component test in a `.test.ts` file (or vice-versa) means it silently won't run.
- **Analytics + streak refresh are intentionally omitted** on mobile (see the spec's "Deviations from web") — do not add a `track(...)` call or a `refreshUser()`; neither exists on mobile yet.
- **`expo-image-picker` `mediaTypes: ['images']`** is the SDK-54 array form (the old `MediaTypeOptions` enum is deprecated). If typecheck complains about the array literal on this Expo version, fall back to `ImagePicker.MediaTypeOptions.Images`.
