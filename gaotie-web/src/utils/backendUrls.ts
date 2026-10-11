const DEFAULT_API_BASE_URL = 'http://localhost:3000';

const BACKEND_PATH_PREFIXES = [
  'images/',
  'sample-images/',
  'layout-elements/',
  'generated/',
];

export const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const getApiBaseUrl = (): string =>
  stripTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL);

export const apiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${getApiBaseUrl()}${normalizedPath}`;
};

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
    return apiUrl(normalized);
  }

  if (normalized.startsWith('样本图片/')) {
    return apiUrl(
      `/sample-images/${encodeURIComponent(normalized.replace('样本图片/', ''))}`,
    );
  }

  if (BACKEND_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return apiUrl(normalized);
  }

  return apiUrl(`/images/${normalized}`);
};
