import type { GenerationResponse } from './types';
import { apiUrl } from '../../utils/backendUrls';

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export type GenerationStage = 'preparing' | 'optimizing' | 'generating' | 'processing';

const readGenerationStream = async (response: Response, onProgress?: (stage: GenerationStage) => void): Promise<unknown> => {
  if (!response.body) throw new Error('生成连接中断，请重试');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const consume = (line: string): { result: unknown } | null => {
    if (!line.trim()) return null;
    const event: unknown = JSON.parse(line);
    if (!isRecord(event)) return null;
    if (event.type === 'error') throw new Error(typeof event.message === 'string' ? event.message : '生成失败');
    if (event.type === 'progress' && ['preparing', 'optimizing', 'generating', 'processing'].includes(String(event.stage))) onProgress?.(event.stage as GenerationStage);
    return event.type === 'result' ? { result: event.result } : null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1000000) throw new Error('生成响应过大');
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const result = consume(line);
        if (result) return result.result;
      }
      if (done) {
        const result = consume(pending);
        if (result) return result.result;
        throw new Error('生成连接中断，请重试');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

export const generateTransparentAsset = async (input: {
  prompt: string;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
}, options?: { signal?: AbortSignal; onProgress?: (stage: GenerationStage) => void }): Promise<GenerationResponse> => {
  const response = await fetch(apiUrl('/super-canvas/generate'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.onProgress ? { Accept: 'application/x-ndjson' } : {}) },
    body: JSON.stringify(input),
    signal: options?.signal,
  });
  const body = response.ok && response.headers?.get('content-type')?.includes('application/x-ndjson')
    ? await readGenerationStream(response, options?.onProgress)
    : await parseJsonSafely(response);

  if (!response.ok) {
    const message = isRecord(body) ? body.message : undefined;
    throw new Error(
      typeof message === 'string' ? message : `生成失败：${response.status}`,
    );
  }

  if (
    !isRecord(body) ||
    typeof body.imageUrl !== 'string' ||
    typeof body.taskId !== 'string'
  ) {
    throw new Error('生成接口返回缺少图片信息');
  }

  return {
    imageUrl: body.imageUrl,
    taskId: body.taskId,
    ...(isRecord(body.promptTrace) && typeof body.promptTrace.originalPrompt === 'string' && typeof body.promptTrace.optimizedPrompt === 'string' && typeof body.promptTrace.mode === 'string'
      ? { promptTrace: { originalPrompt: body.promptTrace.originalPrompt, optimizedPrompt: body.promptTrace.optimizedPrompt, mode: body.promptTrace.mode } } : {}),
    confidence: body.confidence === 'high' ? 'high' : 'low',
    transparentPixelRatio:
      typeof body.transparentPixelRatio === 'number'
        ? body.transparentPixelRatio
        : 0,
  };
};
