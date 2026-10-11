import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from './color-utils';
import type { PaletteGroup, ColorRgb } from './color-config.types';

@Injectable()
export class ColorPaletteService {
  generateAnalogousPalette(baseColor: string): string[] {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return [baseColor];

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const colors: string[] = [];

    for (let i = -2; i <= 2; i++) {
      const newH = (hsl.h + i * 30 + 360) % 360;
      const newRgb = hslToRgb(newH, hsl.s, hsl.l);
      colors.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    }

    return colors;
  }

  generateComplementaryPalette(baseColor: string): string[] {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return [baseColor];

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const complementaryH = (hsl.h + 180) % 360;
    const compRgb = hslToRgb(complementaryH, hsl.s, hsl.l);

    return [baseColor, rgbToHex(compRgb.r, compRgb.g, compRgb.b)];
  }

  generateContrastPalette(baseColor: string): string[] {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return [baseColor];

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const lighterH = hsl.l > 50 ? (hsl.h + 60) % 360 : (hsl.h + 30) % 360;
    const darkerH =
      hsl.l > 50 ? (hsl.h - 60 + 360) % 360 : (hsl.h - 30 + 360) % 360;

    const lighterRgb = hslToRgb(
      lighterH,
      Math.max(10, hsl.s - 20),
      Math.min(90, hsl.l + 30),
    );
    const darkerRgb = hslToRgb(
      darkerH,
      Math.min(100, hsl.s + 20),
      Math.max(10, hsl.l - 30),
    );

    return [
      baseColor,
      rgbToHex(lighterRgb.r, lighterRgb.g, lighterRgb.b),
      rgbToHex(darkerRgb.r, darkerRgb.g, darkerRgb.b),
    ];
  }

  generateMonochromePalette(baseColor: string): string[] {
    const rgb = hexToRgb(baseColor);
    if (!rgb) return [baseColor];

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const colors: string[] = [];

    const lightnessSteps = [15, 30, 45, 50, 55, 70, 85];
    for (const l of lightnessSteps) {
      const newRgb = hslToRgb(hsl.h, hsl.s, l);
      colors.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    }

    return colors;
  }

  generatePaletteGroups(baseColor: string): PaletteGroup[] {
    return [
      {
        type: 'analogous',
        title: '邻近色方案',
        colors: this.generateAnalogousPalette(baseColor),
      },
      {
        type: 'complementary',
        title: '互补色方案',
        colors: this.generateComplementaryPalette(baseColor),
      },
      {
        type: 'contrast',
        title: '对比色方案',
        colors: this.generateContrastPalette(baseColor),
      },
      {
        type: 'monochrome',
        title: '单色渐变方案',
        colors: this.generateMonochromePalette(baseColor),
      },
    ];
  }

  async extractBasePalette(imageBuffer: Buffer): Promise<string[]> {
    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount: Record<string, number> = {};
    const channels = info.channels;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3] ?? 255;

      if (a < 128) continue;
      if (r > 248 && g > 248 && b > 248) continue;
      if (r < 8 && g < 8 && b < 8) continue;

      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${Math.min(qr, 255)},${Math.min(qg, 255)},${Math.min(qb, 255)}`;
      pixelCount[key] = (pixelCount[key] || 0) + 1;
    }

    const colors = Object.entries(pixelCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return rgbToHex(r, g, b);
      });

    if (colors.length === 0) {
      throw new Error('No usable colors extracted from image');
    }

    return colors;
  }

  colorDistance(c1: ColorRgb, c2: ColorRgb): number {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2),
    );
  }

  sortColorsByFrequency(colors: string[]): string[] {
    const frequency: Record<string, number> = {};
    const uniqueColors: string[] = [];

    for (const color of colors) {
      if (!frequency[color]) {
        frequency[color] = 0;
        uniqueColors.push(color);
      }
      frequency[color]++;
    }

    return uniqueColors.sort((a, b) => frequency[b] - frequency[a]);
  }
}
