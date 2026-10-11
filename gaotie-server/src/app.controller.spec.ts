import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    getHello: jest.Mock;
    deleteLayoutScheme: jest.Mock;
    renameLayoutScheme: jest.Mock;
  };

  beforeEach(async () => {
    appService = {
      getHello: jest.fn().mockReturnValue('Hello World!'),
      deleteLayoutScheme: jest.fn(),
      renameLayoutScheme: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('deleteLayoutScheme', () => {
    it('deletes a layout scheme by id', async () => {
      appService.deleteLayoutScheme.mockResolvedValue(true);

      await expect(
        appController.deleteLayoutScheme('scheme-1'),
      ).resolves.toEqual({
        success: true,
      });

      expect(appService.deleteLayoutScheme).toHaveBeenCalledWith('scheme-1');
    });
  });

  describe('renameLayoutScheme', () => {
    it('renames a layout scheme by id', async () => {
      appService.renameLayoutScheme.mockResolvedValue({
        id: 'scheme-1',
        name: '新名称',
        componentsMap: {},
      });

      await expect(
        appController.renameLayoutScheme('scheme-1', { name: '新名称' }),
      ).resolves.toMatchObject({
        id: 'scheme-1',
        name: '新名称',
      });

      expect(appService.renameLayoutScheme).toHaveBeenCalledWith(
        'scheme-1',
        '新名称',
      );
    });
  });
});
