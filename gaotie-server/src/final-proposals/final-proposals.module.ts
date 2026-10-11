import { AssetsModule } from '../assets/assets.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinalProposalsController } from './final-proposals.controller';
import { FinalProposalsRepository } from './final-proposals.repository';
import { FinalProposalsService } from './final-proposals.service';
import { PromptComposerService } from './prompt-composer.service';

@Module({
  imports: [AuthModule, AssetsModule],
  controllers: [FinalProposalsController],
  providers: [
    FinalProposalsRepository,
    FinalProposalsService,
    PromptComposerService,
  ],
})
export class FinalProposalsModule {}
