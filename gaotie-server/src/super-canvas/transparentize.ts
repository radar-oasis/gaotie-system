import sharp from 'sharp';

type Confidence = 'high' | 'low';

type Rgb = {
  r: number;
  g: number;
  b: number;
};

type BorderAnalysis = {
  background: Rgb;
  consistency: number;
};

export type TransparentizeResult = {
  buffer: Buffer;
  confidence: Confidence;
  transparentPixelRatio: number;
};

const SOLID_THRESHOLD = 18;
const FEATHER_THRESHOLD = 58;
const CONNECTED_BACKGROUND_THRESHOLD = 90;
const MIN_CONNECTED_BACKGROUND_RATIO = 0.05;
const EXISTING_TRANSPARENCY_RATIO = 0.05;
const LIGHT_NEUTRAL_LUMINANCE = 245;
const LIGHT_NEUTRAL_CHROMA = 28;
const LINE_ART_BACKGROUND_LUMINANCE = 246;
const LINE_ART_MIN_ALPHA = 48;
const LINE_ART_OPAQUE_LUMINANCE = 224;
const COLORED_LINE_ART_CHROMA = 30;
const HIGH_CONFIDENCE_CONSISTENCY = 0.85;
const MAX_DIMENSION = 7000;
const MAX_PIXELS = 30_000_000;
const MAX_BORDER_SAMPLES = 4096;

export async function transparentizeImage(
  input: Buffer,
): Promise<TransparentizeResult> {
  await assertProcessableDimensions(input);

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const existingTransparentPixels = countTransparentPixels(data);
  const totalPixels = info.width * info.height;

  if (existingTransparentPixels / totalPixels >= EXISTING_TRANSPARENCY_RATIO) {
    return {
      buffer: await encodePng(data, info.width, info.height),
      confidence: 'high',
      transparentPixelRatio: existingTransparentPixels / totalPixels,
    };
  }

  const { background, consistency } = analyzeBorder(
    data,
    info.width,
    info.height,
  );
  const lineArtProfile = analyzeLineArtProfile(data, info.width, info.height);

  if (lineArtProfile.isNearWhiteLineArt) {
    return extractNearWhiteLineArt(data, info.width, info.height);
  }

  if (consistency < HIGH_CONFIDENCE_CONSISTENCY) {
    const connectedBackgroundPixels = removeConnectedBackground(
      data,
      info.width,
      info.height,
      background,
    );
    const lightNeutralPixels = removeLightNeutralPixels(data);
    const transparentPixels = connectedBackgroundPixels + lightNeutralPixels;
    const connectedBackgroundRatio = transparentPixels / totalPixels;

    if (connectedBackgroundRatio >= MIN_CONNECTED_BACKGROUND_RATIO) {
      return {
        buffer: await encodePng(data, info.width, info.height),
        confidence: 'high',
        transparentPixelRatio: connectedBackgroundRatio,
      };
    }

    return {
      buffer: await encodePng(data, info.width, info.height),
      confidence: 'low',
      transparentPixelRatio: 0,
    };
  }

  let transparentPixels = 0;

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    const distance = colorDistance(
      {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      },
      background,
    );

    if (distance <= SOLID_THRESHOLD) {
      data[offset + 3] = 0;
      transparentPixels += 1;
      continue;
    }

    if (distance <= FEATHER_THRESHOLD) {
      const opacity =
        (distance - SOLID_THRESHOLD) / (FEATHER_THRESHOLD - SOLID_THRESHOLD);
      data[offset + 3] = Math.min(data[offset + 3], Math.round(opacity * 255));

      if (data[offset + 3] < 128) {
        transparentPixels += 1;
      }
    }
  }

  return {
    buffer: await encodePng(data, info.width, info.height),
    confidence: 'high',
    transparentPixelRatio: transparentPixels / (info.width * info.height),
  };
}

function countTransparentPixels(data: Buffer): number {
  let transparentPixels = 0;

  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] < 128) {
      transparentPixels += 1;
    }
  }

  return transparentPixels;
}

function removeLightNeutralPixels(data: Buffer): number {
  let transparentPixels = 0;

  for (let pixel = 0; pixel < data.length / 4; pixel += 1) {
    const offset = pixel * 4;

    if (data[offset + 3] === 0) {
      continue;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luminance = relativeLuminance(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    if (
      luminance >= LIGHT_NEUTRAL_LUMINANCE &&
      chroma <= LIGHT_NEUTRAL_CHROMA
    ) {
      data[offset + 3] = 0;
      transparentPixels += 1;
    }
  }

  return transparentPixels;
}

function removeConnectedBackground(
  data: Buffer,
  width: number,
  height: number,
  background: Rgb,
): number {
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let queueStart = 0;
  let queueEnd = 0;
  let transparentPixels = 0;

  const enqueue = (pixel: number) => {
    if (visited[pixel]) {
      return;
    }

    visited[pixel] = 1;

    if (!isConnectedBackgroundPixel(data, pixel, background)) {
      return;
    }

    queue[queueEnd] = pixel;
    queueEnd += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const pixel = queue[queueStart];
    queueStart += 1;

    const offset = pixel * 4;

    if (data[offset + 3] !== 0) {
      data[offset + 3] = 0;
      transparentPixels += 1;
    }

    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (x > 0) {
      enqueue(pixel - 1);
    }

    if (x < width - 1) {
      enqueue(pixel + 1);
    }

    if (y > 0) {
      enqueue(pixel - width);
    }

    if (y < height - 1) {
      enqueue(pixel + width);
    }
  }

  return transparentPixels;
}

function isConnectedBackgroundPixel(
  data: Buffer,
  pixel: number,
  background: Rgb,
): boolean {
  const offset = pixel * 4;

  if (data[offset + 3] === 0) {
    return false;
  }

  return (
    colorDistance(
      {
        r: data[offset],
        g: data[offset + 1],
        b: data[offset + 2],
      },
      background,
    ) <= CONNECTED_BACKGROUND_THRESHOLD
  );
}

function extractNearWhiteLineArt(
  data: Buffer,
  width: number,
  height: number,
): Promise<TransparentizeResult> {
  let transparentPixels = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const luminance = relativeLuminance(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    );
    const alpha = lineArtAlpha(luminance);
    const chroma =
      Math.max(data[offset], data[offset + 1], data[offset + 2]) -
      Math.min(data[offset], data[offset + 1], data[offset + 2]);

    if (chroma <= COLORED_LINE_ART_CHROMA) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
    }
    data[offset + 3] = Math.min(data[offset + 3], alpha);

    if (data[offset + 3] === 0) {
      transparentPixels += 1;
    }
  }

  return encodePng(data, width, height).then((buffer) => ({
    buffer,
    confidence: 'high',
    transparentPixelRatio: transparentPixels / (width * height),
  }));
}

