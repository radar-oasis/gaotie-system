import { AssetGraphService } from './asset-graph.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireUserFromRequest } from '../auth/auth.controller';
import { AssetsService, type FavoriteInput } from './assets.service';
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly service: AssetsService,
    private readonly auth: AuthService,
    private readonly graphService: AssetGraphService,
  ) {}
  @Get()
  async list(@Req() req: Request) {
    return this.service.list((await requireUserFromRequest(this.auth, req)).id);
  }
  @Post('favorites')
  async favorite(@Req() req: Request, @Body() body: FavoriteInput) {
    return this.service.favorite(
      (await requireUserFromRequest(this.auth, req)).id,
      body,
    );
  }
  @Get('graph')
  async graph(@Req() req: Request, @Query('query') query?: string, @Query('projectId') projectId?: string, @Query('hops') hops?: string) {
    return this.graphService.graph((await requireUserFromRequest(this.auth, req)).id, { query, projectId, hops: hops === undefined ? undefined : Number(hops) });
  }
  @Post('graph/chat')
  async chat(@Req() req: Request, @Body() body: { message: string; projectId?: string; history?: { role: 'user' | 'assistant'; content: string }[] }, @Res({ passthrough: true }) res: Response) {
    const user = await requireUserFromRequest(this.auth, req);
    const abort = new AbortController();
    const disconnect = () => { if (!res.writableEnded) abort.abort(); };
    req.once('aborted', disconnect); res.once('close', disconnect);
    if (req.aborted || res.destroyed) abort.abort();
    try { return await this.graphService.chat(user.id, body, abort.signal); }
    finally { req.off('aborted', disconnect); res.off('close', disconnect); }
  }
  @Get('references/:id/image')
  async reference(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const image = await this.service.referenceImage((await requireUserFromRequest(this.auth, req)).id, id);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(image);
  }
  @Get(':id/image')
  async image(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const image = await this.service.image(
      (await requireUserFromRequest(this.auth, req)).id,
      id,
    );
    res
      .set({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image);
  }
  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    return this.service.get(
      (await requireUserFromRequest(this.auth, req)).id,
      id,
    );
  }
  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(
      (await requireUserFromRequest(this.auth, req)).id,
      id,
    );
  }
}
