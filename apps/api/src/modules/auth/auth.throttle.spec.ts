import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Verifies the per-route @Throttle limits on the sensitive auth endpoints.
 * Boots the real AuthController + real ThrottlerGuard with a stubbed AuthService,
 * so the actual decorator metadata (login 10/15min, forgot-password 5/60min) is
 * what's exercised. The global throttler limit is set high here so the per-route
 * overrides are the binding constraint.
 */
describe('Auth route throttling (e2e)', () => {
  let app: INestApplication;

  const authServiceMock = {
    login: jest.fn().mockResolvedValue({ user: { id: 'u1' }, tokens: { accessToken: 'a', refreshToken: 'r' } }),
    forgotPassword: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'global', ttl: 60_000, limit: 100 }],
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login: allows 10 attempts then 429s the 11th', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      const res = await request(server).post('/auth/login').send({ email: 'a@b.co', password: 'password123' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(server).post('/auth/login').send({ email: 'a@b.co', password: 'password123' });
    expect(blocked.status).toBe(429);
    // Standard throttle response surfaced to the client.
    expect(JSON.stringify(blocked.body)).toMatch(/Too Many Requests/i);
  });

  it('POST /auth/forgot-password: allows 5 attempts then 429s the 6th', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      const res = await request(server).post('/auth/forgot-password').send({ email: 'a@b.co' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(server).post('/auth/forgot-password').send({ email: 'a@b.co' });
    expect(blocked.status).toBe(429);
  });
});
