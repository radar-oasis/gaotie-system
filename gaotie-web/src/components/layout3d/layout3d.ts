import { REFERENCE_DOORS, referenceSurfaceHeight, referenceWindscreenHalfAngle, referenceNosePaintEdges, sideAngle } from './referenceTrainProfile';
export interface Layout3DConfig {
  version: 1; model: 'generic-train-v1' | 'reference-train-v2';
  windowBand: { mode: 'none' | 'long' | 'short'; crossDoors: boolean };
  doors: 'inherit' | 'full' | 'upper' | 'white';
  waist: { mode: 'none' | 'single' | 'double'; width: 'thin' | 'medium' | 'wide'; crossDoors: boolean };
  nose: 'none' | 'full' | 'upper' | 'lower' | 'front';
  roofSide: 'none' | 'narrow' | 'wide';
  lowerSide: 'none' | 'narrow' | 'wide';
  skirt: boolean;
}
export type Region = 'windowBand' | 'doors' | 'waist' | 'nose' | 'roofSide' | 'lowerSide' | 'skirt';
export type Paint = Region | 'body' | 'glass' | 'seam' | 'lamp';
export type View = 'side' | 'front' | 'perspective';
export interface Layout3DView { view: View; imageUrl: string }
export interface Layout3DData { config: Layout3DConfig; views: Layout3DView[] }
export const REGIONS: { id: Region; label: string; hint: string }[] = [
  { id: 'windowBand', label: '车窗带', hint: '长短沿车身方向；玻璃始终保留。' },
  { id: 'doors', label: '车门', hint: '独立门涂装优先于背景色块与带线。' },
  { id: 'waist', label: '腰线', hint: '单双线与宽度独立设置。' },
  { id: 'nose', label: '流线型头部', hint: '沿风挡与车体曲面衔接，玻璃和灯具保持可见。' },
  { id: 'roofSide', label: '车顶过渡区', hint: '窗带上缘至车顶的设计分区。' },
  { id: 'lowerSide', label: '窗下侧墙', hint: '窗带下缘至裙板上缘。' },
  { id: 'skirt', label: '裙板', hint: '车体下缘的裙板覆盖范围。' },
];
export const GRAYS: Record<Paint, string> = {
  body: '#f3f3f1', windowBand: '#41454a', doors: '#878b91', waist: '#30343b',
  nose: '#626873', roofSide: '#a3a7ad', lowerSide: '#b7bbc0', skirt: '#666d76',
  glass: '#202b36', seam: '#7f858c', lamp: '#dce6eb',
};
export function defaultLayout3D(): Layout3DConfig {
  return { version: 1, model: 'reference-train-v2', windowBand: { mode: 'none', crossDoors: false },
    doors: 'inherit', waist: { mode: 'none', width: 'medium', crossDoors: false },
    nose: 'none', roofSide: 'none', lowerSide: 'none', skirt: false };
}
export function withPaintForm(config: Layout3DConfig, region: Region, value: string): Layout3DConfig {
  if (region === 'windowBand') return { ...config, windowBand: { ...config.windowBand, mode: value as Layout3DConfig['windowBand']['mode'] } };
  if (region === 'waist') return { ...config, waist: { ...config.waist, mode: value as Layout3DConfig['waist']['mode'] } };
  if (region === 'skirt') return { ...config, skirt: value === 'true' };
  return { ...config, [region]: value } as Layout3DConfig;
}
export const FORM_LABELS: Record<string, string> = { none: '不涂装', long: '长带', short: '短带', inherit: '跟随布局', full: '整体涂装', upper: '上部涂装', lower: '下部涂装', white: '保持白色', single: '单线', double: '双线', thin: '细', medium: '中', wide: '宽幅', narrow: '窄幅', front: '仅正面' };
export function describeLayout3D(c: Layout3DConfig): string {
  return `车窗带：${FORM_LABELS[c.windowBand.mode]}，${c.windowBand.crossDoors ? '跨越' : '避让'}车门；车门：${FORM_LABELS[c.doors]}；腰线：${FORM_LABELS[c.waist.mode]}（${FORM_LABELS[c.waist.width]}），${c.waist.crossDoors ? '跨越' : '避让'}车门；流线型头部：${FORM_LABELS[c.nose]}；车顶过渡区：${FORM_LABELS[c.roofSide]}；窗下侧墙：${FORM_LABELS[c.lowerSide]}；裙板：${c.skirt ? '涂装' : '不涂装'}`;
}

