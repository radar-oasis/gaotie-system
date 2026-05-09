import { afterEach, describe, expect, it, vi } from 'vitest';

const importApi = async (apiBaseUrl = 'http://api.test/') => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./superCanvasApi');
};

describe('generateTransparentAsset', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts JSON to the super canvas generation endpoint and returns a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        imageUrl: '/generated/super-canvas/a.png',
        taskId: 'task-1',
        confidence: 'high',
        transparentPixelRatio: 0.82,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { generateTransparentAsset } = await importApi();

    await expect(
      generateTransparentAsset({
        prompt: 'transparent dragon pattern',
        referenceImageUrl: 'https://example.com/ref.png',
      }),
    ).resolves.toEqual({
      imageUrl: '/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.82,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/super-canvas/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'transparent dragon pattern',
          referenceImageUrl: 'https://example.com/ref.png',
        }),
      },
    );
  });

  it('throws the backend message when generation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({ message: '提示词不能为空' }),
      }),
    );
    const { generateTransparentAsset } = await importApi();

    await expect(generateTransparentAsset({ prompt: '' })).rejects.toThrow(
      '提示词不能为空',
    );
  });

  it('throws a status fallback when an error body cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('not json')),
      }),
    );
    const { generateTransparentAsset } = await importApi();

    await expect(generateTransparentAsset({ prompt: 'asset' })).rejects.toThrow(
      '生成失败：500',
    );
  });

  it('rejects successful responses that are missing required image fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ imageUrl: '/generated/a.png' }),
      }),
    );
    const { generateTransparentAsset } = await importApi();

    await expect(generateTransparentAsset({ prompt: 'asset' })).rejects.toThrow(
      '生成接口返回缺少图片信息',
    );
  });

  it('defaults confidence and transparent ratio when optional fields are invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          imageUrl: '/generated/a.png',
          taskId: 'task-2',
          confidence: 'medium',
          transparentPixelRatio: '0.5',
        }),
      }),
    );
    const { generateTransparentAsset } = await importApi(
      'http://api.with-slash.test///',
    );

    await expect(generateTransparentAsset({ prompt: 'asset' })).resolves.toEqual(
      {
        imageUrl: '/generated/a.png',
        taskId: 'task-2',
        confidence: 'low',
        transparentPixelRatio: 0,
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://api.with-slash.test/super-canvas/generate',
      expect.any(Object),
    );
  });
});
