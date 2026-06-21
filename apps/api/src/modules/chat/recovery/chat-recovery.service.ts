import { Injectable } from '@nestjs/common';
import type { SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { CategoriesService } from '../../categories/categories.service';
import { AccountsService } from '../../accounts/accounts.service';
import { StreaksService } from '../../streaks/streaks.service';
import { XpService } from '../../gamification/xp.service';

export interface ReconstructedTransaction {
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountOriginal: string;
  currencyOriginal: string;
  categoryName: string | null;
  accountName: string | null;
  merchant: string | null;
  transactionDate: string;
  confidence: number;
  needsManual: boolean;
}

const LOG_TOOL_TYPE: Record<string, 'EXPENSE' | 'INCOME' | 'TRANSFER'> = {
  log_expense: 'EXPENSE',
  log_income: 'INCOME',
  log_transfer: 'TRANSFER',
};

const asString = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : undefined;
};
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

@Injectable()
export class ChatRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly transactions: TransactionsService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly streaks: StreaksService,
    private readonly xp: XpService,
  ) {}

  async reconstructTurn(input: {
    workspace: { id: string; baseCurrency: string; tier: SubscriptionTier };
    user: { displayName: string; timezone: string };
    accounts: Array<{ name: string; currency: string }>;
    categories: string[];
    userText: string;
    messageLocalDate: string;
  }): Promise<ReconstructedTransaction | null> {
    const system = this.llm.buildSystemPrompt({
      user: { displayName: input.user.displayName, timezone: input.user.timezone },
      workspace: { baseCurrency: input.workspace.baseCurrency, tier: input.workspace.tier },
      accounts: input.accounts,
      categories: input.categories,
      budgets: [],
      today: input.messageLocalDate, // pin "today" to the day the user spoke
    });

    const response = await this.llm.createMessage({
      system,
      messages: [{ role: 'user', content: input.userText }],
      tools: this.llm.getTools(),
    });

    const call = response.toolCalls.find((c) => c.name in LOG_TOOL_TYPE);
    if (!call) return null; // not a logging intent

    const type = LOG_TOOL_TYPE[call.name]!;
    const amountOriginal = asString(call.input.amountOriginal);
    const currencyOriginal = asString(call.input.currencyOriginal)?.toUpperCase();
    if (!amountOriginal || !currencyOriginal) return null;

    return {
      type,
      amountOriginal,
      currencyOriginal,
      categoryName: asString(call.input.categoryName) ?? null,
      accountName: asString(call.input.accountName) ?? null,
      merchant: asString(call.input.merchant) ?? null,
      transactionDate: (asString(call.input.transactionDate) ?? input.messageLocalDate).slice(0, 10),
      confidence: asNumber(call.input.confidence) ?? 1,
      needsManual: type === 'TRANSFER',
    };
  }
}
