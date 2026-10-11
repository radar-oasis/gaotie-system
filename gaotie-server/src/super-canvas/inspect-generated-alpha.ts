import sharp from 'sharp';
import type { TransparentizeResult } from './transparentize';

/** Inspect only. Never rewrite pixels or infer a background color. */
export async function inspectGeneratedAlpha(buffer: Buffer): Promise<TransparentizeResult> {
  const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) transparent++;
    if (data[i] > 0) visible++;
  }
  if (!visible) throw new Error('模型返回了全透明图片，请重新生成；本次未进行背景移除');
  const ratio = transparent / (info.width * info.height);
  return { buffer, confidence: ratio > 0 ? 'high' : 'low', transparentPixelRatio: ratio };
}
