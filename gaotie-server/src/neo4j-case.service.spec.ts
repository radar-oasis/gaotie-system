import { Neo4jCaseService } from './neo4j-case.service';
import neo4j from 'neo4j-driver';
jest.mock('neo4j-driver', () => ({ __esModule: true, default: { driver: jest.fn(), auth: { basic: jest.fn().mockReturnValue({scheme: 'basic'}) } } }));
describe('case graph dependency', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; jest.clearAllMocks(); });
  it('reports missing configuration without attempting a connection', async () => {
    delete process.env.NEO4J_CASE_PASSWORD;
    const service = new Neo4jCaseService();
    expect(await service.health()).toEqual(expect.objectContaining({ available: false, reason: 'not_configured' }));
    expect(neo4j.driver).not.toHaveBeenCalled();
  });
  it('uses configured endpoint and bounded driver/query timeouts', async () => {
    process.env.NEO4J_CASE_URI = 'bolt://127.0.0.1:7687';
    process.env.NEO4J_CASE_PASSWORD = 'test';
    process.env.NEO4J_CASE_DATABASE = 'cases';
    const session = { run: jest.fn().mockResolvedValue({ records: [{get: () => ({toNumber: () => 86})}] }), close: jest.fn() };
    const driver = { session: jest.fn().mockReturnValue(session), close: jest.fn() };
    (neo4j.driver as jest.Mock).mockReturnValue(driver);
    const service = new Neo4jCaseService();
    expect(await service.health()).toEqual(expect.objectContaining({available: true, trainCount: 86}));
    expect(neo4j.driver).toHaveBeenCalledWith('bolt://127.0.0.1:7687', expect.anything(), expect.objectContaining({connectionTimeout: 2000, connectionAcquisitionTimeout: 2500}));
    expect(driver.session).toHaveBeenCalledWith(expect.objectContaining({database: 'cases'}));
    expect(session.close).toHaveBeenCalled();
  });
});

it('returns even when an established connection and session cleanup hang', async () => {
 const prior=process.env.NEO4J_CASE_PASSWORD; process.env.NEO4J_CASE_PASSWORD='test'; jest.useFakeTimers();
 const session={run:jest.fn(()=>new Promise(()=>{})),close:jest.fn(()=>new Promise(()=>{}))};
 (neo4j.driver as jest.Mock).mockReturnValue({session:()=>session});
 const service=new Neo4jCaseService(); const pending=service.health();
 await jest.advanceTimersByTimeAsync(3001);
 expect(await pending).toMatchObject({available:false,reason:'unavailable'});
 expect(session.close).toHaveBeenCalled();
 jest.useRealTimers(); if(prior===undefined)delete process.env.NEO4J_CASE_PASSWORD;else process.env.NEO4J_CASE_PASSWORD=prior;
});
