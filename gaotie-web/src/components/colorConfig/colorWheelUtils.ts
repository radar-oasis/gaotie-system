export interface HslColor {
  h: number;
  s: number;
  l: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = chroma;
  } else if (hue < 300) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return '#' + [r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
    .join('');
}

export function colorFromWheelPoint(x: number, y: number, size: number): string {
  const radius = size / 2;
  const dx = x - radius;
  const dy = y - radius;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const saturation = clamp(distance / radius, 0, 1) * 100;
  const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;

  return hslToHex(hue, saturation, 50);
}

export function wheelPointerPosition(hsl: HslColor, size: number): { left: number; top: number } {
  const radius = size / 2;
  const angle = hsl.h * Math.PI / 180;
  const distance = radius * clamp(hsl.s / 100, 0, 1);

  return {
    left: radius + Math.cos(angle) * distance,
    top: radius + Math.sin(angle) * distance,
  };
}
