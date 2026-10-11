import { withDependencyDeadline, closeSessionWithoutBlocking } from './dependency-deadline';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

export interface CaseGraphHealth {
  available: boolean;
  reason: 'ready' | 'not_configured' | 'unavailable' | 'empty';
  trainCount: number;
  message: string;
}

@Injectable()
export class Neo4jCaseService implements OnModuleDestroy {
  private driver?: Driver;
  private configurationError = false;

  constructor() {
    const password = process.env.NEO4J_CASE_PASSWORD;
    if (password) {
      try { this.driver = neo4j.driver(
        process.env.NEO4J_CASE_URI || 'bolt://127.0.0.1:7688',
        neo4j.auth.basic(process.env.NEO4J_CASE_USER || 'neo4j', password),
        { connectionTimeout: 2000, connectionAcquisitionTimeout: 2500, maxTransactionRetryTime: 0 },
      ); } catch { this.configurationError = true; }
    }
  }

  getSession(): Session {
    if (!this.driver) throw new Error('Case graph is not configured');
    return this.driver.session({ database: process.env.NEO4J_CASE_DATABASE || undefined });
  }

  async health(): Promise<CaseGraphHealth> {
    if (this.configurationError) return { available: false, reason: 'not_configured', trainCount: 0, message: '案例库连接配置无效，请检查 NEO4J_CASE_URI 协议与地址；可跳过案例继续设计。' };
    if (!this.driver) return { available: false, reason: 'not_configured', trainCount: 0,
      message: '案例库尚未配置。请配置 NEO4J_CASE_URI / NEO4J_CASE_USER / NEO4J_CASE_PASSWORD；也可跳过案例继续设计。' };
    const session = this.getSession();
    try {
      const result = await withDependencyDeadline(() => session.run('MATCH (t:Train) RETURN count(t) AS count', {}, { timeout: 2000 }), 3000);
      const count = result.records[0]?.get('count');
      const trainCount = typeof count?.toNumber === 'function' ? count.toNumber() : Number(count || 0);
      return { available: trainCount > 0, reason: trainCount > 0 ? 'ready' : 'empty', trainCount,
        message: trainCount > 0 ? `案例库已就绪，共 ${trainCount} 个案例。` : '案例库连接正常，但尚未导入案例数据；可跳过案例继续设计。' };
    } catch {
      return { available: false, reason: 'unavailable', trainCount: 0,
        message: '案例数据库未就绪，请检查服务、连接配置和凭据；可跳过案例继续设计。' };
    } finally { closeSessionWithoutBlocking(session); }
  }

  async close() { await this.driver?.close(); }
  async onModuleDestroy() { await this.close(); }
}
