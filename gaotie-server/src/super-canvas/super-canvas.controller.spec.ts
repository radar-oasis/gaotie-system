import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppModule } from '../app.module';
import { SuperCanvasController } from './super-canvas.controller';
import {
  LOCAL_REFERENCE_PUBLIC_BASE_ERROR,
  SuperCanvasService,
} from './super-canvas.service';

describe('SuperCanvasModule wiring', () => {
  it('compiles the AppModule with the SuperCanvasService provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(SuperCanvasService)).toBeInstanceOf(
      SuperCanvasService,
    );

    await moduleRef.close();
  });
});

describe('SuperCanvasController', () => {
  const service = {
    generateTransparentAsset: jest.fn(),
  } as unknown as jest.Mocked<SuperCanvasService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an empty prompt', async () => {
    const controller = new SuperCanvasController(service);

    await expect(controller.generate({ prompt: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a missing request body', async () => {
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate(undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a null request body', async () => {
    const controller = new SuperCanvasController(service);

    await expect(controller.generate(null as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-string reference image URL', async () => {
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 123,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-string entries in reference image URL arrays', async () => {
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrls: ['https://assets.example.com/a.png', 123],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid reference image URL', async () => {
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 'file:///tmp/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates valid generation requests to the service', async () => {
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
      referenceImageUrl: 'http://localhost:3000/images/a.png',
    });
  });

  it('delegates valid https reference image URLs to the service', async () => {
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await controller.generate({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/images/a.png',
    });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/images/a.png',
    });
  });

  it('delegates multiple valid reference image URLs to the service', async () => {
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await controller.generate({
      prompt: '生成长城纹样',
      referenceImageUrls: [
        'https://assets.example.com/images/a.png',
        'http://localhost:3000/images/b.png',
      ],
    });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
      referenceImageUrls: [
        'https://assets.example.com/images/a.png',
        'http://localhost:3000/images/b.png',
      ],
    });
  });

  it('delegates valid data image reference requests to the service', async () => {
    const referenceImageUrl = `data:image/png;base64,${Buffer.from(
      'reference-image',
    ).toString('base64')}`;
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl,
      }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
      referenceImageUrl,
    });
  });

  it('trims prompts before delegating', async () => {
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await controller.generate({ prompt: '  生成长城纹样  ' });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
    });
  });

  it('returns a service-unavailable error when Jimeng credentials are missing', async () => {
    service.generateTransparentAsset.mockRejectedValue(
      new Error(
        'Missing Jimeng credentials: set JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY',
      ),
    );
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({ prompt: '生成长城纹样' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      controller.generate({ prompt: '生成长城纹样' }),
    ).rejects.toThrow(
      'Missing Jimeng credentials: set JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY',
    );
  });

  it('returns a bad-request error when local references need a public backend URL', async () => {
    service.generateTransparentAsset.mockRejectedValue(
      new Error(LOCAL_REFERENCE_PUBLIC_BASE_ERROR),
    );
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).rejects.toThrow(LOCAL_REFERENCE_PUBLIC_BASE_ERROR);
  });
});

