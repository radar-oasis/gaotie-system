import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireUserFromRequest } from '../auth/auth.controller';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listProjects(@Req() request: Request) {
    const user = await requireUserFromRequest(this.authService, request);

    return { projects: await this.projectsService.listProjects(user.id) };
  }

  @Post()
  async createProject(
    @Req() request: Request,
    @Body()
    body: { name?: string; description?: string; currentStep?: string },
  ) {
    const user = await requireUserFromRequest(this.authService, request);
    const project = await this.projectsService.createProject(user.id, body ?? {});

    return { project };
  }

  @Patch(':projectId')
  async updateProject(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: { name?: string; description?: string },
  ) {
    const user = await requireUserFromRequest(this.authService, request);
    const project = await this.projectsService.updateProject(user.id, projectId, body ?? {});

    return { project };
  }

  @Delete(':projectId')
  async deleteProject(
    @Req() request: Request,
    @Param('projectId') projectId: string,
  ) {
    const user = await requireUserFromRequest(this.authService, request);
    const project = await this.projectsService.deleteProject(user.id, projectId);

    return { project };
  }

  @Get(':projectId/snapshot')
  async getSnapshot(
    @Req() request: Request,
    @Param('projectId') projectId: string,
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return this.projectsService.getSnapshot(user.id, projectId);
  }

  @Put(':projectId/snapshot')
  async saveSnapshot(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body()
    body: { snapshot?: unknown; currentStep?: string; name?: string },
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return this.projectsService.saveSnapshot(user.id, projectId, {
      snapshot: body?.snapshot ?? {},
      currentStep: body?.currentStep,
      name: body?.name,
    });
  }

  @Get(':projectId/conversations')
  async listConversations(
    @Req() request: Request,
    @Param('projectId') projectId: string,
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return {
      conversations: await this.projectsService.listConversations(
        user.id,
        projectId,
      ),
    };
  }

  @Post(':projectId/conversations')
  async createConversation(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: { module?: string; title?: string },
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return {
      conversation: await this.projectsService.createConversation(
        user.id,
        projectId,
        body ?? {},
      ),
    };
  }

  @Get(':projectId/conversations/:conversationId/messages')
  async listMessages(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Param('conversationId') conversationId: string,
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return {
      messages: await this.projectsService.listMessages(
        user.id,
        projectId,
        conversationId,
      ),
    };
  }

  @Post(':projectId/conversations/:conversationId/messages')
  async appendMessage(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Param('conversationId') conversationId: string,
    @Body()
    body: { role: string; content: string; payload?: unknown; model?: string },
  ) {
    const user = await requireUserFromRequest(this.authService, request);

    return {
      message: await this.projectsService.appendMessage(
        user.id,
        projectId,
        conversationId,
        body,
      ),
    };
  }
}
