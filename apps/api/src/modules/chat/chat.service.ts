import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TIER_LIMITS, type SubscriptionTier } from '@finby/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../fx/fx.service';
import { LlmService } from '../llm/llm.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BudgetsService } from '../budgets/budgets.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketDataService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import type { InvestmentActionP4 } from '../portfolio/portfolio.types';
import type { LlmContentBlock, LlmMessage, LlmResponse, LlmToolCall } from '../llm/llm.types';
import type { WorkspaceContext } from '../../common/context';
import { ConversationsService } from './conversations.service';
import type {
  ChatAction,
  ChatResult,
  PendingConfirmation,
  ToolExecResult,
} from './chat.types';
import { estimateTokens } from './memory/token-counter.util';
import { MemoryCompressionService } from './memory/memory-compression.service';
import { ContextAssemblerService } from './context/context-assembler.service';

const CONFIDENCE_THRESHOLD = 0.7;
/** Safety cap on the agentic tool loop (one user turn). */
const MAX_TOOL_ROUNDS = 5;
const LLM_UNAVAILABLE_MESSAGE =
  "I'm having trouble reaching my assistant right now — please try again in a moment.";

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
/** Signature-only amount normalization (NOT financial math): drop insignificant
 *  trailing zeros so "12", "12.0", "12.00" compare equal in a dedup key. */
