import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { runCodexChat } from './codex-chat';
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const input = {
  message: '红白配色',
  context: [],
  history: [],
  mode: 'palette' as const,
  candidateColors: ['#FFFFFF', '#AA2222'],
};
const answer = (proportion = 30) => ({
  reply: '建议红白配色',
  images: [],
  palette: {
    name: '红白',
    rationale: '以白为底',
    colors: [
      { hex: '#FFFFFF', role: '底色', proportion: 70 },
      { hex: '#AA2222', role: '点缀', proportion },
    ],
  },
});
function mockRuns(replies: unknown[], events: object[] = []) {
  const schemas: any[] = [],
    prompts: string[] = [],
    paths: string[] = [];
  (spawn as jest.Mock).mockImplementation((_binary, args: string[]) => {
    const path = args[args.indexOf('--output-schema') + 1];
    paths.push(path);
    schemas.push(JSON.parse(readFileSync(path, 'utf8')));
    const child: any = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = jest.fn();
    let prompt = '';
    child.stdin.on('data', (chunk) => {
      prompt += chunk.toString();
    });
    child.stdin.on('finish', () => {
      prompts.push(prompt);
      for (const event of [
        ...events,
        {
          type: 'item.completed',
          item: {
            type: 'agent_message',
            text: JSON.stringify(replies.shift()),
          },
        },
        { type: 'turn.completed' },
      ]) {
        child.stdout.write(JSON.stringify(event) + '\n');
      }
      child.emit('close', 0);
    });
    return child;
  });
  return { schemas, prompts, paths };
}
describe('structured color-studio output recovery', () => {
  beforeEach(() => jest.resetAllMocks());
  it('enforces a candidate-only output schema and repairs an invalid total once', async () => {
    const captured = mockRuns([answer(10), answer()]);
    const result = await runCodexChat(input);
    expect(result.palette?.colors.map((c) => c.proportion)).toEqual([70, 30]);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(
      captured.schemas[0].properties.palette.properties.colors.items.properties
        .hex.enum,
    ).toEqual(input.candidateColors);
    expect(captured.prompts[1]).toContain('palette.colors.proportion');
    expect(captured.paths.every((path) => !existsSync(path))).toBe(true);
  });
  it('stops after two invalid answers and explains the failed field', async () => {
    const captured = mockRuns([answer(10), answer(10)]);
    await expect(runCodexChat(input)).rejects.toThrow('比例合计');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(captured.paths.every((path) => !existsSync(path))).toBe(true);
  });
  it('does not retry tool failures or accept invented search evidence', async () => {
    mockRuns([{ reply: '已找到', images: [] }]);
    await expect(runCodexChat({ ...input, mode: 'search' })).rejects.toThrow(
      '真实联网搜索',
    );
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('preserves successful live-search images with safe generated display IDs', async () => {
    mockRuns(
      [
        {
          reply: '搜索结果',
          palette: null,
          images: [
            {
              title: '参考图',
              imageUrl: 'https://example.org/image.png',
              sourceUrl: 'https://example.org/source',
            },
          ],
        },
      ],
      [{ type: 'item.completed', item: { type: 'web_search' } }],
    );
    const result = await runCodexChat({ ...input, mode: 'search' });
    expect(result.images[0].id).toBe('reference-1');
    expect(result.images[0].sourceUrl).toBe('https://example.org/source');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
