/**
 * One-off backfill: award the daily-login XP that users *should* have earned
 * while the feature was misfiring (it was wired to /auth/me, which the client
 * rarely calls — see fix/daily-login-trigger).
 *
 * Scope (decided with the product owner):
 *   - For each target local date, award ONLY users with evidence of activity on
 *     that date (an XP ledger row, a transaction, or a chat message whose
 *     timestamp falls on that date in the user's own timezone).
 *   - XP is tier-scaled, identical to the live award (XP_BASE.DAILY_LOGIN ×
 *     the user's workspace tier multiplier).
 *   - Idempotent: skips any (user, date) that already has a DAILY_LOGIN ledger
 *     row, so re-runs are safe and it won't collide with the live award.
 *
 * Safety:
 *   - DRY-RUN by default. It prints exactly what it would write and changes
 *     nothing. Pass --commit (or COMMIT=1) to actually write.
 *   - Connects via DIRECT_DATABASE_URL (falls back to DATABASE_URL) so the
 *     batch runs on a direct Postgres connection, not the Accelerate pool.
 *
 * Run (preview):
 *   DIRECT_DATABASE_URL="postgres://…prod…" pnpm --filter finby-api exec \
 *     ts-node --project tsconfig.seed.json prisma/backfill-daily-login-xp.ts
 * Run (commit):
 *   …same… prisma/backfill-daily-login-xp.ts --commit
 * Override the dates (default = the 3 calendar days before today, UTC):
 *   BACKFILL_DATES="2026-06-18,2026-06-19,2026-06-20" …
 */
import { PrismaClient, Prisma, SubscriptionTier, XpEvent } from '@prisma/client';
import { XP_BASE, XP_MULTIPLIER } from '../src/modules/gamification/xp.constants';
import { localDayInfo } from '../src/modules/reminders/reminders.time';

const COMMIT = process.argv.includes('--commit') || process.env.COMMIT === '1';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL } },
});

/** YYYY-MM-DD for an instant in UTC. */
function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The default window: the 3 calendar dates ending yesterday (UTC). */
function defaultDates(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 3; i >= 1; i -= 1) {
    out.push(utcDate(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}

/** Resolve a timestamp to the user's local YYYY-MM-DD, UTC on a bad tz string. */
function localDate(at: Date, timezone: string | null): string {
  try {
    return localDayInfo(at, timezone || 'UTC').date;
  } catch {
    return localDayInfo(at, 'UTC').date;
  }
}

async function main(): Promise<void> {
  const targetDates = (process.env.BACKFILL_DATES?.split(',').map((s) => s.trim()).filter(Boolean) ??
    defaultDates());
  const targetSet = new Set(targetDates);
  const earliest = [...targetDates].sort()[0];
  // Widen the activity scan by a day on each side so timezone offsets can't clip
  // a local day that straddles the UTC boundary.
  const scanFrom = new Date(`${earliest}T00:00:00.000Z`);
  scanFrom.setUTCDate(scanFrom.getUTCDate() - 1);

  console.log(`[backfill] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} dates=${targetDates.join(',')}`);
  console.log(`[backfill] scanning activity since ${scanFrom.toISOString()}`);

  const users = await prisma.user.findMany({
    select: {
      id: true,
      timezone: true,
      workspaceMemberships: {
        orderBy: { joinedAt: 'asc' },
        take: 1,
        select: { workspace: { select: { tier: true } } },
      },
    },
  });

  let awardedRows = 0;
  let awardedXp = 0;
  let skippedExisting = 0;
  let usersTouched = 0;

  for (const user of users) {
    const tier = user.workspaceMemberships[0]?.workspace.tier as SubscriptionTier | undefined;
    if (!tier) continue; // no workspace → no tier multiplier → skip

    // Gather this user's activity timestamps in the window from three sources.
    const [xpTxns, txns, msgs, existingDaily] = await Promise.all([
      prisma.xpTransaction.findMany({
        where: { userId: user.id, createdAt: { gte: scanFrom } },
        select: { createdAt: true },
      }),
      prisma.transaction.findMany({
        where: { loggedByUserId: user.id, createdAt: { gte: scanFrom } },
        select: { createdAt: true },
      }),
      prisma.conversationMessage.findMany({
        where: { conversation: { userId: user.id }, createdAt: { gte: scanFrom } },
        select: { createdAt: true },
      }),
      prisma.xpTransaction.findMany({
        where: { userId: user.id, event: XpEvent.DAILY_LOGIN },
        select: { meta: true },
      }),
    ]);

    // Local dates on which the user was active, intersected with the target window.
    const activeDates = new Set<string>();
    for (const row of [...xpTxns, ...txns, ...msgs]) {
      const d = localDate(row.createdAt, user.timezone);
      if (targetSet.has(d)) activeDates.add(d);
    }
    if (activeDates.size === 0) continue;

    // Dates already credited (live award or a prior backfill run) — never double-award.
    const alreadyAwarded = new Set<string>();
    for (const row of existingDaily) {
      const date = (row.meta as { date?: string } | null)?.date;
      if (date) alreadyAwarded.add(date);
    }

    const toAward = [...activeDates].filter((d) => !alreadyAwarded.has(d)).sort();
    if (toAward.length === 0) {
      skippedExisting += activeDates.size;
      continue;
    }

    const delta = XP_BASE[XpEvent.DAILY_LOGIN] * XP_MULTIPLIER[tier];
    usersTouched += 1;
    for (const date of toAward) {
      console.log(`[backfill] ${COMMIT ? 'award' : 'would award'} user=${user.id} date=${date} tier=${tier} +${delta}xp`);
      if (COMMIT) {
        await prisma.$transaction([
          prisma.xpTransaction.create({
            data: {
              userId: user.id,
              event: XpEvent.DAILY_LOGIN,
              delta,
              meta: { date, source: 'backfill' } as Prisma.InputJsonValue,
            },
          }),
          prisma.userXp.upsert({
            where: { userId: user.id },
            create: { userId: user.id, balance: delta, totalEarned: delta },
            update: { balance: { increment: delta }, totalEarned: { increment: delta } },
          }),
        ]);
      }
      awardedRows += 1;
      awardedXp += delta;
    }
    skippedExisting += activeDates.size - toAward.length;
  }

  console.log(
    `[backfill] done: ${COMMIT ? 'awarded' : 'would award'} ${awardedRows} day(s) across ${usersTouched} user(s), ` +
      `${awardedXp} XP total; skipped ${skippedExisting} already-credited day(s).`,
  );
  if (!COMMIT) console.log('[backfill] DRY-RUN — nothing was written. Re-run with --commit to apply.');
}

main()
  .catch((err) => {
    console.error('[backfill] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
