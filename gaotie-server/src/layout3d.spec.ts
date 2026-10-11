import { AppService } from './app.service';
import { buildDesignImagePackage } from './final-proposals/design-image-package';
import { PromptComposerService } from './final-proposals/prompt-composer.service';
import sharp from 'sharp';
import { readFile, unlink, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FinalProposalsService } from './final-proposals/final-proposals.service';
import { FinalProposalsRepository } from './final-proposals/final-proposals.repository';
import { validateLayout3d } from './layout3d';

const config = {
  version: 1,
  model: 'generic-train-v1',
  windowBand: { mode: 'short', crossDoors: false },
  doors: 'white',
  waist: { mode: 'double', width: 'thin', crossDoors: true },
  nose: 'lower',
  roofSide: 'narrow',
  lowerSide: 'wide',
  skirt: false,
};
const layout = (imageUrl: string) => ({
  config,
  views: ['side', 'front', 'perspective'].map((view) => ({ view, imageUrl })),
});
const pkg = (layout3d: unknown): any => ({
  demandTags: [],
  selectedCases: [],
  selectedPatterns: [],
  canvasAssets: [
    { source: 'capture', imageUrl: '/generated/super-canvas/transformed.png' },
  ],
  layoutScheme: {
    id: 'a',
    name: '3D',
    componentsMap: { 车窗带: 'A2' },
    layout3d,
  },
});

