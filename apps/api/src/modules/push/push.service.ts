import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import type { PushSubscription, MobilePushDevice } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.schema';
import type { SubscribeInput } from './dto/push.schemas';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string | null;
  private readonly configured: boolean;
  private readonly expo: Expo;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const publicKey = config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = config.get('VAPID_PRIVATE_KEY', { infer: true });
    const subject = config.get('VAPID_SUBJECT', { infer: true });

    this.publicKey = publicKey ?? null;
    this.configured = Boolean(publicKey && privateKey);
    if (this.configured) {
      webpush.setVapidDetails(subject, publicKey as string, privateKey as string);
    } else {
      this.logger.warn('VAPID keys not set — web push is disabled (Expo push still delivers).');
    }

    const expoAccessToken = config.get('EXPO_ACCESS_TOKEN', { infer: true });
    this.expo = new Expo(expoAccessToken ? { accessToken: expoAccessToken } : {});
  }

  /** The VAPID public key the browser needs to create a subscription. */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /** Store (or refresh) a device subscription, keyed by its endpoint. */
  async subscribe(workspaceId: string, userId: string, input: SubscribeInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        workspaceId,
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      update: { workspaceId, userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  }

  async unsubscribe(workspaceId: string, userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, workspaceId, userId } });
  }

  /** Store (or refresh) a mobile device's Expo push token, keyed by the token. */
  async registerExpoDevice(workspaceId: string, userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.mobilePushDevice.upsert({
      where: { expoPushToken: token },
      create: { workspaceId, userId, expoPushToken: token, platform },
      update: { workspaceId, userId, platform },
    });
  }

  async unregisterExpoDevice(userId: string, token: string): Promise<void> {
    await this.prisma.mobilePushDevice.deleteMany({ where: { expoPushToken: token, userId } });
  }

  /** Fan a workspace-originated notification out to a member's devices (both transports).
   *  Devices/subscriptions are keyed by a globally-unique token/endpoint, so their stored
   *  `workspaceId` is last-write-wins — a member active in several workspaces would otherwise
   *  only be reachable under the workspace they last registered from. The caller has already
   *  authorized this (workspaceId, userId) pairing, and a device belongs to the *user*, so we
   *  target by `userId` (delegating to sendToUserDevices) to reach all of their devices. */
  async sendToUser(_workspaceId: string, userId: string, payload: PushPayload): Promise<void> {
    await this.sendToUserDevices(userId, payload);
  }

  /** Fan a notification out to every device a user has, across all workspaces.
   *  Used for user-level notifications (e.g. the daily reminder). */
  async sendToUserDevices(userId: string, payload: PushPayload): Promise<void> {
    const [subs, devices] = await Promise.all([
      this.configured
        ? this.prisma.pushSubscription.findMany({ where: { userId } })
        : Promise.resolve([] as PushSubscription[]),
      this.prisma.mobilePushDevice.findMany({ where: { userId } }),
    ]);
    await Promise.all([this.deliver(subs, payload), this.deliverExpo(devices, payload)]);
  }

  /** Send to a set of subscriptions; prunes dead (404/410) endpoints. */
  private async deliver(
    subs: PushSubscription[],
    payload: PushPayload,
  ): Promise<void> {
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 404/410 mean the subscription is gone — stop trying to reach it.
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { endpoint: sub.endpoint } })
              .catch(() => undefined);
          } else {
            this.logger.warn(`Push send failed (${statusCode ?? 'unknown'}).`);
          }
        }
      }),
    );
  }

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

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const token = chunk[i]?.to as string;
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
}
