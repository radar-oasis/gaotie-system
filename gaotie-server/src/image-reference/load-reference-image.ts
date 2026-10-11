import { BadRequestException } from '@nestjs/common';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const invalid = () =>
  new BadRequestException('参考图片无效，请重新上传 PNG、JPEG 或 WebP 图片。');

/** No network access: only uploaded bytes or explicitly mapped application assets. */
export async function loadReferenceImage(value: string, options: { preserveResolution?: boolean } = {}): Promise<Buffer> {
  try {
    if (typeof value !== 'string' || !value.trim()) throw invalid();
    const input = value.trim();
    const bytes = input.startsWith('data:')
      ? decodeDataUrl(input)
      : await readLocalAsset(input);
    if (bytes.length > MAX_BYTES)
      throw new BadRequestException('参考图片不能超过 20 MB。');
    const image = sharp(bytes, {
      limitInputPixels: MAX_PIXELS,
      failOn: 'error',
    });
    const metadata = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(metadata.format || '') ||
      (metadata.pages || 1) > 1
    )
      throw invalid();
    const oriented = image.rotate();
    if (options.preserveResolution) return await oriented.png().toBuffer();
    return await oriented
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      '参考图片读取失败、损坏或像素过大，请重新上传（最多 4000 万像素）。',
    );
  }
}

function decodeDataUrl(input: string): Buffer {
  if (input.length > Math.ceil(MAX_BYTES / 3) * 4 + 64)
    throw new BadRequestException('参考图片不能超过 20 MB。');
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match || match[2].length % 4 !== 0) throw invalid();
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64') !== match[2]) throw invalid();
  return bytes;
}

function configuredOrigins(): string[] {
  return [
    process.env.PUBLIC_ASSET_BASE_URL,
    process.env.SUPER_CANVAS_PUBLIC_BASE_URL,
  ].flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        (url.pathname === '/' || url.pathname === '')
        ? [url.origin]
        : [];
    } catch {
      return [];
    }
  });
}

function assetPath(input: string): string {
  // Check the raw path before URL normalizes away traversal segments.
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    throw invalid();
  }
  if (
    /[\\\u0000-\u001f\u007f?#%]/.test(decoded) ||
    decoded.split('/').some((segment) => segment === '.' || segment === '..') ||
    input.startsWith('//')
  )
    throw invalid();
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash) throw invalid();
    const local =
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.port === (process.env.PORT || '3000');
    if (!local && !configuredOrigins().includes(url.origin)) {
      throw new BadRequestException(
        '此参考图片不是本系统本地素材，请先上传到本系统后再生成。',
      );
    }
    decoded = decodeURIComponent(url.pathname);
  }
  if (decoded.startsWith('样本图片/'))
    return '/sample-images/' + decoded.slice('样本图片/'.length);
  if (decoded.startsWith('/样本图片/'))
    return '/sample-images/' + decoded.slice('/样本图片/'.length);
  return decoded.startsWith('/') ? decoded : '/images/' + decoded;
}

async function readLocalAsset(input: string): Promise<Buffer> {
  const pathname = assetPath(input);
  const roots: [string, string][] = [
    ['/generated/layout3d/', path.resolve(process.cwd(), 'generated/layout3d')],
    ['/layout-elements/', path.resolve(process.cwd(), '../布局元素')],
    ['/sample-images/', path.resolve(process.cwd(), '../样本图片')],
    ['/images/', path.resolve(process.cwd(), '../images')],
    [
      '/generated/super-canvas/',
      path.resolve(process.cwd(), 'generated/super-canvas'),
    ],
    [
      '/generated/final-proposals/',
      path.resolve(process.cwd(), 'generated/final-proposals'),
    ],
  ];
  const mapping = roots.find(([prefix]) => pathname.startsWith(prefix));
  if (!mapping) throw invalid();
  const [prefix, root] = mapping;
  const rootReal = await realpath(root);
  const candidate = await realpath(
    path.resolve(root, pathname.slice(prefix.length)),
  );
  const relative = path.relative(rootReal, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw invalid();
  // Open the resolved path without following a replacement final symlink, and bound reads.
  const file = await open(
    candidate,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw invalid();
    if (stat.size > MAX_BYTES)
      throw new BadRequestException('参考图片不能超过 20 MB。');
    const result = Buffer.alloc(Math.min(stat.size + 1, MAX_BYTES + 1));
    let total = 0;
    while (total < result.length) {
      const { bytesRead } = await file.read(
        result,
        total,
        result.length - total,
        total,
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > stat.size || total > MAX_BYTES) throw invalid();
    return result.subarray(0, total);
  } finally {
    await file.close();
  }
}
