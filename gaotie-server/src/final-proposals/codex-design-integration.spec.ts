jest.mock('../codex-image/codex-image-client', () => ({
  generateCodexImage: jest.fn(),
}));
jest.mock('../image-reference/load-reference-image', () => ({
  loadReferenceImage: jest.fn(),
}));
import { generateCodexImage } from '../codex-image/codex-image-client';
import { loadReferenceImage } from '../image-reference/load-reference-image';
import { FinalProposalsService } from './final-proposals.service';
import { PromptComposerService } from './prompt-composer.service';
import { FinalProposalsRepository } from './final-proposals.repository';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';

describe('Codex final design package integration', () => {
  let dir: string;
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true';
    dir = await mkdtemp(join(tmpdir(), 'gaotie-final-test-'));
  });
  afterEach(async () => {
    if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = old;
    await rm(dir, { recursive: true, force: true });
  });
  const pkg = {
    demandTags: [],
    selectedPatterns: [],
    selectedCases: [
      {
        id: 'c',
        title: 'case',
        image: '/case.png',
        userDescription: '仅参考金色线条',
      },
    ],
    canvasAssets: [
      {
        id: 'a',
        name: 'capture',
        source: 'capture' as const,
        imageUrl: '/capture.png',
      },
    ],
    layoutScheme: { id: 'l', name: 'A2', componentsMap: { 车窗带: 'A2' } },
  };
  it('sends every actual buffer in manifest order and writes the returned image without transparentizing', async () => {
    jest
      .mocked(loadReferenceImage)
      .mockImplementation(async (url) => Buffer.from(url));
    jest
      .mocked(generateCodexImage)
      .mockResolvedValue({
        taskId: 'codex-turn',
        images: [
          {
            type: 'base64',
            value: Buffer.from('opaque-image').toString('base64'),
          },
        ],
      });
    const service = new FinalProposalsService(
      new PromptComposerService(),
      new FinalProposalsRepository(),
    );
    (service as any).outputDir = dir;
    const result = await service.generate({ designPackage: pkg });
    expect(jest.mocked(generateCodexImage)).toHaveBeenCalledTimes(1);
    const call = jest.mocked(generateCodexImage).mock.calls[0][0];
    expect(call.referenceImages.map((b) => b.toString())).toEqual([
      '/capture.png',
      '/layout-elements/%E8%BD%A6%E7%AA%97%E5%B8%A6/A2.png',
      '/case.png',
    ]);
    expect(call.prompt).toContain('参考图 3');
    expect(call.prompt).toContain('仅参考金色线条');
    expect(call.prompt).not.toContain('A2');
    expect(result.taskId).toBe('codex-turn');
    expect((result as any).referenceManifest).toHaveLength(3);
    expect(
      (await readFile(join(dir, basename(result.imageUrl)))).toString(),
    ).toBe('opaque-image');
  });
  it('never generates with a partial package when a layout fails loading', async () => {
    jest.mocked(loadReferenceImage).mockImplementation(async (url) => {
      if (url.includes('layout')) throw new Error('missing');
      return Buffer.from('ok');
    });
    const service = new FinalProposalsService(
      new PromptComposerService(),
      new FinalProposalsRepository(),
    );
    await expect(service.generate({ designPackage: pkg })).rejects.toThrow(
      '车窗带',
    );
    expect(generateCodexImage).not.toHaveBeenCalled();
  });
});
