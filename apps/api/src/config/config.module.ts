import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * Global config module. Loads the repo-root .env (relative to the API cwd)
 * and validates it through the Zod schema. ConfigService<Env, true> is then
 * injectable everywhere with full type inference.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
