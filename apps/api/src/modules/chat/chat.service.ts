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
import { createAccountSchema } from '../accounts/dto/accounts.schemas';
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
  ChatMessageView,
  ChatResult,
  ChatStreamEvent,
  PendingConfirmation,
  ToolExecResult,
} from './chat.types';
import { estimateTokens } from './memory/token-counter.util';
import { MemoryCompressionService } from './memory/memory-compression.service';
import { ContextAssemblerService } from './context/context-assembler.service';
import { FinancialIntelligenceService } from '../analytics/financial-intelligence.service';

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
    private readonly financialIntelligence: FinancialIntelligenceService,
  ) {}

  /** JSON entry point — drains the streaming generator and assembles the
   *  same ChatResult the non-streaming endpoint has always returned. */
  async handleMessage(
    workspace: WorkspaceContext,
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<ChatResult> {
    const actions: ChatAction[] = [];
    const pendingConfirmations: PendingConfirmation[] = [];
    let message: ChatMessageView | null = null;

    for await (const event of this.streamMessage(workspace, userId, conversationId, content)) {
      if (event.type === 'action') actions.push(event.action);
      else if (event.type === 'pending') pendingConfirmations.push(event.confirmation);
      else if (event.type === 'done') message = event.message;
    }

    if (!message) {
      throw new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
    }
    return { message, actions, pendingConfirmations };
  }

  /** Streaming entry point and single source of truth for the agentic loop.
   *  Yields start/text/action/pending/done events; throws (pre-stream) on
   *  rate-limit (429) or first-turn connection failure (503). */
  async *streamMessage(
    workspace: WorkspaceContext,
    userId: string,
    conversationId: string,
    content: string,
  ): AsyncGenerator<ChatStreamEvent> {
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

    const loggedSignatures = await this.loadLoggedSignatures(conversationId, workspace.id);

    const baseSystem = await this.buildSystemPrompt(workspace, user);
    const { system, messages } = await this.contextAssembler.buildContext(conversationId, baseSystem);
    const tools = this.llm.getTools();

    const actions: ChatAction[] = [];
    const convo: LlmMessage[] = [...messages];

    let response: LlmResponse;
    try {
      response = yield* this.runTurn({ system, messages: convo, tools }, true);
    } catch (error) {
      await this.persistLlmFailure(conversationId, conversation.title, content);
      this.logger.error(`LLM call failed: ${this.describe(error)}`);
      throw new ServiceUnavailableException(LLM_UNAVAILABLE_MESSAGE);
    }
    let finalText = response.textOutput;

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
            ...(exec.action?.type === 'TRANSACTION_CREATED' ? { createdTransactionId: exec.action.transactionId } : {}),
          },
        });

        if (exec.action) {
          actions.push(exec.action);
          if (signature) loggedSignatures.add(signature);
          yield { type: 'action', action: exec.action };
        }
        if (exec.pending) {
          yield { type: 'pending', confirmation: exec.pending };
        }
        toolResultBlocks.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: exec.toolResult,
        });
      }

      convo.push({ role: 'assistant', content: response.content });
      convo.push({ role: 'user', content: toolResultBlocks });

      try {
        response = yield* this.runTurn({ system, messages: convo, tools }, false);
      } catch (error) {
        this.logger.error(`LLM follow-up failed after tool execution: ${this.describe(error)}`);
        finalText = this.fallbackSummary(actions);
        yield { type: 'error', code: 'LLM_FOLLOWUP_FAILED', message: LLM_UNAVAILABLE_MESSAGE };
        response = { stopReason: 'error', content: [], textOutput: '', toolCalls: [] };
        break;
      }
      finalText = response.textOutput || finalText;
    }

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
      await this.memory.maintain(conversationId, workspace.tier);
    } else {
      void this.memory.maintain(conversationId, workspace.tier).catch((err) =>
        this.logger.warn(`Background memory maintain failed: ${String(err)}`),
      );
    }

    yield {
      type: 'done',
      message: {
        id: assistant.id,
        role: 'ASSISTANT',
        content: finalText,
        createdAt: assistant.createdAt.toISOString(),
      },
    };
  }

  /** Runs a single LLM turn: forwards text deltas as `text` events (emitting a
   *  one-time `start` first when requested) and returns the assembled response. */
  private async *runTurn(
    params: { system: string; messages: LlmMessage[]; tools: ReturnType<LlmService['getTools']> },
    emitStart: boolean,
  ): AsyncGenerator<ChatStreamEvent, LlmResponse> {
    let started = false;
    let response: LlmResponse | undefined;
    for await (const ev of this.llm.streamMessage(params)) {
      if (!started) {
        started = true;
        if (emitStart) yield { type: 'start' };
      }
      if (ev.type === 'text_delta') {
        if (ev.text) yield { type: 'text', text: ev.text };
      } else if (ev.type === 'complete') {
        response = ev.response;
      }
    }
    if (!response) {
      throw new Error('LLM stream ended without a completion event');
    }
    return response;
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
      case 'create_account':
        return this.execCreateAccount(workspace, call.input);
      case 'update_transaction':
        return this.execUpdateTransaction(workspace, call.input);
      case 'correct_holding_ticker':
        return this.execCorrectHoldingTicker(workspace, userId, call.input);
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
   *  for non-logging tools / incomplete input. Used to detect re-logged history.
   *  Account-aware: two otherwise-identical events into different accounts are
   *  distinct (e.g. ₱5,000 into GCash vs into BPI), so neither shadows the other. */
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
    const account =
      type === 'TRANSFER'
        ? `${(asString(call.input.fromAccountName) ?? '').toLowerCase()}>${(asString(call.input.toAccountName) ?? '').toLowerCase()}`
        : (asString(call.input.accountName) ?? '').toLowerCase();
    return this.composeSignature(type, amount, currency, merchant, account);
  }

  /** Build the canonical 5-part dedup key. Both the tool-call side (account NAMES
   *  from input) and the stored-transaction side (account names joined from the
   *  relation) feed through here so the two always compose identically. */
  private composeSignature(
    type: string,
    amountRaw: string,
    currency: string,
    merchant: string,
    account: string,
  ): string {
    return `${type}|${normalizeAmount(amountRaw)}|${currency.toUpperCase()}|${merchant.toLowerCase()}|${account.toLowerCase()}`;
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
      select: {
        type: true,
        amountOriginal: true,
        currencyOriginal: true,
        merchant: true,
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
    });
    return new Set(
      txs.map((t) => {
        const account =
          t.type === 'TRANSFER'
            ? `${(t.fromAccount?.name ?? '').toLowerCase()}>${(t.toAccount?.name ?? '').toLowerCase()}`
            : (t.fromAccount?.name ?? '').toLowerCase();
        return this.composeSignature(
          t.type,
          t.amountOriginal.toString(),
          t.currencyOriginal,
          t.merchant ?? '',
          account,
        );
      }),
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
    let account: Awaited<ReturnType<AccountsService['findByName']>> = null;
    if (accountName) {
      account = await this.accounts.findByName(workspace.id, accountName);
      // The user named a specific account ("into my GCash") — never silently log
      // the money unattributed. If it doesn't exist yet, refuse and tell the model
      // to create it first (in THIS transaction's currency so the two match).
      if (!account) {
        return {
          toolResult: JSON.stringify({
            error: 'no_such_account',
            message: `No account named "${accountName}" exists yet. Create it first with create_account using currency ${currencyOriginal} (so it matches this ${currencyOriginal} ${type === 'INCOME' ? 'income' : 'expense'}), then log this into that account. Do NOT tell the user it was logged until it succeeds.`,
          }),
        };
      }
    }

    try {
      const { transaction: tx, budgetChange, currentStreak } = await this.transactions.create({
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
        txType: type,
        preview: {
          amount: tx.amountOriginal,
          currency: tx.currencyOriginal,
          merchant: tx.merchant,
          category: tx.category?.name ?? null,
        },
        currentStreak: currentStreak ?? null,
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
      const { transaction: tx, currentStreak } = await this.transactions.create({
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
        txType: 'TRANSFER',
        preview: { amount: tx.amountOriginal, currency: tx.currencyOriginal, merchant: null, category: null },
        currentStreak: currentStreak ?? null,
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

    // Re-categorization: the user is clarifying/correcting a budget's category
    // (e.g. moving it off the "Other" placeholder). Replace the old budget
    // instead of leaving a duplicate.
    const replacesCategoryName = asString(input.replacesCategoryName);
    const replaceCategory = replacesCategoryName
      ? await this.categories.findByName(workspace.id, replacesCategoryName)
      : null;

    try {
      const budget = await this.budgets.createOrUpdate(
        workspace.id,
        workspace.baseCurrency,
        {
          categoryId: category.id,
          amountLimit,
          period,
          periodStart: asString(input.periodStart),
        },
        replaceCategory ? { replaceCategoryId: replaceCategory.id } : undefined,
      );
      const action: ChatAction = {
        type: 'BUDGET_SET',
        preview: {
          currency: budget.currency,
          amount: budget.amountLimit,
          category: budget.category.name,
        },
      };
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
        action,
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  /** Create a new account from chat. Mirrors the HTTP POST: same zod validation
   *  and the same single-currency tier gate, so chat can't bypass plan limits. */
  private async execCreateAccount(
    workspace: WorkspaceContext,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    const parsed = createAccountSchema.safeParse({
      name: input.name,
      accountType:
        typeof input.accountType === 'string' ? input.accountType.toUpperCase() : input.accountType,
      currency: input.currency,
      initialBalance: asString(input.openingBalance) ?? '0',
    });
    if (!parsed.success) {
      return {
        toolResult: JSON.stringify({
          error:
            'Missing or invalid account fields: need a name, an accountType (BANK/CASH/EWALLET/BROKERAGE/CRYPTO/OTHER), and a 3-letter currency code.',
        }),
      };
    }

    const limitError = this.currencyLimitError(
      workspace.tier,
      workspace.baseCurrency,
      parsed.data.currency,
    );
    if (limitError) {
      return { toolResult: JSON.stringify({ error: 'tier_limit', message: limitError }) };
    }

    const existing = await this.accounts.findByName(workspace.id, parsed.data.name);
    if (existing) {
      return {
        toolResult: JSON.stringify({
          error: `You already have an account named "${parsed.data.name}".`,
        }),
      };
    }

    try {
      const account = await this.accounts.create(workspace.id, parsed.data);
      return {
        toolResult: JSON.stringify({
          status: 'account_created',
          name: account.name,
          accountType: account.accountType,
          currency: account.currency,
          balance: account.balance,
        }),
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execUpdateTransaction(
    workspace: WorkspaceContext,
    input: Record<string, unknown>,
  ): Promise<ToolExecResult> {
    const categoryName = asString(input.categoryName);
    const merchant = asString(input.merchant);
    const transactionDate = asString(input.transactionDate);
    const accountName = asString(input.accountName);
    if (!categoryName && !merchant && !transactionDate && !accountName) {
      return {
        toolResult: JSON.stringify({
          error: 'Nothing to update — specify a new category, merchant, date, or account.',
        }),
      };
    }

    // Re-categorizing only makes sense onto a real category — never re-route to
    // the "Other" placeholder, which is the very thing this corrects.
    let categoryId: string | undefined;
    if (categoryName) {
      const category = await this.categories.findByName(workspace.id, categoryName);
      if (!category) {
        return {
          toolResult: JSON.stringify({
            error: `No category named "${categoryName}". Ask the user to pick an existing category or create it first.`,
          }),
        };
      }
      categoryId = category.id;
    }

    // Re-attribute a transaction to an account it should have been logged into.
    let accountId: string | undefined;
    if (accountName) {
      const account = await this.accounts.findByName(workspace.id, accountName);
      if (!account) {
        return {
          toolResult: JSON.stringify({
            error: `No account named "${accountName}". Create it first with create_account, then try again.`,
          }),
        };
      }
      accountId = account.id;
    }

    const matchType = asString(input.matchType)?.toUpperCase();
    const target = await this.transactions.findLatestForCorrection(workspace.id, {
      type: matchType === 'EXPENSE' || matchType === 'INCOME' ? matchType : undefined,
      merchant: asString(input.matchMerchant) ?? undefined,
      amountOriginal: asString(input.matchAmount) ?? undefined,
    });
    if (!target) {
      return {
        toolResult: JSON.stringify({
          error: 'Could not find a matching transaction to correct. Ask the user which one they mean.',
        }),
      };
    }

    try {
      const updated = await this.transactions.update(workspace.id, target.id, {
        ...(categoryId ? { categoryId } : {}),
        ...(merchant ? { merchant } : {}),
        ...(transactionDate ? { transactionDate } : {}),
        ...(accountId ? { accountId } : {}),
      });
      const action: ChatAction = {
        type: 'TRANSACTION_UPDATED',
        transactionId: updated.id,
        preview: {
          amount: updated.amountOriginal,
          currency: updated.currencyOriginal,
          merchant: updated.merchant,
          category: updated.category?.name ?? null,
        },
      };
      return {
        toolResult: JSON.stringify({
          status: 'updated',
          transactionId: updated.id,
          amountOriginal: updated.amountOriginal,
          currencyOriginal: updated.currencyOriginal,
          category: updated.category?.name ?? null,
          merchant: updated.merchant,
          transactionDate: updated.transactionDate,
        }),
        action,
      };
    } catch (error) {
      return { toolResult: JSON.stringify({ error: this.errorMessage(error) }) };
    }
  }

  private async execCorrectHoldingTicker(
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
    const fromTicker = asString(input.fromTicker)?.toUpperCase();
    const toTicker = asString(input.toTicker)?.toUpperCase();
    if (!fromTicker || !toTicker) {
      return { toolResult: JSON.stringify({ error: 'Missing fromTicker or toTicker.' }) };
    }

    try {
      const holding = await this.portfolio.renameTicker({
        workspaceId: workspace.id,
        ownedByUserId: userId,
        fromTicker,
        toTicker,
      });
      const action: ChatAction = {
        type: 'HOLDING_UPDATED',
        preview: { fromTicker, toTicker: holding.ticker },
      };
      return {
        toolResult: JSON.stringify({
          status: 'ticker_corrected',
          fromTicker,
          toTicker: holding.ticker,
          quantity: holding.quantity,
        }),
        action,
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
          // Flags this 429 as an upgrade moment (vs a generic rate limit) so the
          // web client can surface an upgrade CTA. Forwarded by HttpExceptionFilter.
          details: { upgradeRequired: true },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async buildSystemPrompt(
    workspace: WorkspaceContext,
    user: { displayName: string; timezone: string } | null,
  ): Promise<string> {
    const [accounts, categories, budgets, signals] = await Promise.all([
      this.accounts.list(workspace.id),
      this.categories.list(workspace.id),
      this.budgets.list(workspace.id, {}),
      this.financialIntelligence.computeSignals(
        workspace.id,
        workspace.baseCurrency,
        workspace.tier,
      ),
    ]);
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
      signals,
    });
  }

}
