import sharp from 'sharp';
import { FinalColorScheme } from './final-proposals.types';

const COLOR_REFERENCE_HEIGHT = 96;
const MIN_COLOR_REFERENCE_WIDTH = 320;
const SWATCH_WIDTH = 160;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export async function createColorReferenceImage(
  colorScheme?: FinalColorScheme,
): Promise<Buffer | null> {
  const colors = collectValidColors(colorScheme);

  if (!colors.length) {
    return null;
  }

  const width = Math.max(
    MIN_COLOR_REFERENCE_WIDTH,
    colors.length * SWATCH_WIDTH,
  );
  const swatchWidth = width / colors.length;
  const rects = colors
    .map(
      (color, index) =>
        `<rect x="${Math.round(index * swatchWidth)}" y="0" width="${Math.ceil(
          swatchWidth,
        )}" height="${COLOR_REFERENCE_HEIGHT}" fill="${color}" />`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${COLOR_REFERENCE_HEIGHT}"><rect width="100%" height="100%" fill="#ffffff" />${rects}<rect x="0.5" y="0.5" width="${
    width - 1
  }" height="${COLOR_REFERENCE_HEIGHT - 1}" fill="none" stroke="#d1d5db" /></svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function collectValidColors(colorScheme?: FinalColorScheme): string[] {
  if (!colorScheme) {
    return [];
  }

  const candidates = [
    ...colorScheme.regions.map((region) => region.color),
    ...(colorScheme.palette ?? []),
  ];
  const unique: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);

    if (!normalized || unique.includes(normalized)) {
      continue;
    }

    unique.push(normalized);
  }

  return unique;
}

function normalizeHexColor(value: string | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized || !HEX_COLOR_PATTERN.test(normalized)) {
    return null;
  }

  return normalized.toUpperCase();
}
