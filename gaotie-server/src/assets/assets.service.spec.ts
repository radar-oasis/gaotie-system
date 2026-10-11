import { AssetsService } from './assets.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const user = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
describe('AssetsService ownership and validation', () => {
  let db: { query: jest.Mock };
  let service: AssetsService;
  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    service = new AssetsService(db as any);
  });
  it('scopes listing to the authenticated owner', async () => {
    await service.list(user);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      [user],
    );
  });
  it('does not disclose another user’s asset', async () => {
    await expect(service.get(user, projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      [user, projectId],
    );
  });
  it('requires an owned project before accepting a favorite', async () => {
    await expect(
      service.favorite(user, {
        projectId,
        name: '龙纹',
        imageDataUrl: 'data:image/png;base64,YQ==',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      [user, projectId],
    );
  });
  it('rejects invalid image data before persisting anything', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: projectId, name: '项目 A' }],
    });
    await expect(
      service.favorite(user, {
        projectId,
        name: '龙纹',
        imageDataUrl: 'data:text/html;base64,YQ==',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('scopes removal to the owner and refuses unknown ids', async () => {
    await expect(service.remove(user, projectId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      [user, projectId],
    );
  });
});

// Validate metadata independently of image loading or external services.
describe('proposal archive snapshot validation', () => {
  it('refuses a package without its original design arrays', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue({ rows: [{ id: projectId, name: '项目 A' }] }),
    };
    const service = new AssetsService(db as any);
    await expect(
      service.archive(user, {
        projectId,
        name: '方案',
        version: 1,
        imageUrl: '/image.png',
        promptUsed: '说明',
        designRationale: '',
        packageSnapshot: {} as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('durable archive image URLs', () => {
  it('uses the database image instead of the original generated file', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue({
          rows: [
            {
              id: projectId,
              kind: 'proposal',
              name: '方案',
              project_id: projectId,
              project_name: '项目',
              theme: '',
              imagery: '',
              created_at: '2026-10-06',
              payload: {
                imageUrl: '/generated/final-proposals/old.png',
                version: 1,
              },
            },
          ],
        }),
    };
    const proposal = await new AssetsService(db as any).getProposal(
      user,
      projectId,
    );
    expect(proposal.imageUrl).toBe(`/assets/${projectId}/image`);
  });
});


describe('project-scoped proposal archives', () => {
  it('validates project ownership and applies the project filter in SQL', async () => {
    const db = {query: jest.fn().mockResolvedValueOnce({rows:[{id:projectId,name:'项目',created_at:'2026-10-09'}]}).mockResolvedValueOnce({rows:[]})};
    await (new AssetsService(db as any).listProposals as any)(user, projectId);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FROM projects WHERE user_id = $1 AND id = $2'), [user, projectId]);
    expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('project_id = $2'), [user, projectId]);
  });
  it('rejects an unowned project before reading archives', async () => {
    const db = {query: jest.fn().mockResolvedValue({rows:[]})};
    await expect((new AssetsService(db as any).listProposals as any)(user, projectId)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
