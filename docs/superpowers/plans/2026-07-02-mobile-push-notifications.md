# Mobile Push Notifications + Daily Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Expo Push Service delivery path to the backend and a mobile notifications client so every existing push type (daily reminder, budget alerts, re-engagement, insights) reaches the Expo/React Native app, controlled from the mobile Preferences screen.

**Architecture:** The backend's single `PushService` already fans `{title, body, url}` to a user's devices via Web Push (VAPID). We add a second transport: a `MobilePushDevice` table storing Expo push tokens, and Expo delivery via `expo-server-sdk` inside `PushService`. The mobile app registers its Expo token through a new `@finby/core` push API, exposes push + daily-reminder toggles in Preferences, and deep-links notification taps to the matching route.

**Tech Stack:** NestJS + Prisma + `expo-server-sdk` (backend); `@finby/core` transport; Expo/React Native + `expo-notifications` + `expo-device` + Zustand (mobile). Tests: backend **jest** (`apps/api`), mobile **vitest** (logic) + **jest** (components), core **vitest**.

## Global Constraints

- **Transport:** Expo Push Service only (no direct FCM/APNs). Backend sends via `expo-server-sdk`; mobile registers via `expo-notifications`.
- **Parity:** routing delivery to Expo tokens must light up ALL existing push types — no per-type filtering.
- **Expo delivery must NOT be gated on VAPID config.** Web-push is gated by `this.configured` (VAPID keys); Expo delivery runs whenever Expo tokens exist, independent of VAPID.
- **Backend model:** a new `MobilePushDevice` table (do NOT add nullable Expo columns to `PushSubscription`). `expoPushToken` is globally `@unique` — this makes cross-workspace dedupe inherent (one row per device).
- **Preferences semantics (match web exactly):** daily-reminder effective state = `pushOn && prefs.dailyReminders`; the daily-reminder toggle is disabled unless push is on; it writes `updateProfile({ dailyReminders })`.
- **NEVER use native form controls in mobile UI** — use existing `Toggle`/`Field`/`SettingsGroup`/`SettingsRow` primitives.
- **Keep files under 500 lines.** Commit messages: NO AI-attribution trailer, NO "Generated with" boilerplate; one logical change per commit; stage explicitly.
- **Definition of done:** code complete + unit-tested against mocks, register→deliver path exercised with mocks. Live on-device verification is a follow-up gated on the EAS build + FCM/APNs credentials (user-owned, out of band).
- EAS `projectId` is `32cba6b5-10ac-47d9-b04b-ab15cec95a17` (already in `apps/mobile/app.json` `extra.eas.projectId`).

---

## Reference: existing shapes (do not redefine)

Backend `PushService` (`apps/api/src/modules/push/push.service.ts`):
```ts
interface PushPayload { title: string; body: string; url?: string }
class PushService {
  constructor(prisma: PrismaService, config: ConfigService<Env, true>)
  getPublicKey(): string | null
  subscribe(workspaceId, userId, input: SubscribeInput): Promise<void>   // web-push
  unsubscribe(workspaceId, userId, endpoint): Promise<void>              // web-push
  sendToUser(workspaceId, userId, payload): Promise<void>
  sendToUserDevices(userId, payload): Promise<void>
  private deliver(subs: PushSubscription[], payload): Promise<void>      // web-push only, prunes 404/410
}
```
Controller base: `@Controller('workspaces/:workspaceId/push')` guarded by `WorkspaceMemberGuard`; uses `@Workspace() workspace: WorkspaceContext` and `@CurrentUser() user: AuthUser` (`user.userId`). Validation via `new ZodValidationPipe(schema)`.

Mobile adapter pattern (`apps/mobile/src/adapters/biometric.ts` + `local-auth.native.ts` + `runtime.native.ts`): an injectable `XLike` interface + a `createX(dep)` factory + a `x.native.ts` binding + an exported instance wired in `runtime.native.ts`.

Mobile api binding (`apps/mobile/src/lib/api.ts`): `createMobileApi(session, apiBase)` binds `@finby/core` factories to `session.authed`.

Web reference (behavior to mirror): `apps/web/src/lib/push.ts` (`enablePush`/`disablePush`/`getPushState`, `PushState = 'unsupported'|'denied'|'off'|'on'`), `apps/web/src/lib/push-store.ts` (Zustand `{ state, busy }`).

`UserPreferences.dailyReminders: boolean` (from `@finby/shared`); update via `api.settings.updateProfile({ preferences: { dailyReminders } })` → `ApiUser`.

---

## Task 1: Backend — `MobilePushDevice` Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add model near the existing `PushSubscription`, ~line 811)
- Create (generated): a migration under `apps/api/prisma/migrations/`

**Interfaces:**
- Produces: Prisma model `MobilePushDevice { id, workspaceId, userId, expoPushToken (unique), platform, createdAt, updatedAt }` and the generated `prisma.mobilePushDevice` client delegate consumed by Tasks 2–3.

- [ ] **Step 1: Add the model to `schema.prisma`**

Add directly after the `PushSubscription` model:

```prisma
/// One row per mobile device's Expo push token. Separate from PushSubscription
/// (which is Web Push/VAPID only). expoPushToken is globally unique so a device
/// appears once regardless of how many workspaces it registered under.
model MobilePushDevice {
  id            String   @id @default(cuid())
  workspaceId   String
  userId        String
  expoPushToken String   @unique
  platform      String   // 'ios' | 'android'
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, userId])
}
```

- [ ] **Step 2: Add the back-relation on `Workspace`**

Find the `Workspace` model and add a relation field alongside its other relations (mirroring how `pushSubscriptions` is declared, if present):

```prisma
  mobilePushDevices MobilePushDevice[]
```

- [ ] **Step 3: Validate the schema**

Run: `cd apps/api && pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Create the migration (requires the dev DB up — Postgres on :5434 via docker compose)**

Run: `cd apps/api && pnpm run prisma:migrate -- --name add_mobile_push_device`
Expected: a new folder `prisma/migrations/<timestamp>_add_mobile_push_device/migration.sql` containing `CREATE TABLE "MobilePushDevice"`, and `prisma generate` runs so `PrismaClient` gains `mobilePushDevice`.
(If the DB is not running, start it first: `docker compose up -d` from the repo root.)

- [ ] **Step 5: Confirm the client type exists**

Run: `cd apps/api && node -e "const {PrismaClient}=require('@prisma/client'); console.log(typeof new PrismaClient().mobilePushDevice)"`
Expected: prints `object`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add MobilePushDevice model + migration"
```

