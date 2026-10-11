import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { FinalProposalsRepository } from './final-proposals.repository';
import { FinalProposalsService } from './final-proposals.service';
import { PromptComposerService } from './prompt-composer.service';
import { FinalDesignPackage } from './final-proposals.types';

const designPackage: FinalDesignPackage = {
  demandTags: [{ label: '冰雪蓝', topic: '色彩' }],
  selectedPatterns: [
    {
      id: 'pattern-1',
      name: '雪花',
      imageUrl: 'https://assets.example.com/pattern-1.png',
    },
    {
      id: 'pattern-2',
      name: '冰晶',
      imageUrl: 'https://assets.example.com/pattern-2.png',
    },
  ],
  selectedCases: [
    {
      id: 'case-1',
      title: 'CR400BF',
      image: 'https://assets.example.com/case-1.png',
    },
  ],
  layoutScheme: {
    id: 'layout-1',
    name: '方案1',
    componentsMap: {
      车窗带: 'A2',
      车门: 'C1',
    },
  },
  colorScheme: {
    id: 'color-1',
    name: '红色车窗带',
    regions: [
      {
        id: 'region-window-band',
        name: '车窗带',
        color: '#d5492a',
        category: '车窗带',
        componentId: 'A2',
      },
    ],
  },
  canvasAssets: [
    {
      id: 'capture-1',
      name: '截取素材',
      imageUrl: 'https://assets.example.com/capture-1.png',
      source: 'capture',
    },
  ],
};

function createService() {
  return new FinalProposalsService(
    new PromptComposerService(),
    new FinalProposalsRepository(),
  );
}

