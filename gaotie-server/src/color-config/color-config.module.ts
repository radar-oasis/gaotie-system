import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ColorConfigController } from './color-config.controller';
import { ColorConfigService } from './color-config.service';
import { ColorPaletteService } from './color-palette.service';
import { Neo4jModule } from '../neo4j.module';

@Module({
  imports: [
    Neo4jModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  ],
  controllers: [ColorConfigController],
  providers: [ColorConfigService, ColorPaletteService],
  exports: [ColorConfigService, ColorPaletteService],
})
export class ColorConfigModule {}
