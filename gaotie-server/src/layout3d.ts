import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export interface Layout3dConfig {
  version: 1;
  model: 'generic-train-v1' | 'reference-train-v2';
  windowBand: { mode: 'none' | 'long' | 'short'; crossDoors: boolean };
  doors: 'inherit' | 'full' | 'upper' | 'white';
  waist: {
    mode: 'none' | 'single' | 'double';
    width: 'thin' | 'medium' | 'wide';
    crossDoors: boolean;
  };
  nose: 'none' | 'full' | 'upper' | 'lower' | 'front';
  roofSide: 'none' | 'narrow' | 'wide';
  lowerSide: 'none' | 'narrow' | 'wide';
  skirt: boolean;
}
export interface Layout3d {
  config: Layout3dConfig;
  views: Array<{ view: 'side' | 'front' | 'perspective'; imageUrl: string }>;
}

export function validateLayout3d(value: unknown): asserts value is Layout3d {
  const fail = (field: string): never => {
    throw new BadRequestException(
      `3D 布局 ${field} 无效，请重新编辑并保存布局版本。`,
    );
  };
  const object = (v: unknown): v is Record<string, any> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || !object(value.config)) fail('config');
  const c = (value as Layout3d).config;
  if (
    c.version !== 1 ||
    !['generic-train-v1', 'reference-train-v2'].includes(c.model)
  )
    fail('version/model');
  const member = (v: unknown, list: string[], field: string) => {
    if (!list.includes(v as string)) fail(field);
  };
  if (!object(c.windowBand) || typeof c.windowBand.crossDoors !== 'boolean')
    fail('windowBand.crossDoors');
  member(c.windowBand.mode, ['none', 'long', 'short'], 'windowBand.mode');
  if (!object(c.waist) || typeof c.waist.crossDoors !== 'boolean')
    fail('waist.crossDoors');
  member(c.waist.mode, ['none', 'single', 'double'], 'waist.mode');
  member(c.waist.width, ['thin', 'medium', 'wide'], 'waist.width');
  member(c.doors, ['inherit', 'full', 'upper', 'white'], 'doors');
  member(c.nose, ['none', 'full', 'upper', 'lower', 'front'], 'nose');
  member(c.roofSide, ['none', 'narrow', 'wide'], 'roofSide');
  member(c.lowerSide, ['none', 'narrow', 'wide'], 'lowerSide');
  if (typeof c.skirt !== 'boolean') fail('skirt');
  const views = (value as Layout3d).views;
  if (
    !Array.isArray(views) ||
    views.length !== 3 ||
    new Set(views.map((v) => v?.view)).size !== 3
  )
    fail('三视图（必须包含 side/front/perspective）');
  for (const v of views) {
    if (!object(v)) fail('views');
    member(v.view, ['side', 'front', 'perspective'], 'views.view');
    if (typeof v.imageUrl !== 'string' || !v.imageUrl.trim())
      fail('views.imageUrl');
  }
}

