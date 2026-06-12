import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TIER_LIMITS } from '@finby/shared';
import { RedisService } from '../../redis/redis.service';
import { LlmService } from '../llm/llm.service';
import type { LlmImageMediaType, LlmResponse } from '../llm/llm.types';
import type { WorkspaceContext } from '../../common/context';
import { RECEIPT_EXTRACTION_PROMPT } from './receipts.prompt';
import { rawReceiptExtractionSchema, type ReceiptExtraction } from './dto/receipt.dto';

/** Receipt parsing needs accuracy, not speed — always Sonnet, never Haiku. */
const RECEIPT_MODEL = 'claude-sonnet-4-6';
const LOW_CONFIDENCE_THRESHOLD = 0.5;
/** Totals above this get their line items surfaced for review. */
const SHOW_LINE_ITEMS_ABOVE = 100;
const SCAN_COUNTER_TTL_SECONDS = 24 * 60 * 60;

const UNREADABLE_MESSAGE = 'Could not read receipt — please try a clearer photo';

/** The uploaded receipt as held in memory by multer (never written to disk). */
export interface UploadedReceiptImage {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Map an accepted upload MIME type onto the vision API's supported set.
 * HEIC is accepted at the upload boundary (iPhone default format), but the
 * vision API does not support it. In practice iOS browsers transcode camera
 * uploads to JPEG before they reach us; a genuine HEIC payload fails
 * provider-side and surfaces as the standard "try a clearer photo" 422.
 */
function toLlmMediaType(mimetype: string): LlmImageMediaType {
  switch (mimetype) {
    case 'image/png':
      return 'image/png';
    case 'image/webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Extract structured transaction data from a receipt photo.
   * Receipt images are processed in memory only and never persisted to disk
   * or object storage. This is intentional — receipts contain sensitive
   * financial data.
   */
  async extractFromImage(
    workspace: WorkspaceContext,
    userId: string,
    image: UploadedReceiptImage,
  ): Promise<ReceiptExtraction> {
    this.assertTierAllowed(workspace);
    await this.consumeDailyScan(workspace, userId);

    let response: LlmResponse;
    try {
      response = await this.llm.createMessage({
        system: RECEIPT_EXTRACTION_PROMPT,
        model: RECEIPT_MODEL,
        maxTokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  base64: image.buffer.toString('base64'),
                  mediaType: toLlmMediaType(image.mimetype),
                },
              },
              { type: 'text', text: 'Extract the receipt data as JSON.' },
            ],
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Receipt extraction LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "We couldn't read your receipt right now — please try again in a moment.",
      );
    }

    return this.toExtraction(response.textOutput);
  }

  private assertTierAllowed(workspace: WorkspaceContext): void {
    if (!TIER_LIMITS[workspace.tier].receiptScanning) {
      throw new ForbiddenException({
        error: 'TIER_LIMIT',
        message: 'Receipt scanning requires a Pro plan or above',
        details: { upgradeRequired: true },
      });
    }
  }

  /** Daily per-user scan budget — each extraction is an expensive vision call. */
  private async consumeDailyScan(workspace: WorkspaceContext, userId: string): Promise<void> {
    const limit = TIER_LIMITS[workspace.tier].receiptScansPerDay;
    const key = `receipt:scan:${userId}:${todayUtc()}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, SCAN_COUNTER_TTL_SECONDS);
    }
    if (count > limit) {
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: "You've reached your daily receipt scan limit. It resets at midnight.",
          details: { limitReached: true },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private toExtraction(textOutput: string): ReceiptExtraction {
    // The prompt forbids markdown fences, but strip them defensively — a fenced
    // but otherwise valid response shouldn't cost the user a scan.
    const cleaned = textOutput
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new UnprocessableEntityException(UNREADABLE_MESSAGE);
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as Record<string, unknown>).error === 'not_a_receipt'
    ) {
      throw new UnprocessableEntityException('This image does not appear to be a receipt');
    }

    const result = rawReceiptExtractionSchema.safeParse(parsed);
    if (!result.success) {
      throw new UnprocessableEntityException(UNREADABLE_MESSAGE);
    }

    const raw = result.data;
    return {
      merchant: raw.merchant,
      total: raw.total,
      currency: raw.currency,
      date: raw.date ?? todayUtc(),
      category: raw.category,
      lineItems: raw.lineItems,
      confidence: raw.confidence,
      isMixedCategories: raw.isMixedCategories,
      showLineItems: raw.total > SHOW_LINE_ITEMS_ABOVE || raw.isMixedCategories,
      ...(raw.confidence < LOW_CONFIDENCE_THRESHOLD ? { lowConfidence: true } : {}),
      notes: raw.notes,
    };
  }
}
