import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, getApiBaseUrl, resolveBackendImageUrl } from './backendUrls';

describe('backendUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses localhost by default for local development', () => {
    expect(getApiBaseUrl()).toBe('http://localhost:3000');
    expect(apiUrl('/chat')).toBe('http://localhost:3000/chat');
  });

  it('uses VITE_API_BASE_URL without a trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://8.210.235.216/');

    expect(getApiBaseUrl()).toBe('http://8.210.235.216');
    expect(apiUrl('image-search/query')).toBe(
      'http://8.210.235.216/image-search/query',
    );
  });

  it('resolves backend-managed image paths against the API base', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://8.210.235.216');

    expect(resolveBackendImageUrl('/generated/final-proposals/a.png')).toBe(
      'http://8.210.235.216/generated/final-proposals/a.png',
    );
    expect(resolveBackendImageUrl('images/foo.png')).toBe(
      'http://8.210.235.216/images/foo.png',
    );
    expect(resolveBackendImageUrl('foo.png')).toBe(
      'http://8.210.235.216/images/foo.png',
    );
    expect(resolveBackendImageUrl('样本图片/L7.png')).toBe(
      'http://8.210.235.216/sample-images/L7.png',
    );
  });

  it('preserves externally managed image URLs', () => {
    expect(resolveBackendImageUrl('https://example.com/a.png')).toBe(
      'https://example.com/a.png',
    );
    expect(resolveBackendImageUrl('data:image/png;base64,abc')).toBe(
      'data:image/png;base64,abc',
    );
    expect(resolveBackendImageUrl('blob:http://localhost/blob-id')).toBe(
      'blob:http://localhost/blob-id',
    );
  });
});
