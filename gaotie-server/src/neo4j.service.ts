import { withDependencyDeadline, closeSessionWithoutBlocking } from './dependency-deadline';
import { Injectable } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

@Injectable()
export class Neo4jService {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || ''),
      { connectionTimeout: 2000, connectionAcquisitionTimeout: 2500, maxTransactionRetryTime: 0 },
    );
  }

  getSession(): Session {
    return this.driver.session();
  }

  async health(): Promise<{available: boolean; message: string}> {
    const session = this.getSession();
    try {
      await withDependencyDeadline(() => session.run('RETURN 1 AS ready', {}, {timeout: 2000}), 3000);
      return {available: true, message: '纹样图谱已连接'};
    } catch { return {available: false, message: '纹样图谱连接失败，请检查服务与配置'}; }
    finally { closeSessionWithoutBlocking(session); }
  }

  async close() {
    await this.driver.close();
  }
}
