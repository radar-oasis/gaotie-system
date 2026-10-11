import { afterEach, describe, expect, it, vi } from 'vitest';

const importApi = async (apiBaseUrl = 'http://api.test') => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./projectApi');
};

describe('projectApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends a DELETE request for project removal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        project: { id: 'project-1', name: '旧项目名' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { deleteProject } = await importApi();

    await expect(deleteProject('project-1')).resolves.toMatchObject({
      id: 'project-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/projects/project-1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('times out a hanging snapshot save request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    const { saveProjectSnapshot } = await importApi();

    const savePromise = saveProjectSnapshot('project-1', {
      snapshot: {} as never,
      currentStep: 'canvas',
    });
    const expectation = expect(savePromise).rejects.toThrow(
      '请求超时，请检查网络后重试',
    );

    await vi.advanceTimersByTimeAsync(90_000);

    await expectation;
    vi.useRealTimers();
  });
});
