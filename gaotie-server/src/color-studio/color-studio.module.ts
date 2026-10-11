import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ColorStudioController } from './color-studio.controller';
@Module({ imports: [AuthModule], controllers: [ColorStudioController] })
export class ColorStudioModule {}
