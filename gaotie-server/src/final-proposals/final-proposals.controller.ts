import { AssetsService, assetImageId, referenceImageId, type ProposalAssetInput } from '../assets/assets.service';
import { requireUserFromRequest } from '../auth/auth.controller';
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Req,
  Query,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireLocalImageAccess } from '../auth/local-image-access';
import { withGenerationCancellation } from '../image-reference/generation-cancellation';
import { FinalProposalsService } from './final-proposals.service';
import type {
  GenerateFinalProposalInput,
  GeneratedProposalResponse,
  IterateFinalProposalInput,
} from './final-proposals.types';

@Controller('final-proposals')
export class FinalProposalsController {
  constructor(private readonly service: FinalProposalsService, @Optional() private readonly auth?: AuthService, @Optional() private readonly assets?: AssetsService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateFinalProposalInput,
    @Req() request?: Request,
  ): Promise<GeneratedProposalResponse> {
    assertBodyObject(body);
    await requireLocalImageAccess(this.auth, request);

    try {
      body = await this.resolveSavedReferences(body, request);
      return await withGenerationCancellation(request, options => options
        ? this.service.generate(body, options)
        : this.service.generate(body));
    } catch (error) {
      throw mapUnknownGenerationError(error);
    }
  }

  @Post('iterate')
  async iterate(
    @Body() body: IterateFinalProposalInput,
    @Req() request?: Request,
  ): Promise<GeneratedProposalResponse> {
    assertBodyObject(body);
    await requireLocalImageAccess(this.auth, request);

    try {
      body = await this.resolveSavedReferences(body, request);
      if (this.assets && (assetImageId(body.baseImageUrl) || referenceImageId(body.baseImageUrl))) {
        const user = await requireUserFromRequest(this.auth!, request!);
        const image = await this.assets.readImage(user.id, body.baseImageUrl);
        body = {...body, baseImageUrl: `data:image/png;base64,${image.toString('base64')}`};
      }
      return await withGenerationCancellation(request, options => options
        ? this.service.iterate(body, options)
        : this.service.iterate(body));
    } catch (error) {
      throw mapUnknownGenerationError(error);
    }
  }

  private async resolveSavedReferences<T extends GenerateFinalProposalInput | IterateFinalProposalInput>(body: T, request?: Request): Promise<T> {
    const selected = body.selectedReferenceImageUrls ?? body.designPackage?.selectedReferenceImageUrls ?? [];
    if (!Array.isArray(selected) || selected.length > 12) throw new BadRequestException('参考图最多 12 张');
    const privateUrls = selected.filter(url => assetImageId(url) || referenceImageId(url));
    if (!privateUrls.length || !this.assets) return body;
    const user = await requireUserFromRequest(this.auth!, request!);
    const urls = new Map<string, string>();
    for (const url of privateUrls) {
      const image = await this.assets.readImage(user.id, url);
      urls.set(url, `data:image/png;base64,${image.toString('base64')}`);
    }
    const replaced = selected.map(url => urls.get(url) || url);
    return { ...body, selectedReferenceImageUrls: replaced, designPackage: {
      ...body.designPackage, selectedReferenceImageUrls: replaced,
      canvasAssets: body.designPackage?.canvasAssets?.map(asset => ({ ...asset, imageUrl: urls.get(asset.imageUrl) || asset.imageUrl })),
    }};
  }

  @Post('archive')
  async archive(@Body() body: ProposalAssetInput, @Req() request: Request) {
    assertBodyObject(body);
    return this.assets!.archive((await requireUserFromRequest(this.auth!, request)).id, body);
  }

  @Get()
  async list(@Req() request: Request, @Query() query: { projectId?: unknown; scope?: unknown } = {}) {
    const user = await requireUserFromRequest(this.auth!, request);
    if (query.scope === 'all' && query.projectId === undefined) {
      return this.assets!.listProposals(user.id);
    }
    if (query.scope !== undefined || typeof query.projectId !== 'string' || !query.projectId.trim()) {
      throw new BadRequestException('请选择项目或明确选择全部项目');
    }
    return this.assets!.listProposals(user.id, query.projectId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: Request) {
    return this.assets!.getProposal((await requireUserFromRequest(this.auth!, request)).id, id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: Request) {
    const user = await requireUserFromRequest(this.auth!, request);
    await this.assets!.getProposal(user.id, id);
    return this.assets!.remove(user.id, id);
  }

}

function assertBodyObject(
  body: unknown,
): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('request body must be an object');
  }
}

function mapUnknownGenerationError(error: unknown): Error {
  if (error instanceof HttpException) {
    return error;
  }

  if (error instanceof Error) {
    return new BadGatewayException(error.message);
  }

  return new BadGatewayException('生成服务返回了未知错误');
}