---

## Task 2: Backend — Expo delivery in `PushService`

Add the `expo-server-sdk` dependency, the `EXPO_ACCESS_TOKEN` env, Expo device register/unregister, and route `sendToUser`/`sendToUserDevices` to BOTH transports (web-push gated on VAPID; Expo always).

**Files:**
- Modify: `apps/api/package.json` (add `expo-server-sdk`)
- Modify: `apps/api/src/config/env.schema.ts` (add `EXPO_ACCESS_TOKEN`)
- Modify: `apps/api/.env.example`, `apps/api/../../.env.example` (repo-root `.env.example`), `render.yaml` (document the env var)
- Modify: `apps/api/src/modules/push/push.service.ts`
- Test: `apps/api/src/modules/push/push.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `prisma.mobilePushDevice` (Task 1).
- Produces (on `PushService`):
  - `registerExpoDevice(workspaceId: string, userId: string, token: string, platform: string): Promise<void>`
  - `unregisterExpoDevice(token: string): Promise<void>`
  - `sendToUser` / `sendToUserDevices` now deliver to Expo devices too.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/api && pnpm add expo-server-sdk`
Expected: `expo-server-sdk` appears in `apps/api/package.json` dependencies; root `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the env var**

In `apps/api/src/config/env.schema.ts`, add near the other optional service keys (e.g. after `EXCHANGE_RATE_API_URL`):

```ts
  EXPO_ACCESS_TOKEN: z.string().optional(), // Expo push security (optional; SDK works without it)
```

In the repo-root `.env.example` (and `render.yaml` env list), add a documented line:

```
# Expo push access token (optional, from expo.dev → Account → Access Tokens). Improves push security/rate limits.
EXPO_ACCESS_TOKEN=
```

- [ ] **Step 3: Write the failing tests (extend push.service.spec.ts)**

Add a mock for `expo-server-sdk` at the top of the spec (next to the `web-push` mock) and new test cases. The Expo mock must expose the static helpers and an instance method:

```ts
jest.mock('expo-server-sdk', () => {
  const sendPushNotificationsAsync = jest.fn();
  class Expo {
    static isExpoPushToken = (t: string) => typeof t === 'string' && t.startsWith('ExponentPushToken');
    static chunkPushNotifications = (m: unknown[]) => [m];
    sendPushNotificationsAsync = sendPushNotificationsAsync;
  }
  return { Expo, __sendPushNotificationsAsync: sendPushNotificationsAsync };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const expoSend = require('expo-server-sdk').__sendPushNotificationsAsync as jest.Mock;
```

Add tests inside the configured describe (and one showing Expo works while VAPID is unconfigured):

```ts
it('registerExpoDevice upserts by token', async () => {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = { mobilePushDevice: { upsert } };
  const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
  await service.registerExpoDevice('w1', 'u1', 'ExponentPushToken[abc]', 'ios');
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { expoPushToken: 'ExponentPushToken[abc]' },
      create: expect.objectContaining({ workspaceId: 'w1', userId: 'u1', platform: 'ios' }),
    }),
  );
});

it('sendToUser delivers to Expo devices and prunes DeviceNotRegistered', async () => {
  const subFind = jest.fn().mockResolvedValue([]); // no web-push subs
  const devFind = jest.fn().mockResolvedValue([
    { expoPushToken: 'ExponentPushToken[live]', platform: 'ios' },
    { expoPushToken: 'ExponentPushToken[dead]', platform: 'android' },
  ]);
  const devDelete = jest.fn().mockResolvedValue({});
  const prisma = {
    pushSubscription: { findMany: subFind },
    mobilePushDevice: { findMany: devFind, deleteMany: devDelete },
  };
  expoSend.mockResolvedValueOnce([
    { status: 'ok', id: 'x' },
    { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
  ]);
  const service = new PushService(prisma as unknown as PrismaService, makeConfig(CONFIGURED));
  await service.sendToUser('w1', 'u1', { title: 'Budget', body: 'over', url: '/budgets' });
  expect(expoSend).toHaveBeenCalledTimes(1);
  expect(devDelete).toHaveBeenCalledWith({ where: { expoPushToken: 'ExponentPushToken[dead]' } });
});

it('delivers to Expo even when VAPID is unconfigured', async () => {
  const devFind = jest.fn().mockResolvedValue([{ expoPushToken: 'ExponentPushToken[a]', platform: 'ios' }]);
  const prisma = {
    pushSubscription: { findMany: jest.fn() },
    mobilePushDevice: { findMany: devFind, deleteMany: jest.fn() },
  };
  expoSend.mockResolvedValueOnce([{ status: 'ok', id: 'x' }]);
  const service = new PushService(prisma as unknown as PrismaService, makeConfig({})); // no VAPID
  await service.sendToUserDevices('u1', { title: 'Daily', body: 'Check in' });
  expect(devFind).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  expect(expoSend).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/api && pnpm exec jest src/modules/push/push.service.spec.ts`
Expected: FAIL — `registerExpoDevice is not a function`, and existing `sendToUser` no longer queries `mobilePushDevice`.

- [ ] **Step 5: Implement in `push.service.ts`**

Add imports and an Expo client; add the two register methods; split delivery into web-push + Expo; remove the `!this.configured` early-returns from `sendToUser`/`sendToUserDevices` (gate web-push inside instead). Full changed regions:

```ts
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import type { PushSubscription, MobilePushDevice } from '@prisma/client';
```

In the constructor, after the VAPID setup:

```ts
    const expoAccessToken = config.get('EXPO_ACCESS_TOKEN', { infer: true });
    this.expo = new Expo(expoAccessToken ? { accessToken: expoAccessToken } : {});
```

Add the field: `private readonly expo: Expo;`

Add register/unregister:

```ts
  /** Store (or refresh) a mobile device's Expo push token, keyed by the token. */
  async registerExpoDevice(workspaceId: string, userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.mobilePushDevice.upsert({
      where: { expoPushToken: token },
      create: { workspaceId, userId, expoPushToken: token, platform },
      update: { workspaceId, userId, platform },
    });
  }

  async unregisterExpoDevice(token: string): Promise<void> {
    await this.prisma.mobilePushDevice.deleteMany({ where: { expoPushToken: token } });
  }
```

Replace `sendToUser` and `sendToUserDevices`:

```ts
  /** Fan a notification out to a member's devices in one workspace (both transports). */
  async sendToUser(workspaceId: string, userId: string, payload: PushPayload): Promise<void> {
    const [subs, devices] = await Promise.all([
      this.configured
        ? this.prisma.pushSubscription.findMany({ where: { workspaceId, userId } })
        : Promise.resolve([] as PushSubscription[]),
      this.prisma.mobilePushDevice.findMany({ where: { workspaceId, userId } }),
    ]);
    await Promise.all([this.deliver(subs, payload), this.deliverExpo(devices, payload)]);
  }

  /** Fan a notification out to every device a user has, across all workspaces. */
  async sendToUserDevices(userId: string, payload: PushPayload): Promise<void> {
    const [subs, devices] = await Promise.all([
      this.configured
        ? this.prisma.pushSubscription.findMany({ where: { userId } })
        : Promise.resolve([] as PushSubscription[]),
      this.prisma.mobilePushDevice.findMany({ where: { userId } }),
    ]);
    await Promise.all([this.deliver(subs, payload), this.deliverExpo(devices, payload)]);
  }
```

Keep the existing `deliver()` (web-push) but guard the empty case internally (it already loops; add `if (subs.length === 0) return;` at the top). Add the Expo delivery:

```ts
  /** Send to Expo devices via the Expo push service; prunes DeviceNotRegistered tokens. */
  private async deliverExpo(devices: MobilePushDevice[], payload: PushPayload): Promise<void> {
    const messages: ExpoPushMessage[] = devices
      .filter((d) => Expo.isExpoPushToken(d.expoPushToken))
      .map((d) => ({
        to: d.expoPushToken,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        data: payload.url ? { url: payload.url } : {},
      }));
    if (messages.length === 0) return;

    for (const chunk of Expo.chunkPushNotifications(messages)) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const token = chunk[i].to as string;
            void this.prisma.mobilePushDevice
              .deleteMany({ where: { expoPushToken: token } })
              .catch(() => undefined);
          }
        });
      } catch {
        this.logger.warn('Expo push send failed for a chunk.');
      }
    }
  }
