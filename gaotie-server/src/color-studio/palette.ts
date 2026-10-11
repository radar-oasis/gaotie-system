import sharp from 'sharp';
import { getPalette } from 'colorthief';
import { BadRequestException } from '@nestjs/common';
import { MAX_BYTES } from './images';
export async function validateImage(buffer: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES)
    throw new BadRequestException('图片为空或超过 10 MB');
  try {
    const image = sharp(buffer, {
      limitInputPixels: 40_000_000,
      animated: false,
      failOn: 'error',
    });
    const meta = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
      !meta.width ||
      !meta.height ||
      (meta.pages ?? 1) > 1 ||
      meta.width * meta.height > 40_000_000
    )
      throw new Error();
    const result = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    if (result.length > MAX_BYTES) throw new Error();
    return result;
  } catch {
    throw new BadRequestException(
      '请使用有效的 PNG、JPEG 或 WebP 图片（最多 4000 万像素）',
    );
  }
}
export async function extractColors(buffers: Buffer[]): Promise<string[]> {
  if (!buffers.length || buffers.length > 6)
    throw new BadRequestException('请选择 1 至 6 张图片');
  const sets: string[][] = [];
  for (const buffer of buffers) {
    const normalized = await validateImage(buffer);
    const small = await sharp(normalized)
      .resize({
        width: 256,
        height: 256,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const { data, info } = await sharp(small)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!data.some((value, index) => index % 4 === 3 && value >= 128))
      throw new BadRequestException('图片完全透明，没有可提取的颜色');
    const palette = await getPalette(small, {
      colorCount: 8,
      quality: 1,
      colorSpace: 'oklch',
      ignoreWhite: false,
      alphaThreshold: 128,
      loader: {
        async load() {
          return {
            data: new Uint8ClampedArray(data),
            width: info.width,
            height: info.height,
            colorSpace: 'srgb' as const,
          };
        },
      },
    });
    const colors = (palette ?? []).map((c) => c.hex().toUpperCase());
    // Keep neutral areas, including exact whites, that quantization may round away.
    const neutrals = new Map<string, number>();
    let visiblePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 128) continue;
      visiblePixels++;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 12) {
        const avg = (r + g + b) / 3;
        const v = avg >= 245 ? 255 : avg <= 10 ? 0 : Math.round(avg / 16) * 16;
        const h =
          '#' +
          Math.min(255, v)
            .toString(16)
            .padStart(2, '0')
            .repeat(3)
            .toUpperCase();
        neutrals.set(h, (neutrals.get(h) ?? 0) + 1);
      }
    }
    const preserved = [...neutrals]
      .filter(([, n]) => n / Math.max(1, visiblePixels) >= 0.08)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([h]) => h);
    sets.push([...new Set([...preserved, ...colors])].slice(0, 8));
  }
  // Round-robin gives every image equal candidate opportunity, independent of pixel count.
  const result: string[] = [];
  for (let rank = 0; rank < 8; rank++)
    for (const set of sets) {
      const color = set[rank];
      if (color && !result.includes(color)) result.push(color);
    }
  if (!result.length) throw new BadRequestException('图片中没有可提取的颜色');
  return result;
}
