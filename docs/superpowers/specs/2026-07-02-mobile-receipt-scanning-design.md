# Receipt Scanning (mobile) — Design

**Date:** 2026-07-02
**Status:** Approved design → ready for implementation plan
**Scope:** Bring the PWA's receipt-scanning feature to the mobile chat screen. Capture a receipt
via **camera or photo library**, extract it with the existing vision endpoint, let the user
review/edit the draft, log it as a transaction, and post a confirmation note back into chat.

## Goal

The web app lets a user (PRO tier) scan a receipt from the chat composer: pick/snap an image →
the backend extracts merchant/total/date/category via an Anthropic vision model → the user
reviews and edits a draft → it's logged as an EXPENSE transaction → a friendly assistant note
appears in chat. The mobile app has none of this UI. This design adds it with full parity, plus
the requested **"choose from photo library"** capture option.

**The backend and API layer already exist and require no changes.** `POST
/workspaces/:id/receipts/extract` (multipart, field `image`), the shared `@finby/core`
`receipts-api` / `transactions-api` / `chat-api.appendAssistantNote`, and the `@finby/shared`
`ReceiptExtraction` type + `TIER_LIMITS` are all reusable. `api.receipts.extractReceipt` is
already bound in `apps/mobile/src/lib/api.ts`. This is purely a mobile UI + image-capture job.

## Product decisions (confirmed)

1. **Capture source:** Camera **and** photo library. Tapping the entry point opens an action
   sheet: "Take photo" / "Choose from library". (Gallery selection was explicitly requested.)
2. **Entry point:** A camera icon **in the composer**, mirroring the web app.
3. **Tier gating:** Gate to **PRO**, mirroring web, via the existing mobile `UpgradeGate`.

## Reference implementation (web)

- Entry: `apps/web/src/components/chat/composer.tsx` (camera button, optional `onScanReceipt`),
  opened from `apps/web/src/app/(app)/chat/page.tsx`.
- Flow: `apps/web/src/components/receipts/ReceiptScanner.tsx` — modal state machine
  `select → uploading → confirm → success | error`.
- Confirm card: `apps/web/src/components/receipts/ReceiptConfirmationCard.tsx`.
- Chat glue: `handleReceiptLogged` in `chat/page.tsx`.

## What's reused vs. new

**Reused as-is (zero changes):**
- Backend `POST /workspaces/:id/receipts/extract` — multipart `image`, ≤5 MB,
  `image/jpeg|png|webp|heic`; returns `ReceiptExtraction`. Enforces PRO tier (403 `TIER_LIMIT`)
  and a per-day Redis rate limit (429 `RATE_LIMITED`).
- `@finby/core`: `createReceiptsApi().extractReceipt`, `createTransactionsApi().createTransaction`
  + `listCategories`, `createChatApi().appendAssistantNote` — all already bound on mobile as
  `api.receipts` / `api.transactions` / `api.chat`.
- `@finby/shared`: `ReceiptExtraction`, `ReceiptLineItem`, `TIER_LIMITS`.
- HTTP transport already omits `Content-Type` for `FormData`, so multipart uploads work on RN.

**New on mobile (5 pieces):**

### 1. Dependency + permissions
- Add `expo-image-picker`.
- `app.json`: add the `expo-image-picker` config plugin with `NSCameraUsageDescription` and
  `NSPhotoLibraryUsageDescription` (iOS) and the Android camera permission. Requires a
  dev-client rebuild (EAS is already configured).

### 2. Composer camera button
`apps/mobile/src/components/chat/composer.tsx` gains an optional `onScanReceipt?: () => void`
prop and an `Ionicons` camera button next to the input, shown only when the prop is provided
(mirrors web). No behavior change when the prop is absent.

### 3. `ReceiptScannerSheet` (new component)
A `BottomSheet`-based state machine mirroring web's `ReceiptScanner`:
`select → uploading → confirm → success | error`.
- **select:** action sheet — "Take photo" (`ImagePicker.launchCameraAsync`) / "Choose from
  library" (`ImagePicker.launchImageLibraryAsync`). Requests the relevant permission first;
  on denial, show a message pointing to Settings.
- **uploading:** spinner while `extractReceipt(workspace.id, rnFile)` runs.
- **confirm:** renders `ReceiptConfirmationCard` (below).
- **error:** friendly message + retry. Maps backend errors to copy matching web:
  `TIER_LIMIT` (403) → upgrade prompt, `RATE_LIMITED` (429) → daily-limit message,
  422 → "Could not read receipt — please try a clearer photo", 503 → provider-unavailable.
