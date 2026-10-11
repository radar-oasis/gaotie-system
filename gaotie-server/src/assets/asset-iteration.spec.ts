import { FinalProposalsController } from '../final-proposals/final-proposals.controller';
import { AssetsService, assetImageId } from './assets.service';
import { NotFoundException } from '@nestjs/common';
const id = '22222222-2222-4222-8222-222222222222';
it('does not treat a remote lookalike as an owned asset URL', () => {
  expect(assetImageId(`https://other.example/assets/${id}/image`)).toBeNull();
  expect(assetImageId(`/assets/${id}/image`)).toBe(id);
});
it('cannot read another user’s private asset as an image reference', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  await expect(
    new AssetsService(db as any).readImage('owner', `/assets/${id}/image`),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining('user_id = $1'),
    ['owner', id],
  );
});
it('authenticates a saved asset before using it as an iteration base', async () => {
  const previous = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  process.env.LOCAL_CODEX_IMAGE_ENABLED = 'false';
  try {
    const service = { iterate: jest.fn().mockResolvedValue({ id: 'result' }) };
    const auth = {
      getSessionTokenFromCookieHeader: jest.fn().mockReturnValue('session'),
      getUserBySessionToken: jest.fn().mockResolvedValue({ id: 'owner' }),
    };
    const assets = {
      readImage: jest.fn().mockResolvedValue(Buffer.from('png')),
    };
    const controller = new FinalProposalsController(
      service as any,
      auth as any,
      assets as any,
    );
    await controller.iterate(
      {
        baseImageUrl: `/assets/${id}/image`,
        instruction: '细化',
        designPackage: {
          demandTags: [],
          selectedPatterns: [],
          selectedCases: [],
        },
      },
      { headers: { cookie: 'session' } } as any,
    );
    expect(assets.readImage).toHaveBeenCalledWith(
      'owner',
      `/assets/${id}/image`,
    );
    expect(service.iterate).toHaveBeenCalledWith(
      expect.objectContaining({ baseImageUrl: 'data:image/png;base64,cG5n' }),
    );
  } finally {
    if (previous === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
    else process.env.LOCAL_CODEX_IMAGE_ENABLED = previous;
  }
});

it('resolves adopted private references as the authenticated owner before generation', async () => {
  const prior = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  process.env.LOCAL_CODEX_IMAGE_ENABLED = 'false';
  try {
    const service = { generate: jest.fn().mockResolvedValue({ id: 'result' }) };
    const auth = { getSessionTokenFromCookieHeader: jest.fn().mockReturnValue('session'), getUserBySessionToken: jest.fn().mockResolvedValue({ id: 'owner' }) };
    const assets = { readImage: jest.fn().mockResolvedValue(Buffer.from('reference')) };
    const controller = new FinalProposalsController(service as any, auth as any, assets as any);
    const url = `/assets/references/${id}/image`;
    await controller.generate({ selectedReferenceImageUrls: [url], designPackage: { demandTags: [], selectedPatterns: [], selectedCases: [], canvasAssets: [{ id: 'c', name: '纹样', imageUrl: url, source: 'layer' }] } }, { headers: { cookie: 'session' } } as any);
    expect(assets.readImage).toHaveBeenCalledWith('owner', url);
    const called = service.generate.mock.calls[0][0];
    expect(called.selectedReferenceImageUrls[0]).toBe('data:image/png;base64,cmVmZXJlbmNl');
    expect(called.designPackage.canvasAssets[0].imageUrl).toBe(called.selectedReferenceImageUrls[0]);
  } finally { if (prior === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED; else process.env.LOCAL_CODEX_IMAGE_ENABLED = prior; }
});
