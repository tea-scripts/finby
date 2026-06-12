import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import type { AuthenticatedRequest } from '../../common/context';
import type { ReceiptExtraction } from './dto/receipt.dto';

const EXTRACTION: ReceiptExtraction = {
  merchant: 'Walmart',
  total: 42.5,
  currency: 'USD',
  date: '2026-06-10',
  category: 'Groceries',
  lineItems: [],
  confidence: 0.92,
  isMixedCategories: false,
  showLineItems: false,
  notes: null,
};

/** Stands in for JWT auth + membership resolution: attaches a PRO workspace. */
class FakeWorkspaceMemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    req.user = { userId: 'user-1', email: 'pro@example.com' } as AuthenticatedRequest['user'];
    req.workspace = {
      id: 'ws-1',
      name: 'Test WS',
      slug: 'test-ws',
      tier: 'PRO',
      baseCurrency: 'USD',
    };
    req.membership = { id: 'member-1', role: 'OWNER' };
    return true;
  }
}

describe('ReceiptsController', () => {
  let app: INestApplication;
  let extractFromImage: jest.Mock;

  beforeAll(async () => {
    extractFromImage = jest.fn().mockResolvedValue(EXTRACTION);
    const moduleRef = await Test.createTestingModule({
      controllers: [ReceiptsController],
      providers: [{ provide: ReceiptsService, useValue: { extractFromImage } }],
    })
      .overrideGuard(WorkspaceMemberGuard)
      .useValue(new FakeWorkspaceMemberGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    extractFromImage.mockClear();
  });

  it('returns the extraction for a valid image upload from a PRO user', async () => {
    const res = await request(app.getHttpServer())
      .post('/workspaces/ws-1/receipts/extract')
      .attach('image', Buffer.from('fake-jpeg-bytes'), {
        filename: 'receipt.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(res.body).toMatchObject({ merchant: 'Walmart', total: 42.5 });
    expect(extractFromImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-1', tier: 'PRO' }),
      'user-1',
      expect.objectContaining({ mimetype: 'image/jpeg' }),
    );
  });

  it('rejects files over 5MB with 413', async () => {
    await request(app.getHttpServer())
      .post('/workspaces/ws-1/receipts/extract')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'huge.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it('rejects non-image files with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/workspaces/ws-1/receipts/extract')
      .attach('image', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    expect(res.body.message).toBe('Only image files are accepted');
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it('rejects requests with no file attached with 400', async () => {
    await request(app.getHttpServer()).post('/workspaces/ws-1/receipts/extract').expect(400);
    expect(extractFromImage).not.toHaveBeenCalled();
  });

  it('accepts heic uploads (iPhone default format)', async () => {
    await request(app.getHttpServer())
      .post('/workspaces/ws-1/receipts/extract')
      .attach('image', Buffer.from('fake-heic-bytes'), {
        filename: 'receipt.heic',
        contentType: 'image/heic',
      })
      .expect(201);
  });
});
