import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigModule } from './config/config.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChatModule } from './modules/chat/chat.module';
import { ExportModule } from './modules/export/export.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { FxModule } from './modules/fx/fx.module';
import { MarketModule } from './modules/market/market.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { PushModule } from './modules/push/push.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { MembersModule } from './modules/members/members.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Reuse an inbound x-request-id or mint one; echo it on the response so
        // a log line, the response, and any Sentry event share the same id.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers['x-request-id'];
          const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: {
          // pino redact is case-sensitive and path-based; cover the sensitive
          // camelCase domain field names. (The Sentry beforeSend scrubber is the
          // recursive/case-insensitive backstop for anything that slips past.)
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body',
            'res.headers["set-cookie"]',
            '*.amount', '*.amountBase', '*.amountLimit', '*.amountSpent',
            '*.balance', '*.priceBase', '*.merchant', '*.accountNumber',
            '*.email', '*.password', '*.token', '*.refreshToken', '*.secret',
          ],
          censor: '[redacted]',
        },
        // Pretty logs only in local dev; JSON to stdout in prod and tests.
        transport:
          process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      },
    }),
    ConfigModule,
    // Global rate limiting. In-memory store is intentional for a single Render
    // instance; swap in @nestjs/throttler-storage-redis when scaling horizontally.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'global',
            ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    FxModule,
    MarketModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    AlertsModule,
    AnalyticsModule,
    PortfolioModule,
    BillingModule,
    ExportModule,
    PushModule,
    RemindersModule,
    ChatModule,
    SettingsModule,
    MembersModule,
    FeedbackModule,
  ],
  controllers: [AppController],
  providers: [
    // ThrottlerGuard is registered before JwtAuthGuard so rate limiting runs
    // first — abusive callers are rejected before any auth work happens.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
