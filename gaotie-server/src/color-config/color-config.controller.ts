import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ColorConfigService } from './color-config.service';
import type {
  SaveColorSchemeDto,
  ColorSchemeResponse,
} from './color-config.types';

@Controller('color-config')
export class ColorConfigController {
  constructor(private readonly colorConfigService: ColorConfigService) {}

  @Post('extract-palette')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  async extractPalette(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!file) {
      throw new BadRequestException('请上传图片文件');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        '不支持的图片格式，请上传 JPG、PNG 或 WebP 格式',
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('图片大小不能超过 10MB');
    }

    try {
      const result = await this.colorConfigService.extractPaletteFromImage(
        file.buffer,
      );
      return result;
    } catch (error) {
      console.error('Extract palette error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('图片解析失败，请上传有效的图片文件');
    }
  }

  @Post('schemes')
  @HttpCode(HttpStatus.CREATED)
  async saveScheme(
    @Body() dto: SaveColorSchemeDto,
  ): Promise<ColorSchemeResponse> {
    try {
      return await this.colorConfigService.saveColorScheme(dto);
    } catch (error) {
      console.error('Save scheme error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('保存失败，请检查输入数据');
    }
  }

  @Get('schemes')
  async getSchemes(
    @Query('layoutSchemeId') layoutSchemeId?: string,
    @Query('projectId') projectId?: string,
  ): Promise<ColorSchemeResponse[]> {
    try {
      return await this.colorConfigService.getColorSchemes({
        layoutSchemeId,
        projectId,
      });
    } catch (error) {
      console.error('Get schemes error:', error);
      throw new BadRequestException('查询失败');
    }
  }

  @Get('schemes/:id')
  async getSchemeById(@Param('id') id: string): Promise<ColorSchemeResponse> {
    try {
      return await this.colorConfigService.getColorSchemeById(id);
    } catch (error) {
      console.error('Get scheme by id error:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      const { NotFoundException } = await import('@nestjs/common');
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('查询失败');
    }
  }

  @Delete('schemes/:id')
  @HttpCode(HttpStatus.OK)
  async deleteScheme(@Param('id') id: string): Promise<{ success: boolean }> {
    try {
      return await this.colorConfigService.deleteColorScheme(id);
    } catch (error) {
      console.error('Delete scheme error:', error);
      const { NotFoundException } = await import('@nestjs/common');
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('删除失败');
    }
  }
}
