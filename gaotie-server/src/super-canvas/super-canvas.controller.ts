import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Post,
  Req,
  Res,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireLocalImageAccess } from '../auth/local-image-access';
import { withGenerationCancellation } from '../image-reference/generation-cancellation';
import {
  GenerateTransparentAssetInput,
  GenerateTransparentAssetResult,
  LOCAL_REFERENCE_PUBLIC_BASE_ERROR,
  SuperCanvasService,
} from './super-canvas.service';

interface GenerateSuperCanvasRequest {
  prompt?: string;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
}

@Controller('super-canvas')
export class SuperCanvasController {
  constructor(private readonly superCanvasService: SuperCanvasService, @Optional() private readonly auth?: AuthService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateSuperCanvasRequest = {},
    @Req() request?: Request,
    @Res({ passthrough: true }) response?: Response,
  ): Promise<GenerateTransparentAssetResult | void> {
    await requireLocalImageAccess(this.auth, request);
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('request body must be an object');
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      throw new BadRequestException('prompt must be a non-empty string');
    }

    const input: GenerateTransparentAssetInput = { prompt };
    const hasReferenceImageUrl = Object.prototype.hasOwnProperty.call(
      body,
      'referenceImageUrl',
    );

    if (
      hasReferenceImageUrl &&
      body.referenceImageUrl !== undefined &&
      typeof body.referenceImageUrl !== 'string'
    ) {
      throw new BadRequestException('referenceImageUrl must be a string');
    }

    const referenceImageUrl = body.referenceImageUrl?.trim() ?? '';

    if (referenceImageUrl) {
      if (!isAllowedReferenceImageUrl(referenceImageUrl)) {
        throw new BadRequestException(
          'referenceImageUrl must be an http, https, or supported data image URL',
        );
      }

      input.referenceImageUrl = referenceImageUrl;
    }

    const referenceImageUrls = parseReferenceImageUrls(body.referenceImageUrls);

    if (referenceImageUrls.length > 0) {
      input.referenceImageUrls = referenceImageUrls;
    }

    const stream = response && request?.headers.accept?.split(',').some(
      value => value.trim().split(';')[0] === 'application/x-ndjson',
    ) ? response : undefined;
    if (stream) {
      const startedAt = Date.now();
      let lastStage = 'preparing';
      const stages: {stage:string;elapsedMs:number}[] = [];
      stream.status(200);
      stream.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      stream.setHeader('Cache-Control', 'no-cache, no-transform');
      stream.setHeader('X-Accel-Buffering', 'no');
      stream.flushHeaders();
      const emit = (event: unknown) => {
        if (!stream.destroyed && !stream.writableEnded) stream.write(JSON.stringify(event) + '\n');
      };
      try {
        const result = await withGenerationCancellation(request, options =>
          this.superCanvasService.generateTransparentAsset(input, {
            ...options,
            onProgress: stage => { lastStage = stage; stages.push({stage,elapsedMs:Date.now()-startedAt}); emit({ type: 'progress', stage }); },
          }),
        );
        emit({ type: 'result', result });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const category = message === 'Codex 生图请求超时（240 秒），未自动重试' ? 'dispatch_timeout'
          : message === '图片生成阶段超时（240 秒），未自动重试' ? 'image_timeout'
          : message === '生图已取消' ? 'cancelled' : 'upstream_or_processing';
        console.warn('[canvas-generation-failed]', {category,stage:lastStage,elapsedMs:Date.now()-startedAt,stages});
        // Upstream errors can contain credentials or private provider details.
        emit({ type: 'error', message: category === 'dispatch_timeout' ? '生图服务响应超时，尚未开始生成图片，请重试'
          : category === 'image_timeout' ? '图片生成超时，请重试' : '图片生成失败，请稍后重试' });
      } finally {
        if (!stream.destroyed && !stream.writableEnded) stream.end();
      }
      return;
    }

    try {
      return await withGenerationCancellation(request, options => options
        ? this.superCanvasService.generateTransparentAsset(input, options)
        : this.superCanvasService.generateTransparentAsset(input));
    } catch (error) {
      throw mapGenerationError(error);
    }
  }
}

function parseReferenceImageUrls(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException('referenceImageUrls must be an array');
  }

  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new BadRequestException(
          'referenceImageUrls entries must be strings',
        );
      }

      return item.trim();
    })
    .filter((item) => {
      if (!item) {
        return false;
      }

      if (!isAllowedReferenceImageUrl(item)) {
        throw new BadRequestException(
          'referenceImageUrls entries must be http, https, or supported data image URLs',
        );
      }

      return true;
    });
}

function mapGenerationError(error: unknown): Error {
  if (error instanceof HttpException) {
    return error;
  }

  if (!(error instanceof Error)) {
    return new BadGatewayException('生成服务返回了未知错误');
  }

  if (error.message.startsWith('Missing Jimeng credentials')) {
    return new ServiceUnavailableException(error.message);
  }

  if (
    error.message === LOCAL_REFERENCE_PUBLIC_BASE_ERROR ||
    error.message === 'Reference image URL host is not allowed' ||
    error.message === 'Reference image URL must be http or https' ||
    error.message === 'Malformed data image reference' ||
    error.message.startsWith('Reference image ')
  ) {
    return new BadRequestException(error.message);
  }

  return new BadGatewayException(error.message);
}

function isAllowedReferenceImageUrl(value: string): boolean {
  return isHttpUrl(value) || isSupportedDataImageUrl(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSupportedDataImageUrl(value: string): boolean {
  const match =
    /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
      value,
    );

  if (!match?.[1]) {
    return false;
  }

  return match[1].length % 4 !== 1;
}
