import sharp from 'sharp';
import { createColorReferenceImage } from './color-reference-image';
import { FinalColorScheme } from './final-proposals.types';

describe('createColorReferenceImage', () => {
  it('renders a PNG swatch strip from color scheme regions and palette', async () => {
    const colorScheme: FinalColorScheme = {
      id: 'color-1',
      name: '红色车窗带方案',
      regions: [
        {
          id: 'region-body',
          name: '车身主色',
          color: '#FFFFFF',
        },
        {
          id: 'region-window',
          name: '车窗带',
          color: '#D94336',
        },
      ],
      palette: ['#FFFFFF', '#D94336'],
    };

    const buffer = await createColorReferenceImage(colorScheme);

    expect(buffer).toBeInstanceOf(Buffer);

    const metadata = await sharp(buffer).metadata();

    expect(metadata.format).toBe('png');
    expect(metadata.width).toBeGreaterThanOrEqual(320);
    expect(metadata.height).toBe(96);
  });

  it('returns null when the scheme has no valid colors', async () => {
    await expect(
      createColorReferenceImage({
        id: 'empty-color',
        name: '空方案',
        regions: [{ id: 'bad', name: '坏色值', color: 'red-ish' }],
      }),
    ).resolves.toBeNull();
  });
});
