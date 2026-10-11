import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { validateRemoteUrl } from './images';
export interface ChatInput {
  message: string;
  context: string[];
  history: { role: 'user' | 'assistant'; text: string }[];
  mode: 'chat' | 'search' | 'palette';
  candidateColors?: string[];
}
export interface StudioImage {
  id: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
}
export interface ChatAnswer {
  reply: string;
  images: StudioImage[];
  palette?: {
    name: string;
    colors: { hex: string; role: string; proportion: number }[];
    rationale: string;
  };
}
const hex = /^#[0-9a-f]{6}$/i;
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateChat(v: any): ChatInput {
  if (v && typeof v === 'object' && v.mode === undefined)
    v = { ...v, mode: 'chat' };
  if (
    !v ||
    !text(v.message, 6000) ||
    !['chat', 'search', 'palette'].includes(v.mode) ||
    !Array.isArray(v.context) ||
    v.context.length > 30 ||
    v.context.some((x) => !text(x, 4000)) ||
    !Array.isArray(v.history) ||
    v.history.length > 30 ||
    v.history.some(
      (x) =>
        !x || !['user', 'assistant'].includes(x.role) || !text(x.text, 8000),
    ) ||
    (v.candidateColors !== undefined &&
      (!Array.isArray(v.candidateColors) ||
        !v.candidateColors.length ||
        v.candidateColors.length > 48 ||
        v.candidateColors.some((x) => typeof x !== 'string' || !hex.test(x))))
  )
    throw new BadRequestException('对话参数无效，请检查消息、上下文和候选颜色');
  const input: ChatInput = {
    message: v.message.trim(),
    context: v.context,
    history: v.history.map((x) => ({ role: x.role, text: x.text })),
    mode: v.mode,
    ...(v.candidateColors
      ? {
          candidateColors: [
            ...new Set<string>(v.candidateColors.map((x) => x.toUpperCase())),
          ],
        }
      : {}),
  };
  if (JSON.stringify(input).length > 64000)
    throw new BadRequestException('对话上下文过长');
  return input;
}
export class StudioOutputError extends BadGatewayException {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super(`AI 返回结果暂时无法使用：${reason}，请重试`);
  }
}
export function validateAnswer(v: any, input: ChatInput): ChatAnswer {
  const fail = (field: string, reason: string): never => {
    throw new StudioOutputError(field, reason);
  };
  if (!v || typeof v !== 'object' || Array.isArray(v))
    fail('answer', '回复不是有效对象');
  if (!text(v.reply, 16000)) fail('reply', '缺少有效回复文字');
  // Absence means no reference images, not a failed palette or chat response.
  const rawImages = v.images == null ? [] : v.images;
  if (!Array.isArray(rawImages) || rawImages.length > 6)
    fail('images', '参考图片列表无效或超过 6 张');
  const images: StudioImage[] = rawImages.map((img: any, i: number) => {
    if (
      !img ||
      !text(img.title, 300) ||
      !text(img.imageUrl, 2048) ||
      !text(img.sourceUrl, 2048)
    )
      fail(
        `images[${i}]`,
        `第 ${i + 1} 张参考图片缺少标题、图片地址或来源页面`,
      );
    try {
      validateRemoteUrl(img.imageUrl.trim());
      validateRemoteUrl(img.sourceUrl.trim());
    } catch {
      fail(
        `images[${i}].url`,
        `第 ${i + 1} 张参考图片或来源不是有效公网 HTTPS 地址`,
      );
    }
    // IDs are UI identity only; their absence does not invalidate a real reference.
    return {
      id: text(img.id, 100) ? img.id.trim() : `reference-${i + 1}`,
      title: img.title.trim(),
      imageUrl: img.imageUrl.trim(),
      sourceUrl: img.sourceUrl.trim(),
    };
  });
  if (new Set(images.map((image) => image.id)).size !== images.length)
    images.forEach((image, i) => {
      image.id = `reference-${i + 1}`;
    });
  if (input.mode === 'palette' && !v.palette)
    fail('palette', '本次未生成配色方案');
  let palette: ChatAnswer['palette'];
  if (v.palette != null) {
    const p = v.palette;
    if (!text(p.name, 100)) fail('palette.name', '配色方案缺少名称');
    if (!text(p.rationale, 8000))
      fail('palette.rationale', '配色方案缺少设计说明');
    if (!Array.isArray(p.colors) || p.colors.length < 1 || p.colors.length > 8)
      fail('palette.colors', '配色方案须包含 1 至 8 种颜色');
    const used = new Set<string>();
    const candidates = input.candidateColors?.map((c) => c.toUpperCase());
    const colors: NonNullable<ChatAnswer['palette']>['colors'] = p.colors.map(
      (c: any, i: number) => {
        const field = `palette.colors[${i}]`;
        if (!c || typeof c.hex !== 'string')
          fail(`${field}.hex`, `第 ${i + 1} 个色值无效`);
        let value = c.hex.trim().toUpperCase();
        if (/^#[0-9A-F]{3}$/.test(value))
          value = '#' + [...value.slice(1)].map((x) => x + x).join('');
        if (!hex.test(value))
          fail(`${field}.hex`, `第 ${i + 1} 个色值不是有效十六进制颜色`);
        if (used.has(value)) fail(`${field}.hex`, '配色方案包含重复颜色');
        if (candidates && !candidates.includes(value))
          fail(`${field}.hex`, '配色方案使用了候选色之外的颜色');
        used.add(value);
        if (!text(c.role, 100))
          fail(`${field}.role`, `第 ${i + 1} 种颜色缺少用途说明`);
        const ratio =
          typeof c.proportion === 'string' &&
          /^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(c.proportion)
            ? Number(c.proportion.replace('%', '').trim())
            : c.proportion;
        if (
          typeof ratio !== 'number' ||
          !Number.isFinite(ratio) ||
          ratio <= 0 ||
          ratio > 100
        )
          fail(
            `${field}.proportion`,
            `第 ${i + 1} 种颜色的比例须大于 0 且不超过 100`,
          );
        return { hex: value, role: c.role.trim(), proportion: ratio };
      },
    );
    let total = colors.reduce((sum, c) => sum + c.proportion, 0);
    const hasPercentUnit = p.colors.some(
      (c: any) =>
        typeof c.proportion === 'string' && c.proportion.includes('%'),
    );
    if (
      !hasPercentUnit &&
      colors.every((c) => c.proportion <= 1) &&
      Math.abs(total - 1) < 0.000001
    ) {
      colors.forEach((c) => {
        c.proportion *= 100;
      });
      total = colors.reduce((sum, c) => sum + c.proportion, 0);
    }
    if (Math.abs(total - 100) > 0.05)
      fail('palette.colors.proportion', '配色比例合计不是 100%');
    // Correct only small rounding drift on the dominant color; never rescale an incomplete palette.
    const dominant = colors.reduce((a, b) =>
      a.proportion >= b.proportion ? a : b,
    );
    dominant.proportion = Number(
      (dominant.proportion + 100 - total).toFixed(10),
    );
    palette = { name: p.name.trim(), rationale: p.rationale.trim(), colors };
  }
  return { reply: v.reply.trim(), images, ...(palette ? { palette } : {}) };
}
