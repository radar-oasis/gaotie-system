import { AssetGraphIntentService } from './asset-graph-intent';
import { AssetGraphService } from './asset-graph.service';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetGraphService, AssetGraphIntentService],
  exports: [AssetsService],
})
export class AssetsModule {}
