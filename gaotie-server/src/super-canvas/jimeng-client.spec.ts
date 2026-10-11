import {
  buildJimengPrompt,
  generateJimengImage,
  parseJimengImages,
} from './jimeng-client';

describe('parseJimengImages', () => {
  it('parses returned image URLs', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: { status: 'done', image_urls: ['https://example.com/a.png'] },
        message: 'Success',
      }),
    ).toEqual([{ type: 'url', value: 'https://example.com/a.png' }]);
  });

  it('parses returned base64 images', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: { status: 'done', binary_data_base64: ['abc'] },
        message: 'Success',
      }),
    ).toEqual([{ type: 'base64', value: 'abc' }]);
  });

  it('ignores empty and whitespace image entries', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: {
          status: 'done',
          image_urls: ['', '   ', 'https://example.com/a.png'],
          binary_data_base64: ['\t', 'abc'],
        },
        message: 'Success',
      }),
    ).toEqual([
      { type: 'url', value: 'https://example.com/a.png' },
      { type: 'base64', value: 'abc' },
    ]);
  });

  it('returns no images before the task is done', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: {
          status: 'generating',
          image_urls: ['https://example.com/a.png'],
        },
        message: 'Success',
      }),
    ).toEqual([]);
  });
});

describe('buildJimengPrompt', () => {
  it('adds plain-background constraints for post-processing', () => {
    const prompt = buildJimengPrompt('生成京张长城纹样');

    expect(prompt).toContain('生成京张长城纹样');
    expect(prompt).toContain('single clean motif');
    expect(prompt).toContain('standalone flat motif');
    expect(prompt).not.toContain('filled graphic');
    expect(prompt).not.toContain('not an outline-only');
    expect(prompt.length).toBeLessThanOrEqual(800);
  });

  it('rejects overbudget prompts without silently truncating user instructions', () => {
    expect(() => buildJimengPrompt('龙'.repeat(900))).toThrow(/prompt/i);
  });

  it('uses train livery constraints for final proposal prompts', () => {
    const prompt = buildJimengPrompt('生成整车侧视涂装方案', {
      promptContext: 'final-proposal',
    });

    expect(prompt).toContain('生成整车侧视涂装方案');
    expect(prompt).toContain('side-view high-speed train livery design');
    expect(prompt).toContain(
      'layout, color, motif placement, and case placement',
    );
    expect(prompt).not.toContain('single clean motif');
    expect(prompt.length).toBeLessThanOrEqual(1200);
  });
});

