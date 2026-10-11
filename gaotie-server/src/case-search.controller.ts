import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CaseSearchService, ChatResponse } from './case-search.service';

interface ChatDto {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

interface SaveSelectedDto {
  selectedCases: Array<{ id: string; description?: string }>;
}

@Controller('case-search')
export class CaseSearchController {
  constructor(private readonly caseSearchService: CaseSearchService) {}

  @Get('health')
  health() { return this.caseSearchService.health(); }

  @Post('chat')
  async chat(@Body() body: ChatDto): Promise<ChatResponse> {
    try {
      const { message } = body;
      if (!message || message.trim() === '') {
        return {
          status: 'error',
          reply: '请输入搜索关键词。',
          cases: [],
        };
      }
      const result = await this.caseSearchService.searchCases(message.trim());
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

  @Post('all')
  async getAllCases(): Promise<ChatResponse> {
    try {
      return await this.caseSearchService.getAllCases();
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

  @Post('save')
  async saveSelectedCases(
    @Body() body: SaveSelectedDto,
  ): Promise<{ success: boolean }> {
    try {
      const { selectedCases } = body;
      const success =
        await this.caseSearchService.saveSelectedCases(selectedCases);
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
