import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import { FinalProposalsController } from '../final-proposals/final-proposals.controller';
import { SuperCanvasController } from '../super-canvas/super-canvas.controller';

describe('generation HTTP cancellation', () => {
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  beforeEach(() => { delete process.env.LOCAL_CODEX_IMAGE_ENABLED; });
  afterAll(() => { if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED; else process.env.LOCAL_CODEX_IMAGE_ENABLED = old; });

  it.each(['canvas', 'final', 'iterate'])('%s aborts on early response close and cleans up', async (kind) => {
    const response = Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false });
    const request = Object.assign(new EventEmitter(), { res: response }) as unknown as Request;
    let release!: () => void;
    const serviceCall = jest.fn((_body: unknown, _options?: { signal?: AbortSignal }) => new Promise<void>(resolve => { release = resolve; }));
    const controller = kind === 'canvas'
      ? new SuperCanvasController({ generateTransparentAsset: serviceCall } as any)
      : new FinalProposalsController({ generate: serviceCall, iterate: serviceCall } as any);
    const pending = kind === 'iterate'
      ? (controller as FinalProposalsController).iterate({} as any, request)
      : controller.generate({ prompt: '速度感' } as any, request);
    await new Promise(resolve => setImmediate(resolve));
    const signal = serviceCall.mock.calls[0][1]?.signal;
    expect(signal).toBeDefined();
    request.emit('close');
    expect(signal?.aborted).toBe(false);
    response.emit('close');
    expect(signal?.aborted).toBe(true);
    release();
    await pending;
    expect(response.listenerCount('close')).toBe(0);
  });

  it('does not abort an ended response and removes listeners on service error', async () => {
    const response = Object.assign(new EventEmitter(), { writableEnded: true, destroyed: false });
    const request = { res: response } as unknown as Request;
    let signal: AbortSignal | undefined;
    const controller = new SuperCanvasController({ generateTransparentAsset: jest.fn(async (_body, options) => {
      signal = options?.signal;
      response.emit('close');
      throw new Error('provider failed');
    }) } as any);
    await expect(controller.generate({prompt:'龙'}, request)).rejects.toThrow('provider failed');
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);
    expect(response.listenerCount('close')).toBe(0);
  });
});
