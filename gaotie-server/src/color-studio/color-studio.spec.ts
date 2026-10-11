import { validateChat, validateAnswer } from './contract';
import {
  isPublicIp,
  validateRemoteUrl,
  downloadImage,
  pinnedLookup,
} from './images';
import { extractColors, validateImage } from './palette';
import sharp from 'sharp';

describe('color studio contract', () => {
  it('defaults omitted mode to chat', () =>
    expect(
      validateChat({ message: '你好', context: [], history: [] }).mode,
    ).toBe('chat'));
  const input = {
    message: '暖色',
    context: [],
    history: [],
    mode: 'palette',
    candidateColors: ['#FFFFFF', '#223344'],
  };
  const answer = {
    reply: '配色建议',
    images: [],
    palette: {
      name: '暖色',
      colors: [
        { hex: '#FFFFFF', role: '背景', proportion: 70 },
        { hex: '#223344', role: '点缀', proportion: 30 },
      ],
      rationale: '浅色为主',
    },
  };
  it('accepts validated candidate-only palettes', () =>
    expect(
      validateAnswer(answer, validateChat(input)).palette?.colors,
    ).toHaveLength(2));
  it('accepts harmless formatting differences without changing the model colors or input', () => {
    const raw = {
      reply: '配色建议',
      palette: {
        name: '方案',
        rationale: '浅色为主',
        colors: [
          { hex: ' #fff ', role: '背景', proportion: '70%' },
          { hex: '#223344', role: '点缀', proportion: '30' },
        ],
      },
    };
    const before = JSON.stringify(raw);
    const result = validateAnswer(raw, validateChat(input));
    expect(result.images).toEqual([]);
    expect(result.palette?.colors).toEqual([
      { hex: '#FFFFFF', role: '背景', proportion: 70 },
      { hex: '#223344', role: '点缀', proportion: 30 },
    ]);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('converts an explicit fractional distribution and corrects only tiny rounding differences', () => {
    for (const ratios of [
      [0.7, 0.3],
      [66.67, 33.32],
    ]) {
      const result = validateAnswer(
        {
          ...answer,
          palette: {
            ...answer.palette,
            colors: answer.palette.colors.map((c, i) => ({
              ...c,
              proportion: ratios[i],
            })),
          },
        },
        validateChat(input),
      );
      expect(
        result.palette!.colors.reduce((sum, c) => sum + c.proportion, 0),
      ).toBeCloseTo(100, 8);
    }
  });
  it('identifies the failed field instead of collapsing every failure to one generic error', () => {
    expect(() =>
      validateAnswer(
        {
          ...answer,
          palette: {
            ...answer.palette,
            colors: [{ hex: '#FF0000', role: '主色', proportion: 100 }],
          },
        },
        validateChat(input),
      ),
    ).toThrow('候选色');
    expect(() =>
      validateAnswer(
        {
          ...answer,
          palette: {
            ...answer.palette,
            colors: [{ hex: '#FFFFFF', role: '背景', proportion: 70 }],
          },
        },
        validateChat(input),
      ),
    ).toThrow('比例合计');
  });
  it.each([
    null,
    {},
    { ...input, message: '' },
    { ...input, context: [1] },
    { ...input, history: [{ role: 'system', text: 'x' }] },
    { ...input, candidateColors: ['red'] },
    { ...input, mode: 'other' },
  ])('rejects invalid input %j', (v) =>
    expect(() => validateChat(v)).toThrow(),
  );
  it('rejects invented candidates', () =>
    expect(() =>
      validateAnswer(
        {
          ...answer,
          palette: {
            ...answer.palette,
            colors: [{ hex: '#FF0000', role: '背景', proportion: 100 }],
          },
        },
        validateChat(input),
      ),
    ).toThrow());
  it('rejects ratios not totaling 100', () =>
    expect(() =>
      validateAnswer(
        {
          ...answer,
          palette: {
            ...answer.palette,
            colors: [{ hex: '#FFFFFF', role: '背景', proportion: 70 }],
          },
        },
        validateChat(input),
      ),
    ).toThrow());
  it('rejects missing or malformed model output', () => {
    expect(() => validateAnswer({}, validateChat(input))).toThrow();
    expect(() =>
      validateAnswer({ reply: 'x', images: [] }, validateChat(input)),
    ).toThrow();
  });
  it('rejects images without HTTPS source provenance', () =>
    expect(() =>
      validateAnswer(
        {
          ...answer,
          images: [
            {
              id: '1',
              title: 'x',
              imageUrl: 'https://example.com/a.png',
              sourceUrl: 'http://localhost/',
            },
          ],
        },
        validateChat(input),
      ),
    ).toThrow());
});

describe('safe image download', () => {
  it('pins both standard and all-address Node lookup forms', () => {
    const callback = jest.fn();
    const lookup = pinnedLookup({ address: '8.8.8.8', family: 4 });
    lookup('example.com', { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
    ]);
    lookup('example.com', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, '8.8.8.8', 4);
  });
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('blocks private/reserved IP %s', (ip) =>
    expect(isPublicIp(ip)).toBe(false),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public IP %s',
    (ip) => expect(isPublicIp(ip)).toBe(true),
  );
  it.each([
    'http://example.com/x',
    'https://user:pass@example.com/x',
    'https://localhost/x',
    'https://[::ffff:127.0.0.1]/x',
    '/color-studio/uploads/../secret',
  ])('rejects unsafe URLs %s', (url) =>
    expect(() => validateRemoteUrl(url)).toThrow(),
  );
  it('blocks redirect responses', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const transport = jest.fn(async () => ({
      status: 302,
      mime: 'image/png',
      bytes: Buffer.from('x'),
    }));
    await expect(
      downloadImage('https://example.com/a', { resolve, transport }),
    ).rejects.toThrow();
  });
  it('rejects mixed private/public DNS answers before request', async () => {
    const transport = jest.fn();
    await expect(
      downloadImage('https://example.com/a', {
        resolve: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('palette extraction', () => {
  it('rejects fully transparent images instead of using hidden pixels', async () => {
    const buffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    await expect(extractColors([buffer])).rejects.toThrow();
  });
  it('uses alpha 128 consistently for quantified colors and neutrals', async () => {
    const raw = Buffer.alloc(256 * 256 * 4);
    for (let i = 0; i < 256 * 256; i++) {
      raw[i * 4] = 255;
      raw[i * 4 + 1] = i < 32768 ? 255 : 0;
      raw[i * 4 + 2] = i < 32768 ? 255 : 0;
      raw[i * 4 + 3] = i < 32768 ? 126 : 255;
    }
    const buffer = await sharp(raw, {
      raw: { width: 256, height: 256, channels: 4 },
    })
      .png()
      .toBuffer();
    const colors = await extractColors([buffer]);
    expect(colors.every((hex) => parseInt(hex.slice(3, 5), 16) < 40)).toBe(
      true,
    );
  });
  it('never invents neutral colors from transparent RGB', async () => {
    const buffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 5, height: 5, channels: 4, background: '#ff0000' },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const colors = await extractColors([buffer]);
    expect(
      colors.some((hex) => {
        const [r, g, b] = [1, 3, 5].map((i) =>
          parseInt(hex.slice(i, i + 2), 16),
        );
        return Math.max(r, g, b) - Math.min(r, g, b) < 20;
      }),
    ).toBe(false);
  });
  it('preserves a white neutral image beside a saturated image despite dimensions', async () => {
    const white = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const red = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const colors = await extractColors([white, red]);
    expect(colors).toContain('#FFFFFF');
    expect(
      colors.some(
        (x) =>
          parseInt(x.slice(1, 3), 16) > 220 && parseInt(x.slice(3, 5), 16) < 40,
      ),
    ).toBe(true);
  });
  it('rejects non image bytes', async () =>
    expect(validateImage(Buffer.from('<svg/>'))).rejects.toThrow());
});
