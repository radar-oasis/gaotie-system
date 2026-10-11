import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuthService } from '../auth/auth.service';
import { requireUserFromRequest } from '../auth/auth.controller';
import { validateChat } from './contract';
import { runCodexChat } from './codex-chat';
import { downloadImage, MAX_BYTES } from './images';
import { extractColors, validateImage } from './palette';
const uploadRoot = join(process.cwd(), 'generated', 'color-studio');
let imageJobs = 0;
export async function requireStudioAccess(
  auth: AuthService,
  req: Request,
): Promise<void> {
  const hosts = ['localhost', '127.0.0.1', '[::1]'];
  if (
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
      req.socket?.remoteAddress ?? '',
    )
  )
    throw new ForbiddenException('配色工作室仅允许本机访问');
  try {
    if (!hosts.includes(new URL(`http://${req.headers.host}`).hostname))
      throw new Error();
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (
        origin.protocol !== 'http:' ||
        !hosts.includes(origin.hostname) ||
        !['5173', process.env.PORT || '3000'].includes(origin.port)
      )
        throw new Error();
    }
  } catch {
    throw new ForbiddenException('配色工作室仅允许从本地系统页面调用');
  }
  await requireUserFromRequest(auth, req);
}
export function localUploadName(path: string): string | null {
  return (
    /^\/color-studio\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png)$/.exec(
      path,
    )?.[1] ?? null
  );
}
async function imageJob<T>(work: () => Promise<T>): Promise<T> {
  if (imageJobs >= 2)
    throw new HttpException('正在处理其他图片，请稍后重试', 429);
  imageJobs++;
  try {
    return await work();
  } finally {
    imageJobs--;
  }
}
@Controller('color-studio')
export class ColorStudioController {
  constructor(private readonly auth: AuthService) {}
  @Post('chat')
  @HttpCode(200)
  async chat(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await requireStudioAccess(this.auth, req);
    const abort = new AbortController();
    const disconnect = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    if (req.aborted || res.destroyed) abort.abort();
    try {
      return await runCodexChat(validateChat(body), abort.signal);
    } finally {
      req.off('aborted', disconnect);
      res.off('close', disconnect);
    }
  }
  @Post('extract')
  @HttpCode(200)
  async extract(@Body() body: any, @Req() req: Request) {
    await requireStudioAccess(this.auth, req);
    if (
      !body ||
      !Array.isArray(body.imageUrls) ||
      body.imageUrls.length < 1 ||
      body.imageUrls.length > 6 ||
      body.imageUrls.some((x) => typeof x !== 'string' || x.length > 2048)
    )
      throw new BadRequestException('请选择 1 至 6 张图片');
    return imageJob(async () => {
      const buffers: Buffer[] = [];
      const failedImageUrls: string[] = [];
      for (const url of [...new Set<string>(body.imageUrls)]) {
        try {
          const name = localUploadName(url);
          const buffer = name ? await readFile(join(uploadRoot, name)) : await downloadImage(url);
          await extractColors([buffer]);
          buffers.push(buffer);
        } catch {
          failedImageUrls.push(url);
        }
      }
      if (!buffers.length) throw new BadRequestException('所有图片均无法提色，请重新选择图片或上传本地参考图');
      return { colors: await extractColors(buffers), successfulImages: buffers.length, failedImageUrls };
    });
  }
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  async upload(
    @UploadedFile()
    file:
      | { buffer: Buffer; mimetype: string; originalname?: string }
      | undefined,
    @Req() req: Request,
  ) {
    await requireStudioAccess(this.auth, req);
    if (
      !file ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
    )
      throw new BadRequestException('请上传 PNG、JPEG 或 WebP 图片');
    return imageJob(async () => {
      const image = await validateImage(file.buffer);
      const colors = await extractColors([image]);
      const id = randomUUID();
      await mkdir(uploadRoot, { recursive: true });
      await writeFile(join(uploadRoot, `${id}.png`), image, {
        flag: 'wx',
        mode: 0o600,
      });
      const imageUrl = `/color-studio/uploads/${id}.png`;
      return {
        image: {
          id,
          title: (file.originalname || '上传图片').slice(0, 150),
          imageUrl,
          sourceUrl: '',
        },
        colors,
      };
    });
  }
  @Get('uploads/:name')
  async uploaded(
    @Param('name') name: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await requireStudioAccess(this.auth, req);
    if (!localUploadName(`/color-studio/uploads/${name}`))
      throw new NotFoundException();
    let bytes: Buffer;
    try {
      bytes = await readFile(join(uploadRoot, name));
    } catch {
      throw new NotFoundException('图片不存在');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type('png').send(bytes);
  }
}
