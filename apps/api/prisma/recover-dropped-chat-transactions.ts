/**
 * One-off recovery: reconstruct chat transactions that were never saved (the LLM
 * said "Logged!" without calling the tool), insert them dated to the original
 * day, and restore each affected user's streak + the STREAK_DAY/MILESTONE XP for
 * those dates. See docs/superpowers/specs/2026-06-21-recover-dropped-chat-transactions-design.md.
 *
 * Safety: DRY-RUN by default — prints what it would do and writes nothing. Pass
 * --commit (or COMMIT=1) to write. Idempotent: recovered rows carry
 * sourceMessageId + a 'chat-recovery' tag; XP keys on meta.date.
 *
 * Reconstruction replays the original message through the LLM, so the run needs
 * ANTHROPIC_API_KEY in the environment in addition to the DB URL.
 *
 * Run (preview, last 7 days):
 *   DATABASE_URL="$DIRECT_DATABASE_URL" ANTHROPIC_API_KEY=… pnpm --filter finby-api exec \
 *     ts-node --project tsconfig.seed.json prisma/recover-dropped-chat-transactions.ts
 * Run (commit):  …same… prisma/recover-dropped-chat-transactions.ts --commit
 * Override window:  …same… --since=2026-06-14
 *
 * Note: connect via the DIRECT (non-pooled) URL by exporting it as DATABASE_URL
 * for the run, since the Nest PrismaService reads DATABASE_URL.
 */
import { NestFactory } from '@nestjs/core';
import { RecoveryModule } from '../src/modules/chat/recovery/recovery.module';
import { ChatRecoveryService } from '../src/modules/chat/recovery/chat-recovery.service';

const COMMIT = process.argv.includes('--commit') || process.env.COMMIT === '1';

function resolveSince(): string {
  const arg = process.argv.find((a) => a.startsWith('--since='));
  if (arg) return arg.slice('--since='.length);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const since = resolveSince();
  console.log(`[recover] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} since=${since}`);

  const app = await NestFactory.createApplicationContext(RecoveryModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(ChatRecoveryService);
    const report = await service.run({ since, commit: COMMIT });

    console.log(
      `[recover] candidates=${report.candidates} ` +
        `reconstructed=${report.inserted.length} needsManual=${report.needsManual.length} ` +
        `failed=${report.failed.length} ` +
        `notLoggingIntent=${report.notLoggingIntent} skippedAlreadyRecovered=${report.skippedAlreadyRecovered}`,
    );

    for (const i of report.inserted) {
      console.log(
        `[recover] ${COMMIT ? 'inserted' : 'would insert'} user=${i.userId} ` +
          `${i.type} ${i.amountOriginal} ${i.currencyOriginal} ` +
          `cat=${i.categoryName ?? '-'} date=${i.transactionDate} conf=${i.confidence} ` +
          `(msg=${i.userMessageId})`,
      );
    }
    for (const m of report.needsManual) {
      console.log(
        `[recover] NEEDS MANUAL (transfer) user=${m.userId} msg=${m.userMessageId}: "${m.userText}"`,
      );
    }
    for (const f of report.failed) {
      console.log(`[recover] FAILED user=${f.userId} msg=${f.userMessageId}: ${f.error}`);
    }
    for (const s of report.streakRestores) {
      console.log(
        `[recover] user=${s.userId} streak ${s.before.currentStreak}→${s.after.currentStreak} ` +
          `(longest ${s.before.longestStreak}→${s.after.longestStreak}); ` +
          `xp: ${s.xpAwards.map((x) => `${x.event} ${x.date} +${x.delta}`).join(', ') || 'none'}`,
      );
    }
    if (!COMMIT) console.log('[recover] DRY-RUN — nothing was written. Re-run with --commit to apply.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[recover] FAILED:', err);
  process.exitCode = 1;
});
