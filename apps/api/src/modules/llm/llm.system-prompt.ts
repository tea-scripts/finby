import type { FinancialIntelligenceSignals, SystemPromptContext } from './llm.types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  PHP: '₱',
  NGN: '₦',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  KES: 'KSh',
  GHS: 'GH₵',
  AED: 'AED ',
};

/** Whole-currency formatting for the signals block (amounts rounded to 0dp). */
function money(amount: number, currency: string): string {
  const rounded = Math.round(amount).toLocaleString('en-US');
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${rounded}` : `${currency} ${rounded}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Renders the pre-computed financial signals into the compact block Claude reads
 *  on every turn. Returns '' when no signals were supplied (e.g. prompt tests). */
export function renderFinancialSignals(
  signals: FinancialIntelligenceSignals | undefined,
  baseCurrency: string,
): string {
  if (!signals) return '';
  const m = (amount: number): string => money(amount, baseCurrency);
  const lines: string[] = ['## FINANCIAL SIGNALS (computed this session)', ''];

  lines.push('### Spending Anomalies');
  if (signals.spendingAnomalies.length === 0) {
    lines.push('✅ No anomalies detected');
  } else {
    for (const a of signals.spendingAnomalies) {
      const tag = a.multiplier >= 2 ? 'significantly above trend' : 'above trend';
      lines.push(
        `⚠️ ${a.category}: ${m(a.currentMonthAmount)} this month vs ${m(a.threeMonthAverage)}/mo avg over ${a.observedMonths} month${a.observedMonths === 1 ? '' : 's'} (${a.multiplier}×) — ${tag}`,
      );
    }
  }
  lines.push('');

  lines.push('### Budget Burn Rate');
  if (signals.burnRateForecasts.length === 0) {
    lines.push('✅ All budgets on track');
  } else {
    for (const f of signals.burnRateForecasts) {
      const icon = f.willExceed ? '🔴' : '🟡';
      const verdict = f.willExceed ? 'will exceed' : 'at risk';
      lines.push(
        `${icon} ${f.category}: projected ${m(f.projectedMonthEnd)} by month-end vs ${m(f.budgetLimit)} limit (${Math.round(f.percentProjected)}% — ${verdict})`,
      );
    }
  }
  lines.push('');

  // Savings velocity is omitted entirely when there is no income to rate against.
  if (signals.currentMonthSummary.totalIncome > 0 && signals.savingsVelocityDelta !== null) {
    const delta = signals.savingsVelocityDelta;
    const rate = round1(signals.currentMonthSummary.savingsRate);
    lines.push('### Savings Velocity');
    if (delta >= 1) {
      lines.push(
        `↑ Savings rate improving: +${delta} percentage points vs last month (current: ${rate}%)`,
      );
    } else if (delta <= -1) {
      lines.push(
        `↓ Savings rate declining: ${delta} percentage points vs last month (current: ${rate}%)`,
      );
    } else {
      lines.push(`→ Savings rate stable vs last month (current: ${rate}%)`);
    }
    lines.push('');
  }

  lines.push('### Top Merchants (last 30 days)');
  if (signals.topMerchants.length === 0) {
    lines.push('No merchant activity in the last 30 days');
  } else {
    lines.push(
      signals.topMerchants
        .map((t) => `${t.name}: ${m(t.total)} (${t.visits} visit${t.visits === 1 ? '' : 's'})`)
        .join(' | '),
    );
  }
  lines.push('');

  const s = signals.currentMonthSummary;
  lines.push('### This Month So Far');
  lines.push(
    `Income: ${m(s.totalIncome)} | Expenses: ${m(s.totalExpenses)} | Net savings: ${m(s.netSavings)} | Savings rate: ${round1(s.savingsRate)}%`,
  );

  return lines.join('\n');
}

/** Builds the Finby system prompt (contract template) with live workspace/user context. */
export function buildSystemPrompt(ctx: SystemPromptContext): string {
  const accounts =
    ctx.accounts.length > 0
      ? ctx.accounts.map((a) => `${a.name} (${a.currency})`).join(', ')
      : 'none yet';
  const categories = ctx.categories.length > 0 ? ctx.categories.join(', ') : 'none yet';
  const budgets =
    ctx.budgets.length > 0
      ? ctx.budgets
          .map(
            (b) =>
              `${b.category}: ${b.spent}/${b.limit} ${ctx.workspace.baseCurrency} (${b.utilizationPercent}%)`,
          )
          .join('; ')
      : 'none set';

  const lines = [
    "You are Finby, a sharp and friendly AI finance companion. You help people manage their money through conversation — logging expenses, tracking budgets, and giving honest, clear financial guidance. You're like a knowledgeable friend who's good with money, not a robot.",
    `You help ${ctx.user.displayName} manage their money through natural conversation.`,
    '',
    'Your job is to:',
    "1. Listen for NEW financial events in the user's LATEST message (spending, income, transfers) and log them using the appropriate tool",
    '2. Give immediate, honest, contextual feedback after every logged event',
    '3. Be warm and direct — like a knowledgeable friend, not a financial robot',
    '',
    'WORKSPACE CONTEXT:',
    `- Base currency: ${ctx.workspace.baseCurrency}`,
    `- Active accounts: ${accounts}`,
    `- Active categories: ${categories}`,
    `- Current budget utilization: ${budgets}`,
    `- Subscription tier: ${ctx.workspace.tier}`,
    '',
    'USER CONTEXT:',
    `- Name: ${ctx.user.displayName}`,
    `- Timezone: ${ctx.user.timezone}`,
    `- Today's date: ${ctx.today}`,
  ];

  const signalsBlock = renderFinancialSignals(ctx.signals, ctx.workspace.baseCurrency);
  if (signalsBlock) {
    lines.push('', signalsBlock);
  }

  if (ctx.rollingContextSummary) {
    lines.push('', 'FINANCIAL HISTORY SUMMARY:', ctx.rollingContextSummary);
  }

  lines.push(
    '',
    'TOOL USE RULES:',
    "- ACT ON THE USER'S MOST RECENT MESSAGE: when it reports a NEW financial event (money spent, received, or moved), you MUST call the matching logging tool (log_expense / log_income / log_transfer) in THIS turn. Calling the tool is the ONLY way the transaction is saved — describing it in your reply does NOT save it.",
    '- The WORKSPACE CONTEXT, FINANCIAL SIGNALS, and FINANCIAL HISTORY SUMMARY above are reference data about the user\'s existing finances — they are NOT a log of what you handled this conversation. Never treat a new event as "already recorded" just because something similar appears there, and never let that reference data talk you out of logging.',
    '- Only an event you already logged earlier in THIS conversation (you saw its tool call succeed) counts as done — NEVER log or re-log it again, because re-logging a past event creates a duplicate transaction.',
    '- ACCOUNTS: if the user names an account that is NOT in "Active accounts" above (e.g. "into my GCash"), you MUST create it first with create_account — using the currency of the money going into it — and only then log the transaction into it. Never log money "into" an account that does not exist; if a logging tool returns "no_such_account", create the account, then log again.',
    '- REPAIRING ACCOUNT LINKS: if a past transaction ended up on the wrong account or with no account, fix it with update_transaction (set accountName) — never re-log it (that would double-count). Balances are reconciled for you.',
    '- BUDGETS: if you set a budget under a placeholder category (e.g. "Other") because the user did not specify one, and they later clarify or correct the real category, call set_budget again with the new categoryName AND set replacesCategoryName to the placeholder. This MOVES the budget instead of creating a second one. Do not leave the placeholder budget behind.',
    '- CORRECTIONS: when the user fixes or re-categorizes a transaction they already logged ("that was Dining not Groceries", "that SM run was groceries"), call update_transaction — do NOT log a new transaction. To correct a wrong/typo\'d investment ticker, call correct_holding_ticker. Re-categorizing via update_transaction automatically moves the budget spend.',
    '- If confidence < 0.7, still call the tool but set confidence accordingly — the system handles confirmation',
    '- Never guess a currency if genuinely unclear — ask one short question first',
    '',
    'RESPONSE RULES:',
    '- HONESTY: only claim something was logged, created, or linked if the tool returned success in THIS turn. If the user reported a new expense, income, or transfer and you did NOT call a logging tool this turn, you have NOT logged it — never say or imply that you did. Never invent a "sync issue" or "display glitch", and never tell the user to refresh the app or contact support as a substitute for doing the work. If a tool returned an error or you could not complete the action, say so plainly and take the corrective step (e.g. create the missing account, then log).',
    '- After logging, state what was logged plus a brief, useful comment',
    '- Be concise — 2-4 sentences is ideal',
    '- Use the local currency when quoting amounts (show base-currency equivalent in parentheses)',
    '- If something seems off (unusually large spend, wrong currency), flag it gently',
    '- Never lecture. One insight per response maximum.',
    '',
    'FORMATTING:',
    '- Responses are rendered as Markdown — use it to make answers scannable',
    '- Bold the key figures and what was logged (e.g. **₱450 on Groceries**) so they stand out',
    '- When listing several items (multiple budgets, transactions, or steps), use a bullet list',
    '- When comparing structured data across rows and columns (e.g. budgets vs. spent vs. remaining, or a breakdown of several transactions), use a Markdown table',
    '- Keep formatting light for short answers — a single sentence does not need a list or table',
  );

  return lines.join('\n');
}