/** World coordinates shared by rendering, picking and export. X=length, Y=height. */
export function sampleTrainSurface(c: Layout3DConfig, x: number, y: number, z: number): { region: Region; paint: Paint } {
  if (c.model === 'reference-train-v2') return sampleReferenceSurface(c, x, y, z);
  const side = Math.abs(z) > 0.8;
  const nose = x < -10.3;
  const doorX = [-9.15, -1.6, 1.6, 13.4].some(center => Math.abs(x - center) < .46);
  const door = side && doorX && y > 1.18 && y < 3.1;
  const band = y >= 2.2 && y <= 3.05;
  const width = { thin: .055, medium: .085, wide: .12 }[c.waist.width];
  const line1 = Math.abs(y - 1.92) < width / 2;
  const line2 = Math.abs(y - 1.72) < width / 2;
  const region: Region = nose ? 'nose' : door ? 'doors' : y < 1.18 ? 'skirt' : band ? 'windowBand' : y > 3.05 ? 'roofSide' : (line1 || line2) ? 'waist' : 'lowerSide';
  let paint: Paint = 'body';
  if (!nose) {
    if (y < 1.18 && c.skirt) paint = 'skirt';
    if (y >= 1.18 && y < 2.2 && (c.lowerSide === 'wide' || c.lowerSide === 'narrow' && y < 1.52)) paint = 'lowerSide';
    if (y > 3.05 && (c.roofSide === 'wide' || c.roofSide === 'narrow' && y > 3.63 - (3.63 - 3.05) / 3)) paint = 'roofSide';
    const shortSpan = x < 0 ? x > -8 && x < -2.6 : x > 2.5 && x < 12.4;
    if (band && c.windowBand.mode !== 'none' && (c.windowBand.mode === 'long' || shortSpan) && (!door || c.windowBand.crossDoors)) paint = 'windowBand';
    if (c.waist.mode !== 'none' && (line1 || c.waist.mode === 'double' && line2) && (!door || c.waist.crossDoors)) paint = 'waist';
  } else if (y < 2.64 && (c.nose === 'full' || c.nose === 'upper' && y >= 1.7 || c.nose === 'lower' && y < 1.7 || c.nose === 'front' && x < -14.2)) paint = 'nose';
  if (door && c.doors !== 'inherit') paint = c.doors === 'full' || c.doors === 'upper' && y > 2.05 ? 'doors' : 'body';
  // A continuous frame identifies doors even with no paint. Glass wins over all masks.
  if (door && ([-9.15, -1.6, 1.6, 13.4].some(center => Math.abs(Math.abs(x - center) - .43) < .025) || y < 1.23 || y > 3.05)) paint = 'seam';
  const passengerSpan = x < 0 ? x > -8 && x < -2.65 : x > 2.6 && x < 12.5;
  const window = side && passengerSpan && y > 2.38 && y < 2.85 && ((x + 30) % 1.25) < .9;
  if (window || door && y > 2.42 && y < 2.85) paint = 'glass';
  if (nose && x > -12 && x < -10.65 && y > 2.64 && Math.abs(z) < 1.1) paint = 'glass';
  if (nose && x < -13.5 && x > -14.3 && y > 1.4 && y < 1.58 && Math.abs(z) > .5) paint = 'lamp';
  return { region, paint };
}

function sampleReferenceSurface(c: Layout3DConfig, x: number, y: number, z: number): { region: Region; paint: Paint } {
  const door = Math.abs(z) > .8 && REFERENCE_DOORS.some(d => Math.abs(x-d) < .29) && y > 1.18 && y < 3.13;
  const actualY = y;
  y = referenceSurfaceHeight(x,y);
  // The head-to-body boundary rolls back at its shoulders instead of a vertical cut.
  const nose = x < -10.3 - .7 * ((y-2.2)/1.43)**2;
  const band = y >= 2.2 && y <= 3.05;
  const width = { thin: .055, medium: .085, wide: .12 }[c.waist.width];
  const line1 = Math.abs(y-1.92) < width/2, line2 = Math.abs(y-1.72) < width/2;
  const region: Region = nose ? 'nose' : door ? 'doors' : y < 1.18 ? 'skirt' : band ? 'windowBand' : y > 3.05 ? 'roofSide' : line1 || line2 ? 'waist' : 'lowerSide';
  let paint: Paint = 'body';
  const edges = referenceNosePaintEdges(x, c.roofSide, c.lowerSide);
  // Upper/lower are continuous paths into their neighboring body zones, not head caps.
  // An explicit body-zone option takes control once the head has joined the body.
  if (c.nose === 'upper' && y >= edges.upper && (x < -10.5 || c.roofSide === 'none')) paint = 'nose';
  if (c.nose === 'lower' && y < edges.lower && y >= edges.bottom && (x < -10.5 || c.lowerSide === 'none')) paint = 'nose';
  {
    if (y < 1.18 && c.skirt) paint = 'skirt';
    if (y >= 1.18 && y < 2.2 && (c.lowerSide === 'wide' || c.lowerSide === 'narrow' && y < 1.52)) paint = 'lowerSide';
    if (y > 3.05 && (c.roofSide === 'wide' || c.roofSide === 'narrow' && y > 3.63-.58/3)) paint = 'roofSide';
    const short = x < 0 ? x > -11.5 && x < -2.15 : x > 2.55 && x < 13.25;
    if (band && c.windowBand.mode !== 'none' && (c.windowBand.mode === 'long' || short) && (!door || c.windowBand.crossDoors)) paint = 'windowBand';
    if (c.waist.mode !== 'none' && (line1 || c.waist.mode === 'double' && line2) && (!door || c.waist.crossDoors)) paint = 'waist';
  }
  if (nose && (c.nose === 'full' || c.nose === 'front' && x < -14.2)) paint = 'nose';
  if (door && c.doors !== 'inherit') paint = c.doors === 'full' || c.doors === 'upper' && y > 2.05 ? 'doors' : 'body';
  if (x >= -13.83 && x <= -11.12 && sideAngle(x,actualY) <= referenceWindscreenHalfAngle((x+13.83)/2.71)) paint = 'glass';
  return { region, paint };
}
