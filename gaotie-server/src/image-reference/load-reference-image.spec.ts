import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadReferenceImage } from './load-reference-image';

describe('loadReferenceImage', () => {
  let root: string;
  let png: Buffer;
  let cwd: jest.SpyInstance;
  const originalPort = process.env.PORT;
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'gaotie-reference-test-'));
    await mkdir(path.join(root, 'server'));
    await mkdir(path.join(root, 'images'));
    png = await sharp({
      create: { width: 4096, height: 512, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await writeFile(path.join(root, 'images', 'train.png'), png);
    for (const folder of [
      '布局元素/车窗带',
      '样本图片',
      'server/generated/super-canvas',
      'server/generated/layout3d',
      'server/generated/final-proposals',
    ]) {
      await mkdir(path.join(root, folder), { recursive: true });
      await writeFile(path.join(root, folder, 'train.png'), png);
    }
    await writeFile(path.join(root, 'outside.png'), png);
    await symlink(
      path.join(root, 'outside.png'),
      path.join(root, 'images', 'escape.png'),
    );
    cwd = jest.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'server'));
    process.env.PORT = '3001';
  });
  afterAll(async () => {
    cwd.mockRestore();
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    await rm(root, { recursive: true, force: true });
  });
  it.each([
    '/images/train.png',
    'train.png',
    'http://127.0.0.1:3001/images/train.png',
    'http://localhost:3001/images/train.png',
    '/layout-elements/车窗带/train.png',
    '/sample-images/train.png',
    '样本图片/train.png',
    '/generated/super-canvas/train.png',
    '/generated/layout3d/train.png',
    '/generated/final-proposals/train.png',
  ])(
    'reads safe local input %s without changing aspect ratio',
    async (value) => {
      const result = await loadReferenceImage(value);
      expect(await sharp(result).metadata()).toMatchObject({
        format: 'png',
        width: 2048,
        height: 256,
      });
    },
  );
  it.each(['png', 'jpeg', 'webp'] as const)(
    'validates and converts data %s',
    async (format) => {
      const source = await sharp(png).toFormat(format).toBuffer();
      const result = await loadReferenceImage(
        `data:image/${format};base64,${source.toString('base64')}`,
      );
      expect((await sharp(result).metadata()).format).toBe('png');
    },
  );
  it.each([
    '/images/../outside.png',
    '/images/%2e%2e/outside.png',
    'http://localhost:3001/images/../outside.png',
    '/images/escape.png',
    '/etc/passwd',
    'file:///etc/passwd',
    'http://user:pass@localhost:3001/images/train.png',
    'http://localhost:3000/images/train.png',
    'https://example.com/train.png',
    '//example.com/x',
    '/images/%252e%252e/outside.png',
    '/images/no.png',
    'data:image/png;base64,bm90LWltYWdl',
    'data:image/svg+xml;base64,PHN2Zy8+',
    '/images/train.png?token=secret',
  ])('rejects unsafe or invalid input %s', async (value) => {
    await expect(loadReferenceImage(value)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('rejects data exceeding the input byte limit before decoding', async () => {
    await expect(
      loadReferenceImage(
        `data:image/png;base64,${'A'.repeat(28 * 1024 * 1024)}`,
      ),
    ).rejects.toThrow('20 MB');
  });
  it('rejects pixel bombs', async () => {
    const source = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(
      loadReferenceImage(`data:image/png;base64,${source.toString('base64')}`),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('maps an explicitly configured public asset origin locally without fetching', async () => {
    const previous = process.env.PUBLIC_ASSET_BASE_URL;
    process.env.PUBLIC_ASSET_BASE_URL = 'https://assets.example.com';
    try {
      expect(
        (
          await sharp(
            await loadReferenceImage(
              'https://assets.example.com/images/train.png',
            ),
          ).metadata()
        ).width,
      ).toBe(2048);
      await expect(
        loadReferenceImage(
          'https://assets.example.com.evil.test/images/train.png',
        ),
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_ASSET_BASE_URL;
      else process.env.PUBLIC_ASSET_BASE_URL = previous;
    }
  });
});
