import { BadRequestException } from '@nestjs/common';
import { ColorConfigService } from './color-config.service';
import { ColorPaletteService } from './color-palette.service';
import { Neo4jService } from '../neo4j.service';

function createRecord(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

function createServiceWithSession(records: Array<{ get: jest.Mock }> = []) {
  const session = {
    run: jest.fn().mockResolvedValue({ records }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const neo4jService = {
    getSession: jest.fn().mockReturnValue(session),
  } as unknown as Neo4jService;
  const colorPaletteService = {
    extractBasePalette: jest.fn(),
    generatePaletteGroups: jest.fn(),
  } as unknown as ColorPaletteService;

  return {
    service: new ColorConfigService(neo4jService, colorPaletteService),
    session,
    colorPaletteService,
  };
}

describe('ColorConfigService', () => {
  it('persists the selected layout snapshot with the color scheme', async () => {
    const { service, session } = createServiceWithSession([
      createRecord({ cs: { properties: {} } }),
    ]);

    await service.saveColorScheme({
      name: '蓝白方案',
      layoutSchemeId: 'layout-1',
      projectId: 'project-1',
      layoutComponentsMap: {
        车窗带: 'A3',
        腰线: 'B2',
      },
      regions: [
        {
          id: 'region_车窗带_A3',
          name: '车窗带',
          color: '#1D4ED8',
          description: '采用由深到浅的蓝色渐变',
        },
      ],
      palette: ['#1D4ED8'],
    });

    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('layoutComponentsMapJson'),
      expect.objectContaining({
        layoutComponentsMapJson: JSON.stringify({
          车窗带: 'A3',
          腰线: 'B2',
        }),
        projectId: 'project-1',
      }),
    );
  });

  it('filters saved color schemes by project and layout scheme', async () => {
    const { service, session } = createServiceWithSession();

    await service.getColorSchemes({
      projectId: 'project-1',
      layoutSchemeId: 'layout-1',
    });

    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('cs.projectId = $projectId'),
      expect.objectContaining({
        projectId: 'project-1',
        layoutSchemeId: 'layout-1',
      }),
    );
  });

  it('surfaces palette extraction errors instead of returning fake palettes', async () => {
    const { service, colorPaletteService } = createServiceWithSession();
    jest
      .spyOn(colorPaletteService, 'extractBasePalette')
      .mockRejectedValue(new Error('invalid image'));

    await expect(service.extractPaletteFromImage(Buffer.from('bad'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
