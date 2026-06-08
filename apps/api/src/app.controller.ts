import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/public.decorator';

@Controller('health')
export class AppController {
  // Health checks (Render polls this continuously) must never be rate limited.
  @SkipThrottle()
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
