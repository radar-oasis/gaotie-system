import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { SuperCanvasController } from './super-canvas.controller';
import { SuperCanvasService } from './super-canvas.service';

describe('Super canvas generation stream', () => {
  let app: INestApplication;
  const oldEnabled = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  const generate = jest.fn();
  const result = { imageUrl: '/generated/a.png', taskId: 'a', confidence: 'high', transparentPixelRatio: 0.5 };
  beforeEach(async () => {
    process.env.LOCAL_CODEX_IMAGE_ENABLED = 'false';
    generate.mockReset().mockImplementation(async (_input, options) => {
      for (const stage of ['preparing', 'optimizing', 'generating', 'processing']) options?.onProgress?.(stage);
      return result;
    });
    const module = await Test.createTestingModule({ controllers: [SuperCanvasController], providers: [
      { provide: SuperCanvasService, useValue: { generateTransparentAsset: generate } },
    ] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    if (oldEnabled === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = oldEnabled;
  });
  it('streams ordered progress followed by one result', async () => {
    const response = await request(app.getHttpServer()).post('/super-canvas/generate')
      .set('Accept', 'application/x-ndjson').send({ prompt: '简化' }).expect(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.text.trim().split('\n').map(line => JSON.parse(line))).toEqual([
      ...['preparing', 'optimizing', 'generating', 'processing'].map(stage => ({ type: 'progress', stage })),
      { type: 'result', result },
    ]);
  });
  it('preserves the ordinary JSON response', async () => {
    const response = await request(app.getHttpServer()).post('/super-canvas/generate').send({ prompt: '简化' }).expect(201);
    expect(response.body).toEqual(result);
  });
  it('validates before opening the stream', async () => {
    const response = await request(app.getHttpServer()).post('/super-canvas/generate')
      .set('Accept', 'application/x-ndjson').send({ prompt: '' }).expect(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(generate).not.toHaveBeenCalled();
  });
  it('rejects unauthorized local generation before opening the stream', async () => {
    process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true';
    const response = await request(app.getHttpServer()).post('/super-canvas/generate')
      .set('Accept', 'application/x-ndjson').send({ prompt: '简化' }).expect(403);
    expect(response.headers['content-type']).toContain('application/json');
    expect(generate).not.toHaveBeenCalled();
  });
  it('ends failed streams without exposing upstream credentials or internal errors', async () => {
    const log = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    generate.mockRejectedValue(new Error('secret-token upstream internal error'));
    const response = await request(app.getHttpServer()).post('/super-canvas/generate')
      .set('Accept', 'application/x-ndjson').send({ prompt: '简化' }).expect(200);
    const events = response.text.trim().split('\n').map(line => JSON.parse(line));
    expect(events).toEqual([{ type: 'error', message: expect.any(String) }]);
    expect(response.text).not.toContain('secret-token');
    expect(log).toHaveBeenCalledWith('[canvas-generation-failed]', expect.objectContaining({category:'upstream_or_processing',elapsedMs:expect.any(Number)}));
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
    log.mockRestore();
  });
  it('cancels streaming work on disconnect and removes the close listener', async () => {
    const response = Object.assign(new EventEmitter(), {
      destroyed: false, writableEnded: false,
      status: jest.fn(), setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn(),
    });
    let signal: AbortSignal | undefined;
    let started!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    generate.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
      started();
    }));
    const controller = app.get(SuperCanvasController);
    const pending = controller.generate({ prompt: '简化' }, {
      headers: { accept: 'application/x-ndjson' }, res: response,
    } as any, response as any);
    await startedPromise;
    expect(signal?.aborted).toBe(false);
    response.destroyed = true;
    response.emit('close');
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(response.listenerCount('close')).toBe(0);
    expect(response.write).not.toHaveBeenCalled();
  });
});
