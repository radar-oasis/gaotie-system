import sharp from 'sharp';
import { transparentizeImage } from './transparentize';

async function alphaAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return data[(y * info.width + x) * 4 + 3];
}

async function rgbaAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;

  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  };
}

async function pngInput(width: number, height: number, background: string) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
}

describe('transparentizeImage', () => {
  it('turns a simple white background transparent while keeping the motif opaque', async () => {
    const input = await sharp(await pngInput(20, 20, '#ffffff'))
      .composite([
        {
          input: await pngInput(8, 8, '#0052d9'),
          left: 6,
          top: 6,
        },
      ])
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);
    const metadata = await sharp(result.buffer).metadata();

    expect(result.confidence).toBe('high');
    expect(result.transparentPixelRatio).toBeGreaterThan(0);
    expect(metadata.format).toBe('png');
    expect(await alphaAt(result.buffer, 0, 0)).toBe(0);
    expect(await alphaAt(result.buffer, 10, 10)).toBe(255);
  });

  it('keeps the motif opaque when removing an inconsistent edge background', async () => {
    const input = await sharp(await pngInput(20, 20, '#808080'))
      .composite([
        { input: await pngInput(20, 2, '#ffffff'), left: 0, top: 0 },
        { input: await pngInput(20, 2, '#000000'), left: 0, top: 18 },
        { input: await pngInput(2, 16, '#ffffff'), left: 0, top: 2 },
        { input: await pngInput(2, 16, '#000000'), left: 18, top: 2 },
      ])
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);
    const metadata = await sharp(result.buffer).metadata();

    expect(result.transparentPixelRatio).toBeGreaterThanOrEqual(0);
    expect(metadata.format).toBe('png');
    expect(await alphaAt(result.buffer, 10, 10)).toBe(255);
  });

  it('extracts pale line art onto a truly transparent background', async () => {
    const input = await sharp(await pngInput(24, 24, '#fafafa'))
      .composite([
        {
          input: await sharp({
            create: {
              width: 10,
              height: 10,
              channels: 4,
              background: '#d8d8d8',
            },
          })
            .png()
            .toBuffer(),
          left: 7,
          top: 7,
        },
      ])
      .blur(0.4)
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);
    const background = await rgbaAt(result.buffer, 0, 0);
    const motif = await rgbaAt(result.buffer, 12, 12);

    expect(result.confidence).toBe('high');
    expect(background.a).toBe(0);
    expect(motif.a).toBeGreaterThanOrEqual(220);
    expect(motif.r).toBeLessThan(80);
    expect(motif.g).toBeLessThan(80);
    expect(motif.b).toBeLessThan(80);
  });

  it('preserves requested foreground color when extracting colored line art', async () => {
    const input = await sharp(await pngInput(32, 32, '#ffffff'))
      .composite([
        {
          input: await pngInput(20, 4, '#c81e1e'),
          left: 6,
          top: 14,
        },
      ])
      .blur(0.3)
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);
    const background = await rgbaAt(result.buffer, 0, 0);
    const motif = await rgbaAt(result.buffer, 16, 16);

    expect(result.confidence).toBe('high');
    expect(background.a).toBe(0);
    expect(motif.a).toBeGreaterThanOrEqual(220);
    expect(motif.r).toBeGreaterThan(150);
    expect(motif.g).toBeLessThan(80);
    expect(motif.b).toBeLessThan(80);
  });

  it('removes a varied edge-connected background even when border consistency is low', async () => {
    const input = await sharp({
      create: {
        width: 30,
        height: 30,
        channels: 4,
        background: '#ece7dd',
      },
    })
      .composite([
        { input: await pngInput(30, 8, '#f8f6ef'), left: 0, top: 0 },
        { input: await pngInput(30, 8, '#ddd6c9'), left: 0, top: 22 },
        { input: await pngInput(10, 10, '#1f2937'), left: 10, top: 10 },
      ])
      .blur(0.3)
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);

    expect(result.confidence).toBe('high');
    expect(result.transparentPixelRatio).toBeGreaterThan(0.5);
    expect(await alphaAt(result.buffer, 1, 1)).toBe(0);
    expect(await alphaAt(result.buffer, 28, 28)).toBe(0);
    expect(await alphaAt(result.buffer, 15, 15)).toBeGreaterThanOrEqual(240);
  });

  it('preserves images that already have substantial transparency', async () => {
    const input = await sharp(await pngInput(20, 20, '#00000000'))
      .composite([
        {
          input: await pngInput(8, 8, '#111111'),
          left: 6,
          top: 6,
        },
      ])
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);

    expect(result.confidence).toBe('high');
    expect(result.transparentPixelRatio).toBeGreaterThan(0.7);
    expect(await alphaAt(result.buffer, 0, 0)).toBe(0);
    expect(await alphaAt(result.buffer, 10, 10)).toBe(255);
  });

  it('rejects images that exceed the maximum dimension before raw decode', async () => {
    const input = await pngInput(7001, 1, '#ffffff');

    await expect(transparentizeImage(input)).rejects.toThrow(
      'Image dimensions exceed transparentize limit',
    );
  });
});
