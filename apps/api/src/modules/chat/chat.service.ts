import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TIER_LIMITS, type SubscriptionTier } from '@budgy/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { FxService } from '../fx/fx.service';
import { LlmService } from '../llm/llm.service';
import { TransactionsService } from '../transactions/transactions.service';
import type { LlmMessage, LlmResponse, LlmToolCall } from '../llm/llm.types';
import type { WorkspaceContext } from '../../common/context';
import { ConversationsService } from './conversations.service';
import type {
  ChatAction,
  ChatResult,
  PendingConfirmation,
  ToolExecResult,
} from './chat.types';

const CONFIDENCE_THRESHOLD = 0.7;
const FREE_ACTIVE_WINDOW = 20;
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, timezone: true },
    });

    await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'USER', content },
    });

    const system = await this.buildSystemPrompt(workspace, user);
    const history = await this.prisma.conversationMessage.findMany({
      where: { conversationId, isInActiveWindow: true, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      take: FREE_ACTIVE_WINDOW,
    });
    const messages: LlmMessage[] = history.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));

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
    let finalText = first.textOutput;

    if (first.toolCalls.length > 0) {
      const toolResultBlocks = [];
      for (const call of first.toolCalls) {
        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_CALL',
            content: JSON.stringify(call.input),
            toolName: call.name,
          },
        });

        const exec = await this.executeTool(workspace, userId, call);

        await this.prisma.conversationMessage.create({
          data: {
            conversationId,
            role: 'TOOL_RESULT',
            content: exec.toolResult,
            toolResult: exec.toolResult,
            ...(exec.action ? { createdTransactionId: exec.action.transactionId } : {}),
          },
        });

        if (exec.action) actions.push(exec.action);
        if (exec.pending) pendingConfirmations.push(exec.pending);
        toolResultBlocks.push({
          type: 'tool_result' as const,
          toolUseId: call.id,
          content: exec.toolResult,
        });
      }

      try {
        const followup = await this.llm.createMessage({
          system,
          messages: [
            ...messages,
            { role: 'assistant', content: first.content },
            { role: 'user', content: toolResultBlocks },
          ],
          tools,
        });
        finalText = followup.textOutput || finalText;
      } catch (error) {
        // Tools already executed (e.g. a transaction was created) — don't lose
        // the action by failing. Synthesize a minimal confirmation instead.
        this.logger.error(`LLM follow-up failed after tool execution: ${this.describe(error)}`);
        finalText = finalText || this.fallbackSummary(actions);
      }
    }

    const assistant = await this.prisma.conversationMessage.create({
      data: { conversationId, role: 'ASSISTANT', content: finalText },
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
      await this.pruneActiveWindow(conversationId);
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
  ): Promise<ToolExecResult> {
    switch (call.name) {
      case 'log_expense':
        return this.execLog(workspace, userId, 'EXPENSE', call.input);
      case 'log_income':
        return this.execLog(workspace, userId, 'INCOME', call.input);
      case 'log_transfer':
        return this.execTransfer(workspace, userId, call.input);
      case 'get_fx_rate':
        return this.execFxRate(call.input);
      default:
        return { toolResult: JSON.stringify({ error: `Unknown tool: ${call.name}` }) };
    }
  }

  private async execLog(
    workspace: WorkspaceContext,
    userId: string,
    type: 'EXPENSE' | 'INCOME',
    input: Record<string, unknown>,
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
      const tx = await this.transactions.create({
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
      const tx = await this.transactions.create({
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
      data: { conversationId, role: 'ASSISTANT', content: LLM_UNAVAILABLE_MESSAGE },
    });
    const messageCount = await this.prisma.conversationMessage.count({ where: { conversationId } });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { messageCount, title: existingTitle ?? userContent.slice(0, 50), updatedAt: new Date() },
    });
  }

  private async buildSystemPrompt(
    workspace: WorkspaceContext,
    user: { displayName: string; timezone: string } | null,
  ): Promise<string> {
    const accounts = await this.accounts.list(workspace.id);
    const categories = await this.categories.list(workspace.id);
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
      today: today(),
    });
  }

  private async pruneActiveWindow(conversationId: string): Promise<void> {
    const stale = await this.prisma.conversationMessage.findMany({
      where: { conversationId, isInActiveWindow: true },
      orderBy: { createdAt: 'desc' },
      skip: FREE_ACTIVE_WINDOW,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.conversationMessage.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { isInActiveWindow: false },
      });
    }
  }
}
