jest.mock('../codex-image/codex-image-client', () => ({generateCodexImage: jest.fn()}));
jest.mock('./load-reference-image', () => ({loadReferenceImage: jest.fn()}));
import {generateCodexImage} from '../codex-image/codex-image-client';
import {loadReferenceImage} from './load-reference-image';
import {SuperCanvasService} from '../super-canvas/super-canvas.service';
import {FinalProposalsService} from '../final-proposals/final-proposals.service';
import {PromptComposerService} from '../final-proposals/prompt-composer.service';
import {FinalProposalsRepository} from '../final-proposals/final-proposals.repository';

describe('service cancellation propagation', () => {
  const old = process.env.LOCAL_CODEX_IMAGE_ENABLED;
  beforeEach(() => { jest.resetAllMocks(); process.env.LOCAL_CODEX_IMAGE_ENABLED = 'true'; });
  afterAll(() => { if (old === undefined) delete process.env.LOCAL_CODEX_IMAGE_ENABLED; else process.env.LOCAL_CODEX_IMAGE_ENABLED = old; });
  const run = (kind: string, signal: AbortSignal) => {
    if (kind === 'canvas') return (new SuperCanvasService().generateTransparentAsset as any)({prompt:'龙',referenceImageUrl:'/images/a.png'}, {signal});
    const service = new FinalProposalsService(new PromptComposerService(), new FinalProposalsRepository());
    const body = {designPackage:{demandTags:[],selectedPatterns:[],selectedCases:[],canvasAssets:[{id:'a',name:'图',source:'capture',imageUrl:'/images/a.png'}]},baseImageUrl:'/images/b.png',instruction:'流线化'};
    return (service[kind === 'iterate' ? 'iterate' : 'generate'] as any).call(service, body, {signal});
  };
  it.each(['canvas','final','iterate'])('%s does not start Codex after cancellation while loading', async kind => {
    const abort = new AbortController();
    jest.mocked(loadReferenceImage).mockImplementation(async () => {abort.abort();return Buffer.from('ref');});
    jest.mocked(generateCodexImage).mockRejectedValue(new Error('must not call generator'));
    await expect(run(kind,abort.signal)).rejects.toThrow('已取消');
    expect(generateCodexImage).not.toHaveBeenCalled();
  });
  it.each(['canvas','final','iterate'])('%s passes the same live signal to Codex', async kind => {
    const abort = new AbortController();
    jest.mocked(loadReferenceImage).mockResolvedValue(Buffer.from('ref'));
    jest.mocked(generateCodexImage).mockRejectedValue(new Error('provider stopped'));
    await expect(run(kind,abort.signal)).rejects.toThrow('provider stopped');
    expect(jest.mocked(generateCodexImage).mock.calls[0][0].signal).toBe(abort.signal);
  });
});