- Wrapped in `UpgradeGate requiredTier="PRO"` (using `workspace?.tier ?? 'FREE'`), so FREE users
  see the upgrade card / `PlanCarouselSheet` and no API call is made.
- Categories for the confirm dropdown are fetched via `api.transactions.listCategories` (as web).

### 4. `ReceiptConfirmationCard` (new component)
RN rebuild of the web card using mobile `Field` / `Input` / `Dropdown`:
- Editable **total** and **merchant**; total validated `^\d+(\.\d+)?$` and `> 0` (same as web).
- Category `Dropdown` resolved against workspace categories via a `resolveCategoryId` helper
  (unknown model category → "Other" → uncategorized), ported from web.
- Line items shown when `extraction.showLineItems`; low-confidence warning when
  `extraction.confidence < 0.5` (`lowConfidence`).
- Emits `{ total, merchant, categoryId }`; the sheet then calls `createTransaction`.

### 5. Chat glue
`apps/mobile/src/screens/chat-screen.tsx` gains a `handleReceiptLogged(tx, extraction)`:
- Composes the note **from the returned `Transaction`** (which carries `category.name`,
  `merchant`, and amounts): `api.chat.appendAssistantNote(workspace.id, conversationId,
  "Got it — logged {money(amountOriginal, currencyOriginal)} at {merchant} under {category} from
  your receipt 🧾")`, then append the returned `ChatMessageView` to the message list. If
  persistence fails, still show the bubble locally for the session (web behavior).
- The composer's `onScanReceipt` opens the sheet; the screen owns `scannerOpen` state.

**Deviations from web (found during planning, deliberately out of scope):**
- **No analytics `track('transaction_logged', …)`** — mobile has not wired the PostHog
  `track` singleton into any screen yet (`createAnalytics` exists but is unused in screens);
  adding an analytics call layer is a separate concern.
- **No `refreshUser()`** — mobile has no `me`/refresh endpoint or `refreshUser` action, and the
  existing mobile chat does not refresh the streak after logging either. The streak badge
  updates on the next natural hydrate. Matching this keeps behavior consistent with the rest of
  the mobile app.

## Data flow

image → `extractReceipt` (vision; **draft only, nothing persisted**) → user reviews/edits in the
sheet → `createTransaction` (`type: 'EXPENSE'`, `amountOriginal: total`,
`currencyOriginal: extraction.currency`, `categoryId?`, `merchant?`, `description: notes`,
`transactionDate: date`; **line items are display-only, not sent**) → `appendAssistantNote` →
assistant bubble in chat.

## Cross-platform seam

`createReceiptsApi().extractReceipt` types its arg as `File`, which RN lacks. The mobile call
site passes the picker result as an RN file object —
`form.append('image', { uri, name, type } as any)` — via a **cast at the mobile call site**,
leaving core's web-facing `File` signature untouched. (Rejected alternative: widen the core type
to `File | { uri; name; type }` — more correct but touches shared code and every consumer; the
cast keeps this migration contained.)

## Error & edge handling

- **Permission denied** (camera or library) → message prompting the user to enable it in
  Settings; no crash, sheet stays usable.
- **HEIC** from iOS → backend already accepts `image/heic`; don't force-convert, just send the
  correct `type`.
- **Size / MIME** — 5 MB and allowed types are enforced server-side; surface those errors in the
  `error` phase.
- **FREE tier** → gated before any API call by `UpgradeGate`.
- **Rate limit** (429) → daily-limit message with retry disabled for the session.

## Testing

The mobile app splits tests by file type: **pure logic → Vitest (`*.test.ts`, node env)**;
**components → Jest (`*.test.tsx`, jest-expo + React Native Testing Library)**.
- `resolveCategoryId` + `image-picker` mapping (Vitest): category resolution (known / unknown /
  Other), and asset→file / permission-denied / canceled mapping with `expo-image-picker` mocked.
- `ReceiptConfirmationCard` (Jest): total validation, initial category resolution, line-item
  visibility toggle, low-confidence warning, confirm payload.
- `ReceiptScannerSheet` (Jest): state-machine transitions with mocked `pickImage` /
  `extractReceipt` / `createTransaction`, error mapping (uses backend `ApiError.message`), and
  the FREE-tier gate short-circuit.
- `Composer` (Jest): renders the scan button only when `onScanReceipt` is provided.
- `ChatScreen` (Jest): the scan button opens the sheet, and a logged receipt appends the
  assistant note (sheet stubbed to isolate the chat glue).

## Out of scope

- Persisting the receipt image (backend intentionally uses in-memory storage; nothing stored).
- Sending line items to the transaction (display-only, as web).
- Multi-receipt / batch scanning.
- Any backend, `@finby/core`, or `@finby/shared` changes.
