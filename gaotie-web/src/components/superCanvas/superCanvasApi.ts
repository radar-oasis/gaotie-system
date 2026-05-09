import type { GenerationResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const getApiBaseUrl = (): string => stripTrailingSlash(API_BASE_URL);

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const generateTransparentAsset = async (input: {
  prompt: string;
  referenceImageUrl?: string;
}): Promise<GenerationResponse> => {
  const response = await fetch(`${getApiBaseUrl()}/super-canvas/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await parseJsonSafely(response);

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
    confidence: body.confidence === 'high' ? 'high' : 'low',
    transparentPixelRatio:
      typeof body.transparentPixelRatio === 'number'
        ? body.transparentPixelRatio
        : 0,
  };
};