describe('SuperCanvasService', () => {
  it.each([undefined, '240000', 'invalid'])('keeps generation timeout independent from downloads (%s)', async configured => {
    process.env.SUPER_CANVAS_IMAGE_PROVIDER = 'ark';
    process.env.ARK_API_KEY = 'test';
    if (configured === undefined) delete process.env.SUPER_CANVAS_GENERATION_TIMEOUT_MS;
    else process.env.SUPER_CANVAS_GENERATION_TIMEOUT_MS = configured;
    const openAiGenerator = jest.fn().mockRejectedValue(new Error('stop before billing'));
    const service = SuperCanvasService.createForTest({ openAiGenerator, downloadTimeoutMs: 50 });
    await expect(service.generateTransparentAsset({ prompt: '龙纹' })).rejects.toThrow('stop before billing');
    expect(openAiGenerator).toHaveBeenCalledWith(expect.objectContaining({ requestTimeoutMs: configured === '240000' ? 240000 : 180000 }));
  });
  it('sends current-port local Ark assets inline without a public tunnel', async () => {
    const old = { ...process.env };
    process.env.PORT = '3001';
    process.env.SUPER_CANVAS_IMAGE_PROVIDER = 'ark';
    process.env.ARK_API_KEY = 'test';
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => Uint8Array.from(Buffer.from('reference')).buffer });
    const openAiGenerator = jest.fn().mockRejectedValue(new Error('provider reached'));
    const service = SuperCanvasService.createForTest({ fetchImpl, openAiGenerator, publicAssetBaseUrl: 'http://localhost:3000' });
    try {
      await expect(service.generateTransparentAsset({ prompt: '龙纹', referenceImageUrl: 'http://127.0.0.1:3001/images/a.png' })).rejects.toThrow('provider reached');
      expect(openAiGenerator).toHaveBeenCalledWith(expect.objectContaining({ imageUrls: ['data:image/png;base64,cmVmZXJlbmNl'], generationImageField: true }));
      expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:3001/images/a.png', expect.objectContaining({ redirect: 'error' }));
    } finally { process.env = old; }
  });
  it.each(['http://127.0.0.1:3002/images/a.png', 'http://127.0.0.1:3001/auth/me', 'http://127.0.0.2:3001/images/a.png'])('does not allow unrelated local Ark URLs: %s', async url => {
    process.env.PORT = '3001'; process.env.SUPER_CANVAS_IMAGE_PROVIDER = 'ark';
    const fetchImpl = jest.fn();
    const service = SuperCanvasService.createForTest({ fetchImpl });
    await expect(service.generateTransparentAsset({ prompt: '龙纹', referenceImageUrl: url })).rejects.toThrow('Reference image URL host is not allowed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  const previousEnv = { ...process.env };
  let outputDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = { ...previousEnv };
    outputDir = await mkdtemp(join(tmpdir(), 'super-canvas-'));
  });

  afterEach(async () => {
    process.env = previousEnv;
    await rm(outputDir, { force: true, recursive: true });
  });

  it('throws a clear error when Jimeng credentials are missing', async () => {
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    const service = new SuperCanvasService();

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).rejects.toThrow(
      'Missing Jimeng credentials: set JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY',
    );
  });

  it('uses Ark-compatible image generation when configured', async () => {
    process.env.SUPER_CANVAS_IMAGE_PROVIDER = 'ark';
    process.env.ARK_API_KEY = 'test-ark-key';
    process.env.SUPER_CANVAS_ARK_BASE_URL =
      'https://ark.cn-beijing.volces.com/api/v3';
    process.env.SUPER_CANVAS_ARK_MODEL = 'doubao-seedream-5-0-260128';
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    const openAiGenerator = jest.fn().mockResolvedValue({
      taskId: 'ark-super-canvas-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('ark-source-image').toString('base64'),
        },
      ],
    });
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator: () => 'asset-test.png',
      openAiGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/asset-test.png',
      taskId: 'ark-super-canvas-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(openAiGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-ark-key',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seedream-5-0-260128',
        prompt: '生成长城纹样',
        promptContext: 'transparent-asset',
        requestMode: 'auto',
        includeOptionalImageParameters: false,
      }),
    );
    expect(transparentizer).toHaveBeenCalledWith(
      Buffer.from('ark-source-image'),
    );
  });

  it('passes multiple selected image references to Ark-compatible generation', async () => {
    process.env.SUPER_CANVAS_IMAGE_PROVIDER = 'ark';
    process.env.ARK_API_KEY = 'test-ark-key';
    process.env.SUPER_CANVAS_ARK_BASE_URL =
      'https://ark.cn-beijing.volces.com/api/v3';
    process.env.SUPER_CANVAS_ARK_MODEL = 'doubao-seedream-5-0-260128';
    delete process.env.SUPER_CANVAS_OPENAI_IMAGE_REQUEST_MODE;
    delete process.env.JIMENG_ACCESS_KEY_ID;
    delete process.env.JIMENG_SECRET_ACCESS_KEY;
    const openAiGenerator = jest.fn().mockResolvedValue({
      taskId: 'ark-super-canvas-multi',
      images: [
        {
          type: 'base64',
          value: Buffer.from('ark-source-image').toString('base64'),
        },
      ],
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator: () => 'asset-test.png',
      openAiGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('processed-png'),
        confidence: 'high',
        transparentPixelRatio: 0.4,
      }),
    });

    await service.generateTransparentAsset({
      prompt: '融合两张纹样',
      referenceImageUrls: [
        'https://cdn.example.com/source-a.png',
        'https://cdn.example.com/source-b.png',
      ],
    });

    expect(openAiGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://cdn.example.com/source-a.png',
          'https://cdn.example.com/source-b.png',
        ],
        requestMode: 'auto',
      }),
    );
  });

  it('fetches local reference URLs and sends Jimeng a public generated URL', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [{ type: 'url', value: 'https://example.com/source.png' }],
    });
    const referenceBuffer = Buffer.from('reference-image');
    const sourceBuffer = Buffer.from('source-image');
    const referenceArrayBuffer = Uint8Array.from(referenceBuffer).buffer;
    const sourceArrayBuffer = Uint8Array.from(sourceBuffer).buffer;
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => referenceArrayBuffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => sourceArrayBuffer,
      });
    const processedBuffer = Buffer.from('processed-png');
    const filenameGenerator = jest
      .fn()
      .mockReturnValueOnce('reference-test.jpg')
      .mockReturnValueOnce('asset-test.png');
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: processedBuffer,
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator,
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/asset-test.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '生成长城纹样',
        imageUrls: [
          'https://assets.example.com/generated/super-canvas/reference-test.png',
        ],
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/images/a.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/source.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(transparentizer).toHaveBeenCalledWith(sourceBuffer);
    await expect(
      readFile(join(outputDir, 'reference-test.png')),
    ).resolves.toEqual(referenceBuffer);
    await expect(readFile(join(outputDir, 'asset-test.png'))).resolves.toEqual(
      processedBuffer,
    );
  });

  it('passes public reference URLs through unchanged', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const fetchImpl = jest.fn();
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator: () => 'asset-test.png',
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://backend.example.com',
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/source.png',
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ['https://assets.example.com/source.png'],
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes public reference URLs through unchanged when the public asset base is local', async () => {
    delete process.env.SUPER_CANVAS_PUBLIC_BASE_URL;
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const fetchImpl = jest.fn();
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator: () => 'asset-test.png',
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/source.png',
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ['https://assets.example.com/source.png'],
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes configured Jimeng polling limits to the image generator', async () => {
    const originalMaxPolls = process.env.SUPER_CANVAS_JIMENG_MAX_POLLS;
    const originalPollDelay = process.env.SUPER_CANVAS_JIMENG_POLL_DELAY_MS;
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    process.env.SUPER_CANVAS_JIMENG_MAX_POLLS = '120';
    process.env.SUPER_CANVAS_JIMENG_POLL_DELAY_MS = '1500';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator: () => 'asset-test.png',
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    try {
      await service.generateTransparentAsset({ prompt: '融合多张纹样' });

      expect(jimengGenerator).toHaveBeenCalledWith(
        expect.objectContaining({
          maxPolls: 120,
          pollDelayMs: 1500,
        }),
      );
    } finally {
      if (originalMaxPolls === undefined) {
        delete process.env.SUPER_CANVAS_JIMENG_MAX_POLLS;
      } else {
        process.env.SUPER_CANVAS_JIMENG_MAX_POLLS = originalMaxPolls;
      }

      if (originalPollDelay === undefined) {
        delete process.env.SUPER_CANVAS_JIMENG_POLL_DELAY_MS;
      } else {
        process.env.SUPER_CANVAS_JIMENG_POLL_DELAY_MS = originalPollDelay;
      }
    }
  });

  it('passes public reference URLs through unchanged when the public asset base is malformed', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const fetchImpl = jest.fn();
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator: () => 'asset-test.png',
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'not-a-url',
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/source.png',
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ['https://assets.example.com/source.png'],
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects data image references when the public asset base is local before calling Jimeng', async () => {
    delete process.env.SUPER_CANVAS_PUBLIC_BASE_URL;
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn();
    const filenameGenerator = jest.fn(() => 'asset-test.png');
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      filenameGenerator,
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: `data:image/png;base64,${Buffer.from(
          'reference-image',
        ).toString('base64')}`,
      }),
    ).rejects.toThrow(
      'SUPER_CANVAS_PUBLIC_BASE_URL must be a public http(s) URL to use local reference images',
    );

    expect(filenameGenerator).not.toHaveBeenCalled();
    expect(jimengGenerator).not.toHaveBeenCalled();
    expect(transparentizer).not.toHaveBeenCalled();
  });

  it('rejects localhost reference URLs when the public asset base is local before calling Jimeng or fetch', async () => {
    delete process.env.SUPER_CANVAS_PUBLIC_BASE_URL;
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const fetchImpl = jest.fn();
    const jimengGenerator = jest.fn();
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).rejects.toThrow(
      'SUPER_CANVAS_PUBLIC_BASE_URL must be a public http(s) URL to use local reference images',
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(jimengGenerator).not.toHaveBeenCalled();
    expect(transparentizer).not.toHaveBeenCalled();
  });

  it.each(['http://localhost.:3000', 'http://foo.localhost:3000'])(
    'rejects data image references when the public asset base is %s before calling Jimeng',
    async (publicAssetBaseUrl) => {
      process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
      process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
      const jimengGenerator = jest.fn();
      const filenameGenerator = jest.fn(() => 'asset-test.png');
      const transparentizer = jest.fn();
      const service = SuperCanvasService.createForTest({
        filenameGenerator,
        jimengGenerator,
        outputDir,
        publicAssetBaseUrl,
        transparentizer,
      });

      await expect(
        service.generateTransparentAsset({
          prompt: '生成长城纹样',
          referenceImageUrl: `data:image/png;base64,${Buffer.from(
            'reference-image',
          ).toString('base64')}`,
        }),
      ).rejects.toThrow(
        'SUPER_CANVAS_PUBLIC_BASE_URL must be a public http(s) URL to use local reference images',
      );

      expect(filenameGenerator).not.toHaveBeenCalled();
      expect(jimengGenerator).not.toHaveBeenCalled();
      expect(transparentizer).not.toHaveBeenCalled();
    },
  );

  it.each(['http://localhost.:3000', 'http://foo.localhost:3000'])(
    'rejects local reference URLs when the public asset base is %s before calling Jimeng or fetch',
    async (publicAssetBaseUrl) => {
      process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
      process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
      const fetchImpl = jest.fn();
      const jimengGenerator = jest.fn();
      const transparentizer = jest.fn();
      const service = SuperCanvasService.createForTest({
        fetchImpl,
        jimengGenerator,
        outputDir,
        publicAssetBaseUrl,
        transparentizer,
      });

      await expect(
        service.generateTransparentAsset({
          prompt: '生成长城纹样',
          referenceImageUrl: '/images/a.png',
        }),
      ).rejects.toThrow(
        'SUPER_CANVAS_PUBLIC_BASE_URL must be a public http(s) URL to use local reference images',
      );

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(jimengGenerator).not.toHaveBeenCalled();
      expect(transparentizer).not.toHaveBeenCalled();
    },
  );

  it('fetches own public asset references before sending them to Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const referenceBuffer = Buffer.from('reference-image');
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'image/webp' : null),
      },
      arrayBuffer: async () => Uint8Array.from(referenceBuffer).buffer,
    });
    const filenameGenerator = jest
      .fn()
      .mockReturnValueOnce('reference-test.png')
      .mockReturnValueOnce('asset-test.png');
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator,
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl: 'https://assets.example.com/images/source.png',
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://assets.example.com/generated/super-canvas/reference-test.webp',
        ],
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assets.example.com/images/source.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await expect(
      readFile(join(outputDir, 'reference-test.webp')),
    ).resolves.toEqual(referenceBuffer);
  });

  it('rejects private reference URLs before calling Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn();
    const fetchImpl = jest.fn();
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://192.168.1.10/a.png',
      }),
    ).rejects.toThrow('Reference image URL host is not allowed');

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(jimengGenerator).not.toHaveBeenCalled();
    expect(transparentizer).not.toHaveBeenCalled();
  });

  it.each([
    'http://[::ffff:192.168.1.10]/a.png',
    'http://[::ffff:127.0.0.1]/a.png',
    'http://[::ffff:c0a8:10a]/a.png',
  ])(
    'rejects IPv4-mapped IPv6 private reference URL %s before calling Jimeng',
    async (referenceImageUrl) => {
      process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
      process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
      const jimengGenerator = jest.fn();
      const fetchImpl = jest.fn();
      const transparentizer = jest.fn();
      const service = SuperCanvasService.createForTest({
        fetchImpl,
        jimengGenerator,
        outputDir,
        transparentizer,
      });

      await expect(
        service.generateTransparentAsset({
          prompt: '生成长城纹样',
          referenceImageUrl,
        }),
      ).rejects.toThrow('Reference image URL host is not allowed');

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(jimengGenerator).not.toHaveBeenCalled();
      expect(transparentizer).not.toHaveBeenCalled();
    },
  );

  it('rejects downloaded reference URLs that exceed the byte limit before calling Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '6' },
      arrayBuffer: async () => Uint8Array.from(Buffer.from('source')).buffer,
    });
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      jimengGenerator,
      maxDownloadBytes: 5,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).rejects.toThrow('Reference image exceeds 5 bytes');

    expect(jimengGenerator).not.toHaveBeenCalled();
    expect(transparentizer).not.toHaveBeenCalled();
  });

  it('uses the first base64 image without fetching', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const sourceBuffer = Buffer.from('source-image');
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [{ type: 'base64', value: sourceBuffer.toString('base64') }],
    });
    const fetchImpl = jest.fn();
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'low',
      transparentPixelRatio: 0,
    });
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      filenameGenerator: () => 'asset-test.png',
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).resolves.toMatchObject({
      taskId: 'task-1',
      confidence: 'low',
      transparentPixelRatio: 0,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(transparentizer).toHaveBeenCalledWith(sourceBuffer);
  });

  it('converts a data image reference to an absolute public URL for Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const referenceBuffer = Buffer.from('reference-image');
    const finalBuffer = Buffer.from('final-image');
    const referenceImageUrl = `data:image/png;base64,${referenceBuffer.toString(
      'base64',
    )}`;
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [{ type: 'base64', value: finalBuffer.toString('base64') }],
    });
    const filenameGenerator = jest
      .fn()
      .mockReturnValueOnce('../reference-name.jpg')
      .mockReturnValueOnce('asset-test.png');
    const processedBuffer = Buffer.from('processed-png');
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: processedBuffer,
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator,
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl,
      }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/asset-test.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '生成长城纹样',
        imageUrls: [
          'https://assets.example.com/generated/super-canvas/reference-name.png',
        ],
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
      }),
    );
    await expect(
      readFile(join(outputDir, 'reference-name.png')),
    ).resolves.toEqual(referenceBuffer);
    await expect(readFile(join(outputDir, 'asset-test.png'))).resolves.toEqual(
      processedBuffer,
    );
  });

  it('converts a mixed-case WEBP data image reference for Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const referenceBuffer = Buffer.from('reference-image');
    const finalBuffer = Buffer.from('final-image');
    const referenceImageUrl = `DaTa:ImAgE/WEBP;BaSe64,${referenceBuffer.toString(
      'base64',
    )}`;
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [{ type: 'base64', value: finalBuffer.toString('base64') }],
    });
    const filenameGenerator = jest
      .fn()
      .mockReturnValueOnce('reference-name.png')
      .mockReturnValueOnce('asset-test.png');
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator,
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl,
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://assets.example.com/generated/super-canvas/reference-name.webp',
        ],
      }),
    );
    await expect(
      readFile(join(outputDir, 'reference-name.webp')),
    ).resolves.toEqual(referenceBuffer);
  });

  it('converts a JPEG data image reference for Jimeng', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const referenceBuffer = Buffer.from('reference-image');
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('final-image').toString('base64'),
        },
      ],
    });
    const filenameGenerator = jest
      .fn()
      .mockReturnValueOnce('reference-name.webp')
      .mockReturnValueOnce('asset-test.png');
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator,
      jimengGenerator,
      outputDir,
      publicAssetBaseUrl: 'https://assets.example.com',
      transparentizer,
    });

    await service.generateTransparentAsset({
      prompt: '生成长城纹样',
      referenceImageUrl: `data:image/jpeg;base64,${referenceBuffer.toString(
        'base64',
      )}`,
    });

    expect(jimengGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://assets.example.com/generated/super-canvas/reference-name.jpg',
        ],
      }),
    );
    await expect(
      readFile(join(outputDir, 'reference-name.jpg')),
    ).resolves.toEqual(referenceBuffer);
  });

  it('rejects data image references that exceed the byte limit', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn();
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      jimengGenerator,
      maxDownloadBytes: 5,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({
        prompt: '生成长城纹样',
        referenceImageUrl: `data:image/webp;base64,${Buffer.from(
          'reference-image',
        ).toString('base64')}`,
      }),
    ).rejects.toThrow('Reference image exceeds 5 bytes');

    expect(jimengGenerator).not.toHaveBeenCalled();
    expect(transparentizer).not.toHaveBeenCalled();
  });

  it('rejects generated base64 images that exceed the byte limit', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('generated-image').toString('base64'),
        },
      ],
    });
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      jimengGenerator,
      maxDownloadBytes: 5,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).rejects.toThrow('Generated image exceeds 5 bytes');

    expect(transparentizer).not.toHaveBeenCalled();
  });

  it('rejects generated image downloads that exceed the byte limit', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [{ type: 'url', value: 'https://example.com/source.png' }],
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => '6' },
      arrayBuffer: async () => Uint8Array.from(Buffer.from('source')).buffer,
    });
    const transparentizer = jest.fn();
    const service = SuperCanvasService.createForTest({
      fetchImpl,
      jimengGenerator,
      maxDownloadBytes: 5,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).rejects.toThrow('Generated image exceeds 5 bytes');

    expect(transparentizer).not.toHaveBeenCalled();
  });

  it('constrains generated filenames to their basename', async () => {
    process.env.JIMENG_ACCESS_KEY_ID = 'AKTEST';
    process.env.JIMENG_SECRET_ACCESS_KEY = 'SKTEST';
    const jimengGenerator = jest.fn().mockResolvedValue({
      taskId: 'task-1',
      images: [
        {
          type: 'base64',
          value: Buffer.from('source-image').toString('base64'),
        },
      ],
    });
    const transparentizer = jest.fn().mockResolvedValue({
      buffer: Buffer.from('processed-png'),
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const service = SuperCanvasService.createForTest({
      filenameGenerator: () => '../asset-test.png',
      jimengGenerator,
      outputDir,
      transparentizer,
    });

    await expect(
      service.generateTransparentAsset({ prompt: '生成长城纹样' }),
    ).resolves.toMatchObject({
      imageUrl: '/generated/super-canvas/asset-test.png',
    });

    await expect(readFile(join(outputDir, 'asset-test.png'))).resolves.toEqual(
      Buffer.from('processed-png'),
    );
  });
});
