import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { generateCodexImage } from './codex-image-client';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('Codex image adapter', () => {
  let png: Buffer;
  let child: EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: jest.Mock;
  };
  let requests: any[];
  let outcome: 'image' | 'text' | 'invalid' | 'wait' | 'permission' | 'command';
  let mcpEnabled: boolean;
  let invalidAnalysis: boolean;
  let analysisMode: string;
  let suppressFinal: boolean;
  beforeEach(async () => {
    png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    requests = [];
    outcome = 'image';
    mcpEnabled = false;
    invalidAnalysis = false;
    analysisMode = 'detail';
    suppressFinal = false;
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(() => {
        queueMicrotask(() => child.emit('exit', 0));
        return true;
      }),
    });
    (spawn as jest.Mock).mockReturnValue(child);
    child.stdin.on('data', (chunk: Buffer) => {
      const message = JSON.parse(chunk.toString());
      requests.push(message);
      if (!message.method) return;
      let result: any = {};
      if (message.method === 'account/read')
        result = { account: { type: 'chatgpt' } };
      if (message.method === 'modelProvider/capabilities/read')
        result = { imageGeneration: true };
      if (message.method === 'config/read')
        result = {
          config: {
            mcp_servers: {
              node_repl: { enabled: true },
              'custom-name': { enabled: true },
            },
          },
        };
      if (message.method === 'mcpServerStatus/list')
        result = {
          data: ['node_repl', 'custom-name'].map((name) => ({
            name,
            runtimeStatus: mcpEnabled ? 'ready' : 'disabled',
            tools: {},
          })),
          nextCursor: null,
        };
      if (message.method === 'thread/start')
        result = { thread: { id: 'thread1' } };
      if (message.method === 'turn/start') result = { turn: { id: 'turn1' } };
      if (message.id)
        child.stdout.write(JSON.stringify({ id: message.id, result }) + '\n');
      if (message.method === 'turn/start')
        queueMicrotask(() => {
          if (message.params.outputSchema) {
            child.stdout.write(JSON.stringify({ method: 'item/completed', params: { item: {
              type: 'agentMessage', text: invalidAnalysis ? '{}' : JSON.stringify({ mode: analysisMode, observations: ['横向奔行，长尾'], optimizedPrompt: '保留奔行姿态，简化碎线，生成单个纹样。' }),
            } } }) + '\n');
            child.stdout.write(JSON.stringify({ method: 'turn/completed', params: { turn: { id: 'analysis1', status: 'completed' } } }) + '\n');
            return;
          }
          if (outcome === 'wait') return;
          if (outcome === 'command')
            child.stdout.write(
              JSON.stringify({
                method: 'item/started',
                params: { item: { type: 'commandExecution', id: 'cmd1' } },
              }) + '\n',
            );
          if (outcome === 'permission')
            child.stdout.write(
              JSON.stringify({
                id: 'approval1',
                method: 'item/commandExecution/requestApproval',
                params: {},
              }) + '\n',
            );
          if (outcome === 'image' || outcome === 'invalid')
            child.stdout.write(
              JSON.stringify({
                method: 'item/completed',
                params: {
                  item: {
                    type: 'imageGeneration',
                    id: 'image1',
                    status: 'completed',
                    result:
                      outcome === 'image'
                        ? png.toString('base64')
                        : Buffer.from('bad').toString('base64'),
                    savedPath: '/etc/passwd',
                  },
                },
              }) + '\n',
            );
          if (!suppressFinal) child.stdout.write(
            JSON.stringify({
              method: 'turn/completed',
              params: { turn: { id: 'turn1', status: 'completed' } },
            }) + '\n',
          );
        });
    });
  });
  afterEach(() => jest.clearAllMocks());
  it('gives an image tool that starts late its own bounded generation window', async () => {
    jest.useFakeTimers({doNotFake:['queueMicrotask','nextTick','setImmediate']});
    outcome='wait';
    const controller=new AbortController();
    let done=false;
    const pending=generateCodexImage({prompt:'生成',referenceImages:[],signal:controller.signal});
    const handled=pending.catch(()=>undefined).finally(()=>{done=true;});
    try {
      for(let i=0;i<100&&!requests.some(r=>r.method==='turn/start');i++) await new Promise<void>(resolve=>setImmediate(resolve));
      expect(requests.some(r=>r.method==='turn/start')).toBe(true);
      await jest.advanceTimersByTimeAsync(180_000);
      child.stdout.write(JSON.stringify({method:'item/started',params:{item:{type:'imageGeneration'}}})+'\n');
      await jest.advanceTimersByTimeAsync(61_000);
      expect(child.kill).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(180_000);
      await handled;
      expect(done).toBe(true);
    } finally {controller.abort();await handled;jest.useRealTimers();}
  });
  it('returns a completed image without waiting for trailing assistant text', async () => {
    suppressFinal = true;
    const controller = new AbortController();
    const pending = generateCodexImage({prompt:'生成',referenceImages:[png],signal:controller.signal});
    try {
      const ready = await Promise.race([pending.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),100))]);
      expect(ready).toBe(true);
    } finally { controller.abort(); await pending.catch(()=>undefined); }
  });
  it('uses explicit low effort and reports safe timing events for direct generation', async () => {
    const report = jest.fn();
    await generateCodexImage({prompt:'private prompt',referenceImages:[png],reasoningEffort:'low',onDiagnostic:report} as any);
    expect(requests.find(r=>r.method==='turn/start').params.effort).toBe('low');
    expect(report).toHaveBeenCalledWith(expect.objectContaining({outcome:'success',events:expect.arrayContaining([expect.objectContaining({stage:'image_received'})])}));
    expect(JSON.stringify(report.mock.calls)).not.toContain('private prompt');
  });

  it('reports optimization and generation immediately before their respective turns', async () => {
    const stages: string[] = [];
    const stagesAtTurns: Array<string | undefined> = [];
    child.stdin.on('data', (chunk: Buffer) => {
      const message = JSON.parse(chunk.toString());
      if (message.method === 'turn/start') {
        stagesAtTurns.push(stages.at(-1));
      }
    });
    await generateCodexImage({ prompt: '简化', referenceImages: [png], analyzeMotif: true,
      onProgress: (stage: string) => stages.push(stage),
    } as any);
    expect(stages).toEqual(['optimizing', 'generating']);
    expect(stagesAtTurns).toEqual(['optimizing', 'generating']);
  });

  it('records detail routing and limits generation to the requested changes', async () => {
    const result = await generateCodexImage({ prompt: '这个高铁涂装只把尾巴缩短', referenceImages: [png], analyzeMotif: true });
    expect((result.promptTrace as any).mode).toBe('detail');
    expect(result.promptTrace?.generationPrompt).toContain('仅执行用户本轮指定的修改');
    expect(result.promptTrace?.generationPrompt).not.toContain('车身适配策略');
  });

  it('records whole-livery routing when the analysis selects it', async () => {
    analysisMode = 'livery';
    const result = await generateCodexImage({ prompt: '转成适合高铁涂装的纹样', referenceImages: [png], analyzeMotif: true });
    expect((result.promptTrace as any).mode).toBe('livery');
    expect(result.promptTrace?.generationPrompt).toContain('车身适配策略');
  });

  it('rejects unknown routing modes without generating', async () => {
    analysisMode = 'unknown';
    await expect(generateCodexImage({ prompt: '修改', referenceImages: [png], analyzeMotif: true })).rejects.toThrow('未继续生图');
    expect(requests.filter(m => m.method === 'turn/start')).toHaveLength(1);
  });

  it('does not generate when visual analysis is invalid', async () => {
    invalidAnalysis = true;
    await expect(generateCodexImage({ prompt: '简化', referenceImages: [png], analyzeMotif: true })).rejects.toThrow('未继续生图');
    expect(requests.filter(m => m.method === 'turn/start')).toHaveLength(1);
  });

  it('observes attached images before generating from the validated optimized prompt', async () => {
    const result = await generateCodexImage({ prompt: '简化一点', referenceImages: [png], analyzeMotif: true } as any);
    const turns = requests.filter((m) => m.method === 'turn/start');
    expect(turns).toHaveLength(2);
    expect(turns[0].params.input[1].type).toBe('localImage');
    expect(turns[1].params.input[0].text).toContain('保留奔行姿态');
    expect((result as any).promptTrace.originalPrompt).toBe('简化一点');
    expect((result as any).promptTrace.observations).toEqual(['横向奔行，长尾']);
  });

  it('sends all references in order as temporary local images and returns verified image bytes', async () => {
    let sent: string[] = [];
    child.stdin.on('data', (chunk) => {
      const m = JSON.parse(chunk.toString());
      if (m.method === 'turn/start') {
        sent = m.params.input
          .filter((i: any) => i.type === 'localImage')
          .map((i: any) => i.path);
        expect(sent).toHaveLength(2);
        expect(readFileSync(sent[0])).toEqual(png);
      }
    });
    const result = await generateCodexImage({
      prompt: '参考图1主体，参考图2风格',
      referenceImages: [png, png],
    });
    expect(result.taskId).toBe('turn1');
    expect(
      (await sharp(Buffer.from(result.images[0].value, 'base64')).metadata())
        .format,
    ).toBe('png');
    expect(sent.every((path) => !existsSync(path))).toBe(true);
    expect(child.kill).toHaveBeenCalled();
  });
  it('rejects text-only turns instead of treating savedPath or text as generated images', async () => {
    outcome = 'text';
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [png] }),
    ).rejects.toThrow('未返回');
  });
  it('rejects invalid image output', async () => {
    outcome = 'invalid';
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('图片');
  });
  it('rejects more than 12 references before spawning', async () => {
    await expect(
      generateCodexImage({
        prompt: '生成',
        referenceImages: Array(13).fill(png),
      }),
    ).rejects.toThrow('12');
    expect(spawn).not.toHaveBeenCalled();
  });
  it('rejects extra tool approval requests', async () => {
    outcome = 'permission';
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('额外工具');
    expect(requests.some((r) => r.id === 'approval1' && r.error)).toBe(true);
  });
  it('interrupts forbidden tool starts even when no approval is requested', async () => {
    outcome = 'command';
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('额外工具');
    expect(requests.some((r) => r.method === 'turn/interrupt')).toBe(true);
  });
  it('disables installed shell and browser capabilities on the spawned service', async () => {
    await generateCodexImage({ prompt: '生成', referenceImages: [] });
    const args = (spawn as jest.Mock).mock.calls[0][1];
    expect(args).toContain('shell_tool');
    expect(args).toContain('web_search="disabled"');
  });
  it('disables each inherited MCP by name and checks runtime before starting a turn', async () => {
    await generateCodexImage({ prompt: '生成', referenceImages: [] });
    expect(
      requests.find((r) => r.method === 'thread/start').params.config,
    ).toEqual({
      mcp_servers: {
        node_repl: { enabled: false },
        'custom-name': { enabled: false },
      },
    });
    expect(
      requests.findIndex((r) => r.method === 'mcpServerStatus/list'),
    ).toBeLessThan(requests.findIndex((r) => r.method === 'turn/start'));
  });
  it('fails closed if any MCP runtime was not disabled', async () => {
    mcpEnabled = true;
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('MCP');
    expect(requests.some((r) => r.method === 'turn/start')).toBe(false);
  });
  it('allows only one request and aborts cleanly', async () => {
    outcome = 'wait';
    const controller = new AbortController();
    const pending = generateCodexImage({
      prompt: '生成',
      referenceImages: [],
      signal: controller.signal,
    });
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('正在');
    controller.abort();
    await expect(pending).rejects.toThrow('取消');
  });
  it('stops a hanging RPC at 240 seconds without retrying', async () => {
    jest.useFakeTimers({
      doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'],
    });
    outcome = 'wait';
    const pending = generateCodexImage({ prompt: '生成', referenceImages: [] });
    const assertion = expect(pending).rejects.toThrow('240 秒');
    await jest.advanceTimersByTimeAsync(240_000);
    await assertion;
    expect((spawn as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
    jest.useRealTimers();
  });
  it('rejects a subprocess exit while an RPC is pending', async () => {
    child.stdin.removeAllListeners('data');
    child.stdin.on('data', () => queueMicrotask(() => child.emit('exit', 1)));
    await expect(
      generateCodexImage({ prompt: '生成', referenceImages: [] }),
    ).rejects.toThrow('提前结束');
  });
});
