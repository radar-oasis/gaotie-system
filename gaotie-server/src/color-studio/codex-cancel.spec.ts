import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { runCodexChat } from './codex-chat';
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
describe('Codex cancellation', () => {
  const input = {
    message: 'x',
    context: [],
    history: [],
    mode: 'chat' as const,
  };
  beforeEach(() => jest.clearAllMocks());
  it('cancels the subprocess on disconnect and releases the active slot', async () => {
    const child: any = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = jest.fn(() => {
      queueMicrotask(() => child.emit('close', null));
      return true;
    });
    (spawn as jest.Mock).mockImplementation(() => child);
    const abort = new AbortController();
    const pending = runCodexChat(input, abort.signal);
    while (!(spawn as jest.Mock).mock.calls.length)
      await new Promise((r) => setTimeout(r, 1));
    abort.abort();
    // Baseline returns success; corrected code rejects before this artificial completed turn.
    child.stdout.write(
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"reply":"ok","images":[]}' },
      }) +
        '\n' +
        JSON.stringify({ type: 'turn.completed' }) +
        '\n',
    );
    child.emit('close', 0);
    await expect(pending).rejects.toThrow('取消');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
