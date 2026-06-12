import {
  ForbiddenException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SubscriptionTier } from '@finby/shared';
import { ReceiptsService } from './receipts.service';
import type { LlmService } from '../llm/llm.service';
import type { RedisService } from '../../redis/redis.service';
import type { LlmCreateParams, LlmResponse } from '../llm/llm.types';
import type { WorkspaceContext } from '../../common/context';

const VALID_RECEIPT = {
  merchant: 'Walmart',
  total: 42.5,
  currency: 'USD',
  date: '2026-06-10',
  category: 'Groceries',
  lineItems: [{ name: 'Milk', amount: 4.5 }],
  confidence: 0.92,
  isMixedCategories: false,
  notes: '123 Main St',
};

function llmResponse(payload: unknown): LlmResponse {
  return {
    stopReason: 'end_turn',
    content: [],
    textOutput: typeof payload === 'string' ? payload : JSON.stringify(payload),
    toolCalls: [],
  };
}

function workspace(tier: SubscriptionTier = 'PRO'): WorkspaceContext {
  return { id: 'ws-1', name: 'Test WS', slug: 'test-ws', tier, baseCurrency: 'USD' };
}

const IMAGE = { buffer: Buffer.from('fake-image-bytes'), mimetype: 'image/jpeg' };

describe('ReceiptsService', () => {
  let createMessage: jest.Mock;
  let incr: jest.Mock;
  let expire: jest.Mock;
  let service: ReceiptsService;

  beforeEach(() => {
    createMessage = jest.fn().mockResolvedValue(llmResponse(VALID_RECEIPT));
    incr = jest.fn().mockResolvedValue(1);
    expire = jest.fn().mockResolvedValue(1);
    const llm = { createMessage } as unknown as LlmService;
    const redis = { client: { incr, expire } } as unknown as RedisService;
    service = new ReceiptsService(llm, redis);
  });

  it('returns a structured extraction for a valid receipt image', async () => {
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result).toMatchObject({
      merchant: 'Walmart',
      total: 42.5,
      currency: 'USD',
      date: '2026-06-10',
      category: 'Groceries',
      lineItems: [{ name: 'Milk', amount: 4.5 }],
      confidence: 0.92,
      isMixedCategories: false,
      showLineItems: false,
      notes: '123 Main St',
    });
    expect(result.lowConfidence).toBeUndefined();
  });

  it('always extracts with claude-sonnet-4-6 and sends the image as a vision block', async () => {
    await service.extractFromImage(workspace(), 'user-1', IMAGE);
    const params = createMessage.mock.calls[0][0] as LlmCreateParams;
    expect(params.model).toBe('claude-sonnet-4-6');
    const content = params.messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({
      type: 'image',
      source: {
        base64: IMAGE.buffer.toString('base64'),
        mediaType: 'image/jpeg',
      },
    });
  });

  it('sets showLineItems when total > 100', async () => {
    createMessage.mockResolvedValue(llmResponse({ ...VALID_RECEIPT, total: 150 }));
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result.showLineItems).toBe(true);
  });

  it('sets showLineItems when categories are mixed', async () => {
    createMessage.mockResolvedValue(llmResponse({ ...VALID_RECEIPT, isMixedCategories: true }));
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result.showLineItems).toBe(true);
  });

  it('hides line items for a small single-category receipt', async () => {
    createMessage.mockResolvedValue(
      llmResponse({ ...VALID_RECEIPT, total: 100, isMixedCategories: false }),
    );
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result.showLineItems).toBe(false);
  });

  it('throws 422 when the model reports the image is not a receipt', async () => {
    createMessage.mockResolvedValue(llmResponse({ error: 'not_a_receipt' }));
    const err = (await service
      .extractFromImage(workspace(), 'user-1', IMAGE)
      .catch((e: unknown) => e)) as UnprocessableEntityException;
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.message).toBe('This image does not appear to be a receipt');
  });

  it('throws 422 when the model response is not parseable JSON', async () => {
    createMessage.mockResolvedValue(llmResponse('sorry, I cannot read that image'));
    const err = (await service
      .extractFromImage(workspace(), 'user-1', IMAGE)
      .catch((e: unknown) => e)) as UnprocessableEntityException;
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(err.message).toBe('Could not read receipt — please try a clearer photo');
  });

  it('throws 422 when the JSON is missing required fields', async () => {
    createMessage.mockResolvedValue(llmResponse({ total: 12 }));
    await expect(service.extractFromImage(workspace(), 'user-1', IMAGE)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('still parses a response wrapped in markdown fences', async () => {
    createMessage.mockResolvedValue(
      llmResponse('```json\n' + JSON.stringify(VALID_RECEIPT) + '\n```'),
    );
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result.merchant).toBe('Walmart');
  });

  it('flags low confidence extractions instead of rejecting them', async () => {
    createMessage.mockResolvedValue(llmResponse({ ...VALID_RECEIPT, confidence: 0.4 }));
    const result = await service.extractFromImage(workspace(), 'user-1', IMAGE);
    expect(result.lowConfidence).toBe(true);
    expect(result.total).toBe(42.5);
  });

  it('rejects FREE tier with 403 and an upgrade flag, without calling the LLM', async () => {
    const err = (await service
      .extractFromImage(workspace('FREE'), 'user-1', IMAGE)
      .catch((e: unknown) => e)) as ForbiddenException;
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      message: 'Receipt scanning requires a Pro plan or above',
      details: { upgradeRequired: true },
    });
    expect(createMessage).not.toHaveBeenCalled();
    expect(incr).not.toHaveBeenCalled();
  });

  describe('rate limiting', () => {
    it('rejects the 21st scan of the day for a PRO user with 429', async () => {
      incr.mockResolvedValue(21);
      const err = (await service
        .extractFromImage(workspace('PRO'), 'user-1', IMAGE)
        .catch((e: unknown) => e)) as HttpException;
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.getResponse()).toMatchObject({ details: { limitReached: true } });
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('allows the 21st scan for PREMIUM (limit 50) and rejects the 51st', async () => {
      incr.mockResolvedValue(21);
      await expect(
        service.extractFromImage(workspace('PREMIUM'), 'user-1', IMAGE),
      ).resolves.toBeDefined();

      incr.mockResolvedValue(51);
      await expect(
        service.extractFromImage(workspace('FAMILY'), 'user-1', IMAGE),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('keys the counter by user and UTC day so a new day starts fresh', async () => {
      await service.extractFromImage(workspace(), 'user-1', IMAGE);
      const today = new Date().toISOString().slice(0, 10);
      expect(incr).toHaveBeenCalledWith(`receipt:scan:user-1:${today}`);
      // First scan of the day sets the 24h expiry on the fresh key.
      expect(expire).toHaveBeenCalledWith(`receipt:scan:user-1:${today}`, 24 * 60 * 60);
    });

    it('does not reset the TTL on subsequent scans of the same day', async () => {
      incr.mockResolvedValue(2);
      await service.extractFromImage(workspace(), 'user-1', IMAGE);
      expect(expire).not.toHaveBeenCalled();
    });
  });
});
