import { apiUrl } from '../utils/backendUrls';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
}

interface AuthResponse {
  user: AuthUser | null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await request<AuthResponse>('/auth/me');
  return response.user;
}

export async function login(input: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  const response = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.user) {
    throw new Error('登录失败');
  }

  return response.user;
}

export async function register(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser> {
  const response = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.user) {
    throw new Error('注册失败');
  }

  return response.user;
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<T>;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload.message || `请求失败：${response.status}`;
  } catch {
    return `请求失败：${response.status}`;
  }
}
