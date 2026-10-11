import { buildJimengPrompt } from './jimeng-client';
import { buildOpenAiImagePrompt } from '../final-proposals/openai-image-client';
import { TRANSPARENT_ASSET_PROMPT_BODY_LIMIT } from './motif-prompt';

describe('shared transparent motif adapter budget', () => {
  for (const [name, build] of [
    ['jimeng', (prompt: string) => buildJimengPrompt(prompt)],
    [
      'openai',
      (prompt: string) =>
        buildOpenAiImagePrompt(prompt, { promptContext: 'transparent-asset' }),
    ],
  ] as const) {
    it(`${name} preserves every character at the exact boundary and rejects one over`, () => {
      const prompt =
        '龙'.repeat(TRANSPARENT_ASSET_PROMPT_BODY_LIMIT - 4) + '保留线稿';
      const result = build(prompt);
      expect(result).toHaveLength(800);
      expect(result.startsWith(prompt + '\n\n')).toBe(true);
      expect(() => build(prompt + '字')).toThrow(/prompt/);
    });
  }
  it('leaves the existing final-proposal truncation contracts intact', () => {
    expect(
      buildJimengPrompt('龙'.repeat(2000), { promptContext: 'final-proposal' }),
    ).toHaveLength(1200);
    expect(
      buildOpenAiImagePrompt('龙'.repeat(33000), {
        promptContext: 'final-proposal',
      }),
    ).toHaveLength(32000);
  });
});
