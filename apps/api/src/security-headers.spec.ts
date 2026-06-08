import helmet from 'helmet';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from './app.controller';

/**
 * Verifies helmet security headers are applied. Mirrors the exact helmet config
 * used in main.ts (CSP disabled for a pure JSON API) and asserts the headers on
 * the public health route.
 */
describe('Security headers (helmet)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(helmet({ contentSecurityPolicy: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets x-content-type-options: nosniff', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets x-frame-options', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('does not set a Content-Security-Policy (disabled for JSON API)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});
