import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhancePrompt, parseEnhancement } from './promptEnhancement';

const response = {
  originalPrompt: '龙纹', contextMode: 'metadata-only', ruleVersion: '1', model: 'test', maxPromptLength: 575, warnings: [],
  directions: ['preserve', 'explore'].map(id => ({ id, title: id, prompt: '整理龙纹', retained: ['龙'], changes: [], checks: [] })),
};
afterEach(() => vi.unstubAllGlobals());
describe('prompt enhancement contract', () => {
  it('sends only allowed metadata, credentials and cancellation, never image URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...response, originalPrompt: ' 龙纹 ' }) }); vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const reference = { id: '1', name: '龙纹', imageUrl: 'data:image/png;base64,PRIVATE', src: 'PRIVATE', motifs: ['龙'] };
    await enhancePrompt({ prompt: ' 龙纹 ', references: [reference] }, signal);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/super-canvas/enhance-prompt'); expect(init.credentials).toBe('include'); expect(init.signal).toBe(signal);
    expect(init.body).not.toContain('PRIVATE'); expect(JSON.parse(init.body).prompt).toBe(' 龙纹 ');
  });
  it('rejects changed originals, duplicate directions and oversized candidate text', () => {
    expect(() => parseEnhancement({ ...response, originalPrompt: '凤' }, '龙纹')).toThrow();
    expect(() => parseEnhancement({ ...response, directions: [response.directions[0], response.directions[0]] }, '龙纹')).toThrow();
    expect(() => parseEnhancement({ ...response, directions: response.directions.map(d => ({ ...d, prompt: '长'.repeat(576) })) }, '龙纹')).toThrow();
  });
  it('surfaces safe server errors and malformed results without fabricated suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: '请先登录' }) }));
    await expect(enhancePrompt({ prompt: '龙纹', references: [] }, new AbortController().signal)).rejects.toThrow('请先登录');
    expect(() => parseEnhancement(null, '龙纹')).toThrow();
  });
});