```

Also add `if (subs.length === 0) return;` at the very top of the existing `deliver()` method.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/modules/push/push.service.spec.ts`
Expected: PASS (existing web-push tests + the 3 new Expo tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/config/env.schema.ts .env.example render.yaml apps/api/src/modules/push/push.service.ts apps/api/src/modules/push/push.service.spec.ts
git commit -m "feat(api): deliver push to Expo devices via expo-server-sdk"
```

---

## Task 3: Backend — Expo register/unregister endpoints

**Files:**
- Modify: `apps/api/src/modules/push/dto/push.schemas.ts`
- Modify: `apps/api/src/modules/push/push.controller.ts`
- Test: `apps/api/src/modules/push/push.controller.spec.ts` (create)

**Interfaces:**
- Consumes: `PushService.registerExpoDevice` / `unregisterExpoDevice` (Task 2).
- Produces: `POST /workspaces/:workspaceId/push/expo/register` `{ token, platform }` and `POST /workspaces/:workspaceId/push/expo/unregister` `{ token }`.

- [ ] **Step 1: Add schemas**

Append to `push.schemas.ts`:

```ts
export const expoRegisterSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});
export type ExpoRegisterInput = z.infer<typeof expoRegisterSchema>;

export const expoUnregisterSchema = z.object({
  token: z.string().min(1),
});
export type ExpoUnregisterInput = z.infer<typeof expoUnregisterSchema>;
```

- [ ] **Step 2: Write the failing controller test**

```ts
// apps/api/src/modules/push/push.controller.spec.ts
import { PushController } from './push.controller';
import type { PushService } from './push.service';
import type { WorkspaceContext } from '../../common/context';
import type { AuthUser } from '../auth/auth.types';

const ws = { id: 'w1' } as WorkspaceContext;
const user = { userId: 'u1' } as AuthUser;

function make() {
  const push = {
    registerExpoDevice: jest.fn().mockResolvedValue(undefined),
    unregisterExpoDevice: jest.fn().mockResolvedValue(undefined),
  };
  return { push, controller: new PushController(push as unknown as PushService) };
}

