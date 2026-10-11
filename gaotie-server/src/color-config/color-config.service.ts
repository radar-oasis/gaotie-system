import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Neo4jService } from '../neo4j.service';
import { ColorPaletteService } from './color-palette.service';
import type {
  SaveColorSchemeDto,
  ColorSchemeResponse,
  ExtractPaletteResponse,
  PaletteGroup,
} from './color-config.types';
import { isValidHex } from './color-utils';

@Injectable()
export class ColorConfigService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly colorPaletteService: ColorPaletteService,
  ) {}

  async extractPaletteFromImage(
    imageBuffer: Buffer,
  ): Promise<ExtractPaletteResponse> {
    try {
      const basePalette =
        await this.colorPaletteService.extractBasePalette(imageBuffer);

      const groups: PaletteGroup[] = [];
      if (basePalette.length > 0) {
        const mainColor = basePalette[0];
        groups.push(
          ...this.colorPaletteService.generatePaletteGroups(mainColor),
        );
      }

      return {
        status: 'success',
        basePalette,
        groups,
      };
    } catch (error) {
      console.error('Extract palette error:', error);
      throw new BadRequestException('图片解析失败，请上传有效的图片文件');
    }
  }

  async saveColorScheme(dto: SaveColorSchemeDto): Promise<ColorSchemeResponse> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('方案名称不能为空');
    }

    if (!dto.layoutSchemeId) {
      throw new BadRequestException('布局方案ID不能为空');
    }

    if (!dto.regions || dto.regions.length === 0) {
      throw new BadRequestException('施色域不能为空');
    }

    for (const region of dto.regions) {
      if (region.color && !isValidHex(region.color)) {
        throw new BadRequestException(`无效的HEX颜色值: ${region.color}`);
      }
    }

    const id = `color_scheme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();
    const session = this.neo4jService.getSession();

    try {
      const query = `
        CREATE (cs:ColorScheme {
          id: $id,
          name: $name,
          layoutSchemeId: $layoutSchemeId,
          projectId: $projectId,
          layoutComponentsMapJson: $layoutComponentsMapJson,
          regionsJson: $regionsJson,
          paletteJson: $paletteJson,
          createdAt: $createdAt
        })
        RETURN cs
      `;

      const regionsJson = JSON.stringify(dto.regions);
      const paletteJson = JSON.stringify(dto.palette || []);
      const layoutComponentsMapJson = JSON.stringify(dto.layoutComponentsMap || {});

      const result = await session.run(query, {
        id,
        name: dto.name.trim(),
        layoutSchemeId: dto.layoutSchemeId,
        projectId: dto.projectId?.trim() || null,
        layoutComponentsMapJson,
        regionsJson,
        paletteJson,
        createdAt,
      });

      if (result.records.length === 0) {
        throw new Error('Failed to create color scheme');
      }

      return {
        id,
        name: dto.name.trim(),
        layoutSchemeId: dto.layoutSchemeId,
        projectId: dto.projectId?.trim() || null,
        layoutComponentsMap: dto.layoutComponentsMap || {},
        regions: dto.regions,
        palette: dto.palette || [],
        createdAt,
      };
    } finally {
      await session.close();
    }
  }

  async getColorSchemes(input: {
    layoutSchemeId?: string;
    projectId?: string;
  } = {}): Promise<ColorSchemeResponse[]> {
    const session = this.neo4jService.getSession();

    try {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};
      const layoutSchemeId = input.layoutSchemeId?.trim();
      const projectId = input.projectId?.trim();

      if (layoutSchemeId) {
        conditions.push('cs.layoutSchemeId = $layoutSchemeId');
        params.layoutSchemeId = layoutSchemeId;
      }

      if (projectId) {
        conditions.push('cs.projectId = $projectId');
        params.projectId = projectId;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `
        MATCH (cs:ColorScheme)
        ${whereClause}
        RETURN cs
        ORDER BY cs.createdAt DESC
      `;
      const result = await session.run(query, params);

      return result.records.map((record) => {
        const cs = record.get('cs').properties as Record<string, unknown>;
        return {
          id: cs.id as string,
          name: cs.name as string,
          layoutSchemeId: cs.layoutSchemeId as string,
          projectId: (cs.projectId as string | undefined) ?? null,
          layoutComponentsMap: JSON.parse(
            (cs.layoutComponentsMapJson as string | undefined) || '{}',
          ),
          regions: JSON.parse(cs.regionsJson as string),
          palette: JSON.parse(cs.paletteJson as string),
          createdAt: cs.createdAt as string,
          updatedAt: cs.updatedAt as string | undefined,
        };
      });
    } finally {
      await session.close();
    }
  }

  async getColorSchemeById(id: string): Promise<ColorSchemeResponse> {
    const session = this.neo4jService.getSession();

    try {
      const query = `
        MATCH (cs:ColorScheme {id: $id})
        RETURN cs
      `;

      const result = await session.run(query, { id });

      if (result.records.length === 0) {
        throw new NotFoundException(`色彩方案不存在: ${id}`);
      }

      const cs = result.records[0].get('cs').properties as Record<
        string,
        unknown
      >;

      return {
        id: cs.id as string,
        name: cs.name as string,
        layoutSchemeId: cs.layoutSchemeId as string,
        projectId: (cs.projectId as string | undefined) ?? null,
        layoutComponentsMap: JSON.parse(
          (cs.layoutComponentsMapJson as string | undefined) || '{}',
        ),
        regions: JSON.parse(cs.regionsJson as string),
        palette: JSON.parse(cs.paletteJson as string),
        createdAt: cs.createdAt as string,
        updatedAt: cs.updatedAt as string | undefined,
      };
    } finally {
      await session.close();
    }
  }

  async deleteColorScheme(id: string): Promise<{ success: boolean }> {
    const session = this.neo4jService.getSession();

    try {
      const query = `
        MATCH (cs:ColorScheme {id: $id})
        DELETE cs
        RETURN count(*) as deletedCount
      `;

      const result = await session.run(query, { id });

      if (
        result.records.length === 0 ||
        result.records[0].get('deletedCount').toInt() === 0
      ) {
        throw new NotFoundException(`色彩方案不存在: ${id}`);
      }

      return { success: true };
    } finally {
      await session.close();
    }
  }
}
