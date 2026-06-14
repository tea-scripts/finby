import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FunnelMetrics, FunnelStep } from '@finby/shared';
import { RedisService } from '../../redis/redis.service';
import type { Env } from '../../config/env.schema';

const CACHE_TTL_SECONDS = 600; // 10 min — matches AdminAnalyticsService.

/** Predefined funnels. Events are the allow-listed names captured by the web app. */
const FUNNELS = {
  activation: {
    label: 'Activation',
    steps: [
      { event: 'signed_up', label: 'Signed up' },
      { event: 'onboarding_completed', label: 'Completed onboarding' },
      { event: 'transaction_logged', label: 'Logged a transaction' },
      { event: 'chat_message_sent', label: 'Sent a chat message' },
    ],
  },
  monetization: {
    label: 'Monetization',
    steps: [
      { event: 'upgrade_modal_viewed', label: 'Viewed upgrade' },
      { event: 'checkout_started', label: 'Started checkout' },
      { event: 'subscription_activated', label: 'Subscribed' },
    ],
  },
} as const;

export type FunnelKey = keyof typeof FUNNELS;

/** Shape of a single step in a PostHog FunnelsQuery response (`results` array). */
interface PosthogFunnelStep {
  count: number;
  name?: string;
  order?: number;
}

/**
 * Queries PostHog's HogQL query API for behavioural funnels. Unlike the
 * DB-derived admin metrics, these numbers come from client events and are
 * therefore subject to ad-blocker loss — surfaced for funnel/retention shapes
 * the database can't express, not for authoritative counts.
 */
@Injectable()
export class PosthogService {
  private readonly logger = new Logger(PosthogService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {}

  /** True only when both the personal API key and project id are configured. */
  isConfigured(): boolean {
    return Boolean(
      this.config.get('POSTHOG_API_KEY', { infer: true }) &&
        this.config.get('POSTHOG_PROJECT_ID', { infer: true }),
    );
  }

  async funnel(key: FunnelKey, windowDays: number): Promise<FunnelMetrics> {
    const def = FUNNELS[key];
    if (!this.isConfigured()) {
      return { key, label: def.label, windowDays, steps: [], configured: false };
    }

    const cacheKey = `admin:posthog:funnel:${key}:${windowDays}`;
    const hit = await this.redis.client.get(cacheKey);
    if (hit) return JSON.parse(hit) as FunnelMetrics;

    const counts = await this.queryFunnelCounts(def.steps, windowDays);
    const steps = this.toSteps(def.steps, counts);
    const result: FunnelMetrics = { key, label: def.label, windowDays, steps, configured: true };

    await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
    return result;
  }

  /** POST a FunnelsQuery to PostHog and return the per-step counts in order. */
  private async queryFunnelCounts(
    steps: readonly { event: string; label: string }[],
    windowDays: number,
  ): Promise<number[]> {
    const host = this.config.get('POSTHOG_API_HOST', { infer: true });
    const projectId = this.config.get('POSTHOG_PROJECT_ID', { infer: true });
    const apiKey = this.config.get('POSTHOG_API_KEY', { infer: true });

    const body = {
      query: {
        kind: 'FunnelsQuery',
        series: steps.map((s) => ({ kind: 'EventsNode', event: s.event })),
        dateRange: { date_from: `-${windowDays}d` },
        funnelsFilter: { funnelWindowInterval: windowDays, funnelWindowIntervalUnit: 'day' },
      },
    };

    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`PostHog query failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { results?: PosthogFunnelStep[] };
    const results = data.results ?? [];
    // Map back onto our ordered steps; default to 0 if PostHog omits a step.
    return steps.map((_, i) => {
      const match = results.find((r) => r.order === i) ?? results[i];
      return Number(match?.count ?? 0);
    });
  }

  /** Turn ordered counts into steps with from-start / from-prev conversion %. */
  private toSteps(
    defs: readonly { event: string; label: string }[],
    counts: number[],
  ): FunnelStep[] {
    const start = counts[0] ?? 0;
    return defs.map((d, i) => {
      const count = counts[i] ?? 0;
      const prev = i === 0 ? count : counts[i - 1] ?? 0;
      const pct = (num: number, den: number) =>
        den === 0 ? 0 : Math.round((num / den) * 1000) / 10;
      return {
        event: d.event,
        label: d.label,
        count,
        conversionFromStart: i === 0 ? 100 : pct(count, start),
        conversionFromPrev: i === 0 ? 100 : pct(count, prev),
      };
    });
  }
}
