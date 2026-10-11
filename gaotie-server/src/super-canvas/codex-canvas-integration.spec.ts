jest.mock('../codex-image/codex-image-client', () => ({
  generateCodexImage: jest.fn(),
}));
jest.mock('../image-reference/load-reference-image', () => ({
  loadReferenceImage: jest.fn(),
}));
import { generateCodexImage } from '../codex-image/codex-image-client';
import { loadReferenceImage } from '../image-reference/load-reference-image';
import { SuperCanvasService } from './super-canvas.service';
import { mkdtemp, rm, readFile } from 'fs/promises';
import sharp from 'sharp';
import { tmpdir } from 'os';
import { join } from 'path';
it('reports real processing and exposes only the public prompt trace after success', async () => {
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  const root = await mkdtemp(join(tmpdir(), 'gaotie-canvas-progress-'));
  process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true';
  try {
    const generated = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const stages: string[] = [];
    jest.mocked(loadReferenceImage).mockImplementation(async () => {
      expect(stages).toEqual(['preparing']);
      return Buffer.from('reference');
    });
    jest.mocked(generateCodexImage).mockImplementation(async (input: any) => {
      expect(input.analyzeMotif).toBe(false);
      expect(input.prompt).toBe('简化');
      input.onProgress?.('optimizing');
      input.onProgress?.('generating');
      return { taskId: 'codex', images: [{ type: 'base64', value: generated.toString('base64') }],
        promptTrace: { originalPrompt: '简化', optimizedPrompt: '保留姿态', mode: 'detail', observations: ['private'], generationPrompt: 'private system instructions' } };
    });
    const service = SuperCanvasService.createForTest({ outputDir: join(root, 'images') });
    const result = await service.generateTransparentAsset({ prompt: '简化', referenceImageUrls: ['http://localhost/a.png'] }, {
      onProgress: (stage: string) => stages.push(stage),
    } as any);
    expect(stages).toEqual(['preparing', 'optimizing', 'generating', 'processing']);
    expect((result as any).promptTrace).toEqual({ originalPrompt: '简化', optimizedPrompt: '保留姿态', mode: 'detail' });
    expect(JSON.stringify(result)).not.toContain('private');
  } finally {
    if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = old;
    await rm(root, { recursive: true, force: true });
  }
});
it.each([0, 128, 255])('preserves Codex image bytes without background removal (alpha=%s)', async (alpha) => {
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  const dir = await mkdtemp(join(tmpdir(), 'gaotie-canvas-test-'));
  process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true';
  try {
    const generated = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: alpha / 255 } } }).png().toBuffer();
    jest.mocked(loadReferenceImage).mockResolvedValue(Buffer.from('reference'));
    jest
      .mocked(generateCodexImage)
      .mockResolvedValue({
        taskId: 'codex',
        images: [
          {
            type: 'base64',
            value: generated.toString('base64'),
          },
        ],
      });
    const transparentizer = jest.fn(async () => ({
      buffer: Buffer.from('transparent'),
      confidence: 'high' as const,
      transparentPixelRatio: 0.5,
    }));
    const service = SuperCanvasService.createForTest({
      outputDir: dir,
      transparentizer,
    });
    const request = service.generateTransparentAsset({
      prompt: '流线化',
      referenceImageUrls: ['http://127.0.0.1:3001/images/a.png'],
    });
    if (alpha === 0) {
      await expect(request).rejects.toThrow('全透明');
    } else {
      const result = await request;
      expect(result.taskId).toBe('codex');
      expect(await readFile(join(dir, result.imageUrl.split('/').pop()!))).toEqual(generated);
      expect(result.confidence).toBe(alpha === 255 ? 'low' : 'high');
    }
    expect(transparentizer).not.toHaveBeenCalled();
    expect(
      jest.mocked(generateCodexImage).mock.calls[0][0].referenceImages,
    ).toEqual([Buffer.from('reference')]);
  } finally {
    if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = old;
    await rm(dir, { recursive: true, force: true });
  }
});
