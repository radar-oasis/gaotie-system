import sharp from 'sharp';

const MAX_REFERENCE_WIDTH = 1280;
const MAX_REFERENCE_HEIGHT = 720;

export async function optimizeReferenceImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: MAX_REFERENCE_WIDTH,
      height: MAX_REFERENCE_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 9,
      palette: true,
    })
    .toBuffer();
}
