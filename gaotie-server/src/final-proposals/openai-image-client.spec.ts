import {
  buildOpenAiFinalProposalPrompt,
  buildOpenAiImagePrompt,
  generateOpenAiImage,
} from './openai-image-client';

const pngBytes = Buffer.from('reference-image');
const generatedBase64 = Buffer.from('generated-image').toString('base64');

function createJsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)).buffer,
  };
}

function createImageResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'image/png' : null,
    },
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () =>
      pngBytes.buffer.slice(
        pngBytes.byteOffset,
        pngBytes.byteOffset + pngBytes.byteLength,
      ),
  };
}

describe('openai-image-client', () => {
  it('includes reference images in explicitly enabled generation JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(createJsonResponse({ data: [{ b64_json: generatedBase64 }] }));
    await generateOpenAiImage({ apiKey: 'test', prompt: '龙纹', requestMode: 'generations', imageUrls: ['data:image/png;base64,YQ=='], generationImageField: true, fetchImpl } as Parameters<typeof generateOpenAiImage>[0]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).image).toEqual(['data:image/png;base64,YQ==']);
  });
  it('rejects transparent motif overflow and respects requested line art', () => {
    expect(() =>
      buildOpenAiImagePrompt('龙'.repeat(801), {
        promptContext: 'transparent-asset',
      }),
    ).toThrow(/prompt/i);
    const prompt = buildOpenAiImagePrompt('黑白线稿', {
      promptContext: 'transparent-asset',
    });
    expect(prompt).toContain('黑白线稿');
    expect(prompt).not.toContain('filled graphic');
    expect(prompt).not.toContain('not an outline-only');
  });
  it('calls image edits with gpt-image-2 low quality and reference image files', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createImageResponse())
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            created: 1778832000,
            data: [{ b64_json: generatedBase64 }],
          },
          { 'x-request-id': 'req-openai-1' },
        ),
      );

    const result = await generateOpenAiImage({
      apiKey: 'test-openai-key',
      prompt: '生成高铁涂装',
      imageUrls: ['https://assets.example.com/reference.png'],
      model: 'gpt-image-2',
      quality: 'low',
      size: '1536x1024',
      outputFormat: 'png',
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(result).toEqual({
      taskId: 'openai-1778832000',
      requestId: 'req-openai-1',
      images: [{ type: 'base64', value: generatedBase64 }],
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://assets.example.com/reference.png',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-openai-key' },
      }),
    );

    const requestBody = fetchImpl.mock.calls[1][1].body as FormData;
    expect(requestBody.get('model')).toBe('gpt-image-2');
    expect(requestBody.get('quality')).toBe('low');
    expect(requestBody.get('size')).toBe('1536x1024');
    expect(requestBody.get('output_format')).toBe('png');
    expect(requestBody.getAll('image[]')).toHaveLength(1);
  });

  it('calls image generations when no reference images are provided', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      createJsonResponse({
        created: 1778832001,
        data: [{ b64_json: generatedBase64 }],
      }),
    );

    await generateOpenAiImage({
      apiKey: 'test-openai-key',
      prompt: '生成高铁涂装',
      imageUrls: [],
      model: 'gpt-image-2',
      quality: 'low',
      size: '1536x1024',
      outputFormat: 'png',
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-openai-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      model: 'gpt-image-2',
      quality: 'low',
      size: '1536x1024',
      output_format: 'png',
    });
  });

  it('uses a custom OpenAI-compatible base URL when configured', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      createJsonResponse({
        created: 1778832002,
        data: [{ b64_json: generatedBase64 }],
      }),
    );

    await generateOpenAiImage({
      apiKey: 'test-spatialai-key',
      baseUrl: 'https://spatialai.vip/v1',
      prompt: '生成高铁涂装',
      imageUrls: [],
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://spatialai.vip/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-spatialai-key',
        }),
      }),
    );
  });

  it('normalizes a custom base URL without the trailing /v1 segment', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      createJsonResponse({
        created: 1778832003,
        data: [{ b64_json: generatedBase64 }],
      }),
    );

    await generateOpenAiImage({
      apiKey: 'test-spatialai-key',
      baseUrl: 'https://spatialai.vip',
      prompt: '生成高铁涂装',
      imageUrls: [],
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://spatialai.vip/v1/images/generations',
    );
  });

  it('uses Ark api/v3 image generations without OpenAI-only optional fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      createJsonResponse({
        created: 1778832004,
        data: [{ b64_json: generatedBase64 }],
      }),
    );

    await generateOpenAiImage({
      apiKey: 'test-ark-key',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      prompt: '生成长城纹样',
      imageUrls: ['https://assets.example.com/reference.png'],
      model: 'doubao-seedream-5-0-260128',
      requestMode: 'generations',
      includeOptionalImageParameters: false,
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-ark-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      model: 'doubao-seedream-5-0-260128',
      prompt: expect.stringContaining('生成长城纹样'),
    });
  });

  it('uses Ark api/v3 image edits with multiple reference images in auto mode', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(createImageResponse())
      .mockResolvedValueOnce(createImageResponse())
      .mockResolvedValueOnce(
        createJsonResponse({
          created: 1778832005,
          data: [{ b64_json: generatedBase64 }],
        }),
      );

    await generateOpenAiImage({
      apiKey: 'test-ark-key',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      prompt: '融合两张纹样',
      imageUrls: [
        'https://assets.example.com/reference-1.png',
        'https://assets.example.com/reference-2.png',
      ],
      model: 'doubao-seedream-5-0-260128',
      requestMode: 'auto',
      includeOptionalImageParameters: false,
      fetchImpl,
      requestTimeoutMs: 1000,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://ark.cn-beijing.volces.com/api/v3/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-ark-key' },
      }),
    );

    const requestBody = fetchImpl.mock.calls[2][1].body as FormData;
    expect(requestBody.get('model')).toBe('doubao-seedream-5-0-260128');
    expect(requestBody.get('prompt')).toEqual(
      expect.stringContaining('融合两张纹样'),
    );
    expect(requestBody.getAll('image[]')).toHaveLength(2);
    expect(requestBody.get('quality')).toBeNull();
    expect(requestBody.get('size')).toBeNull();
    expect(requestBody.get('output_format')).toBeNull();
  });

  it('can build transparent asset prompts without train-livery constraints', () => {
    const prompt = buildOpenAiImagePrompt('生成长城纹样', {
      promptContext: 'transparent-asset',
    });

    expect(prompt).toContain('生成长城纹样');
    expect(prompt).toContain('single clean motif');
    expect(prompt).not.toContain('side-view high-speed train livery');
  });

  it('adds final train livery constraints to the prompt', () => {
    const prompt = buildOpenAiFinalProposalPrompt('车窗带使用红色');

    expect(prompt).toContain('车窗带使用红色');
    expect(prompt).toContain('side-view high-speed train livery');
    expect(prompt).toContain('Do not render labels such as A1, A2');
  });
});