/** Validate all uploads before writing; cleanup only files created by this operation. */
export async function persistLayout3d(
  value: unknown,
): Promise<{ layout3d: Layout3d; cleanup: () => Promise<void> }> {
  validateLayout3d(value);
  const buffers: Buffer[] = [];
  for (const view of value.views) {
    const fail = () =>
      new BadRequestException(
        `3D ${view.view} 视图必须为有效 PNG（每张最多 5 MB、1600 万像素），请重新截取三视图。`,
      );
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      view.imageUrl,
    );
    if (!match || match[1].length > Math.ceil((5 * 1024 * 1024) / 3) * 4)
      throw fail();
    const buffer = Buffer.from(match[1], 'base64');
    if (
      buffer.length > 5 * 1024 * 1024 ||
      buffer.toString('base64') !== match[1]
    )
      throw fail();
    try {
      const image = sharp(buffer, {
        limitInputPixels: 16_000_000,
        failOn: 'error',
      });
      const meta = await image.metadata();
      if (meta.format !== 'png' || (meta.pages ?? 1) !== 1) throw fail();
      await image.raw().toBuffer(); // Full decode rejects truncated or forged PNG payloads.
    } catch {
      throw fail();
    }
    buffers.push(buffer);
  }
  const files: string[] = [];
  const cleanup = async () => {
    await Promise.all(files.map((file) => unlink(file).catch(() => undefined)));
  };
  const id = randomUUID();
  const root = join(process.cwd(), 'generated', 'layout3d');
  const views: Layout3d['views'] = [];
  try {
    await mkdir(root, { recursive: true });
    for (let i = 0; i < value.views.length; i++) {
      const view = value.views[i].view;
      const name = `${id}-${view}.png`;
      const path = join(root, name);
      // UUID plus exclusive create prevents overwriting another saved version.
      const handle = await open(path, 'wx');
      files.push(path);
      try {
        await handle.writeFile(buffers[i]);
      } finally {
        await handle.close();
      }
      views.push({ view, imageUrl: `/generated/layout3d/${name}` });
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
  return { layout3d: { config: value.config, views }, cleanup };
}

export function describeLayout3d(
  value: Layout3d,
  hasColorScheme = true,
): string {
  validateLayout3d(value);
  const c = value.config;
  const modelDescription =
    c.model === 'reference-train-v2'
      ? '参考照片重建的两节编组列车'
      : '通用列车车头加一节客车车厢';
  return [
    hasColorScheme
      ? `已保存的三维布局：${modelDescription}；三视图灰度仅编码涂装区域，不是最终颜色。布局遮罩约束大色块及留白，最终颜色由配色方案与本次颜色要求决定。`
      : `已保存的三维布局：${modelDescription}；三视图灰度编码涂装区域，布局遮罩约束大色块及留白。未选择配色时默认保持黑白灰布局，本次明确文字颜色要求优先；不从案例或纹样图片中自行引入颜色。`,
    `车窗带：${{ none: '不设置涂装窗带，保留独立玻璃窗口', long: '长窗带，沿窗区纵向连接', short: '短窗带，按窗组分段且保留段间留白，不强制连续贯穿' }[c.windowBand.mode]}；${c.windowBand.crossDoors ? '允许窗带跨车门' : '窗带在车门处断开'}。`,
    `车门：${{ inherit: '继承相邻区域布局（跨门开关决定带状涂装是否跨门）', full: '门板全高涂装', upper: '只涂车门上半部，下半部留白', white: '整扇门板留白，不受跨门开关覆盖' }[c.doors]}。门窗玻璃、门缝和把手结构必须保留。`,
    `腰线：${{ none: '无腰线涂装', single: '单腰线', double: '双腰线' }[c.waist.mode]}；宽度${{ thin: '细', medium: '中', wide: '宽' }[c.waist.width]}；${c.waist.crossDoors ? '允许跨车门' : '在车门处断开'}，但车门独立留白或上半涂装设置优先。`,
    `车头：${{ none: '无车头色块涂装', full: '车头整体涂装', upper: '车头上半部涂装', lower: '车头下半部涂装', front: '仅鼻尖正前区域涂装' }[c.nose]}，保留驾驶室玻璃和灯组。`,
    `车顶侧区（侧窗上缘至车顶侧肩）：${{ none: '留白不涂装', narrow: '窄区，区域高度的 1/3', wide: '宽区，完整区域高度' }[c.roofSide]}。`,
    `侧下区（窗下缘到裙底板之间）：${{ none: '留白不涂装', narrow: '从裙板上缘向上延伸区域高度的 1/3', wide: '完整区域高度' }[c.lowerSide]}。`,
    `裙板：${c.skirt ? '涂装' : '不涂装，保留白模底色'}。`,
    '冲突处理：已保存三维布局决定大色块位置，覆盖旧画布中冲突的大色块；画布中的已转化纹样保留纹样身份、朝向、相对比例和相对构图，按可涂装区域适配位置，不退回原始纹样素材。车窗玻璃、车门边界和轮组禁止被涂装遮盖。',
  ].join('\n');
}
