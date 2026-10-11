import { afterEach, describe, expect, it, vi } from 'vitest';

const importApi = async (apiBaseUrl = 'http://api.test/') => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./superCanvasApi');
};

describe('generateTransparentAsset', () => {
  it('reads split progress lines and exposes the optimized prompt only in the result', async () => {
    const trace = { originalPrompt: '龙', optimizedPrompt: '保留龙纹轮廓', mode: 'detail' };
    const payload = [
      { type: 'progress', stage: 'optimizing' },
      { type: 'progress', stage: 'generating' },
      { type: 'result', result: { imageUrl: '/a.png', taskId: '1', promptTrace: trace } },
    ].map(item => JSON.stringify(item)).join('\n');
    const bytes = new TextEncoder().encode(payload);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
      controller.close();
    } }), { headers: { 'content-type': 'application/x-ndjson' } })));
    const { generateTransparentAsset } = await importApi();
    const onProgress = vi.fn();
    const result = await generateTransparentAsset({ prompt: '龙' }, { onProgress });
    expect(onProgress.mock.calls.map(call => call[0])).toEqual(['optimizing', 'generating']);
    expect(result.promptTrace).toEqual(trace);
  });

  it('does not treat interrupted streams as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"type":"progress","stage":"generating"}\n', { headers: { 'content-type': 'application/x-ndjson' } })));
    const { generateTransparentAsset } = await importApi();
    await expect(generateTransparentAsset({ prompt: '龙' }, { onProgress: vi.fn() })).rejects.toThrow('生成连接中断');
  });
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
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'transparent dragon pattern',
          referenceImageUrl: 'https://example.com/ref.png',
        }),
      },
    );
  });

  it('posts multiple reference image URLs when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        imageUrl: '/generated/super-canvas/a.png',
        taskId: 'task-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { generateTransparentAsset } = await importApi();

    await generateTransparentAsset({
      prompt: 'transparent dragon pattern',
      referenceImageUrls: [
        'https://example.com/ref-1.png',
        'https://example.com/ref-2.png',
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/super-canvas/generate',
      expect.objectContaining({
        body: JSON.stringify({
          prompt: 'transparent dragon pattern',
          referenceImageUrls: [
            'https://example.com/ref-1.png',
            'https://example.com/ref-2.png',
          ],
        }),
      }),
    );
  });

  it('passes an abort signal to the generation request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        imageUrl: '/generated/super-canvas/a.png',
        taskId: 'task-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { generateTransparentAsset } = await importApi();
    const controller = new AbortController();

    await generateTransparentAsset(
      {
        prompt: 'transparent dragon pattern',
      },
      { signal: controller.signal },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/super-canvas/generate',
      expect.objectContaining({
        signal: controller.signal,
      }),
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
