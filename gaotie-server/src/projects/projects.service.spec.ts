import { ProjectsService } from './projects.service';

type Row = Record<string, any>;

class FakeDatabaseService {
  projects: Row[] = [];
  snapshots: Row[] = [];
  conversations: Row[] = [];
  messages: Row[] = [];

  async query<T extends Row = Row>(sql: string, params: any[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('insert into projects')) {
      const [id, userId, name, description, currentStep] = params;
      const project = {
        id,
        user_id: userId,
        name,
        description,
        current_step: currentStep,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.projects.push(project);
      return { rows: [project as T], rowCount: 1 };
    }

    if (normalized.startsWith('select') && normalized.includes('from projects')) {
      const userId = params[0];
      const id = params[1];
      const rows = this.projects.filter(
        (project) =>
          project.user_id === userId &&
          (!id || project.id === id) &&
          !project.archived_at,
      );
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (normalized.startsWith('insert into project_snapshots')) {
      const [projectId, userId, snapshot] = params;
      const existing = this.snapshots.find(
        (row) => row.project_id === projectId && row.user_id === userId,
      );
      if (existing) {
        existing.snapshot = snapshot;
        existing.updated_at = new Date();
        return { rows: [existing as T], rowCount: 1 };
      }
      const row = {
        project_id: projectId,
        user_id: userId,
        snapshot,
        version: 1,
        updated_at: new Date(),
      };
      this.snapshots.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    if (
      normalized.startsWith('select') &&
      normalized.includes('from project_snapshots')
    ) {
      const [projectId, userId] = params;
      const row = this.snapshots.find(
        (snapshot) =>
          snapshot.project_id === projectId && snapshot.user_id === userId,
      );
      return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith('update projects set')) {
      if (normalized.includes('archived_at = now()')) {
        const [id, userId] = params;
        const project = this.projects.find(
          (row) => row.id === id && row.user_id === userId,
        );
        if (project) {
          project.status = 'archived';
          project.archived_at = new Date();
          project.updated_at = new Date();
        }
        return { rows: project ? [project as T] : [], rowCount: project ? 1 : 0 };
      }

      if (normalized.includes('current_step = $1')) {
        const [currentStep, name, id, userId] = params;
        const project = this.projects.find(
          (row) => row.id === id && row.user_id === userId,
        );
        if (project) {
          project.current_step = currentStep;
          project.name = name ?? project.name;
          project.updated_at = new Date();
        }
        return { rows: project ? [project as T] : [], rowCount: project ? 1 : 0 };
      }

      const [name, description, id, userId] = params;
      const project = this.projects.find(
        (row) => row.id === id && row.user_id === userId,
      );
      if (project) {
        project.description = description ?? project.description;
        project.name = name ?? project.name;
        project.updated_at = new Date();
      }
      return { rows: project ? [project as T] : [], rowCount: project ? 1 : 0 };
    }

    if (normalized.startsWith('insert into conversations')) {
      const [id, projectId, userId, module, title] = params;
      const row = {
        id,
        project_id: projectId,
        user_id: userId,
        module,
        title,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.conversations.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    if (normalized.startsWith('insert into messages')) {
      const [id, conversationId, projectId, userId, role, content, payload] =
        params;
      const row = {
        id,
        conversation_id: conversationId,
        project_id: projectId,
        user_id: userId,
        role,
        content,
        payload,
        created_at: new Date(),
      };
      this.messages.push(row);
      return { rows: [row as T], rowCount: 1 };
    }

    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('ProjectsService', () => {
  let db: FakeDatabaseService;
  let service: ProjectsService;

  beforeEach(() => {
    db = new FakeDatabaseService();
    service = new ProjectsService(db as any);
  });

  it('creates a project owned by the current user', async () => {
    const project = await service.createProject('user-1', {
      name: 'CR450 龙纹方案',
      description: '春运主题',
      currentStep: 'image',
    });

    expect(project).toMatchObject({
      userId: 'user-1',
      name: 'CR450 龙纹方案',
      currentStep: 'image',
    });
  });

  it('saves and restores a workspace snapshot for the owner only', async () => {
    const project = await service.createProject('user-1', {
      name: 'CR450 龙纹方案',
    });

    await service.saveSnapshot('user-1', project.id, {
      snapshot: { demand: { selectedTags: [{ label: '龙纹' }] } },
      currentStep: 'image',
      name: '龙纹意象',
    });

    const saved = await service.getSnapshot('user-1', project.id);
    await expect(service.getSnapshot('user-2', project.id)).rejects.toThrow(
      '项目不存在',
    );

    expect(saved.snapshot).toEqual({
      demand: { selectedTags: [{ label: '龙纹' }] },
    });
    expect(saved.project).toMatchObject({
      id: project.id,
      name: '龙纹意象',
      currentStep: 'image',
    });
  });

  it('renames a project owned by the current user', async () => {
    const project = await service.createProject('user-1', {
      name: '新项目 1',
    });

    const renamed = await service.updateProject('user-1', project.id, {
      name: '车厢龙纹项目',
    });

    expect(renamed).toMatchObject({
      id: project.id,
      name: '车厢龙纹项目',
    });
  });

  it('archives a project instead of listing it as active', async () => {
    const project = await service.createProject('user-1', {
      name: '要删除的项目',
    });

    const deleted = await service.deleteProject('user-1', project.id);
    const projects = await service.listProjects('user-1');

    expect(deleted).toMatchObject({
      id: project.id,
      status: 'archived',
    });
    expect(projects).toEqual([]);
    await expect(service.getSnapshot('user-1', project.id)).rejects.toThrow(
      '项目不存在',
    );
  });

  it('creates a conversation and appends messages under the project', async () => {
    const project = await service.createProject('user-1', {
      name: 'CR450 龙纹方案',
    });
    const conversation = await service.createConversation('user-1', project.id, {
      module: 'demand',
      title: '需求分析',
    });

    const message = await service.appendMessage(
      'user-1',
      project.id,
      conversation.id,
      {
        role: 'user',
        content: '我想做龙纹主题',
        payload: { tags: ['龙纹'] },
      },
    );

    expect(message).toMatchObject({
      conversationId: conversation.id,
      projectId: project.id,
      role: 'user',
      content: '我想做龙纹主题',
    });
  });
});
