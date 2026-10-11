import {
  Controller,
  Delete,
  Get,
  Put,
  Post,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AppService, DeepSeekResponse } from './app.service';
import type {
  Tag,
  IntentParseResult,
  PatternFilters,
  PatternResult,
  PatternGroupQuery,
  PatternGroupResponse,
  LayoutScheme,
} from './app.service';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'rich-card';
  content: string;
  tags?: Tag[];
}

interface ChatRequest {
  messages: ChatMessage[];
  selectedTags: Tag[];
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('chat')
  async chat(@Body() body: ChatRequest): Promise<DeepSeekResponse> {
    try {
      const { messages, selectedTags } = body;
      const result = await this.appService.callDeepSeek(messages, selectedTags);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('image-search/parse-intent')
  async parseIntent(
    @Body() body: { userInput: string; groups?: PatternGroupQuery['groups'] },
  ): Promise<IntentParseResult> {
    try {
      const result = await this.appService.parseIntent(body.userInput, body.groups);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('image-search/query')
  async queryPatterns(@Body() body: PatternFilters): Promise<PatternResult[]> {
    try {
      const result = await this.appService.searchPatterns(body);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('image-search/test')
  async testPatterns(): Promise<any[]> {
    try {
      const result = await this.appService.getSamplePatterns();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('image-search/grouped-query')
  async queryPatternGroups(
    @Body() body: PatternGroupQuery,
  ): Promise<PatternGroupResponse> {
    return this.appService.searchPatternGroups(body);
  }

  @Post('image-search/graph')
  async patternGraph(@Body() body: unknown) {
    return this.appService.getPatternGraph(body);
  }

  @Post('image-search/native-graph')
  async nativePatternGraph(@Body() body: unknown) {
    return this.appService.getNativePatternGraph(body);
  }

  @Post('image-search/native-graph/expand')
  async expandNativePatternNode(@Body() body: unknown) {
    return this.appService.expandNativePatternNode(body);
  }

  @Get('image-search/schema')
  async getSchema(): Promise<any> {
    try {
      const result = await this.appService.getDbSchema();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('layout-scheme/save')
  async saveLayoutScheme(@Body() scheme: LayoutScheme): Promise<LayoutScheme> {
    try {
      const result = await this.appService.saveLayoutScheme(scheme);
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('layout-scheme/list')
  async getLayoutSchemes(
    @Query('projectId') projectId?: string,
  ): Promise<LayoutScheme[]> {
    try {
      const result = await this.appService.getLayoutSchemes(projectId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('layout-scheme/:id')
  async getLayoutSchemeById(
    @Param('id') id: string,
  ): Promise<LayoutScheme | null> {
    try {
      const result = await this.appService.getLayoutSchemeById(id);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('layout-scheme/:id')
  async renameLayoutScheme(
    @Param('id') id: string,
    @Body() body: { name?: string },
  ): Promise<LayoutScheme> {
    try {
      return await this.appService.renameLayoutScheme(id, body?.name ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('layout-scheme/:id')
  async deleteLayoutScheme(
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    try {
      const success = await this.appService.deleteLayoutScheme(id);
      return { success };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
