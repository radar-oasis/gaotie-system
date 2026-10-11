import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import * as projectApi from './projectApi';
import type { Project } from './projectApi';

/* eslint-disable react-refresh/only-export-components */

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string;
  lastSavedAt: string | null;
  selectProject: (projectId: string) => void;
  createProject: () => Promise<Project>;
  renameProject: (projectId: string, name: string) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<Project>;
  markSaved: (project: Project, savedAt?: string) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setCurrentProject(null);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let loaded = await projectApi.listProjects();

      if (loaded.length === 0) {
        const initial = await projectApi.createProject({
          name: '默认项目',
          currentStep: 'demand',
        });
        loaded = [initial];
      }

      setProjects(loaded);
      setCurrentProject((current) => {
        if (current && loaded.some((project) => project.id === current.id)) {
          return loaded.find((project) => project.id === current.id) ?? current;
        }

        return loaded[0] ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : '项目列表加载失败',
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectProject = useCallback(
    (projectId: string) => {
      const nextProject = projects.find((project) => project.id === projectId);

      if (nextProject) {
        setCurrentProject(nextProject);
      }
    },
    [projects],
  );

  const createProject = useCallback(async () => {
    const project = await projectApi.createProject({
      name: `新项目 ${projects.length + 1}`,
      currentStep: 'demand',
    });

    setProjects((previous) => [project, ...previous]);
    setCurrentProject(project);
    setLastSavedAt(null);

    return project;
  }, [projects.length]);

  const renameProject = useCallback(async (projectId: string, name: string) => {
    const project = await projectApi.updateProject(projectId, { name });

    setProjects((previous) =>
      previous.map((item) => (item.id === project.id ? project : item)),
    );
    setCurrentProject((current) =>
      current?.id === project.id ? project : current,
    );

    return project;
  }, []);

  const deleteProject = useCallback(
    async (projectId: string) => {
      const deletedProject = await projectApi.deleteProject(projectId);
      const remainingProjects = projects.filter(
        (project) => project.id !== projectId,
      );

      if (remainingProjects.length === 0) {
        const initialProject = await projectApi.createProject({
          name: '默认项目',
          currentStep: 'demand',
        });
        setProjects([initialProject]);
        setCurrentProject(initialProject);
        setLastSavedAt(null);
        return deletedProject;
      }

      setProjects(remainingProjects);
      setCurrentProject((current) =>
        current?.id === projectId ? remainingProjects[0] : current,
      );
      setLastSavedAt(null);

      return deletedProject;
    },
    [projects],
  );

  const markSaved = useCallback((project: Project, savedAt?: string) => {
    setProjects((previous) =>
      previous
        .map((item) => (item.id === project.id ? project : item))
        .sort((a, b) =>
          String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
        ),
    );
    setCurrentProject(project);
    setLastSavedAt(savedAt ?? new Date().toISOString());
  }, []);

  const value = useMemo(
    () => ({
      projects,
      currentProject,
      isLoading,
      error,
      lastSavedAt,
      selectProject,
      createProject,
      renameProject,
      deleteProject,
      markSaved,
      refreshProjects: loadProjects,
    }),
    [
      createProject,
      currentProject,
      error,
      isLoading,
      lastSavedAt,
      loadProjects,
      markSaved,
      projects,
      deleteProject,
      renameProject,
      selectProject,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);

  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }

  return context;
}