describe('PushController expo endpoints', () => {
  it('registers an expo device for the current user + workspace', async () => {
    const { push, controller } = make();
    await controller.expoRegister(ws, user, { token: 'ExponentPushToken[a]', platform: 'ios' });
    expect(push.registerExpoDevice).toHaveBeenCalledWith('w1', 'u1', 'ExponentPushToken[a]', 'ios');
  });

  it('unregisters an expo device by token', async () => {
    const { push, controller } = make();
    await controller.expoUnregister({ token: 'ExponentPushToken[a]' });
    expect(push.unregisterExpoDevice).toHaveBeenCalledWith('ExponentPushToken[a]');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/modules/push/push.controller.spec.ts`
Expected: FAIL — `controller.expoRegister is not a function`.

- [ ] **Step 4: Implement the endpoints**

Add imports for the new schemas/types and two methods to `PushController`:

```ts
  @Post('expo/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async expoRegister(
    @Workspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(expoRegisterSchema)) body: ExpoRegisterInput,
  ): Promise<void> {
    await this.push.registerExpoDevice(workspace.id, user.userId, body.token, body.platform);
  }

  @Post('expo/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async expoUnregister(
    @Body(new ZodValidationPipe(expoUnregisterSchema)) body: ExpoUnregisterInput,
  ): Promise<void> {
    await this.push.unregisterExpoDevice(body.token);
  }
```

Add to the imports from `./dto/push.schemas`: `expoRegisterSchema, expoUnregisterSchema, type ExpoRegisterInput, type ExpoUnregisterInput`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/modules/push/push.controller.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/push/dto/push.schemas.ts apps/api/src/modules/push/push.controller.ts apps/api/src/modules/push/push.controller.spec.ts
git commit -m "feat(api): expo device register/unregister endpoints"
```

---

## Task 4: Core — push API factory

**Files:**
- Create: `packages/core/src/api/push-api.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Modify: `apps/mobile/src/lib/api.ts` (bind it onto the mobile api)
- Test: `packages/core/src/api/push-api.test.ts`

**Interfaces:**
- Produces: `createPushApi(authed: AuthedFetch): PushApi` where
  - `registerExpoDevice(workspaceId: string, token: string, platform: 'ios' | 'android'): Promise<void>`
  - `unregisterExpoDevice(workspaceId: string, token: string): Promise<void>`
  - Consumed by mobile as `api.push.registerExpoDevice(...)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/api/push-api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPushApi } from './push-api';

describe('push-api', () => {
  it('registers an expo device', async () => {
    const authed = vi.fn().mockResolvedValue(undefined);
    const api = createPushApi(authed as never);
    await api.registerExpoDevice('w1', 'ExponentPushToken[a]', 'ios');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/push/expo/register', {
      method: 'POST',
      body: JSON.stringify({ token: 'ExponentPushToken[a]', platform: 'ios' }),
    });
  });

  it('unregisters an expo device', async () => {
    const authed = vi.fn().mockResolvedValue(undefined);
    const api = createPushApi(authed as never);
    await api.unregisterExpoDevice('w1', 'ExponentPushToken[a]');
    expect(authed).toHaveBeenCalledWith('/workspaces/w1/push/expo/unregister', {
      method: 'POST',
      body: JSON.stringify({ token: 'ExponentPushToken[a]' }),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run src/api/push-api.test.ts`
Expected: FAIL — cannot find module `./push-api`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/api/push-api.ts
import type { AuthedFetch } from './contract';

export interface PushApi {
  registerExpoDevice(workspaceId: string, token: string, platform: 'ios' | 'android'): Promise<void>;
  unregisterExpoDevice(workspaceId: string, token: string): Promise<void>;
}

export function createPushApi(authed: AuthedFetch): PushApi {
  return {
    registerExpoDevice(workspaceId, token, platform) {
      return authed<void>(`/workspaces/${workspaceId}/push/expo/register`, {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      });
    },
    unregisterExpoDevice(workspaceId, token) {
      return authed<void>(`/workspaces/${workspaceId}/push/expo/unregister`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },
  };
}
```

- [ ] **Step 4: Export from core index**

In `packages/core/src/index.ts`, add next to the other API exports:

```ts
export { createPushApi } from './api/push-api';
export type { PushApi } from './api/push-api';
```

- [ ] **Step 5: Run test + rebuild core**

Run: `cd packages/core && pnpm exec vitest run src/api/push-api.test.ts && pnpm run build`
Expected: PASS; `dist/` rebuilt so the mobile app resolves the new export.

- [ ] **Step 6: Bind onto the mobile api**

In `apps/mobile/src/lib/api.ts`, add `createPushApi` to the import list from `@finby/core`, and add to the returned object:

```ts
    push: createPushApi(authed),
```

- [ ] **Step 7: Verify mobile typechecks**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/api/push-api.ts packages/core/src/api/push-api.test.ts packages/core/src/index.ts apps/mobile/src/lib/api.ts
git commit -m "feat(core): push API for expo device register/unregister"
```

---

## Task 5: Mobile — notifications adapter + deps + app.json plugin

**Files:**
- Create: `apps/mobile/src/adapters/notifications.ts` (interface + factory)
- Create: `apps/mobile/src/adapters/notifications.native.ts` (binding)
- Modify: `apps/mobile/src/lib/runtime.native.ts` (wire the instance + expose `projectId`)
- Modify: `apps/mobile/app.json` (add `expo-notifications` plugin)
- Modify: `apps/mobile/package.json` (add `expo-notifications`, `expo-device`)
- Test: `apps/mobile/src/adapters/notifications.test.ts`

**Interfaces:**
- Produces:
  - `PermissionStatus = 'granted' | 'denied' | 'undetermined'`
  - `NotificationsLike` (injectable slice of expo-notifications/expo-device — see below).
  - `createNotifications(deps: NotificationsLike): Notifications` where `Notifications` = `{ isPhysicalDevice: boolean; getPermissionStatus(): Promise<PermissionStatus>; requestPermission(): Promise<PermissionStatus>; getExpoPushToken(projectId?: string): Promise<string | null>; ensureAndroidChannel(): Promise<void>; addResponseListener(cb: (url: string | null) => void): () => void; getInitialUrl(): Promise<string | null>; setForegroundHandler(): void }`
  - Exported `notifications` instance + `projectId` string from `runtime.native.ts` (consumed by Tasks 7 & 9).

- [ ] **Step 1: Add dependencies + app.json plugin**

Run: `cd apps/mobile && pnpm exec expo install expo-notifications expo-device`
Expected: both added to `apps/mobile/package.json` at Expo-SDK-aligned versions.

In `apps/mobile/app.json`, add `"expo-notifications"` to the `plugins` array (with icon/color config):

```json
      ["expo-notifications", { "color": "#1d6ef5" }]
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/mobile/src/adapters/notifications.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createNotifications, type NotificationsLike } from './notifications';

function fake(over: Partial<NotificationsLike> = {}): NotificationsLike {
  return {
    isDevice: true,
    getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
    requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
    getExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: 'ExponentPushToken[abc]' }),
    setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
    setNotificationHandler: vi.fn(),
    addNotificationResponseReceivedListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    getLastNotificationResponseAsync: vi.fn().mockResolvedValue(null),
    platformOS: 'ios',
    ...over,
  };
}

describe('createNotifications', () => {
  it('maps permission status through', async () => {
    const n = createNotifications(fake());
    expect(await n.getPermissionStatus()).toBe('granted');
  });

  it('returns the expo token string', async () => {
    const n = createNotifications(fake());
    expect(await n.getExpoPushToken('proj')).toBe('ExponentPushToken[abc]');
  });

  it('returns null token on a non-physical device', async () => {
    const n = createNotifications(fake({ isDevice: false }));
    expect(await n.getExpoPushToken('proj')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/adapters/notifications.test.ts`
Expected: FAIL — cannot find module `./notifications`.

- [ ] **Step 4: Implement the adapter**

```ts
// apps/mobile/src/adapters/notifications.ts
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Minimal slice of expo-notifications/expo-device this app uses — injected so
 *  the logic is testable with a fake (real binding in notifications.native.ts). */
export interface NotificationsLike {
  isDevice: boolean;
  platformOS: 'ios' | 'android' | string;
  getPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(opts: { projectId?: string }): Promise<{ data: string }>;
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  setNotificationHandler(handler: unknown): void;
  addNotificationResponseReceivedListener(cb: (resp: unknown) => void): { remove(): void };
  getLastNotificationResponseAsync(): Promise<unknown>;
}

export interface Notifications {
  isPhysicalDevice: boolean;
  getPermissionStatus(): Promise<PermissionStatus>;
  requestPermission(): Promise<PermissionStatus>;
  /** Expo push token, or null if unavailable (simulator / no permission / error). */
  getExpoPushToken(projectId?: string): Promise<string | null>;
  ensureAndroidChannel(): Promise<void>;
  setForegroundHandler(): void;
  /** Subscribe to notification taps; the callback gets the payload `url` (or null). Returns an unsubscribe. */
  addResponseListener(cb: (url: string | null) => void): () => void;
  /** The url of the notification that cold-started the app (or null). */
  getInitialUrl(): Promise<string | null>;
}

function normalizeStatus(status: string): PermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

function urlFromResponse(resp: unknown): string | null {
  const data = (resp as { notification?: { request?: { content?: { data?: { url?: unknown } } } } })
    ?.notification?.request?.content?.data;
  return typeof data?.url === 'string' ? data.url : null;
}

export function createNotifications(deps: NotificationsLike): Notifications {
  return {
    isPhysicalDevice: deps.isDevice,

    async getPermissionStatus() {
      return normalizeStatus((await deps.getPermissionsAsync()).status);
    },

    async requestPermission() {
      return normalizeStatus((await deps.requestPermissionsAsync()).status);
    },

    async getExpoPushToken(projectId) {
      if (!deps.isDevice) return null;
      try {
        const { data } = await deps.getExpoPushTokenAsync({ projectId });
        return data ?? null;
      } catch {
        return null;
      }
    },

    async ensureAndroidChannel() {
      if (deps.platformOS !== 'android') return;
      await deps.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: 4, // AndroidImportance.HIGH
      });
    },

    setForegroundHandler() {
      deps.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    },

    addResponseListener(cb) {
      const sub = deps.addNotificationResponseReceivedListener((resp) => cb(urlFromResponse(resp)));
      return () => sub.remove();
    },

    async getInitialUrl() {
      return urlFromResponse(await deps.getLastNotificationResponseAsync());
    },
  };
}
```

- [ ] **Step 5: Implement the native binding**

```ts
// apps/mobile/src/adapters/notifications.native.ts
import { Platform } from 'react-native';
import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import type { NotificationsLike } from './notifications';

/** expo-notifications + expo-device binding. Verified on device (no unit
 *  coverage — pure pass-through to the native modules). */
export const notificationsBinding: NotificationsLike = {
  isDevice: Device.isDevice,
  platformOS: Platform.OS,
  getPermissionsAsync: () => ExpoNotifications.getPermissionsAsync(),
  requestPermissionsAsync: () => ExpoNotifications.requestPermissionsAsync(),
  getExpoPushTokenAsync: (opts) => ExpoNotifications.getExpoPushTokenAsync(opts),
  setNotificationChannelAsync: (id, channel) =>
    ExpoNotifications.setNotificationChannelAsync(id, channel as never),
  setNotificationHandler: (handler) => ExpoNotifications.setNotificationHandler(handler as never),
  addNotificationResponseReceivedListener: (cb) =>
    ExpoNotifications.addNotificationResponseReceivedListener(cb as never),
  getLastNotificationResponseAsync: () => ExpoNotifications.getLastNotificationResponseAsync(),
};
```

- [ ] **Step 6: Wire the instance + projectId in `runtime.native.ts`**

Add imports and exports:

```ts
import { createNotifications } from '../adapters/notifications';
import { notificationsBinding } from '../adapters/notifications.native';
```

```ts
export const projectId =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;

export const notifications = createNotifications(notificationsBinding);
```

- [ ] **Step 7: Run test + typecheck**

Run: `cd apps/mobile && pnpm exec vitest run src/adapters/notifications.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (3 tests); tsc clean.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/adapters/notifications.ts apps/mobile/src/adapters/notifications.native.ts apps/mobile/src/adapters/notifications.test.ts apps/mobile/src/lib/runtime.native.ts apps/mobile/app.json apps/mobile/package.json
git commit -m "feat(mobile): notifications adapter (expo-notifications/expo-device)"
```

---

## Task 6: Mobile — push store

**Files:**
- Create: `apps/mobile/src/lib/push-store.ts`
- Create: `apps/mobile/src/lib/use-push-store.ts`
- Test: `apps/mobile/src/lib/push-store.test.ts`

**Interfaces:**
- Produces:
  - `PushState = 'unsupported' | 'denied' | 'off' | 'on'`
  - a Zustand vanilla store (`createStore`) with `{ state: PushState; busy: boolean; token: string | null; setState; setBusy; setToken }`, exported as `pushStore`.
  - `usePushStore(selector)` hook (mirrors `use-auth-store.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/push-store.test.ts
import { describe, it, expect } from 'vitest';
import { createPushStore } from './push-store';

describe('push-store', () => {
  it('defaults to off, not busy, no token', () => {
    const s = createPushStore().getState();
    expect(s.state).toBe('off');
    expect(s.busy).toBe(false);
    expect(s.token).toBeNull();
  });

  it('updates state, busy, and token', () => {
    const store = createPushStore();
    store.getState().setState('on');
    store.getState().setBusy(true);
    store.getState().setToken('ExponentPushToken[a]');
    expect(store.getState()).toMatchObject({ state: 'on', busy: true, token: 'ExponentPushToken[a]' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/push-store.test.ts`
Expected: FAIL — cannot find module `./push-store`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/push-store.ts
import { createStore, type StoreApi } from 'zustand/vanilla';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export interface PushStoreState {
  state: PushState;
  busy: boolean;
  token: string | null;
  setState(s: PushState): void;
  setBusy(b: boolean): void;
  setToken(t: string | null): void;
}

/** Shared push state so the Preferences push toggle and the daily-reminder
 *  toggle (which derives from it) reflect the same device state. */
export function createPushStore(): StoreApi<PushStoreState> {
  return createStore<PushStoreState>((set) => ({
    state: 'off',
    busy: false,
    token: null,
    setState: (s) => set({ state: s }),
    setBusy: (b) => set({ busy: b }),
    setToken: (t) => set({ token: t }),
  }));
}

export const pushStore = createPushStore();
```

```ts
// apps/mobile/src/lib/use-push-store.ts
import { useStore } from 'zustand';
import { pushStore } from './push-store';
import type { PushStoreState } from './push-store';

export function usePushStore<T>(selector: (s: PushStoreState) => T): T {
  return useStore(pushStore, selector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/push-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/push-store.ts apps/mobile/src/lib/use-push-store.ts apps/mobile/src/lib/push-store.test.ts
git commit -m "feat(mobile): shared push-notification store"
```

---

## Task 7: Mobile — push enable/disable logic

**Files:**
- Create: `apps/mobile/src/lib/push.ts`
- Modify: `apps/mobile/src/lib/runtime.native.ts` (export a wired `push` instance)
- Test: `apps/mobile/src/lib/push.test.ts`

**Interfaces:**
- Consumes: `notifications` (Task 5), `pushStore` (Task 6), `api.push` (Task 4), `projectId` (Task 5).
- Produces: `createPush(deps): Push` where `Push` = `{ getPushState(): Promise<PushState>; enablePush(workspaceId: string): Promise<PushState>; disablePush(workspaceId: string): Promise<PushState> }`. The factory also writes results into the injected store. Exported instance `push` from `runtime.native.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/push.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPush } from './push';
import { createPushStore } from './push-store';

function deps(over: Record<string, unknown> = {}) {
  const store = createPushStore();
  const notifications = {
    isPhysicalDevice: true,
    getPermissionStatus: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    getExpoPushToken: vi.fn().mockResolvedValue('ExponentPushToken[a]'),
    ensureAndroidChannel: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  const api = { registerExpoDevice: vi.fn().mockResolvedValue(undefined), unregisterExpoDevice: vi.fn().mockResolvedValue(undefined) };
  const push = createPush({ notifications: notifications as never, api: api as never, store, projectId: 'proj', platform: 'ios' });
  return { store, notifications, api, push };
}

describe('createPush', () => {
  it('enablePush requests permission, gets a token, registers, and sets on', async () => {
    const { store, api, push } = deps();
    const result = await push.enablePush('w1');
    expect(result).toBe('on');
    expect(api.registerExpoDevice).toHaveBeenCalledWith('w1', 'ExponentPushToken[a]', 'ios');
    expect(store.getState().state).toBe('on');
    expect(store.getState().token).toBe('ExponentPushToken[a]');
  });

  it('enablePush returns denied when permission is refused', async () => {
    const { api, push } = deps({ requestPermission: vi.fn().mockResolvedValue('denied') });
    expect(await push.enablePush('w1')).toBe('denied');
    expect(api.registerExpoDevice).not.toHaveBeenCalled();
  });

  it('enablePush returns unsupported when no token is available', async () => {
    const { push } = deps({ getExpoPushToken: vi.fn().mockResolvedValue(null) });
    expect(await push.enablePush('w1')).toBe('unsupported');
  });

  it('disablePush unregisters the stored token and sets off', async () => {
    const { store, api, push } = deps();
    store.getState().setToken('ExponentPushToken[a]');
    expect(await push.disablePush('w1')).toBe('off');
    expect(api.unregisterExpoDevice).toHaveBeenCalledWith('w1', 'ExponentPushToken[a]');
    expect(store.getState().state).toBe('off');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/push.test.ts`
Expected: FAIL — cannot find module `./push`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/lib/push.ts
import type { StoreApi } from 'zustand/vanilla';
import type { Notifications } from '../adapters/notifications';
import type { PushApi } from '@finby/core';
import type { PushState, PushStoreState } from './push-store';

export interface Push {
  getPushState(): Promise<PushState>;
  enablePush(workspaceId: string): Promise<PushState>;
  disablePush(workspaceId: string): Promise<PushState>;
}

export function createPush(deps: {
  notifications: Notifications;
  api: PushApi;
  store: StoreApi<PushStoreState>;
  projectId?: string;
  platform: 'ios' | 'android';
}): Push {
  const { notifications, api, store, projectId, platform } = deps;

  async function reconcile(): Promise<PushState> {
    if (!notifications.isPhysicalDevice) return 'unsupported';
    const perm = await notifications.getPermissionStatus();
    if (perm === 'denied') return 'denied';
    return store.getState().token ? 'on' : 'off';
  }

  return {
    async getPushState() {
      const s = await reconcile();
      store.getState().setState(s);
      return s;
    },

    async enablePush(workspaceId) {
      if (!notifications.isPhysicalDevice) {
        store.getState().setState('unsupported');
        return 'unsupported';
      }
      const perm = await notifications.requestPermission();
      if (perm !== 'granted') {
        const s: PushState = perm === 'denied' ? 'denied' : 'off';
        store.getState().setState(s);
        return s;
      }
      await notifications.ensureAndroidChannel();
      const token = await notifications.getExpoPushToken(projectId);
      if (!token) {
        store.getState().setState('unsupported');
        return 'unsupported';
      }
      await api.registerExpoDevice(workspaceId, token, platform);
      store.getState().setToken(token);
      store.getState().setState('on');
      return 'on';
    },

    async disablePush(workspaceId) {
      const token = store.getState().token;
      if (token) {
        await api.unregisterExpoDevice(workspaceId, token).catch(() => undefined);
        store.getState().setToken(null);
      }
      store.getState().setState('off');
      return 'off';
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/push.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the instance in `runtime.native.ts`**

Add imports and export, after the `api` export (needs `api`, `notifications`, `projectId`, and `Platform`):

```ts
import { Platform } from 'react-native';
import { createPush } from './push';
import { pushStore } from './push-store';
```

```ts
export const push = createPush({
  notifications,
  api: api.push,
  store: pushStore,
  projectId,
  platform: Platform.OS === 'android' ? 'android' : 'ios',
});
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add apps/mobile/src/lib/push.ts apps/mobile/src/lib/push.test.ts apps/mobile/src/lib/runtime.native.ts
git commit -m "feat(mobile): push enable/disable/reconcile logic"
```

---

## Task 8: Mobile — Preferences Notifications UI

Add a Notifications group to the Preferences screen: a push master toggle + a daily-reminder toggle (disabled unless push on; effective = `pushOn && dailyReminders`).

**Files:**
- Modify: `apps/mobile/src/screens/settings/preferences-screen.tsx`
- Test: `apps/mobile/src/screens/settings/preferences-screen.test.tsx` (extend)

**Interfaces:**
- Consumes: `usePushStore` (Task 6), `push` (`enablePush`/`disablePush`, Task 7), `useAuthStore` (`workspace`, `user.preferences`, `setUser`), `api.settings.updateProfile`, `Toggle`/`Field` primitives.

- [ ] **Step 1: Write the failing test (extend the existing preferences test)**

Add mocks for the push store, the runtime `push`, and extend the existing `runtime.native` mock. Add tests:

```ts
// add to the top-of-file mocks in preferences-screen.test.tsx
const enablePush = jest.fn().mockResolvedValue('on');
const disablePush = jest.fn().mockResolvedValue('off');
let pushState = 'off';
jest.mock('../../lib/use-push-store', () => ({
  usePushStore: (sel: (s: unknown) => unknown) => sel({ state: pushState, busy: false }),
}));
// extend the existing jest.mock('../../lib/runtime.native', ...) to include:
//   push: { enablePush, disablePush }, and keep api.settings.updateProfile

// new tests:
it('enabling the push toggle calls enablePush for the workspace', async () => {
  pushState = 'off';
  render(<PreferencesScreen />);
  fireEvent(screen.getByLabelText('Push notifications'), 'valueChange', true);
  await waitFor(() => expect(enablePush).toHaveBeenCalledWith('w1'));
});

it('daily reminder toggle is disabled while push is off', async () => {
  pushState = 'off';
  render(<PreferencesScreen />);
  expect(screen.getByLabelText('Daily reminder').props.accessibilityState.disabled).toBe(true);
});
```

(Ensure the existing `useAuthStore` mock exposes `workspace: { id: 'w1' }` and `user.preferences.dailyReminders`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/preferences-screen.test.tsx`
Expected: FAIL — no "Push notifications" toggle.

- [ ] **Step 3: Implement — add a Notifications group to the screen**

Add imports:

```tsx
import { Toggle } from '../../components/ui/toggle';
import { usePushStore } from '../../lib/use-push-store';
import { useAuthStore } from '../../lib/use-auth-store';
import { push } from '../../lib/runtime.native';
```

Inside the component, read the needed state:

```tsx
  const workspace = useAuthStore((s) => s.workspace);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const pushState = usePushStore((s) => s.state);
  const pushOn = pushState === 'on';
  const dailyReminders = user?.preferences?.dailyReminders ?? true;
  const reminderOn = pushOn && dailyReminders;

  async function togglePush(next: boolean) {
    if (!workspace) return;
    if (next) await push.enablePush(workspace.id);
    else await push.disablePush(workspace.id);
  }

  async function toggleDailyReminder() {
    const updated = await api.settings.updateProfile({ preferences: { dailyReminders: !dailyReminders } });
    setUser(updated);
  }
```

Add a Notifications section in the returned JSX (below the format dropdowns), using the same `Field`/row style already in the file:

```tsx
        <Field label="Push notifications" hint={pushState === 'denied' ? 'Enable notifications for Finby in your device Settings.' : 'Get alerts on this device for reminders and updates.'}>
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink">Push notifications</Text>
            <Toggle
              value={pushOn}
              onValueChange={(v) => void togglePush(v)}
              accessibilityLabel="Push notifications"
            />
          </View>
        </Field>

        <Field label="Daily reminder" hint="A nudge at ~8pm if you haven't logged anything that day. Requires notifications on.">
          <View className="flex-row items-center justify-between">
            <Text className="text-base text-ink">Daily reminder</Text>
            <Toggle
              value={reminderOn}
              disabled={!pushOn}
              onValueChange={() => void toggleDailyReminder()}
              accessibilityLabel="Daily reminder"
            />
          </View>
        </Field>
```

(If `View`/`Text` aren't imported in the file yet, add them from `react-native`. If `Toggle` lacks a `disabled` prop, add an optional `disabled?: boolean` that maps to the underlying `Switch`'s `disabled` — check `apps/mobile/src/components/ui/toggle.tsx`; extend it minimally if needed and note it in the report.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/screens/settings/preferences-screen.test.tsx`
Expected: PASS (existing + 2 new tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add apps/mobile/src/screens/settings/preferences-screen.tsx apps/mobile/src/screens/settings/preferences-screen.test.tsx apps/mobile/src/components/ui/toggle.tsx
git commit -m "feat(mobile): push + daily-reminder toggles in Preferences"
```

---

## Task 9: Mobile — deep-link notification taps

Map a notification's `url` to an expo-router route, and wire a responder (warm taps + cold start) + the foreground handler at the authed layout.

**Files:**
- Create: `apps/mobile/src/lib/notification-routing.ts`
- Create: `apps/mobile/src/lib/use-notification-responder.ts`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (mount the responder)
- Test: `apps/mobile/src/lib/notification-routing.test.ts`

**Interfaces:**
- Produces: `mapUrlToRoute(url: string | null): string | null` and a `useNotificationResponder()` hook.
- Consumes: `notifications` (Task 5, `addResponseListener`/`getInitialUrl`/`setForegroundHandler`), `useRouter` from expo-router.

- [ ] **Step 1: Write the failing test (pure mapper)**

```ts
// apps/mobile/src/lib/notification-routing.test.ts
import { describe, it, expect } from 'vitest';
import { mapUrlToRoute } from './notification-routing';

describe('mapUrlToRoute', () => {
  it('maps known web paths to mobile routes', () => {
    expect(mapUrlToRoute('/chat')).toBe('/');
    expect(mapUrlToRoute('/transactions')).toBe('/transactions');
    expect(mapUrlToRoute('/dashboard')).toBe('/dashboard');
    expect(mapUrlToRoute('/streaks')).toBe('/streaks');
    expect(mapUrlToRoute('/budgets')).toBe('/dashboard'); // budgets live under dashboard on mobile
  });

  it('strips query strings and matches the path', () => {
    expect(mapUrlToRoute('/transactions?highlight=abc')).toBe('/transactions');
  });

  it('returns null for unknown or empty urls (open app only)', () => {
    expect(mapUrlToRoute('/unknown')).toBeNull();
    expect(mapUrlToRoute(null)).toBeNull();
    expect(mapUrlToRoute('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/notification-routing.test.ts`
Expected: FAIL — cannot find module `./notification-routing`.

- [ ] **Step 3: Implement the mapper**

```ts
// apps/mobile/src/lib/notification-routing.ts
/** Map a backend push `url` (web path) to the mobile route to navigate to on tap.
 *  Returns null when there's no matching route (the app just opens). */
const ROUTES: Record<string, string> = {
  '/chat': '/',
  '/': '/',
  '/dashboard': '/dashboard',
  '/budgets': '/dashboard',
  '/transactions': '/transactions',
  '/streaks': '/streaks',
  '/settings': '/settings',
};

export function mapUrlToRoute(url: string | null): string | null {
  if (!url) return null;
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  return ROUTES[path] ?? null;
}
```

- [ ] **Step 4: Implement the responder hook**

```ts
// apps/mobile/src/lib/use-notification-responder.ts
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { notifications } from './runtime.native';
import { mapUrlToRoute } from './notification-routing';

/** Sets the foreground presentation handler and routes notification taps
 *  (both warm taps and the cold-start tap) to the matching screen. Mount once
 *  inside the authed layout. */
export function useNotificationResponder(): void {
  const router = useRouter();
  useEffect(() => {
    notifications.setForegroundHandler();

    let active = true;
    void notifications.getInitialUrl().then((url) => {
      if (!active) return;
      const route = mapUrlToRoute(url);
      if (route) router.push(route as never);
    });

    const unsubscribe = notifications.addResponseListener((url) => {
      const route = mapUrlToRoute(url);
      if (route) router.push(route as never);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);
}
```

- [ ] **Step 5: Mount the responder in the authed layout**

In `apps/mobile/app/(app)/_layout.tsx`, import and call the hook at the top of the `AppLayout` component body (it renders nothing; it only wires listeners):

```tsx
import { useNotificationResponder } from '../../src/lib/use-notification-responder';
// inside AppLayout():
  useNotificationResponder();
```

- [ ] **Step 6: Run mapper test + typecheck**

Run: `cd apps/mobile && pnpm exec vitest run src/lib/notification-routing.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/notification-routing.ts apps/mobile/src/lib/notification-routing.test.ts apps/mobile/src/lib/use-notification-responder.ts "apps/mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): deep-link notification taps to routes"
```

---

## Task 10: Full gate — typecheck, lint, tests (api + core + mobile)

**Files:** none (verification only; fix-forward if something is red).

- [ ] **Step 1: Backend**

Run: `cd apps/api && pnpm exec tsc --noEmit && pnpm test -- src/modules/push`
Expected: tsc clean; push service + controller specs pass.

- [ ] **Step 2: Core**

Run: `cd packages/core && pnpm exec vitest run && pnpm run build`
Expected: all core tests pass; `dist/` rebuilt.

- [ ] **Step 3: Mobile**

Run: `cd apps/mobile && pnpm exec tsc --noEmit && pnpm run test`
Expected: tsc clean; vitest + jest all pass.

- [ ] **Step 4: Lint (workspace root)**

Run: `pnpm -w run lint`
Expected: no new errors introduced by this work (pre-existing unrelated warnings, e.g. in `apps/web/public/sw.js`, are acceptable — leave them).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A apps/api packages/core apps/mobile
git commit -m "chore: typecheck/lint/test fixes for mobile push notifications"
```

---

## Self-Review

**Spec coverage:**
- Expo transport in backend `PushService` (register/unregister + deliver routing, un-gated from VAPID) → Tasks 1–3 ✓
- `MobilePushDevice` table (separate, unique token = inherent dedupe) → Task 1 ✓
- `expo-server-sdk` + `EXPO_ACCESS_TOKEN` env → Task 2 ✓
- Prune on `DeviceNotRegistered` → Task 2 ✓
- Parity (all existing push types) → automatic: Tasks 2 route `sendToUser`/`sendToUserDevices`, which every caller (reminders/alerts/reengagement/insights) already uses ✓
- `@finby/core` push API → Task 4 ✓
- Mobile adapter (permission/token/channel/listeners) → Task 5 ✓
- Push store → Task 6 ✓
- enable/disable/reconcile logic (permission denied/unsupported/token rotation via reconcile) → Task 7 ✓
- Preferences push + daily-reminder toggles with `pushOn && dailyReminders` semantics → Task 8 ✓
- Deep-link on tap (mapper + warm + cold start + foreground handler) → Task 9 ✓
- app.json plugin + projectId + deps → Task 5 ✓
- Testing across api/core/mobile → each task + Task 10 ✓
- Out-of-scope items (categories, badges, receipt polling) → not implemented, per spec ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every code step carries concrete code. Two conditional notes are explicit and actionable (extend `Toggle` with `disabled` if absent — Task 8; add `View`/`Text` imports if absent — Task 8), each with the exact change.

**Type consistency:** `registerExpoDevice(workspaceId, userId, token, platform)` (service, Task 2) vs `api.push.registerExpoDevice(workspaceId, token, platform)` (core, Task 4 — workspace+userId resolved server-side from the auth context) — intentional and consistent with the controller in Task 3. `PushState` union identical in Tasks 6/7. `Notifications` interface produced in Task 5 is consumed with the same method names in Tasks 7 & 9. `mapUrlToRoute` signature identical in Tasks 9 test + impl + hook.

**Known execution caveats (not gaps):**
- The Prisma migration (Task 1) needs the dev Postgres up (docker compose, PG on :5434).
- `expo-notifications` foreground-handler field names (`shouldShowBanner`/`shouldShowList`) are SDK 54+; if tsc flags them against the installed types, match the installed `NotificationBehavior` type (older SDKs use `shouldShowAlert`).
- Live device delivery can't be verified without the EAS build + FCM/APNs credentials (user-owned); DoD is code + mocked-path coverage.
