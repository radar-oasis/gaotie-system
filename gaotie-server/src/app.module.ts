import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Neo4jModule } from './neo4j.module';
import { Neo4jCaseModule } from './neo4j-case.module';
import { SuperCanvasController } from './super-canvas/super-canvas.controller';
import { SuperCanvasService } from './super-canvas/super-canvas.service';
import { ColorConfigModule } from './color-config/color-config.module';
import { FinalProposalsModule } from './final-proposals/final-proposals.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { PromptEnhancerController } from './super-canvas/prompt-enhancer.controller';
import { PromptEnhancerService } from './super-canvas/prompt-enhancer.service';
import { ColorStudioModule } from './color-studio/color-studio.module';

@Module({
  imports: [
    Neo4jModule,
    Neo4jCaseModule,
    ColorConfigModule,
    FinalProposalsModule,
    AuthModule,
    ProjectsModule,
    ColorStudioModule,
  ],
  controllers: [AppController, SuperCanvasController, PromptEnhancerController],
  providers: [AppService, SuperCanvasService, PromptEnhancerService],
})
export class AppModule {}
