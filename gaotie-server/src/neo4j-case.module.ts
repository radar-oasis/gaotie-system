import { Module } from '@nestjs/common';
import { Neo4jCaseService } from './neo4j-case.service';
import { CaseSearchService } from './case-search.service';
import { CaseSearchController } from './case-search.controller';

@Module({
  providers: [Neo4jCaseService, CaseSearchService],
  controllers: [CaseSearchController],
  exports: [Neo4jCaseService, CaseSearchService],
})
export class Neo4jCaseModule {}
