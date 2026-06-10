import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { PushSubscription } from '@prisma/client';
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
      this.logger.warn('VAPID keys not set — push notifications are disabled.');
    }
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

  /** Fan a notification out to a member's devices in one workspace. */
  async sendToUser(workspaceId: string, userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { workspaceId, userId } });
    if (subs.length === 0) return;
    await this.deliver(subs, payload);
  }

  /** Fan a notification out to every device a user has, across all workspaces.
   *  Used for user-level notifications (e.g. the daily reminder). */
  async sendToUserDevices(userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;
    await this.deliver(subs, payload);
  }

  /** Send to a set of subscriptions; prunes dead (404/410) endpoints. */
  private async deliver(
    subs: PushSubscription[],
    payload: PushPayload,
  ): Promise<void> {
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
}
