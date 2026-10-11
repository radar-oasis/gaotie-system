import sharp from 'sharp';
import { optimizeReferenceImage } from './reference-image-optimizer';

describe('optimizeReferenceImage', () => {
  it('shrinks oversized reference images before they are sent to the image provider', async () => {
    const input = await sharp({
      create: {
        width: 2400,
        height: 900,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="900"><path d="M80 450 C 500 120, 1100 780, 2300 350" stroke="#111111" stroke-width="18" fill="none"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();

    const optimized = await optimizeReferenceImage(input);
    const metadata = await sharp(optimized).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeLessThanOrEqual(1280);
    expect(metadata.height).toBeLessThanOrEqual(720);
    expect(optimized.byteLength).toBeLessThan(input.byteLength);
  });
});