describe('generateJimengImage', () => {
  it('submits a task and polls until an image URL is available', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
          request_id: 'submit-request',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'generating' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: {
            status: 'done',
            image_urls: ['https://example.com/result.png'],
          },
          message: 'Success',
          request_id: 'result-request',
        }),
      });

    const result = await generateJimengImage({
      prompt: '生成龙纹',
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      fetchImpl,
      pollDelayMs: 0,
      maxPolls: 3,
    });

    expect(result).toEqual({
      taskId: 'task-1',
      requestId: 'result-request',
      images: [{ type: 'url', value: 'https://example.com/result.png' }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const [submitUrl, submitInit] = fetchImpl.mock.calls[0];
    expect(submitUrl).toContain('Action=CVSync2AsyncSubmitTask');
    expect(submitUrl).toContain('Version=2022-08-31');
    expect(JSON.parse(submitInit.body)).toMatchObject({
      req_key: 'jimeng_t2i_v40',
      force_single: true,
      return_url: true,
      prompt: expect.stringContaining('生成龙纹'),
    });

    const [pollUrl, pollInit] = fetchImpl.mock.calls[1];
    expect(pollUrl).toContain('Action=CVSync2AsyncGetResult');
    expect(pollUrl).toContain('Version=2022-08-31');
    expect(JSON.parse(pollInit.body)).toEqual({
      req_key: 'jimeng_t2i_v40',
      task_id: 'task-1',
      req_json: JSON.stringify({ return_url: true }),
    });
  });

  it('includes optional image URLs in the submit body', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'done', binary_data_base64: ['abc'] },
          message: 'Success',
        }),
      });

    await generateJimengImage({
      prompt: '生成龙纹',
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      imageUrls: ['https://example.com/input.png'],
      fetchImpl,
      pollDelayMs: 0,
      maxPolls: 1,
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      image_urls: ['https://example.com/input.png'],
    });
  });

  it('submits final proposal prompts with train livery constraints', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'done', binary_data_base64: ['abc'] },
          message: 'Success',
        }),
      });

    await generateJimengImage({
      prompt: '生成整车侧视涂装方案',
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      promptContext: 'final-proposal',
      fetchImpl,
      pollDelayMs: 0,
      maxPolls: 1,
    });

    const submitBody = JSON.parse(fetchImpl.mock.calls[0][1].body);

    expect(submitBody.prompt).toContain(
      'side-view high-speed train livery design',
    );
    expect(submitBody.prompt).not.toContain('single clean motif');
  });

  it('throws when the API returns a non-success code', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 50400,
        message: 'Invalid parameter',
      }),
    });

    await expect(
      generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
      }),
    ).rejects.toThrow('Jimeng API error 50400: Invalid parameter');
  });

  it('throws when submit succeeds without a task id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 10000,
        data: {},
        message: 'Success',
      }),
    });

    await expect(
      generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
      }),
    ).rejects.toThrow('Jimeng submit response missing task_id');
  });

  it('throws when the task completes without images', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'done' },
          message: 'Success',
        }),
      });

    await expect(
      generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
      }),
    ).rejects.toThrow('Jimeng task task-1 completed without images');
  });

  it.each(['expired', 'not_found'])(
    'throws when the task status is %s',
    async (status) => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 10000,
            data: { task_id: 'task-1' },
            message: 'Success',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            code: 10000,
            data: { status },
            message: 'Success',
          }),
        });

      await expect(
        generateJimengImage({
          prompt: '生成龙纹',
          accessKeyId: 'AKTEST',
          secretAccessKey: 'SKTEST',
          fetchImpl,
          pollDelayMs: 0,
          maxPolls: 1,
        }),
      ).rejects.toThrow(`Jimeng task task-1 ${status}`);
    },
  );

  it('throws when polling times out', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'generating' },
          message: 'Success',
        }),
      });

    await expect(
      generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 2,
      }),
    ).rejects.toThrow('Jimeng task task-1 timed out after 2 polls');
  });

  it('throws on non-ok HTTP responses', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'upstream unavailable',
    });

    await expect(
      generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
      }),
    ).rejects.toThrow(
      'Jimeng HTTP error 502 Bad Gateway: upstream unavailable',
    );
  });

  it('throws when the submit request times out', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(() => new Promise<never>(() => undefined));

    try {
      const result = generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
        requestTimeoutMs: 10,
      });
      const assertion = expect(result).rejects.toThrow(
        'Jimeng request CVSync2AsyncSubmitTask timed out after 10ms',
      );

      await jest.advanceTimersByTimeAsync(10);
      await assertion;
      expect(fetchImpl.mock.calls[0][1].signal).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws when a poll request times out', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockImplementationOnce(() => new Promise<never>(() => undefined));

    try {
      const result = generateJimengImage({
        prompt: '生成龙纹',
        accessKeyId: 'AKTEST',
        secretAccessKey: 'SKTEST',
        fetchImpl,
        pollDelayMs: 0,
        maxPolls: 1,
        requestTimeoutMs: 10,
      });
      const assertion = expect(result).rejects.toThrow(
        'Jimeng request CVSync2AsyncGetResult timed out after 10ms',
      );

      await jest.advanceTimersByTimeAsync(10);
      await assertion;
      expect(fetchImpl.mock.calls[1][1].signal).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