describe('FinalProposalsService', () => {
  it('preserves later case references instead of truncating after six', () => {
    const service = createService();

    const urls = service.selectReferenceImageUrls({
      designPackage,
      baseImageUrl: 'https://assets.example.com/base.png',
      selectedReferenceImageUrls: [
        'https://assets.example.com/manual-1.png',
        'https://assets.example.com/manual-2.png',
        'https://assets.example.com/manual-3.png',
      ],
    });

    expect(urls).toEqual([
      'https://assets.example.com/base.png',
      'https://assets.example.com/manual-1.png',
      'https://assets.example.com/manual-2.png',
      'https://assets.example.com/manual-3.png',
      '/layout-elements/%E8%BD%A6%E7%AA%97%E5%B8%A6/A2.png',
      '/layout-elements/%E8%BD%A6%E9%97%A8/C1.png',
      'https://assets.example.com/case-1.png',
    ]);
  });

  it('rejects excess legacy references instead of silently truncating', () => {
    expect(()=>createService().selectReferenceImageUrls({designPackage,selectedReferenceImageUrls:Array.from({length:13},(_,i)=>`https://assets.example.com/${i}.png`)})).toThrow('12');
  });

  it('adds canvas captures, layout element images, and selected case images as references', () => {
    const service = createService();

    const urls = service.selectReferenceImageUrls({ designPackage });

    expect(urls).toEqual([
      'https://assets.example.com/capture-1.png',
      '/layout-elements/%E8%BD%A6%E7%AA%97%E5%B8%A6/A2.png',
      '/layout-elements/%E8%BD%A6%E9%97%A8/C1.png',
      'https://assets.example.com/case-1.png',
    ]);
  });

  it('uses generated colorized layout references instead of raw layout references', () => {
    const service = createService();

    const urls = service.selectReferenceImageUrls({
      designPackage,
      selectedReferenceImageUrls: ['https://assets.example.com/canvas.png'],
      generatedLayoutReferenceImageUrls: [
        'https://assets.example.com/generated/colorized-layout-a2.png',
      ],
      generatedReferenceImageUrls: [
        'https://assets.example.com/generated/color-reference.png',
      ],
    });

    expect(urls).toEqual([
      'https://assets.example.com/canvas.png',
      'https://assets.example.com/generated/colorized-layout-a2.png',
      'https://assets.example.com/generated/color-reference.png',
      'https://assets.example.com/case-1.png',
    ]);
  });

  it('does not add motif images but normalizes local selected case images', () => {
    const service = createService();

    const urls = service.selectReferenceImageUrls({
      designPackage: {
        ...designPackage,
        selectedPatterns: [
          {
            id: 'pattern-local',
            name: '本地纹样',
            imageUrl: '样本图片/local-pattern.png',
          },
        ],
        selectedCases: [
          {
            id: 'case-local',
            title: '本地案例',
            image: '样本图片/L68.png',
          },
        ],
        layoutScheme: undefined,
        colorScheme: undefined,
      },
      selectedReferenceImageUrls: ['data:image/png;base64,Y2FwdHVyZQ=='],
    });

    expect(urls).toEqual([
      'data:image/png;base64,Y2FwdHVyZQ==',
      '/sample-images/L68.png',
    ]);
  });

  it('optimizes local layout references before sending public URLs to the image provider', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const service = createService() as unknown as {
      outputDir: string;
      publicAssetBaseUrl: string;
      resolveReferenceImage: (imageUrl: string) => Promise<string>;
    };

    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      const resolvedUrl = await service.resolveReferenceImage(
        '/layout-elements/%E8%BD%A6%E7%AA%97%E5%B8%A6/A2.png',
      );
      const [filename] = await readdir(outputDir);
      const optimized = await readFile(join(outputDir, filename));
      const metadata = await sharp(optimized).metadata();

      expect(resolvedUrl).toMatch(
        /^https:\/\/assets\.example\.com\/generated\/final-proposals\/final-reference-/,
      );
      expect(metadata.width).toBeLessThanOrEqual(1280);
      expect(metadata.height).toBeLessThanOrEqual(720);
      expect(optimized.byteLength).toBeLessThan(1_000_000);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('creates colorized layout reference images from the selected color scheme', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const service = createService() as unknown as {
      outputDir: string;
      publicAssetBaseUrl: string;
      writeColorizedLayoutReferenceImages: (
        designPackage: FinalDesignPackage,
      ) => Promise<string[]>;
    };

    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      const urls =
        await service.writeColorizedLayoutReferenceImages(designPackage);
      const [filename] = await readdir(outputDir);
      const generated = await readFile(join(outputDir, filename));
      const sample = await sharp(generated)
        .resize({ width: 320 })
        .raw()
        .ensureAlpha()
        .extract({ left: 140, top: 54, width: 1, height: 1 })
        .toBuffer();

      expect(urls).toHaveLength(1);
      expect(urls[0]).toMatch(
        /^https:\/\/assets\.example\.com\/generated\/final-proposals\/final-reference-/,
      );
      expect(sample[0]).toBeGreaterThan(160);
      expect(sample[1]).toBeLessThan(120);
      expect(sample[2]).toBeLessThan(100);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects empty design packages for generation', async () => {
    const service = createService();

    await expect(
      service.generate({
        designPackage: {
          demandTags: [],
          selectedPatterns: [],
          selectedCases: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates final proposals with OpenAI gpt-image-2 low quality', async () => {
    const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    const originalProvider = process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
    const originalJimengAccessKey = process.env.JIMENG_ACCESS_KEY_ID;
    const originalJimengSecretKey = process.env.JIMENG_SECRET_ACCESS_KEY;
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const openAiGenerator = jest.fn().mockResolvedValue({
      taskId: 'openai-task-1',
      requestId: 'req-openai-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('generated-final-proposal').toString('base64'),
        },
      ],
    });
    const service = createService() as unknown as {
      openAiGenerator: typeof openAiGenerator;
      outputDir: string;
      publicAssetBaseUrl: string;
    };

    process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    service.openAiGenerator = openAiGenerator;
    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      const proposal = await (
        service as unknown as FinalProposalsService
      ).generate({
        designPackage,
        selectedReferenceImageUrls: ['https://assets.example.com/canvas.png'],
      });

      expect(proposal.imageUrl).toMatch(
        /^\/generated\/final-proposals\/final-proposal-/,
      );
      expect(proposal.taskId).toBe('openai-task-1');
      expect(openAiGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-openai-key',
          baseUrl: undefined,
          imageUrls: expect.arrayContaining([
            'https://assets.example.com/canvas.png',
            'https://assets.example.com/case-1.png',
          ]),
          model: 'gpt-image-2',
          quality: 'low',
          size: '1536x1024',
          outputFormat: 'png',
          background: 'opaque',
        }),
      );
      const [filename] = await readdir(outputDir);
      const generated = await readFile(join(outputDir, filename));

      expect(generated.toString()).toBe('generated-final-proposal');
    } finally {
      if (originalOpenAiApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiApiKey;
      }

      if (originalProvider === undefined) {
        delete process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
      } else {
        process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = originalProvider;
      }

      if (originalJimengAccessKey === undefined) {
        delete process.env.JIMENG_ACCESS_KEY_ID;
      } else {
        process.env.JIMENG_ACCESS_KEY_ID = originalJimengAccessKey;
      }

      if (originalJimengSecretKey === undefined) {
        delete process.env.JIMENG_SECRET_ACCESS_KEY;
      } else {
        process.env.JIMENG_SECRET_ACCESS_KEY = originalJimengSecretKey;
      }

      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('uses Ark-compatible image generation env aliases for final proposals', async () => {
    const originalEnv = { ...process.env };
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const openAiGenerator = jest.fn().mockResolvedValue({
      taskId: 'ark-task-1',
      requestId: 'req-ark-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('ark-final-proposal').toString('base64'),
        },
      ],
    });
    const service = createService() as unknown as {
      openAiGenerator: typeof openAiGenerator;
      outputDir: string;
      publicAssetBaseUrl: string;
    };

    process.env = {
      ...originalEnv,
      FINAL_PROPOSAL_IMAGE_PROVIDER: 'ark',
      ARK_API_KEY: 'test-ark-key',
      FINAL_PROPOSAL_ARK_BASE_URL:
        'https://ark.cn-beijing.volces.com/api/v3',
      FINAL_PROPOSAL_ARK_MODEL: 'doubao-seedream-5-0-260128',
      FINAL_PROPOSAL_OPENAI_IMAGE_REQUEST_MODE: 'auto',
      FINAL_PROPOSAL_OPENAI_INCLUDE_OPTIONAL_PARAMS: 'false',
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    service.openAiGenerator = openAiGenerator;
    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      const proposal = await (
        service as unknown as FinalProposalsService
      ).generate({
        designPackage,
        selectedReferenceImageUrls: ['https://assets.example.com/canvas.png'],
      });

      expect(proposal.taskId).toBe('ark-task-1');
      expect(openAiGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-ark-key',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          model: 'doubao-seedream-5-0-260128',
          requestMode: 'auto',
          generationImageField: true,
          includeOptionalImageParameters: false,
          promptContext: 'final-proposal',
        }),
      );
      const [filename] = await readdir(outputDir);
      const generated = await readFile(join(outputDir, filename));

      expect(generated.toString()).toBe('ark-final-proposal');
    } finally {
      process.env = originalEnv;
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('passes multiple prompt images to Ark-compatible final proposal generation', async () => {
    const originalEnv = { ...process.env };
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const openAiGenerator = jest.fn().mockResolvedValue({
      taskId: 'ark-final-multi',
      requestId: 'req-ark-multi',
      images: [
        {
          type: 'base64',
          value: Buffer.from('ark-final-proposal').toString('base64'),
        },
      ],
    });
    const service = createService() as unknown as {
      openAiGenerator: typeof openAiGenerator;
      outputDir: string;
      publicAssetBaseUrl: string;
    };

    process.env = {
      ...originalEnv,
      FINAL_PROPOSAL_IMAGE_PROVIDER: 'ark',
      ARK_API_KEY: 'test-ark-key',
      FINAL_PROPOSAL_ARK_BASE_URL:
        'https://ark.cn-beijing.volces.com/api/v3',
      FINAL_PROPOSAL_ARK_MODEL: 'doubao-seedream-5-0-260128',
      FINAL_PROPOSAL_OPENAI_IMAGE_REQUEST_MODE: 'auto',
      FINAL_PROPOSAL_OPENAI_INCLUDE_OPTIONAL_PARAMS: 'false',
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    service.openAiGenerator = openAiGenerator;
    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      await (service as unknown as FinalProposalsService).generate({
        designPackage: {
          demandTags: [{ label: '邮轮涂装', topic: '主题' }],
          selectedPatterns: [],
          selectedCases: [],
        },
        selectedReferenceImageUrls: [
          'https://cdn.example.com/prompt-a.png',
          'https://cdn.example.com/prompt-b.png',
        ],
      });

      expect(openAiGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrls: [
            'https://cdn.example.com/prompt-a.png',
            'https://cdn.example.com/prompt-b.png',
          ],
          requestMode: 'auto',
          promptContext: 'final-proposal',
        }),
      );
    } finally {
      process.env = originalEnv;
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('uses Jimeng for final proposals when the image provider is configured for deployment', async () => {
    const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    const originalProvider = process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
    const originalJimengAccessKey = process.env.JIMENG_ACCESS_KEY_ID;
    const originalJimengSecretKey = process.env.JIMENG_SECRET_ACCESS_KEY;
    const originalJimengMaxPolls = process.env.FINAL_PROPOSAL_JIMENG_MAX_POLLS;
    const originalJimengPollDelay =
      process.env.FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS;
    const outputDir = await mkdtemp(join(tmpdir(), 'final-proposals-'));
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'jimeng-task-1',
      requestId: 'req-jimeng-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('jimeng-final-proposal').toString('base64'),
        },
      ],
    });

    process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = 'jimeng';
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    process.env.FINAL_PROPOSAL_JIMENG_MAX_POLLS = '120';
    process.env.FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS = '1000';
    const service = createService() as unknown as {
      jimengGenerator: typeof jimengGenerator;
      outputDir: string;
      publicAssetBaseUrl: string;
    };

    delete process.env.OPENAI_API_KEY;
    service.jimengGenerator = jimengGenerator;
    service.outputDir = outputDir;
    service.publicAssetBaseUrl = 'https://assets.example.com';

    try {
      const proposal = await (
        service as unknown as FinalProposalsService
      ).generate({
        designPackage,
        selectedReferenceImageUrls: ['https://assets.example.com/canvas.png'],
      });

      expect(proposal.taskId).toBe('jimeng-task-1');
      expect(jimengGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('高铁'),
          imageUrls: expect.arrayContaining([
            'https://assets.example.com/canvas.png',
            'https://assets.example.com/case-1.png',
          ]),
          accessKeyId: 'AKTEST',
          secretAccessKey: 'SKTEST',
          promptContext: 'final-proposal',
          maxPolls: 120,
          pollDelayMs: 1000,
        }),
      );
      const [filename] = await readdir(outputDir);
      const generated = await readFile(join(outputDir, filename));

      expect(generated.toString()).toBe('jimeng-final-proposal');
    } finally {
      if (originalOpenAiApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiApiKey;
      }

      if (originalProvider === undefined) {
        delete process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
      } else {
        process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = originalProvider;
      }

      if (originalJimengAccessKey === undefined) {
        delete process.env.JIMENG_ACCESS_KEY_ID;
      } else {
        process.env.JIMENG_ACCESS_KEY_ID = originalJimengAccessKey;
      }

      if (originalJimengSecretKey === undefined) {
        delete process.env.JIMENG_SECRET_ACCESS_KEY;
      } else {
        process.env.JIMENG_SECRET_ACCESS_KEY = originalJimengSecretKey;
      }

      if (originalJimengMaxPolls === undefined) {
        delete process.env.FINAL_PROPOSAL_JIMENG_MAX_POLLS;
      } else {
        process.env.FINAL_PROPOSAL_JIMENG_MAX_POLLS = originalJimengMaxPolls;
      }

      if (originalJimengPollDelay === undefined) {
        delete process.env.FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS;
      } else {
        process.env.FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS =
          originalJimengPollDelay;
      }

      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('archives, lists, retrieves, and deletes proposals', () => {
    const service = createService();

    const archived = service.archive({
      name: '冰雪蓝方案 V1',
      version: 1,
      imageUrl: '/generated/final-proposals/a.png',
      promptUsed: '生成高铁方案',
      designRationale: '采用冰雪蓝主色与雪花纹样',
      packageSnapshot: designPackage,
    });

    expect(service.list()).toHaveLength(1);
    expect(service.get(archived.id)).toMatchObject({
      name: '冰雪蓝方案 V1',
      imageUrl: '/generated/final-proposals/a.png',
    });

    service.remove(archived.id);

    expect(service.list()).toEqual([]);
  });
});
