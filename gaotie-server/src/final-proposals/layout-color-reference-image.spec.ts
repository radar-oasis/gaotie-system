import sharp from 'sharp';
import { createColorizedLayoutReferenceImage } from './layout-color-reference-image';

describe('createColorizedLayoutReferenceImage', () => {
  it('recolors neutral layout fill areas to the selected region color', async () => {
    const input = await sharp({
      create: {
        width: 320,
        height: 120,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect x="40" y="46" width="220" height="28" fill="#555555"/><rect x="40" y="46" width="220" height="28" fill="none" stroke="#000000" stroke-width="4"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();

    const output = await createColorizedLayoutReferenceImage(input, '#d5492a');
    const sample = await sharp(output)
      .raw()
      .ensureAlpha()
      .extract({ left: 120, top: 58, width: 1, height: 1 })
      .toBuffer();

    expect(sample[0]).toBeGreaterThan(190);
    expect(sample[1]).toBeLessThan(100);
    expect(sample[2]).toBeLessThan(80);
  });

  it('leaves black outlines intact', async () => {
    const input = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="12" y="12" width="40" height="40" fill="#666666" stroke="#000000" stroke-width="6"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();

    const output = await createColorizedLayoutReferenceImage(input, '#d5492a');
    const outline = await sharp(output)
      .raw()
      .ensureAlpha()
      .extract({ left: 13, top: 13, width: 1, height: 1 })
      .toBuffer();

    expect(outline[0]).toBeLessThan(40);
    expect(outline[1]).toBeLessThan(40);
    expect(outline[2]).toBeLessThan(40);
  });
});
