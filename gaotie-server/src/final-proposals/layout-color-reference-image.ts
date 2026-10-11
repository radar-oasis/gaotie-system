import sharp from 'sharp';

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export async function createColorizedLayoutReferenceImage(
  input: Buffer,
  color: string,
): Promise<Buffer> {
  const target = parseHexColor(color);
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = output[offset + 3];

    if (alpha < 16) {
      continue;
    }

    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const neutralChroma = max - min;

    if (neutralChroma <= 24 && luma >= 35 && luma <= 190) {
      const shade = Math.max(0.72, Math.min(1.08, luma / 95));

      output[offset] = clamp(target.red * shade);
      output[offset + 1] = clamp(target.green * shade);
      output[offset + 2] = clamp(target.blue * shade);
    }
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

function parseHexColor(color: string): {
  red: number;
  green: number;
  blue: number;
} {
  const normalized = color.trim();
  const match = HEX_COLOR_PATTERN.exec(normalized);

  if (!match) {
    throw new Error('Invalid hex color');
  }

  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : match[1];

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
