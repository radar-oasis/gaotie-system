const BACKEND_ORIGIN = 'http://localhost:3000';

export const resolveBackendImageUrl = (imageUrl: string): string => {
  const normalized = imageUrl.trim();

  if (
    normalized === '' ||
    normalized.startsWith('data:') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }

  if (normalized.startsWith('/')) {
    return `${BACKEND_ORIGIN}${normalized}`;
  }

  if (normalized.startsWith('images/')) {
    return `${BACKEND_ORIGIN}/${normalized}`;
  }

  return `${BACKEND_ORIGIN}/images/${normalized}`;
};
