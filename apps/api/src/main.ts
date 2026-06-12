import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the raw request bytes for webhook signature verification.
  // bufferLogs: true holds logs until the pino logger is attached below.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  // Security headers — registered first, before raw-body handling and CORS.
  // CSP is disabled: this is a pure JSON API that serves no HTML, and helmet's
  // default CSP can interfere with non-HTML responses. The remaining helmet
  // defaults (HSTS, X-Frame-Options, X-Content-Type-Options, etc.) all apply.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  // Allow the web app's browser origin to call the API (tokens travel in the
  // Authorization header, not cookies, but credentials are enabled for safety).
  app.enableCors({
    origin: [
      process.env.WEB_URL ?? 'http://localhost:3000',
      process.env.ADMIN_WEB_URL ?? 'http://localhost:3002',
    ],
    credentials: true,
  });
  // Hosts (Render, Railway, Fly…) inject PORT; fall back to API_PORT then 3001.
  const port = process.env.PORT ?? process.env.API_PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
