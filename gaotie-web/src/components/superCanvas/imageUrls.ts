const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const getApiBaseUrl = (): string => stripTrailingSlash(API_BASE_URL);

export const resolveBackendImageUrl = (imageUrl: string): string => {
  const normalized = imageUrl.trim();

  if (
    normalized === '' ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('//') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }

  if (normalized.startsWith('/')) {
    return `${getApiBaseUrl()}${normalized}`;
  }

  if (normalized.startsWith('images/')) {
    return `${getApiBaseUrl()}/${normalized}`;
  }

  return `${getApiBaseUrl()}/images/${normalized}`;
};
