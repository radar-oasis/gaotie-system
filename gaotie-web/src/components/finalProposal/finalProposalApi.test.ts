import { afterEach, describe, expect, it, vi } from 'vitest';

const designPackage = {
  demandTags: [{ label: '冰雪蓝', topic: '色彩' }],
  selectedPatterns: [],
  selectedCases: [],
  selectedReferenceImageUrls: [],
};

const importApi = async (apiBaseUrl = 'http://api.test/') => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', apiBaseUrl);

  return import('./finalProposalApi');
};

describe('finalProposalApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts a design package to the final proposal generation endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'temp-1',
        version: 1,
        imageUrl: '/generated/final-proposals/a.png',
        taskId: 'task-1',
        promptUsed: 'prompt',
        designRationale: 'rationale',
        createdAt: '2026-05-14T00:00:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { generateFinalProposal } = await importApi();

    await expect(
      generateFinalProposal({
        designPackage,
        userPrompt: '更有科技感',
        selectedReferenceImageUrls: ['https://assets.example.com/ref.png'],
      }),
    ).resolves.toMatchObject({
      id: 'temp-1',
      imageUrl: '/generated/final-proposals/a.png',
      version: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/final-proposals/generate',
      {
        credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designPackage,
          userPrompt: '更有科技感',
          selectedReferenceImageUrls: ['https://assets.example.com/ref.png'],
        }),
      },
    );
  });

  it('posts iteration requests with the base proposal image and instruction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'temp-2',
        version: 2,
        imageUrl: '/generated/final-proposals/b.png',
        taskId: 'task-2',
        promptUsed: 'prompt',
        designRationale: 'rationale',
        createdAt: '2026-05-14T00:01:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { iterateFinalProposal } = await importApi('http://api.test///');

    await iterateFinalProposal({
      baseProposalId: 'temp-1',
      baseImageUrl: '/generated/final-proposals/a.png',
      instruction: '车头雪花缩小',
      designPackage,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/final-proposals/iterate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          baseProposalId: 'temp-1',
          baseImageUrl: '/generated/final-proposals/a.png',
          instruction: '车头雪花缩小',
          designPackage,
        }),
      }),
    );
  });

  it('throws the backend message when an API request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ message: 'designPackage 不能为空' }),
      }),
    );
    const { generateFinalProposal } = await importApi();

    await expect(
      generateFinalProposal({ designPackage, userPrompt: '' }),
    ).rejects.toThrow('designPackage 不能为空');
  });
});


it('requests archives for the selected project and supports explicit all-project scope', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => []});
  vi.stubGlobal('fetch', fetchMock);
  const { listArchivedProposals } = await importApi();
  await listArchivedProposals({ projectId: 'project/a' });
  expect(fetchMock).toHaveBeenLastCalledWith('http://api.test/final-proposals?projectId=project%2Fa', { credentials: 'include' });
  await listArchivedProposals({ scope: 'all' });
  expect(fetchMock).toHaveBeenLastCalledWith('http://api.test/final-proposals?scope=all', { credentials: 'include' });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('passes cancellation to fetch without putting the signal in the design JSON',async()=>{
 const controller=new AbortController();
 const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'p',version:1,imageUrl:'/p.png',promptUsed:'p',designRationale:'r',createdAt:'now'})});
 vi.stubGlobal('fetch',fetchMock);
 try{
  const {generateFinalProposal}=await importApi();
  await generateFinalProposal({designPackage,signal:controller.signal});
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({designPackage});
 }finally{vi.unstubAllEnvs();vi.unstubAllGlobals();}
});
