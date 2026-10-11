import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';

export interface ProjectDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  currentStep: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status?: string;
  current_step: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

interface SnapshotRow {
  project_id: string;
  user_id: string;
  snapshot: unknown;
  version: number;
  updated_at?: Date | string;
}

interface ConversationRow {
  id: string;
  project_id: string;
  user_id: string;
  module: string;
  title: string;
  status?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  project_id: string;
  user_id: string;
  role: string;
  message_type?: string;
  content: string;
  payload?: unknown;
  model?: string | null;
  created_at?: Date | string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  async listProjects(userId: string): Promise<ProjectDto[]> {
    const result = await this.db.query<ProjectRow>(
      `
        SELECT id, user_id, name, description, status, current_step, created_at, updated_at
          FROM projects
         WHERE user_id = $1
           AND archived_at IS NULL
         ORDER BY updated_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => this.toProject(row));
  }

  async createProject(
    userId: string,
    input: { name?: string; description?: string; currentStep?: string },
  ): Promise<ProjectDto> {
    const name = this.normalizeProjectName(input.name);
    const result = await this.db.query<ProjectRow>(
      `
        INSERT INTO projects (id, user_id, name, description, current_step)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, name, description, status, current_step, created_at, updated_at
      `,
      [
        randomUUID(),
        userId,
        name,
        input.description?.trim() || null,
        input.currentStep || 'demand',
      ],
    );

    return this.toProject(result.rows[0]);
  }

  async updateProject(
    userId: string,
    projectId: string,
    input: { name?: string; description?: string },
  ): Promise<ProjectDto> {
    await this.getProjectForUser(userId, projectId);

    const name =
      typeof input.name === 'string'
        ? this.normalizeProjectName(input.name)
        : undefined;
    const description =
      typeof input.description === 'string'
        ? input.description.trim() || null
        : undefined;

    const result = await this.db.query<ProjectRow>(
      `
        UPDATE projects
           SET name = COALESCE($1, name),
               description = COALESCE($2, description),
               updated_at = now()
         WHERE id = $3
           AND user_id = $4
           AND archived_at IS NULL
        RETURNING id, user_id, name, description, status, current_step, created_at, updated_at
      `,
      [name, description, projectId, userId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('项目不存在');
    }

    return this.toProject(result.rows[0]);
  }

  async deleteProject(userId: string, projectId: string): Promise<ProjectDto> {
    await this.getProjectForUser(userId, projectId);

    const result = await this.db.query<ProjectRow>(
      `
        UPDATE projects
           SET status = 'archived',
               archived_at = now(),
               updated_at = now()
         WHERE id = $1
           AND user_id = $2
           AND archived_at IS NULL
        RETURNING id, user_id, name, description, status, current_step, created_at, updated_at
      `,
      [projectId, userId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('项目不存在');
    }

    return this.toProject(result.rows[0]);
  }

  async getSnapshot(
    userId: string,
    projectId: string,
  ): Promise<{
    project: ProjectDto;
    snapshot: unknown;
    version: number;
    updatedAt?: string;
  }> {
    const project = await this.getProjectForUser(userId, projectId);
    const result = await this.db.query<SnapshotRow>(
      `
        SELECT project_id, user_id, snapshot, version, updated_at
          FROM project_snapshots
         WHERE project_id = $1
           AND user_id = $2
         LIMIT 1
      `,
      [projectId, userId],
    );
    const snapshot = result.rows[0];

    return {
      project,
      snapshot: snapshot?.snapshot ?? {},
      version: snapshot?.version ?? 1,
      updatedAt: this.toIso(snapshot?.updated_at),
    };
  }

  async saveSnapshot(
    userId: string,
    projectId: string,
    input: { snapshot: unknown; currentStep?: string; name?: string },
  ): Promise<{
    project: ProjectDto;
    snapshot: unknown;
    version: number;
    updatedAt?: string;
  }> {
    const project = await this.getProjectForUser(userId, projectId);
    const currentStep = input.currentStep || project.currentStep;
    const name = input.name?.trim() || project.name;

    await this.db.query(
      `
        INSERT INTO project_snapshots (project_id, user_id, snapshot, version, updated_at)
        VALUES ($1, $2, $3, 1, now())
        ON CONFLICT (project_id)
        DO UPDATE SET snapshot = EXCLUDED.snapshot,
                      version = project_snapshots.version + 1,
                      updated_at = now()
        RETURNING project_id, user_id, snapshot, version, updated_at
      `,
      [projectId, userId, input.snapshot ?? {}],
    );

    await this.db.query<ProjectRow>(
      `
        UPDATE projects
           SET current_step = $1,
               name = COALESCE($2, name),
               updated_at = now()
         WHERE id = $3
           AND user_id = $4
        RETURNING id, user_id, name, description, status, current_step, created_at, updated_at
      `,
      [currentStep, name, projectId, userId],
    );

    return this.getSnapshot(userId, projectId);
  }

  async createConversation(
    userId: string,
    projectId: string,
    input: { module?: string; title?: string },
  ) {
    await this.getProjectForUser(userId, projectId);

    const result = await this.db.query<ConversationRow>(
      `
        INSERT INTO conversations (id, project_id, user_id, module, title)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, project_id, user_id, module, title, status, created_at, updated_at
      `,
      [
        randomUUID(),
        projectId,
        userId,
        input.module || 'demand',
        input.title?.trim() || '新会话',
      ],
    );

    return this.toConversation(result.rows[0]);
  }

  async listConversations(userId: string, projectId: string) {
    await this.getProjectForUser(userId, projectId);

    const result = await this.db.query<ConversationRow>(
      `
        SELECT id, project_id, user_id, module, title, status, created_at, updated_at
          FROM conversations
         WHERE project_id = $1
           AND user_id = $2
         ORDER BY updated_at DESC
      `,
      [projectId, userId],
    );

    return result.rows.map((row) => this.toConversation(row));
  }

  async listMessages(
    userId: string,
    projectId: string,
    conversationId: string,
  ) {
    await this.getProjectForUser(userId, projectId);

    const result = await this.db.query<MessageRow>(
      `
        SELECT id, conversation_id, project_id, user_id, role, message_type, content, payload, model, created_at
          FROM messages
         WHERE conversation_id = $1
           AND project_id = $2
           AND user_id = $3
         ORDER BY created_at ASC
      `,
      [conversationId, projectId, userId],
    );

    return result.rows.map((row) => this.toMessage(row));
  }

  async appendMessage(
    userId: string,
    projectId: string,
    conversationId: string,
    input: { role: string; content: string; payload?: unknown; model?: string },
  ) {
    await this.getProjectForUser(userId, projectId);

    if (!input.content?.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const result = await this.db.query<MessageRow>(
      `
        INSERT INTO messages (id, conversation_id, project_id, user_id, role, content, payload, model)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, conversation_id, project_id, user_id, role, message_type, content, payload, model, created_at
      `,
      [
        randomUUID(),
        conversationId,
        projectId,
        userId,
        input.role,
        input.content,
        input.payload ?? {},
        input.model ?? null,
      ],
    );

    return this.toMessage(result.rows[0]);
  }

  private async getProjectForUser(
    userId: string,
    projectId: string,
  ): Promise<ProjectDto> {
    const result = await this.db.query<ProjectRow>(
      `
        SELECT id, user_id, name, description, status, current_step, created_at, updated_at
          FROM projects
         WHERE user_id = $1
           AND id = $2
           AND archived_at IS NULL
         LIMIT 1
      `,
      [userId, projectId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('项目不存在');
    }

    return this.toProject(result.rows[0]);
  }

  private normalizeProjectName(name?: string): string {
    const normalized = name?.trim() || '未命名项目';

    if (normalized.length > 80) {
      throw new BadRequestException('项目名称不能超过 80 个字符');
    }

    return normalized;
  }

  private toProject(row: ProjectRow): ProjectDto {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? null,
      status: row.status ?? 'active',
      currentStep: row.current_step,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private toConversation(row: ConversationRow) {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      module: row.module,
      title: row.title,
      status: row.status ?? 'active',
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private toMessage(row: MessageRow) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      projectId: row.project_id,
      userId: row.user_id,
      role: row.role,
      messageType: row.message_type ?? 'text',
      content: row.content,
      payload: row.payload ?? {},
      model: row.model ?? null,
      createdAt: this.toIso(row.created_at),
    };
  }

  private toIso(value?: Date | string): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }
}
