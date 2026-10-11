import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireUserFromRequest } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { PromptEnhancerService } from './prompt-enhancer.service';

@Controller('super-canvas')
export class PromptEnhancerController {
  constructor(
    private readonly enhancer: PromptEnhancerService,
    private readonly auth: AuthService,
  ) {}

  @Post('enhance-prompt')
  async enhance(@Req() request: Request, @Body() body: unknown) {
    await requireUserFromRequest(this.auth, request);
    return this.enhancer.enhance(body);
  }
}