describe('3D layout contract', () => {
  it.each([
    ['generic-train-v1', '通用列车车头加一节客车车厢'],
    ['reference-train-v2', '参考照片重建的两节编组列车'],
  ])('describes %s with its model identity and preserves attachments', (model, description) => {
    const layout3d = {
      ...layout('/generated/layout3d/view.png'),
      config: { ...config, model },
    };
    expect(() => validateLayout3d(layout3d)).not.toThrow();
    for (const colorScheme of [undefined, { name: '蓝色', colors: ['#0000ff'] }]) {
      const built = buildDesignImagePackage({
        designPackage: { ...pkg(layout3d), colorScheme },
      });
      expect(built.prompt).toContain(description);
      expect(built.references.filter((r) => r.role === 'layout').map((r) => r.imageUrl))
        .toEqual(Array(3).fill('/generated/layout3d/view.png'));
    }
  });
  it.each(['unknown-train', 'reference-train-v3', '', null])('rejects unsupported model %s', (model) => {
    expect(() => validateLayout3d({
      ...layout('/generated/layout3d/view.png'),
      config: { ...config, model },
    })).toThrow('version/model');
  });
  it('requires transformed artwork for selected motifs in a 3D package', () => {
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    designPackage.canvasAssets = [];
    designPackage.selectedPatterns = [
      { id: 'original', name: '原始纹样', imageUrl: '/original.png' },
    ];
    expect(() => buildDesignImagePackage({ designPackage })).toThrow('已转化');
  });
  it('preserves explicit mixed capture and transformed layer selections', () => {
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    designPackage.canvasAssets.push({
      source: 'layer',
      generated: true,
      imageUrl: '/transformed-layer.png',
    });
    const built = buildDesignImagePackage({
      designPackage,
      selectedReferenceImageUrls: [
        '/transformed-layer.png',
        '/chosen-capture.png',
      ],
    });
    expect(
      built.references
        .filter((r) => r.role === 'canvas')
        .map((r) => r.imageUrl),
    ).toEqual(['/transformed-layer.png', '/chosen-capture.png']);
    expect(() =>
      buildDesignImagePackage({
        designPackage: {
          ...designPackage,
          selectedPatterns: [{ id: 'p', name: 'p', imageUrl: '/original.png' }],
        },
        selectedReferenceImageUrls: [],
      }),
    ).toThrow('已转化');
  });
  it('preserves legacy 2D original-pattern fallback when only layers exist', () => {
    const built = buildDesignImagePackage({
      designPackage: {
        demandTags: [],
        selectedCases: [],
        selectedPatterns: [{ id: 'p', name: 'p', imageUrl: '/original.png' }],
        canvasAssets: [
          { id: 'l', name: 'layer', source: 'layer', imageUrl: '/layer.png' },
        ],
      },
    });
    expect(built.references.map((r) => r.imageUrl)).toEqual(['/original.png']);
  });
  it('defaults a layout-only 3D package to grayscale while explicit text colors take priority', () => {
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    designPackage.canvasAssets = [];
    const built = buildDesignImagePackage({ designPackage, userPrompt: '车窗带使用蓝色，腰线使用金色' });
    expect(built.references).toHaveLength(3);
    expect(built.prompt).toContain('保持黑白灰');
    expect(built.prompt).toContain('默认保持黑白灰');
    expect(built.prompt).toContain('本次明确文字颜色要求优先');
    expect(built.prompt).toContain('不从案例或纹样图片中自行引入颜色');
    expect(built.prompt).toContain('车窗带使用蓝色，腰线使用金色');
    for (const reference of built.references) {
      expect(reference.instruction).toContain('默认保持黑白灰');
      expect(reference.instruction).toContain('本次明确文字颜色要求优先');
    }
    expect(built.prompt).not.toContain('区域配色：以参考图为准');
    expect(built.prompt).not.toContain('灰度不是最终颜色');
    expect(
      new PromptComposerService().composeGeneratePrompt({ designPackage }),
    ).toContain('保持黑白灰');
    expect(new PromptComposerService().composeGeneratePrompt({ designPackage, userPrompt: '车窗带使用蓝色' })).toContain('本次明确文字颜色要求优先');
  });
  it.each(['openai', 'jimeng'])(
    'keeps the iteration base numbered first for %s',
    async (provider) => {
      const oldCodex = process.env.LOCAL_CODEX_IMAGE_ENABLED;
      const oldProvider = process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
      process.env.LOCAL_CODEX_IMAGE_ENABLED = 'false';
      process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = provider;
      const service = new FinalProposalsService(
        new PromptComposerService(),
        new FinalProposalsRepository(),
      );
      const prepared = jest
        .spyOn(service as any, 'prepareReferenceImageUrls')
        .mockImplementation(async (input: any) =>
          buildDesignImagePackage(input).references.map((r) => r.imageUrl),
        );
      const send = jest
        .spyOn(service as any, 'generateImageResponse')
        .mockResolvedValue({ id: 'mock' });
      try {
        await service.iterate({
          baseImageUrl: '/previous.png',
          instruction: '调整线条',
          designPackage: pkg(layout('/generated/layout3d/view.png')),
          selectedReferenceImageUrls: ['/transformed.png'],
        });
        expect(prepared).toHaveBeenCalledWith(
          expect.objectContaining({ baseImageUrl: '/previous.png' }),
        );
        const request = send.mock.calls[0][0] as any;
        expect(request.referenceImageUrls).toEqual([
          '/previous.png',
          '/transformed.png',
          '/generated/layout3d/view.png',
          '/generated/layout3d/view.png',
          '/generated/layout3d/view.png',
        ]);
        expect(request.promptUsed).toContain('本次实际附件共 5 张');
        expect(request.promptUsed).toContain('参考图 1【上一版效果】');
        expect(request.promptUsed).toContain('参考图 2【画布构图】');
        expect(request.promptUsed).toContain('参考图 3【三维布局 side】');
      } finally {
        if (oldCodex === undefined)
          delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
        else process.env.LOCAL_CODEX_IMAGE_ENABLED = oldCodex;
        if (oldProvider === undefined)
          delete process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
        else process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = oldProvider;
      }
    },
  );
  const files: string[] = [];
  afterEach(async () => {
    await Promise.all(
      files.splice(0).map((file) => unlink(file).catch(() => undefined)),
    );
  });
  function setup() {
    let saved: any;
    const session = {
      close: jest.fn(),
      run: jest.fn(async (_query: string, values: any) => {
        if (values?.createdAt) saved = { ...values, id: 'new-id' };
        return { records: [{ get: (key: string) => saved?.[key] }] };
      }),
    };
    return {
      service: new AppService({ getSession: () => session } as any),
      session,
    };
  }
  it.each(['generic-train-v1', 'reference-train-v2'])('saves real PNGs and roundtrips %s config through list/get/rename', async (model) => {
    const { service } = setup();
    const png = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#aaa' },
    })
      .png()
      .toBuffer();
    const saved = (await service.saveLayoutScheme({
      name: 'v1',
      projectId: 'p1',
      componentsMap: {},
      layout3d: {
        ...layout('data:image/png;base64,' + png.toString('base64')),
        config: { ...config, model },
      },
    } as any)) as any;
    for (const view of saved.layout3d?.views ?? [])
      files.push(join(process.cwd(), view.imageUrl));
    expect(saved.layout3d?.config).toEqual({ ...config, model });
    expect(saved.layout3d.views).toHaveLength(3);
    for (const view of saved.layout3d.views) {
      expect(view.imageUrl).toMatch(
        /^\/generated\/layout3d\/[a-f0-9-]+-(side|front|perspective)\.png$/,
      );
      expect(
        (
          await sharp(
            await readFile(join(process.cwd(), view.imageUrl)),
          ).metadata()
        ).format,
      ).toBe('png');
    }
    expect((await service.getLayoutSchemes('p1'))[0]).toMatchObject({
      layout3d: saved.layout3d,
    });
    expect(await service.getLayoutSchemeById('new-id')).toMatchObject({
      layout3d: saved.layout3d,
    });
    expect(await service.renameLayoutScheme('new-id', 'v2')).toMatchObject({
      layout3d: saved.layout3d,
    });
  });
  it.each([
    { layout3d: layout('data:image/png;base64,aGVsbG8=') },
    { layout3d: { config, views: [] } },
    { layout3d: { ...layout('x'), config: { ...config, version: 2 } } },
    { projectId: '', layout3d: layout('x') },
    { layout3d: { ...layout('x'), config: { ...config, skirt: 'false' } } },
    {
      layout3d: {
        ...layout('x'),
        views: [
          { view: 'side', imageUrl: 'x' },
          { view: 'side', imageUrl: 'x' },
          { view: 'front', imageUrl: 'x' },
        ],
      },
    },
  ])('rejects invalid 3D saves before database access: %j', async (change) => {
    const { service, session } = setup();
    await expect(
      service.saveLayoutScheme({
        name: 'x',
        projectId: 'p1',
        componentsMap: {},
        ...change,
      } as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(session.run).not.toHaveBeenCalled();
  });
  it('replaces old component attachments with three masks and describes short bands', () => {
    const built = buildDesignImagePackage({
      designPackage: pkg(layout('/generated/layout3d/view.png')),
    });
    expect(built.references.filter((r) => r.role === 'layout')).toHaveLength(3);
    expect(
      built.references.some((r) => r.imageUrl?.includes('layout-elements')),
    ).toBe(false);
    expect(built.prompt).toContain('短窗带');
    expect(built.prompt).toContain('灰度');
    expect(built.prompt).toContain('1/3');
    expect(built.prompt).not.toContain('必须在车窗区域形成沿车身纵向连续贯穿');
    expect(
      new PromptComposerService().composeGeneratePrompt({
        designPackage: pkg(layout('/generated/layout3d/view.png')),
      }),
    ).toContain('短窗带');
  });
  it('uses the same three masks and selected transformed canvas for legacy providers', async () => {
    const service = new FinalProposalsService(
      new PromptComposerService(),
      new FinalProposalsRepository(),
    );
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    const urls = service.selectReferenceImageUrls({
      designPackage,
      selectedReferenceImageUrls: ['/chosen-transformed.png'],
      generatedLayoutReferenceImageUrls: ['/old-2d.png'],
    });
    expect(urls).toEqual([
      '/chosen-transformed.png',
      ...designPackage.layoutScheme.layout3d.views.map((v: any) => v.imageUrl),
    ]);
    const load = jest
      .spyOn(
        require('./image-reference/load-reference-image'),
        'loadReferenceImage',
      )
      .mockRejectedValue(new Error('missing layout'));
    const paid = jest.spyOn(service as any, 'generateImageResponse');
    try {
      await expect(service.generate({ designPackage })).rejects.toThrow(
        '未发送生图请求',
      );
      expect(paid).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });
  it('keeps 3D config and view URLs in archived snapshots', () => {
    const repository = new FinalProposalsRepository();
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    const saved = repository.archive({
      version: 1,
      imageUrl: '/final.png',
      promptUsed: 'test',
      designRationale: 'test',
      packageSnapshot: designPackage,
    });
    expect(
      repository.get(saved.id).packageSnapshot.layoutScheme?.layout3d,
    ).toEqual(designPackage.layoutScheme.layout3d);
  });
  it('never falls back to original motifs when transformed canvas layers exist', () => {
    const designPackage = pkg(layout('/generated/layout3d/view.png'));
    designPackage.canvasAssets[0].source = 'layer';
    designPackage.selectedPatterns = [
      { id: 'p', name: '原图', imageUrl: '/original.png' },
    ];
    const built = buildDesignImagePackage({ designPackage });
    expect(built.references.map((r) => r.imageUrl)).toContain(
      '/generated/super-canvas/transformed.png',
    );
    expect(built.references.map((r) => r.imageUrl)).not.toContain(
      '/original.png',
    );
  });
  it('cleans only newly created PNGs when the database write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gaotie-layout3d-db-test-'));
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(dir);
    const { service, session } = setup();
    session.run.mockRejectedValueOnce(new Error('database unavailable'));
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#aaa' },
    })
      .png()
      .toBuffer();
    try {
      await expect(
        service.saveLayoutScheme({
          name: 'v1',
          projectId: 'p1',
          componentsMap: {},
          layout3d: layout('data:image/png;base64,' + png.toString('base64')),
        } as any),
      ).rejects.toThrow('database unavailable');
      expect(await readdir(join(dir, 'generated', 'layout3d'))).toEqual([]);
    } finally {
      cwd.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.each(['openai', 'jimeng', 'codex'])(
    'prepares every 3D view for %s without old 2D attachments',
    async (provider) => {
      const dir = await mkdtemp(
        join(tmpdir(), 'gaotie-layout3d-provider-test-'),
      );
      const previous = {
        codex: process.env.LOCAL_CODEX_IMAGE_ENABLED,
        provider: process.env.FINAL_PROPOSAL_IMAGE_PROVIDER,
      };
      process.env.LOCAL_CODEX_IMAGE_ENABLED =
        provider === 'codex' ? 'true' : 'false';
      process.env.FINAL_PROPOSAL_IMAGE_PROVIDER =
        provider === 'jimeng' ? 'jimeng' : 'openai';
      const png = await sharp({
        create: { width: 12, height: 12, channels: 3, background: '#aaa' },
      })
        .png()
        .toBuffer();
      const load = jest
        .spyOn(
          require('./image-reference/load-reference-image'),
          'loadReferenceImage',
        )
        .mockResolvedValue(png);
      const service = new FinalProposalsService(
        new PromptComposerService(),
        new FinalProposalsRepository(),
      );
      (service as any).outputDir = dir;
      let referenceNumber = 0;
      jest
        .spyOn(service as any, 'writeReferenceImage')
        .mockImplementation(
          async () => `https://assets.example.com/ref-${++referenceNumber}.png`,
        );
      const response = {
        taskId: 'mock-task',
        images: [{ type: 'base64', value: png.toString('base64') }],
      };
      const codex = jest
        .spyOn(
          require('./codex-image/codex-image-client'),
          'generateCodexImage',
        )
        .mockResolvedValue(response);
      const openai = jest
        .spyOn(service as any, 'generateWithOpenAi')
        .mockResolvedValue(response);
      const jimeng = jest
        .spyOn(service as any, 'generateWithJimeng')
        .mockResolvedValue(response);
      const layout3d = layout('/generated/layout3d/view.png');
      layout3d.views = layout3d.views.map((v) => ({
        ...v,
        imageUrl: `/generated/layout3d/${v.view}.png`,
      }));
      try {
        const result = await service.generate({
          designPackage: pkg(layout3d),
          selectedReferenceImageUrls: ['/selected-transformed.png'],
        });
        expect(load.mock.calls.map((call) => call[0])).toEqual([
          '/selected-transformed.png',
          ...layout3d.views.map((v) => v.imageUrl),
        ]);
        expect(result.promptUsed).toContain('短窗带');
        if (provider === 'codex')
          expect((codex.mock.calls[0][0] as any).referenceImages).toHaveLength(
            4,
          );
        else
          expect(
            (provider === 'jimeng' ? jimeng : openai).mock.calls[0][1],
          ).toHaveLength(4);
      } finally {
        load.mockRestore();
        codex.mockRestore();
        if (previous.codex === undefined)
          delete process.env.LOCAL_CODEX_IMAGE_ENABLED;
        else process.env.LOCAL_CODEX_IMAGE_ENABLED = previous.codex;
        if (previous.provider === undefined)
          delete process.env.FINAL_PROPOSAL_IMAGE_PROVIDER;
        else process.env.FINAL_PROPOSAL_IMAGE_PROVIDER = previous.provider;
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
  it('rejects a JPEG disguised as PNG, a truncated PNG, and oversized data', async () => {
    const { service, session } = setup();
    const image = sharp({
      create: { width: 12, height: 12, channels: 3, background: '#aaa' },
    });
    const jpeg = await image.clone().jpeg().toBuffer();
    const png = await image.clone().png().toBuffer();
    for (const data of [
      jpeg.toString('base64'),
      png.subarray(0, 50).toString('base64'),
      'A'.repeat(7 * 1024 * 1024),
    ]) {
      await expect(
        service.saveLayoutScheme({
          name: 'v1',
          projectId: 'p1',
          componentsMap: {},
          layout3d: layout('data:image/png;base64,' + data),
        } as any),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(session.run).not.toHaveBeenCalled();
  });
});
