import { ColorPaletteService } from './color-palette.service';

describe('ColorPaletteService', () => {
  it('throws when image bytes cannot be decoded', async () => {
    const service = new ColorPaletteService();

    await expect(service.extractBasePalette(Buffer.from('not an image'))).rejects.toThrow();
  });
});