function normalizeAmount(value: string): string {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly llm: LlmService,
    private readonly transactions: TransactionsService,
    private readonly fx: FxService,
    private readonly categories: CategoriesService,
    private readonly accounts: AccountsService,
    private readonly budgets: BudgetsService,
    private readonly analytics: AnalyticsService,
    private readonly market: MarketDataService,
    private readonly portfolio: PortfolioService,
    private readonly memory: MemoryCompressionService,
    private readonly contextAssembler: ContextAssemblerService,
  ) {}

  async handleMessage(
    workspace: WorkspaceContext,
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<ChatResult> {
    const conversation = await this.conversations.requireConversation(
      workspace.id,
      userId,
      conversationId,
    );

    await this.enforceDailyMessageLimit(workspace.tier, workspace.id, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, timezone: true },
    });

    const userMessage = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'USER', content, tokenCount: estimateTokens(content) },
    });

    // Signatures of events already logged in THIS conversation. The model sees the
    // full active window each turn, so without this guard a past "spent $12" can be
    // re-logged on later turns; we skip a log whose signature is already recorded.
    const loggedSignatures = await this.loadLoggedSignatures(conversationId, workspace.id);

    const baseSystem = await this.buildSystemPrompt(workspace, user);
    const { system, messages } = await this.contextAssembler.buildContext(conversationId, baseSystem);

    const tools = this.llm.getTools();
    let first: LlmResponse;
    try {
      first = await this.llm.createMessage({ system, messages, tools });
    } catch (error) {
      // No tool ran yet — nothing was committed. Degrade gracefully (503).
      await this.persistLlmFailure(conversationId, conversation.title, content);
      this.logger.error(`LLM call failed: ${this.describe(error)}`);
      throw new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
    }

    const actions: ChatAction[] = [];
    const pendingConfirmations: PendingConfirmation[] = [];

    // Agentic tool loop: keep executing tools and re-prompting until the model
    // returns final text (or we hit the cap). A single round was the original
    // bug — multi-step sequences (e.g. get_fx_rate then log_expense) dropped the
    // second tool, producing an empty message and logging nothing.
    const convo: LlmMessage[] = [...messages];
    let response = first;
    let finalText = first.textOutput;

    for (let round = 0; round < MAX_TOOL_ROUNDS && response.toolCalls.length > 0; round += 1) {
      const toolResultBlocks: LlmContentBlock[] = [];
      for (const call of response.toolCalls) {
        const signature = this.logSignature(call);

        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_CALL',
            content: JSON.stringify(call.input),
            toolName: call.name,
            tokenCount: estimateTokens(JSON.stringify(call.input)),
          },
        });

        // Deterministic duplicate guard: if the model re-emits a log for an event
        // already recorded in this conversation, skip it — never create a duplicate
        // transaction (a prompt rule alone is not reliable enough for financial data).
        if (signature && loggedSignatures.has(signature)) {
          const dupResult = JSON.stringify({
            status: 'duplicate_skipped',
            message:
              'That event was already logged earlier in this conversation — not logging it again.',
          });
          await this.prisma.conversationMessage.create({
            data: {
              conversationId,
              role: 'TOOL_RESULT',
              content: dupResult,
              toolResult: dupResult,
              tokenCount: estimateTokens(dupResult),
            },
          });
          toolResultBlocks.push({ type: 'tool_result', toolUseId: call.id, content: dupResult });
          continue;
        }

        const exec = await this.executeTool(workspace, userId, call, userMessage.id);

        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_RESULT',
            content: exec.toolResult,
            toolResult: exec.toolResult,
            tokenCount: estimateTokens(exec.toolResult),
            ...(exec.action ? { createdTransactionId: exec.action.transactionId } : {}),
          },
        });

        if (exec.action) {
          actions.push(exec.action);
          // Only a committed transaction counts toward the dedup set (not pending/errors).
          if (signature) loggedSignatures.add(signature);
        }
        if (exec.pending) pendingConfirmations.push(exec.pending);
        toolResultBlocks.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: exec.toolResult,
        });
      }

      convo.push({ role: 'assistant', content: response.content });
      convo.push({ role: 'user', content: toolResultBlocks });

      try {
        response = await this.llm.createMessage({ system, messages: convo, tools });
      } catch (error) {
        // Tools already executed (e.g. a transaction was created) — don't lose
        // the action by failing. Synthesize a minimal summary instead.
        this.logger.error(`LLM follow-up failed after tool execution: ${this.describe(error)}`);
        finalText = this.fallbackSummary(actions);
        response = { stopReason: 'error', content: [], textOutput: '', toolCalls: [] };
        break;
      }
      finalText = response.textOutput || finalText;
    }

    // Never surface an empty bubble — synthesize from actions if the model
    // returned no text (or we exhausted the tool-round cap).
    if (!finalText.trim()) {
      finalText = this.fallbackSummary(actions);
    }

    const assistant = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'ASSISTANT', content: finalText, tokenCount: estimateTokens(finalText) },
    });

    const messageCount = await this.prisma.conversationMessage.count({ where: { conversationId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messageCount,
        title: conversation.title ?? content.slice(0, 50),
        updatedAt: new Date(),
      },
    });

    if (workspace.tier === 'FREE') {
      await this.memory.maintain(conversationId, workspace.tier); // sync eviction
    } else {
      // fire-and-forget compression — never let a background failure reject unhandled
      void this.memory.maintain(conversationId, workspace.tier).catch((err) =>
        this.logger.warn(`Background memory maintain failed: ${String(err)}`),
      );
    }

    return {
      message: {
        id: assistant.id,
        role: 'ASSISTANT',
        content: finalText,
        createdAt: assistant.createdAt.toISOString(),
      },
      actions,
      pendingConfirmations,
    };
  }

  async executeTool(
    workspace: WorkspaceContext,
    userId: string,
    call: LlmToolCall,
    sourceMessageId?: string,
  ): Promise<ToolExecResult> {
    switch (call.name) {
      case 'log_expense':
        return this.execLog(workspace, userId, 'EXPENSE', call.input, sourceMessageId);
      case 'log_income':
        return this.execLog(workspace, userId, 'INCOME', call.input, sourceMessageId);
      case 'log_transfer':
        return this.execTransfer(workspace, userId, call.input, sourceMessageId);
      case 'set_budget':
        return this.execSetBudget(workspace, call.input);
      case 'query_analytics':
        return this.execQueryAnalytics(workspace, call.input);
      case 'log_investment_event':
        return this.execLogInvestment(workspace, userId, call.input);
      case 'get_market_data':
        return this.execGetMarketData(workspace, call.input);
      case 'get_fx_rate':
        return this.execFxRate(call.input);
      default:
        return { toolResult: JSON.stringify({ error: `Unknown tool: ${call.name}` }) };
    }
  }

  /** Canonical signature of a logging tool call (EXPENSE/INCOME/TRANSFER), or null
   *  for non-logging tools / incomplete input. Used to detect re-logged history. */
  private logSignature(call: LlmToolCall): string | null {
    const type =
      call.name === 'log_expense'
        ? 'EXPENSE'
        : call.name === 'log_income'
          ? 'INCOME'
          : call.name === 'log_transfer'
            ? 'TRANSFER'
            : null;
    if (!type) return null;
    const amount = asString(call.input.amountOriginal);
    const currency = asString(call.input.currencyOriginal)?.toUpperCase();
    if (!amount || !currency) return null;
    const merchant = (asString(call.input.merchant) ?? '').toLowerCase();
    return `${type}|${normalizeAmount(amount)}|${currency}|${merchant}`;
  }

  /** Signatures of non-void transactions already logged in this conversation
   *  (matched via sourceMessageId), used to skip duplicate re-logs. */
  private async loadLoggedSignatures(
    conversationId: string,
    workspaceId: string,
  ): Promise<Set<string>> {
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      select: { id: true },
    });
    const ids = messages.map((m) => m.id);
    if (ids.length === 0) return new Set();
    const txs = await this.prisma.transaction.findMany({
      where: { workspaceId, sourceMessageId: { in: ids }, status: { not: 'VOID' } },
      select: { type: true, amountOriginal: true, currencyOriginal: true, merchant: true },
    });
    return new Set(
      txs.map(
        (t) =>
          `${t.type}|${normalizeAmount(t.amountOriginal.toString())}|${t.currencyOriginal.toUpperCase()}|${(
            t.merchant ?? ''
          ).toLowerCase()}`,
      ),
    );
  }

  private async execLog(
    workspace: WorkspaceContext,
    userId: string,
    type: 'EXPENSE' | 'INCOME',
    input: Record<string, unknown>,
    sourceMessageId?: string,
  ): Promise<ToolExecResult> {
    const amountOriginal = asString(input.amountOriginal);
    const currencyOriginal = asString(input.currencyOriginal)?.toUpperCase();
    if (!amountOriginal || !currencyOriginal) {
      return { toolResult: JSON.stringify({ error: 'Missing amount or currency.' }) };
    }
    const confidence = asNumber(input.confidence) ?? 1;
    const date = (asString(input.transactionDate) ?? today()).slice(0, 10);

    if (confidence < CONFIDENCE_THRESHOLD) {
      const draft = {
        type,
        amountOriginal,
        currencyOriginal,
        merchant: asString(input.merchant) ?? null,
        categoryName: asString(input.categoryName) ?? null,
      };
      return {
        toolResult: JSON.stringify({ status: 'pending_confirmation', draft }),
        pending: {
          confirmationId: randomUUID(),
          question: `I want to make sure I got that right — ${type === 'EXPENSE' ? 'you spent' : 'you received'} ${amountOriginal} ${currencyOriginal}. Can you confirm the amount and details?`,
          draft,
        },
      };
    }

    const limitError = this.currencyLimitError(workspace.tier, workspace.baseCurrency, currencyOriginal);
    if (limitError) {
      return { toolResult: JSON.stringify({ error: 'tier_limit', message: limitError }) };
    }

    const categoryName = asString(input.categoryName);
    const category = categoryName
      ? ((await this.categories.findByName(workspace.id, categoryName)) ??
        (await this.categories.findByName(workspace.id, 'Other')))
      : null;
    const accountName = asString(input.accountName);
    const account = accountName ? await this.accounts.findByName(workspace.id, accountName) : null;

    try {
      const { transaction: tx, budgetChange } = await this.transactions.create({
        workspaceId: workspace.id,
        loggedByUserId: userId,
        baseCurrency: workspace.baseCurrency,
        type,
        amountOriginal,
        currencyOriginal,
        transactionDate: date,
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        merchant: asString(input.merchant) ?? null,
        description: asString(input.description) ?? null,
        aiConfidence: confidence,
        sourceMessageId: sourceMessageId ?? null,
      });

      const action: ChatAction = {
        type: 'TRANSACTION_CREATED',
        transactionId: tx.id,
        preview: {
          amount: tx.amountOriginal,
          currency: tx.currencyOriginal,
          merchant: tx.merchant,
          category: tx.category?.name ?? null,
        },
      };
      return {
        toolResult: JSON.stringify({
          status: 'logged',
          type,
          amountOriginal: tx.amountOriginal,
          currencyOriginal: tx.currencyOriginal,
          amountBase: tx.amountBase,
          currencyBase: tx.currencyBase,
          category: tx.category?.name ?? null,
          account: tx.account?.name ?? null,
          ...(budgetChange
            ? {
                budget: {
                  category: budgetChange.categoryName,
                  spent: budgetChange.newSpent,
                  limit: budgetChange.amountLimit,
                  utilizationPercent: budgetChange.newPercent,
                },
              }
            : {}),
        }),
        action,
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execTransfer(
    workspace: WorkspaceContext,
    userId: string,
    input: Record<string, unknown>,
    sourceMessageId?: string,
  ): Promise<ToolExecResult> {
    const amountOriginal = asString(input.amountOriginal);
    const currencyOriginal = asString(input.currencyOriginal)?.toUpperCase();
    if (!amountOriginal || !currencyOriginal) {
      return { toolResult: JSON.stringify({ error: 'Missing amount or currency.' }) };
    }
    const confidence = asNumber(input.confidence) ?? 1;
    const date = (asString(input.transactionDate) ?? today()).slice(0, 10);

    const fromName = asString(input.fromAccountName);
    const toName = asString(input.toAccountName);
    const from = fromName ? await this.accounts.findByName(workspace.id, fromName) : null;
    const to = toName ? await this.accounts.findByName(workspace.id, toName) : null;
    if (!from || !to) {
      return {
        toolResult: JSON.stringify({
          error: 'Could not find both accounts for the transfer. Ask the user which accounts.',
        }),
      };
    }

    if (confidence < CONFIDENCE_THRESHOLD) {
      const draft = { type: 'TRANSFER', amountOriginal, currencyOriginal, from: from.name, to: to.name };
      return {
        toolResult: JSON.stringify({ status: 'pending_confirmation', draft }),
        pending: {
          confirmationId: randomUUID(),
          question: `Confirm: transfer ${amountOriginal} ${currencyOriginal} from ${from.name} to ${to.name}?`,
          draft,
        },
      };
    }

    try {
      const { transaction: tx } = await this.transactions.create({
        workspaceId: workspace.id,
        loggedByUserId: userId,
        baseCurrency: workspace.baseCurrency,
        type: 'TRANSFER',
        amountOriginal,
        currencyOriginal,
        transactionDate: date,
        accountId: from.id,
        toAccountId: to.id,
        description: asString(input.description) ?? null,
        aiConfidence: confidence,
        sourceMessageId: sourceMessageId ?? null,
      });
      const action: ChatAction = {
        type: 'TRANSACTION_CREATED',
        transactionId: tx.id,
        preview: { amount: tx.amountOriginal, currency: tx.currencyOriginal, merchant: null, category: null },
      };
      return {
        toolResult: JSON.stringify({
          status: 'logged',
          type: 'TRANSFER',
          amountOriginal: tx.amountOriginal,
          currencyOriginal: tx.currencyOriginal,
          from: from.name,
          to: to.name,
        }),
        action,
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execSetBudget(
    workspace: WorkspaceContext,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    const categoryName = asString(input.categoryName);
    const amountLimit = asString(input.amountLimit);
    if (!categoryName || !amountLimit) {
      return { toolResult: JSON.stringify({ error: 'Missing category or amount.' }) };
    }

    const category = await this.categories.findByName(workspace.id, categoryName);
    if (!category) {
      return {
        toolResult: JSON.stringify({
          error: `No category named "${categoryName}". Ask the user to pick an existing category or create it first.`,
        }),
      };
    }

    const periodRaw = asString(input.period)?.toUpperCase();
    const period =
      periodRaw === 'WEEKLY' || periodRaw === 'QUARTERLY' || periodRaw === 'ANNUAL'
        ? periodRaw
        : 'MONTHLY';

    try {
      const budget = await this.budgets.createOrUpdate(workspace.id, workspace.baseCurrency, {
        categoryId: category.id,
        amountLimit,
        period,
        periodStart: asString(input.periodStart),
      });
      return {
        toolResult: JSON.stringify({
          status: 'budget_set',
          category: budget.category.name,
          amountLimit: budget.amountLimit,
          currency: budget.currency,
          period: budget.period,
          alreadySpent: budget.amountSpent,
          utilizationPercent: budget.utilizationPercent,
        }),
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execQueryAnalytics(
    workspace: WorkspaceContext,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    const queryType = asString(input.queryType)?.toUpperCase();
    const fromDate = asString(input.fromDate);
    const toDate = asString(input.toDate);
    if (!queryType || !fromDate || !toDate) {
      return { toolResult: JSON.stringify({ error: 'Missing queryType, fromDate or toDate.' }) };
    }

    const txType = asString(input.transactionType)?.toUpperCase() === 'INCOME' ? 'INCOME' : 'EXPENSE';

    try {
      switch (queryType) {
        case 'SUMMARY':
          return {
            toolResult: JSON.stringify(
              await this.analytics.summary(workspace.id, workspace.baseCurrency, fromDate, toDate),
            ),
          };
        case 'BY_CATEGORY':
          return {
            toolResult: JSON.stringify(
              await this.analytics.byCategory(
                workspace.id,
                workspace.baseCurrency,
                fromDate,
                toDate,
                txType,
              ),
            ),
          };
        case 'TREND': {
          const months = this.monthsBetween(fromDate, toDate);
          return {
            toolResult: JSON.stringify(
              await this.analytics.trend(workspace.id, workspace.baseCurrency, months, workspace.tier),
            ),
          };
        }
        case 'TOP_MERCHANTS':
          return {
            toolResult: JSON.stringify(
              await this.analytics.topMerchants(
                workspace.id,
                workspace.baseCurrency,
                fromDate,
                toDate,
                5,
              ),
            ),
          };
        case 'NET_WORTH':
          return {
            toolResult: JSON.stringify({
              error: 'Net worth requires the portfolio feature, available on Pro (coming soon).',
            }),
          };
        default:
          return { toolResult: JSON.stringify({ error: `Unknown queryType: ${queryType}` }) };
      }
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private monthsBetween(from: string, to: string): number {
    const a = new Date(from.slice(0, 10));
    const b = new Date(to.slice(0, 10));
    const months =
      (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
    return Math.min(Math.max(months, 1), 24);
  }

  private async execLogInvestment(
    workspace: WorkspaceContext,
    userId: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    if (!TIER_LIMITS[workspace.tier].portfolio) {
      return {
        toolResult: JSON.stringify({
          error: 'tier_limit',
          message: 'Portfolio tracking requires the Pro plan. Tell the user to upgrade.',
        }),
      };
    }

    const ticker = asString(input.ticker)?.toUpperCase();
    const action = asString(input.action)?.toUpperCase();
    const quantity = asString(input.quantity);
    const pricePerUnit = asString(input.pricePerUnit);
    const validAction =
      action === 'BUY' || action === 'SELL' || action === 'DIVIDEND' || action === 'SPLIT' || action === 'ADD';
    if (!ticker || !validAction || !quantity || !pricePerUnit) {
      return { toolResult: JSON.stringify({ error: 'Missing ticker, action, quantity or price.' }) };
    }

    const confidence = asNumber(input.confidence) ?? 1;
    if (confidence < CONFIDENCE_THRESHOLD) {
      const draft = { ticker, action, quantity, pricePerUnit };
      return {
        toolResult: JSON.stringify({ status: 'pending_confirmation', draft }),
        pending: {
          confirmationId: randomUUID(),
          question: `Confirm: ${action} ${quantity} ${ticker} at ${pricePerUnit}?`,
          draft,
        },
      };
    }

    try {
      const result = await this.portfolio.logEvent({
        workspaceId: workspace.id,
        ownedByUserId: userId,
        baseCurrency: workspace.baseCurrency,
        tier: workspace.tier,
        ticker,
        action: action as InvestmentActionP4,
        quantity,
        pricePerUnit,
        currency: asString(input.currency)?.toUpperCase() ?? 'USD',
        eventDate: (asString(input.eventDate) ?? today()).slice(0, 10),
        notes: asString(input.notes) ?? null,
      });
      return {
        toolResult: JSON.stringify({
          status: 'logged',
          action,
          ticker: result.holding.ticker,
          quantity: result.holding.quantity,
          avgCostBasis: result.holding.avgCostBasis,
          costCurrency: result.holding.costCurrency,
        }),
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execGetMarketData(
    workspace: WorkspaceContext,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    if (!TIER_LIMITS[workspace.tier].marketData) {
      return {
        toolResult: JSON.stringify({
          error: 'tier_limit',
          message: 'Market data requires the Pro plan. Tell the user to upgrade.',
        }),
      };
    }

    const ticker = asString(input.ticker);
    if (!ticker) {
      return { toolResult: JSON.stringify({ error: 'Missing ticker.' }) };
    }

    try {
      const quote = await this.market.getQuote(ticker);
      const result: Record<string, unknown> = { quote };
      if (input.includeInsight === true) {
        result.overview = await this.market.getOverview(ticker);
      }
      return { toolResult: JSON.stringify(result) };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execFxRate(input: Record<string, unknown>): Promise<ToolExecResult> {
    const from = asString(input.from);
    const to = asString(input.to);
    if (!from || !to) {
      return { toolResult: JSON.stringify({ error: 'Missing from/to currency.' }) };
    }
    try {
      const rate = await this.fx.getRate(from, to, asString(input.date));
      return { toolResult: JSON.stringify(rate) };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private currencyLimitError(
    tier: SubscriptionTier,
    baseCurrency: string,
    currency: string,
  ): string | null {
    const limit = TIER_LIMITS[tier].currencies;
    if (limit !== null && limit <= 1 && currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      return `The ${tier} plan supports a single currency (${baseCurrency}). Tell the user to upgrade to Pro for multi-currency.`;
    }
    return null;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      return error.message;
    }
    return 'Could not complete the action.';
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private fallbackSummary(actions: ChatAction[]): string {
    return actions.length > 0
      ? "Done — I've logged that for you. (I couldn't add my usual note just now.)"
      : LLM_UNAVAILABLE_MESSAGE;
  }

  /** Persist a friendly assistant fallback so the failed turn still reads coherently. */
  private async persistLlmFailure(
    conversationId: string,
    existingTitle: string | null,
    userContent: string,
  ): Promise<void> {
    await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: LLM_UNAVAILABLE_MESSAGE,
        tokenCount: estimateTokens(LLM_UNAVAILABLE_MESSAGE),
      },
    });
    const messageCount = await this.prisma.conversationMessage.count({ where: { conversationId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { messageCount, title: existingTitle ?? userContent.slice(0, 50), updatedAt: new Date() },
    });
  }

  private async enforceDailyMessageLimit(
    tier: SubscriptionTier,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const limit = TIER_LIMITS[tier].chatMessagesPerDay;
    if (limit === null) {
      return;
    }
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const used = await this.prisma.conversationMessage.count({
      where: {
        role: 'USER',
        createdAt: { gte: startOfDay },
        conversation: { workspaceId, userId },
      },
    });
    if (used >= limit) {
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: `You've reached the ${tier} plan's daily limit of ${limit} messages. Upgrade for unlimited chat.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async buildSystemPrompt(
    workspace: WorkspaceContext,
    user: { displayName: string; timezone: string } | null,
  ): Promise<string> {
    const accounts = await this.accounts.list(workspace.id);
    const categories = await this.categories.list(workspace.id);
    const budgets = await this.budgets.list(workspace.id, {});
    return this.llm.buildSystemPrompt({
      user: {
        displayName: user?.displayName ?? 'there',
        timezone: user?.timezone ?? 'UTC',
      },
      workspace: { baseCurrency: workspace.baseCurrency, tier: workspace.tier },
      accounts: accounts
        .filter((a) => !a.isArchived)
        .map((a) => ({ name: a.name, currency: a.currency })),
      categories: categories.filter((c) => !c.isArchived).map((c) => c.name),
      budgets: budgets
        .filter((b) => b.isActive)
        .map((b) => ({
          category: b.category.name,
          spent: b.amountSpent,
          limit: b.amountLimit,
          utilizationPercent: b.utilizationPercent,
        })),
      today: today(),
    });
  }

}