function lineArtAlpha(luminance: number): number {
  if (luminance >= LINE_ART_BACKGROUND_LUMINANCE) {
    return 0;
  }

  if (luminance <= LINE_ART_OPAQUE_LUMINANCE) {
    return 255;
  }

  const alpha =
    ((LINE_ART_BACKGROUND_LUMINANCE - luminance) /
      (LINE_ART_BACKGROUND_LUMINANCE - LINE_ART_OPAQUE_LUMINANCE)) *
    255;

  return alpha < LINE_ART_MIN_ALPHA ? 0 : Math.round(alpha);
}

async function assertProcessableDimensions(input: Buffer): Promise<void> {
  const metadata = await sharp(input).metadata();
  const { width, height } = metadata;

  if (width === undefined || height === undefined) {
    throw new Error('Unable to determine image dimensions');
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(
      `Image dimensions exceed transparentize limit of ${MAX_DIMENSION}px`,
    );
  }

  if (width * height > MAX_PIXELS) {
    throw new Error(
      `Image pixel count exceeds transparentize limit of ${MAX_PIXELS} pixels`,
    );
  }
}

function encodePng(
  data: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

function analyzeBorder(
  data: Buffer,
  width: number,
  height: number,
): BorderAnalysis {
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSquaredR = 0;
  let sumSquaredG = 0;
  let sumSquaredB = 0;

  visitBorderSamples(width, height, (x, y) => {
    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    count += 1;
    sumR += r;
    sumG += g;
    sumB += b;
    sumSquaredR += r * r;
    sumSquaredG += g * g;
    sumSquaredB += b * b;
  });

  const background = {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
  const distanceVariance =
    sumSquaredR / count -
    (sumR / count) ** 2 +
    sumSquaredG / count -
    (sumG / count) ** 2 +
    sumSquaredB / count -
    (sumB / count) ** 2;
  const consistency = Math.max(
    0,
    1 - Math.sqrt(Math.max(0, distanceVariance)) / SOLID_THRESHOLD,
  );

  return { background, consistency };
}

function analyzeLineArtProfile(
  data: Buffer,
  width: number,
  height: number,
): { isNearWhiteLineArt: boolean } {
  let nearWhitePixels = 0;
  let colorfulPixels = 0;
  let darkPixels = 0;
  const totalPixels = width * height;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const offset = pixel * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luminance = relativeLuminance(r, g, b);
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);

    if (luminance >= 245 && chroma <= 18) {
      nearWhitePixels += 1;
    }

    if (chroma > 40 && luminance < 235) {
      colorfulPixels += 1;
    }

    if (luminance < 96) {
      darkPixels += 1;
    }
  }

  return {
    isNearWhiteLineArt:
      nearWhitePixels / totalPixels >= 0.55 &&
      colorfulPixels / totalPixels <= 0.08 &&
      darkPixels / totalPixels <= 0.2,
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function visitBorderSamples(
  width: number,
  height: number,
  visit: (x: number, y: number) => void,
): void {
  const inset = Math.max(1, Math.ceil(Math.min(width, height) * 0.08));
  const edgeSamples = Math.floor(Math.sqrt(MAX_BORDER_SAMPLES / 4));
  const depthSamples = Math.max(1, Math.floor(edgeSamples / 8));
  const horizontalXs = evenlySpacedIndexes(width, edgeSamples);
  const verticalYs = evenlySpacedIndexes(height, edgeSamples);
  const topYs = evenlySpacedIndexes(inset, depthSamples);
  const bottomYs = topYs.map((y) => height - inset + y);
  const leftXs = evenlySpacedIndexes(inset, depthSamples);
  const rightXs = leftXs.map((x) => width - inset + x);

  for (const y of topYs) {
    for (const x of horizontalXs) {
      visit(x, y);
    }
  }

  for (const y of bottomYs) {
    for (const x of horizontalXs) {
      visit(x, y);
    }
  }

  for (const y of verticalYs) {
    for (const x of leftXs) {
      visit(x, y);
    }
  }

  for (const y of verticalYs) {
    for (const x of rightXs) {
      visit(x, y);
    }
  }
}

function evenlySpacedIndexes(length: number, targetCount: number): number[] {
  const count = Math.min(length, Math.max(1, targetCount));

  if (count === 1) {
    return [0];
  }

  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (length - 1)) / (count - 1)),
  );
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
