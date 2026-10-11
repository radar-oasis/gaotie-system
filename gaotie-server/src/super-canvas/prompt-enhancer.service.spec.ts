import { PromptEnhancerService } from './prompt-enhancer.service';
import { TRANSPARENT_ASSET_PROMPT_BODY_LIMIT } from './motif-prompt';

const candidate = () => ({
  directions: [
    {
      id: 'preserve',
      title: '保留调整',
      prompt: '保留龙纹轮廓，仅整理重复间距',
      retained: ['龙纹轮廓'],
      changes: ['重复间距'],
    },
    {
      id: 'explore',
      title: '探索变化',
      prompt: '保留龙纹轮廓，探索疏密节奏',
      retained: ['龙纹轮廓'],
      changes: ['疏密节奏'],
    },
  ],
});
describe('PromptEnhancerService', () => {
  let service: PromptEnhancerService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    process.env.PROMPT_ENHANCER_API_KEY = 'unit-test-key';
    service = new PromptEnhancerService();
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(candidate()) } }],
        }),
      ),
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    delete process.env.PROMPT_ENHANCER_API_KEY;
  });
  it('returns two validated directions and preserves exact original; sends metadata text only', async () => {
    const original = '  保留龙纹轮廓，不改变黑白线稿  ';
    const result = await service.enhance({
      prompt: original,
      references: [{ id: 'r1', name: '龙纹', motifs: ['龙'] }],
    });
    expect(result.originalPrompt).toBe(original);
    expect(result.contextMode).toBe('metadata-only');
    expect(result.maxPromptLength).toBe(TRANSPARENT_ASSET_PROMPT_BODY_LIMIT);
    expect(result.directions.map((d) => d.id)).toEqual(['preserve', 'explore']);
    expect(
      result.directions[0].checks.some((c) => c.label.includes('程序')),
    ).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(
      body.messages.every(
        (m: { content: unknown }) => typeof m.content === 'string',
      ),
    ).toBe(true);
    expect(body.messages[1].content).toContain('龙纹');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('converts feeling into optional shape changes while protecting recognizability', async () => {
    await service.enhance({ prompt: '保留龙纹，增加速度感和流线型' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.messages[0].content).toContain('统一走势、渐收、横向延展');
    expect(body.messages[0].content).toContain('不要默认运动模糊');
    expect(body.messages[0].content).toContain('纹样可识别性');
  });
  it('preserves selected reference order and warns explicitly about unassigned roles', async () => {
    const references = [
      { id: 'b', name: '云纹' },
      { id: 'a', name: '龙纹' },
    ];
    const result = await service.enhance({ prompt: '增加流线型', references });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(JSON.parse(body.messages[1].content).references).toEqual(references);
    expect(body.messages[0].content).toContain('不代表主次或融合关系');
    expect(
      result.warnings.some((warning) =>
        warning.includes('如原文未指定各参考角色'),
      ),
    ).toBe(true);
    expect(
      result.warnings.some((warning) => warning.includes('不默认融合')),
    ).toBe(true);
  });
  it.each([
    null,
    {},
    { prompt: '' },
    { prompt: 'x'.repeat(2001) },
    { prompt: 'x', references: Array(9).fill({ id: '1', name: 'r' }) },
    {
      prompt: 'x',
      references: [
        { id: '1', name: 'r', imageUrl: 'https://example.com/x.png' },
      ],
    },
    {
      prompt: 'x',
      references: [{ id: '1', name: 'r', motifs: ['a'.repeat(161)] }],
    },
  ])('rejects malformed or overlong input %j', async (input) => {
    await expect(service.enhance(input)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    'not json',
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        uncertainties: 'invalid',
      })),
    }),
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        uncertainties: Array(7).fill('待确认'),
      })),
    }),
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        uncertainties: ['字'.repeat(161)],
      })),
    }),
    JSON.stringify({ directions: [] }),
    JSON.stringify({
      directions: [candidate().directions[0], candidate().directions[0]],
    }),
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        prompt: '相同文字',
      })),
    }),
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        changes: 'invalid',
      })),
    }),
    JSON.stringify({
      directions: candidate().directions.map((d) => ({
        ...d,
        prompt: 'x'.repeat(801),
      })),
    }),
  ])('sanitizes malformed provider output', async (content) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content } }] })),
    );
    await expect(
      service.enhance({ prompt: '龙纹', references: [] }),
    ).rejects.toMatchObject({
      status: 502,
      message: '提示词增强服务返回无效内容，请重试',
    });
  });
  it('maps candidate-specific uncertainties to warnings without model pass claims', async () => {
    const risk = '横向延展的程度需确认，以免改变原文要求保留的龙纹轮廓';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  directions: candidate().directions.map((d) => ({
                    ...d,
                    uncertainties: [risk],
                  })),
                }),
              },
            },
          ],
        }),
      ),
    );
    const result = await service.enhance({ prompt: '保持轮廓，增强流线型' });
    expect(result.directions[0].checks).toContainEqual({
      label: '模型建议 · 本次待确认',
      status: 'warning',
      detail: risk,
    });
  });
  it('accepts omitted or empty uncertainties for provider compatibility', async () => {
    const data = candidate();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  directions: [
                    data.directions[0],
                    { ...data.directions[1], uncertainties: [] },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );
    const result = await service.enhance({ prompt: '龙纹' });
    expect(
      result.directions.every((d) =>
        d.checks.every((c) => c.label !== '模型建议 · 本次待确认'),
      ),
    ).toBe(true);
  });
  it('fails clearly without credentials', async () => {
    delete process.env.PROMPT_ENHANCER_API_KEY;
    const old = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      await expect(
        service.enhance({ prompt: '龙纹', references: [] }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      if (old) process.env.DEEPSEEK_API_KEY = old;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('ignores provider attempts to replace original and fabricate successful checks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...candidate(),
                  originalPrompt: '恶意替换',
                  warnings: [],
                  directions: candidate().directions.map((d) => ({
                    ...d,
                    checks: [
                      {
                        label: '图像效果优秀',
                        status: 'pass',
                        detail: '已验证图片',
                      },
                    ],
                  })),
                }),
              },
            },
          ],
        }),
      ),
    );
    const result = await service.enhance({ prompt: '  原始硬约束  ' });
    expect(result.originalPrompt).toBe('  原始硬约束  ');
    expect(JSON.stringify(result.directions)).not.toContain('图像效果优秀');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('rejects an oversized upstream response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(64001)));
    await expect(service.enhance({ prompt: '龙纹' })).rejects.toMatchObject({
      status: 502,
    });
  });
  it('does not return provider HTTP error details', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('secret-provider-body', { status: 401 }),
    );
    await expect(service.enhance({ prompt: '龙纹' })).rejects.toMatchObject({
      status: 502,
      message: '提示词增强服务暂时不可用，请重试',
    });
  });
  it('sanitizes upstream failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('secret-provider-internals'));
    await expect(
      service.enhance({ prompt: '龙纹', references: [] }),
    ).rejects.toMatchObject({
      status: 502,
      message: '提示词增强服务暂时不可用，请重试',
    });
  });
  it('times out at 30 seconds even if provider ignores abort', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = service.enhance({ prompt: '龙纹', references: [] });
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await jest.advanceTimersByTimeAsync(30000);
    await assertion;
  });
  it('bounds simultaneous model calls', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = [
      service.enhance({ prompt: 'a' }),
      service.enhance({ prompt: 'b' }),
    ];
    const settled = Promise.allSettled(pending);
    await expect(service.enhance({ prompt: 'c' })).rejects.toMatchObject({
      status: 429,
    });
    await jest.advanceTimersByTimeAsync(30000);
    await settled;
  });
});
