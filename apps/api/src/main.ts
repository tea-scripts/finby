import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the raw request bytes for webhook signature verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');
  // Allow the web app's browser origin to call the API (tokens travel in the
  // Authorization header, not cookies, but credentials are enabled for safety).
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  // Hosts (Render, Railway, Fly…) inject PORT; fall back to API_PORT then 3001.
  const port = process.env.PORT ?? process.env.API_PORT ?? 3001;
  await app.listen(port);
}

void bootstrap();
