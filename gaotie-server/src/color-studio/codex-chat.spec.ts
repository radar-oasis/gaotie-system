import { parseCodexEvents, buildCodexArgs } from './codex-chat';
describe('isolated Codex chat', () => {
  it('disables web search for direct palette mode', () => {
    expect(buildCodexArgs('palette')).toContain('web_search="disabled"');
    expect(buildCodexArgs('search')).toContain('web_search="live"');
  });
  it('parses final structured text and requires real web search events', () => {
    const events = [
      {
        type: 'item.completed',
        item: {
          type: 'web_search',
          id: '1',
          action: { type: 'search', query: 'train' },
        },
      },
      {
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"reply":"ok","images":[]}' },
      },
      { type: 'turn.completed' },
    ];
    expect(
      parseCodexEvents(events.map((x) => JSON.stringify(x)).join('\n'), true),
    ).toEqual({ reply: 'ok', images: [] });
    expect(() => parseCodexEvents(JSON.stringify(events[1]), true)).toThrow();
  });
  it('rejects failed turns and forbidden tool calls even with final JSON', () => {
    expect(() =>
      parseCodexEvents(
        '{"type":"turn.failed","error":{"message":"secret"}}',
        false,
      ),
    ).toThrow();
    expect(() =>
      parseCodexEvents(
        '{"type":"item.started","item":{"type":"command_execution"}}',
        false,
      ),
    ).toThrow();
    expect(() =>
      parseCodexEvents(
        '{"type":"item.completed","item":{"type":"agent_message","text":"invalid"}}',
        false,
      ),
    ).toThrow();
  });
  it('ignores user configuration and disables execution, apps, plugins, hooks and agents', () => {
    const args = buildCodexArgs();
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ephemeral');
    for (const flag of [
      'shell_tool',
      'unified_exec',
      'apps',
      'plugins',
      'hooks',
      'multi_agent',
      'view_image',
      'image_generation',
      'skill_search',
    ])
      expect(args).toContain(flag);
  });
});
