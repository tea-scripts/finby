import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { validateEnv } from './env.schema';

/**
 * Load the repo-root .env with `override: true` BEFORE Nest reads the
 * environment, so the project's .env is authoritative in local dev — even when
 * a stale variable is exported in the shell (e.g. ANTHROPIC_API_KEY in
 * ~/.bashrc), which dotenv would otherwise refuse to overwrite.
 *
 * In production (Render) there is no .env file, so this is a no-op and the
 * platform-provided environment variables are used as-is.
 */
dotenv.config({ path: resolve(process.cwd(), '../../.env'), override: true });

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true, // already loaded above (with override)
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
