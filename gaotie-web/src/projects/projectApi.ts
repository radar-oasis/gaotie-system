import { apiUrl } from '../utils/backendUrls';
import type { WorkspaceSnapshot } from './workspaceSnapshot';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  currentStep: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectResponse {
  project: Project;
}

interface ProjectsResponse {
  projects: Project[];
}

interface SnapshotResponse {
  project: Project;
  snapshot: unknown;
  version: number;
  updatedAt?: string;
}

export async function listProjects(): Promise<Project[]> {
  const response = await request<ProjectsResponse>('/projects');
  return response.projects;
}

export async function createProject(input: {
  name?: string;
  description?: string;
  currentStep?: string;
}): Promise<Project> {
  const response = await request<ProjectResponse>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return response.project;
}

export async function updateProject(
  projectId: string,
  input: {
    name?: string;
    description?: string;
  },
): Promise<Project> {
  const response = await request<ProjectResponse>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return response.project;
}

export async function deleteProject(projectId: string): Promise<Project> {
  const response = await request<ProjectResponse>(`/projects/${projectId}`, {
    method: 'DELETE',
  });

  return response.project;
}

export async function getProjectSnapshot(projectId: string) {
  return request<SnapshotResponse>(`/projects/${projectId}/snapshot`);
}

export async function saveProjectSnapshot(
  projectId: string,
  input: {
    snapshot: WorkspaceSnapshot;
    currentStep: string;
    name?: string;
  },
) {
  return request<SnapshotResponse>(`/projects/${projectId}/snapshot`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }, { timeoutMs: 90_000 });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000,
  );

  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('请求超时，请检查网络后重试');
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }

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
