import type { Request } from 'express';

export interface GenerationOptions { signal?: AbortSignal }

export function assertGenerationActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('生图已取消');
}

/** Request close also fires after a normal body read; observe the response instead. */
export async function withGenerationCancellation<T>(
  request: Request | undefined,
  action: (options?: GenerationOptions) => Promise<T>,
): Promise<T> {
  const response = request?.res;
  if (!response) return action();
  const controller = new AbortController();
  const onClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on('close', onClose);
  if (response.destroyed) onClose();
  try {
    assertGenerationActive(controller.signal);
    return await action({ signal: controller.signal });
  } finally {
    response.off('close', onClose);
  }
}
