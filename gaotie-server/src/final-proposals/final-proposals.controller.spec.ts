import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FinalProposalsController } from './final-proposals.controller';

describe('archive list scope', () => {
  const request = {headers:{cookie:'session=test'}};
  const auth = {getSessionTokenFromCookieHeader: jest.fn(() => 'token'), getUserBySessionToken: jest.fn(async () => ({id:'owner'}))};
  const assets = {listProposals: jest.fn(async () => [])};
  const controller = new FinalProposalsController({} as any, auth as any, assets as any);
  beforeEach(() => { jest.clearAllMocks(); });
  it('forwards authenticated owner and requested project', async () => {
    await (controller.list as any)(request, {projectId:'project-a'});
    expect(assets.listProposals).toHaveBeenCalledWith('owner', 'project-a');
  });
  it('requires project selection or explicit all-project scope', async () => {
    await expect((controller.list as any)(request, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(assets.listProposals).not.toHaveBeenCalled();
  });
  it('allows explicit all-project scope only for the signed-in owner', async () => {
    await (controller.list as any)(request, {scope:'all'});
    expect(assets.listProposals).toHaveBeenCalledWith('owner');
  });
  it('rejects invalid or ambiguous query scopes', async () => {
    for (const query of [{projectId:[]}, {scope:'other'}, {projectId:'project-a',scope:'all'}]) {
      await expect((controller.list as any)(request, query)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
  it('requires authentication before accessing any archive scope', async () => {
    auth.getUserBySessionToken.mockResolvedValueOnce(null as any);
    await expect((controller.list as any)(request, {scope:'all'})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(assets.listProposals).not.toHaveBeenCalled();
  });
});
