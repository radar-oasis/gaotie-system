import {
  ColorStudioController,
  requireStudioAccess,
  localUploadName,
} from './color-studio.controller';
import * as images from './images';
import sharp from 'sharp';
describe('color studio access and routes', () => {
  afterEach(() => jest.restoreAllMocks());
  const auth: any = {
    getSessionTokenFromCookieHeader: () => '',
    getUserBySessionToken: jest.fn(async () => ({ id: '1' })),
  };
  const request: any = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3001', origin: 'http://localhost:5173' },
  };
  it('accepts authenticated local access', async () => {
    await expect(requireStudioAccess(auth, request)).resolves.toBeUndefined();
  });
  it.each([
    { ...request, socket: { remoteAddress: '10.0.0.1' } },
    { ...request, headers: { host: 'evil.example' } },
    {
      ...request,
      headers: { host: 'localhost:3001', origin: 'https://evil.example' },
    },
  ])(
    'rejects nonlocal calls even when local image feature disabled',
    async (req) => {
      await expect(requireStudioAccess(auth, req)).rejects.toThrow();
    },
  );
  it('rejects missing sessions', async () => {
    await expect(
      requireStudioAccess(
        { ...auth, getUserBySessionToken: async () => null },
        request,
      ),
    ).rejects.toThrow();
  });
  it('accepts only exact generated local names', () => {
    expect(
      localUploadName(
        '/color-studio/uploads/12345678-abcd-4abc-9abc-123456789abc.png',
      ),
    ).toBe('12345678-abcd-4abc-9abc-123456789abc.png');
    for (const x of [
      '/color-studio/uploads/../secrets',
      '/color-studio/uploads/%2e%2e/x.png',
      '/color-studio/uploads/a.png?x=y',
    ])
      expect(localUploadName(x)).toBeNull();
  });
  it('rejects missing upload and excessive image requests', async () => {
    const controller = new ColorStudioController(auth);
    await expect(controller.upload(undefined, request)).rejects.toThrow();
    await expect(
      controller.extract({ imageUrls: [] }, request),
    ).rejects.toThrow();
    await expect(
      controller.extract(
        { imageUrls: Array(7).fill('https://example.com/a.png') },
        request,
      ),
    ).rejects.toThrow();
  });
  it('extracts from usable images and reports failed downloads and invalid images', async () => {
    const red = await sharp({create:{width:20,height:20,channels:3,background:'#cc2233'}}).png().toBuffer();
    jest.spyOn(images, 'downloadImage').mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(Buffer.from('invalid')).mockResolvedValueOnce(red);
    const result = await new ColorStudioController(auth).extract({imageUrls:['https://example.com/a.png','https://example.com/b.png','https://example.com/c.png']}, request);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result).toMatchObject({successfulImages:1, failedImageUrls:['https://example.com/a.png','https://example.com/b.png']});
  });
  it('gives an actionable error if no image can be extracted', async () => {
    jest.spyOn(images, 'downloadImage').mockRejectedValue(new Error('timeout'));
    await expect(new ColorStudioController(auth).extract({imageUrls:['https://example.com/a.png']}, request)).rejects.toThrow('所有图片均无法提色');
  });
});
