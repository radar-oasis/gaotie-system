import sharp from 'sharp';
import { compositeLocalEdit, pixelEditRegion } from './local-edit';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, extname, join, relative, resolve } from 'path';
import {
  GenerateOpenAiImageInput,
  GenerateOpenAiImageResult,
  OpenAiBackground,
  OpenAiImageRequestMode,
  OpenAiImage,
  OpenAiImageQuality,
  OpenAiOutputFormat,
  generateOpenAiImage,
} from './openai-image-client';
import {
  GenerateJimengImageInput,
  GenerateJimengImageResult,
  JimengImage,
  generateJimengImage,
} from '../super-canvas/jimeng-client';
import { FinalProposalsRepository } from './final-proposals.repository';
import { PromptComposerService } from './prompt-composer.service';
import {
  ArchiveFinalProposalInput,
  ArchivedProposal,
  FinalColorScheme,
  FinalDesignPackage,
  GenerateFinalProposalInput,
  GeneratedProposalResponse,
  IterateFinalProposalInput,
} from './final-proposals.types';
import { createColorReferenceImage } from './color-reference-image';
import { createColorizedLayoutReferenceImage } from './layout-color-reference-image';
import { optimizeReferenceImage } from './reference-image-optimizer';
import { buildDesignImagePackage } from './design-image-package';
import { loadReferenceImage } from '../image-reference/load-reference-image';
import { generateCodexImage } from '../codex-image/codex-image-client';
import { assertGenerationActive, GenerationOptions } from '../image-reference/generation-cancellation';

type OpenAiGenerator = (
  input: GenerateOpenAiImageInput,
) => Promise<GenerateOpenAiImageResult>;

type JimengGenerator = (
  input: GenerateJimengImageInput,
) => Promise<GenerateJimengImageResult>;

type FinalProposalImage = OpenAiImage | JimengImage;
type FinalProposalImageResult = {
  taskId: string;
  requestId?: string;
  images: FinalProposalImage[];
};

type ImageFetch = (url: string) => Promise<{
  ok?: boolean;
  status?: number;
  statusText?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

const MAX_REFERENCE_IMAGES = 12;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_FINAL_PROPOSAL_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_FINAL_PROPOSAL_JIMENG_MAX_POLLS = 120;
const DEFAULT_FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS = 1000;
const DATA_IMAGE_PATTERN =
  /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

@Injectable()
export class FinalProposalsService {
  private readonly outputDir = join(
    process.cwd(),
    'generated',
    'final-proposals',
  );
  private readonly publicPathPrefix = '/generated/final-proposals';
  private readonly publicAssetBaseUrl =
    process.env.PUBLIC_ASSET_BASE_URL ??
    process.env.SUPER_CANVAS_PUBLIC_BASE_URL ??
    'http://localhost:3000';
  private readonly imageRequestTimeoutMs = Number(
    process.env.FINAL_PROPOSAL_OPENAI_REQUEST_TIMEOUT_MS ??
      process.env.FINAL_PROPOSAL_JIMENG_REQUEST_TIMEOUT_MS ??
      DEFAULT_FINAL_PROPOSAL_REQUEST_TIMEOUT_MS,
  );
  private readonly jimengMaxPolls = parseIntegerEnv(
    process.env.FINAL_PROPOSAL_JIMENG_MAX_POLLS,
    DEFAULT_FINAL_PROPOSAL_JIMENG_MAX_POLLS,
    { min: 1 },
  );
  private readonly jimengPollDelayMs = parseIntegerEnv(
    process.env.FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS,
    DEFAULT_FINAL_PROPOSAL_JIMENG_POLL_DELAY_MS,
    { min: 0 },
  );
  private openAiGenerator: OpenAiGenerator = generateOpenAiImage;
  private jimengGenerator: JimengGenerator = generateJimengImage;
  private fetchImpl: ImageFetch = async (url: string) => {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is unavailable');
    }

    return fetch(url);
  };

  constructor(
    private readonly promptComposer: PromptComposerService,
    private readonly repository: FinalProposalsRepository,
  ) {}

  async generate(
    input: GenerateFinalProposalInput,
    options: GenerationOptions = {},
  ): Promise<GeneratedProposalResponse> {
    assertGenerationActive(options.signal);
    this.assertUsefulDesignPackage(input.designPackage);
    if (process.env.LOCAL_CODEX_IMAGE_ENABLED === 'true') {
      return this.generateCodexPackage(input, 1, options);
    }
    const promptUsed = input.designPackage.layoutScheme?.layout3d
      ? buildDesignImagePackage(input).prompt
      : this.promptComposer.composeGeneratePrompt(input);
    const referenceImageUrls = await this.prepareReferenceImageUrls({
      designPackage: input.designPackage,
      selectedReferenceImageUrls: input.selectedReferenceImageUrls,
    });

    return this.generateImageResponse({
      designPackage: input.designPackage,
      promptUsed,
      referenceImageUrls,
      version: 1,
      designRationale: this.composeRationale(input.designPackage),
    });
  }

  async iterate(
    input: IterateFinalProposalInput,
    options: GenerationOptions = {},
  ): Promise<GeneratedProposalResponse> {
    assertGenerationActive(options.signal);
    this.assertUsefulDesignPackage(input.designPackage);

    if (!input.baseImageUrl?.trim()) {
      throw new BadRequestException('baseImageUrl 不能为空');
    }

    if (!input.instruction?.trim()) {
      throw new BadRequestException('instruction 不能为空');
    }

    if (input.editMode && !['global', 'local'].includes(input.editMode)) throw new BadRequestException('无效的编辑模式');
    if (input.editMode === 'local') return this.iterateLocal(input, options);

    if (process.env.LOCAL_CODEX_IMAGE_ENABLED === 'true') {
      return this.generateCodexPackage({ ...input, userPrompt: input.instruction }, 2, options);
    }

    const promptUsed = input.designPackage.layoutScheme?.layout3d
      ? buildDesignImagePackage({ designPackage: input.designPackage, baseImageUrl: input.baseImageUrl, selectedReferenceImageUrls: input.selectedReferenceImageUrls, userPrompt: input.instruction }).prompt
      : this.promptComposer.composeIterationPrompt(input);
    const referenceImageUrls = await this.prepareReferenceImageUrls({
      designPackage: input.designPackage,
      baseImageUrl: input.baseImageUrl,
      selectedReferenceImageUrls: input.selectedReferenceImageUrls,
    });

    return this.generateImageResponse({
      designPackage: input.designPackage,
      promptUsed,
      referenceImageUrls,
      version: 2,
      designRationale: `基于上一版方案微调：${input.instruction.trim()}`,
    });
  }

  private async iterateLocal(input: IterateFinalProposalInput, options: GenerationOptions): Promise<GeneratedProposalResponse> {
    // Validate before any provider call, and retain full resolution for pixel protection.
    pixelEditRegion(input.editRegion, 1, 1);
    const base = await loadReferenceImage(input.baseImageUrl, { preserveResolution: true });
    const metadata = await sharp(base).metadata();
    const pixels = pixelEditRegion(input.editRegion, metadata.width!, metadata.height!);
    const crop = await sharp(base).extract(pixels).png().toBuffer();
    const promptUsed = `局部图像编辑。参考图仅为用户选中的局部区域。请在相同构图、视角和边缘衔接下修改这块区域，不要生成整列车或扩大画面。用户要求：${input.instruction.trim()}。只输出修改后的局部图像。`;
    assertGenerationActive(options.signal);
    let generated: Buffer;
    let taskId: string;
    if (process.env.LOCAL_CODEX_IMAGE_ENABLED === 'true') {
      const result = await generateCodexImage({prompt: promptUsed, referenceImages: [crop], signal: options.signal});
      if (!result.images[0]) throw new ServiceUnavailableException('局部编辑未返回图片');
      generated = decodeLimitedBase64(result.images[0].value, 'Generated patch');
      taskId = result.taskId;
    } else {
      const cropUrl = await this.writeReferenceImage(crop, 'png');
      const result = finalProposalImageProviderFromEnv() === 'jimeng'
        ? await this.generateWithJimeng(promptUsed, [cropUrl])
        : await this.generateWithOpenAi(promptUsed, [cropUrl]);
      if (!result.images[0]) throw new ServiceUnavailableException('局部编辑未返回图片');
      generated = await this.readGeneratedImage(result.images[0]);
      taskId = result.taskId;
    }
    assertGenerationActive(options.signal);
    const composite = await compositeLocalEdit(base, generated, input.editRegion!);
    const filename = `final-proposal-${Date.now()}-${randomUUID()}.png`;
    await mkdir(this.outputDir, {recursive:true});
    await writeFile(join(this.outputDir, filename), composite.image);
    return {id: randomUUID(), version: 2, imageUrl: `${this.publicPathPrefix}/${filename}`, taskId,
      promptUsed, designRationale: `局部编辑：${input.instruction.trim()}。选区外像素已保留，选区内效果及边缘衔接需结合验收记录核对。`,
      createdAt: new Date().toISOString(), reviewStatus: 'pending',
      editProtection: {region: input.editRegion!, pixels: composite.pixels, outsideRegion: 'pixel-identical'},
      referenceManifest: [{index:1,role:'edit-region',label:'选中的局部区域',instruction:'只编辑选区，服务端保留选区外像素'}]};
  }

  selectReferenceImageUrls(input: {
    designPackage: FinalDesignPackage;
    baseImageUrl?: string;
    selectedReferenceImageUrls?: string[];
    generatedLayoutReferenceImageUrls?: string[];
    generatedReferenceImageUrls?: string[];
  }): string[] {
    if (input.designPackage.layoutScheme?.layout3d) {
      return buildDesignImagePackage(input).references.flatMap(reference =>
        reference.role === 'palette' ? input.generatedReferenceImageUrls ?? [] : [reference.imageUrl!],
      );
    }
    const selectedReferences = input.selectedReferenceImageUrls;
    const generatedLayoutReferences =
      input.generatedLayoutReferenceImageUrls ?? [];
    const candidates = [
      input.baseImageUrl,
      ...(selectedReferences !== undefined
        ? selectedReferences
        : (input.designPackage.canvasAssets ?? []).map(
            (asset) => asset.imageUrl,
          )),
      ...(generatedLayoutReferences.length > 0
        ? generatedLayoutReferences
        : layoutReferenceImageUrls(input.designPackage)),
      ...(input.generatedReferenceImageUrls ?? []),
      ...caseReferenceImageUrls(input.designPackage),
    ];
    const unique: string[] = [];

    for (const candidate of candidates) {
      const normalized = normalizeReferenceImageCandidate(candidate);

      if (!normalized || unique.includes(normalized)) {
        continue;
      }

      unique.push(normalized);

      if (unique.length > MAX_REFERENCE_IMAGES) {
        throw new BadRequestException('设计包超过 12 张参考图，请减少截图或案例后重试，不会自动省略图片');
      }
    }

    return unique;
  }

  private async generateCodexPackage(input: GenerateFinalProposalInput & { baseImageUrl?: string }, version: number, options: GenerationOptions): Promise<GeneratedProposalResponse> {
    const pkg = buildDesignImagePackage(input);
    const referenceImages: Buffer[] = [];
    for (const reference of pkg.references) {
      assertGenerationActive(options.signal);
      try {
        const buffer = reference.role === 'palette'
          ? await createColorReferenceImage(input.designPackage.colorScheme)
          : await loadReferenceImage(reference.imageUrl!);
        if (!buffer) throw new Error('图片为空');
        referenceImages.push(buffer);
      } catch (error) {
        throw new BadRequestException(`参考图 ${reference.index}（${reference.label}）加载失败：${error instanceof Error ? error.message : '请重新上传'}。未发送生图请求。`);
      }
    }
    assertGenerationActive(options.signal);
    const result = await generateCodexImage({ prompt: pkg.prompt, referenceImages, signal: options.signal });
    assertGenerationActive(options.signal);
    const first = result.images[0];
    if (!first) throw new ServiceUnavailableException('Codex 未返回图片');
    const filename = `final-proposal-${Date.now()}-${randomUUID()}.png`;
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(join(this.outputDir, filename), decodeLimitedBase64(first.value, 'Generated image'));
    return {
      id: randomUUID(), version, imageUrl: `${this.publicPathPrefix}/${filename}`,
      taskId: result.taskId, promptUsed: pkg.prompt,
      designRationale: this.composeRationale(input.designPackage), createdAt: new Date().toISOString(),
      referenceManifest: pkg.references.map(({ imageUrl: _imageUrl, ...reference }) => reference),
    };
  }

  archive(input: ArchiveFinalProposalInput): ArchivedProposal {
    if (!input.imageUrl?.trim()) {
      throw new BadRequestException('imageUrl 不能为空');
    }

    if (!input.promptUsed?.trim()) {
      throw new BadRequestException('promptUsed 不能为空');
    }

    this.assertUsefulDesignPackage(input.packageSnapshot);

    return this.repository.archive(input);
  }

  list(): ArchivedProposal[] {
    return this.repository.list();
  }

  get(id: string): ArchivedProposal {
    return this.repository.get(id);
  }

  remove(id: string): void {
    return this.repository.remove(id);
  }

  private async prepareReferenceImageUrls(input: {
    designPackage: FinalDesignPackage;
    baseImageUrl?: string;
    selectedReferenceImageUrls?: string[];
  }): Promise<string[]> {
    if (input.designPackage.layoutScheme?.layout3d) {
      const manifest = buildDesignImagePackage(input);
      const loaded: Buffer[] = [];
      // Fully load the entire manifest before preparing any provider request.
      for (const reference of manifest.references) {
        try {
          const buffer = reference.role === 'palette'
            ? await createColorReferenceImage(input.designPackage.colorScheme)
            : await loadReferenceImage(reference.imageUrl!);
          if (!buffer) throw new Error('图片为空');
          loaded.push(buffer);
        } catch (error) {
          throw new BadRequestException(`参考图 ${reference.index}（${reference.label}）加载失败：${error instanceof Error ? error.message : '请重新上传'}。未发送生图请求。`);
        }
      }
      const urls: string[] = [];
      for (const buffer of loaded) urls.push(await this.writeReferenceImage(await optimizeReferenceImage(buffer), 'png'));
      return urls;
    }
    const colorizedLayoutReferenceImageUrls =
      await this.writeColorizedLayoutReferenceImages(input.designPackage);
    const colorReferenceImageUrl = await this.writeColorReferenceImage(
      input.designPackage.colorScheme,
    );

    return this.resolveReferenceImages(
      this.selectReferenceImageUrls({
        ...input,
        generatedLayoutReferenceImageUrls: colorizedLayoutReferenceImageUrls,
        generatedReferenceImageUrls: colorReferenceImageUrl
          ? [colorReferenceImageUrl]
          : [],
      }),
    );
  }

  private async generateImageResponse(input: {
    designPackage: FinalDesignPackage;
    promptUsed: string;
    referenceImageUrls: string[];
    version: number;
    designRationale: string;
  }): Promise<GeneratedProposalResponse> {
    const provider = finalProposalImageProviderFromEnv();
    const imageResult =
      provider === 'jimeng'
        ? await this.generateWithJimeng(
            input.promptUsed,
            input.referenceImageUrls,
          )
        : await this.generateWithOpenAi(
            input.promptUsed,
            input.referenceImageUrls,
          );
    const firstImage = imageResult.images[0];

    if (!firstImage) {
      throw new Error(
        `${provider === 'jimeng' ? 'Jimeng' : 'OpenAI image'} task ${
          imageResult.taskId
        } returned no images`,
      );
    }

    const imageBuffer = await this.readGeneratedImage(firstImage);
    const filename = basename(
      `final-proposal-${Date.now()}-${randomUUID()}${extensionForGeneratedImage(firstImage)}`,
    );

    await mkdir(this.outputDir, { recursive: true });
    await writeFile(join(this.outputDir, filename), imageBuffer);

    return {
      id: randomUUID(),
      version: input.version,
      imageUrl: `${this.publicPathPrefix}/${filename}`,
      taskId: imageResult.taskId,
      promptUsed: input.promptUsed,
      designRationale: input.designRationale,
      createdAt: new Date().toISOString(),
    };
  }

  private async generateWithOpenAi(
    promptUsed: string,
    referenceImageUrls: string[],
  ): Promise<FinalProposalImageResult> {
    const apiKey =
      process.env.FINAL_PROPOSAL_ARK_API_KEY ??
      process.env.ARK_API_KEY ??
      process.env.FINAL_PROPOSAL_OPENAI_API_KEY ??
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Missing image generation credentials: set ARK_API_KEY or OPENAI_API_KEY',
      );
    }

    return this.openAiGenerator({
      apiKey,
      baseUrl:
        process.env.FINAL_PROPOSAL_ARK_BASE_URL ??
        process.env.ARK_IMAGE_BASE_URL ??
        process.env.FINAL_PROPOSAL_OPENAI_BASE_URL ??
        process.env.OPENAI_BASE_URL,
      prompt: promptUsed,
      imageUrls: referenceImageUrls,
      generationImageField: Boolean(process.env.FINAL_PROPOSAL_ARK_API_KEY || process.env.ARK_API_KEY),
      model:
        process.env.FINAL_PROPOSAL_ARK_MODEL ??
        process.env.ARK_IMAGE_MODEL ??
        process.env.FINAL_PROPOSAL_OPENAI_IMAGE_MODEL ??
        'gpt-image-2',
      quality: openAiQualityFromEnv(
        process.env.FINAL_PROPOSAL_OPENAI_IMAGE_QUALITY,
      ),
      size: process.env.FINAL_PROPOSAL_OPENAI_IMAGE_SIZE ?? '1536x1024',
      outputFormat: openAiOutputFormatFromEnv(
        process.env.FINAL_PROPOSAL_OPENAI_OUTPUT_FORMAT,
      ),
      background: openAiBackgroundFromEnv(
        process.env.FINAL_PROPOSAL_OPENAI_BACKGROUND,
      ),
      promptContext: 'final-proposal',
      requestMode: openAiRequestModeFromEnv(
        process.env.FINAL_PROPOSAL_OPENAI_IMAGE_REQUEST_MODE,
      ),
      includeOptionalImageParameters: includeOptionalOpenAiImageParameters(
        process.env.FINAL_PROPOSAL_OPENAI_INCLUDE_OPTIONAL_PARAMS,
      ),
      requestTimeoutMs: this.imageRequestTimeoutMs,
    });
  }

  private async generateWithJimeng(
    promptUsed: string,
    referenceImageUrls: string[],
  ): Promise<FinalProposalImageResult> {
    const accessKeyId = process.env.JIMENG_ACCESS_KEY_ID;
    const secretAccessKey = process.env.JIMENG_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'Missing Jimeng credentials: set JIMENG_ACCESS_KEY_ID and JIMENG_SECRET_ACCESS_KEY',
      );
    }

    return this.jimengGenerator({
      prompt: promptUsed,
      imageUrls: referenceImageUrls,
      accessKeyId,
      secretAccessKey,
      promptContext: 'final-proposal',
      requestTimeoutMs: this.imageRequestTimeoutMs,
      maxPolls: this.jimengMaxPolls,
      pollDelayMs: this.jimengPollDelayMs,
    });
  }

  private assertUsefulDesignPackage(designPackage: FinalDesignPackage): void {
    if (!designPackage || typeof designPackage !== 'object') {
      throw new BadRequestException('designPackage 不能为空');
    }

    const hasContent =
      designPackage.demandTags?.length > 0 ||
      designPackage.selectedPatterns?.length > 0 ||
      designPackage.selectedCases?.length > 0 ||
      Boolean(designPackage.layoutScheme) ||
      Boolean(designPackage.colorScheme) ||
      (designPackage.canvasAssets?.length ?? 0) > 0;

    if (!hasContent) {
      throw new BadRequestException('designPackage 不能为空');
    }
  }

  private composeRationale(designPackage: FinalDesignPackage): string {
    const tags = designPackage.demandTags
      .map((tag) => tag.label)
      .filter(Boolean)
      .join('、');
    const colorScheme = designPackage.colorScheme?.name;

    return [
      tags ? `围绕${tags}展开设计` : undefined,
      colorScheme ? `采用${colorScheme}` : undefined,
      designPackage.selectedPatterns.length
        ? `融合${designPackage.selectedPatterns.length}个意象素材`
        : undefined,
      designPackage.selectedCases.length
        ? `参考${designPackage.selectedCases.length}个案例`
        : undefined,
    ]
      .filter(Boolean)
      .join('，');
  }

  private async resolveReferenceImages(urls: string[]): Promise<string[]> {
    const resolved: string[] = [];

    for (const url of urls) {
      resolved.push(await this.resolveReferenceImage(url));
    }

    return resolved;
  }

  private async resolveReferenceImage(imageUrl: string): Promise<string> {
    if (DATA_IMAGE_PATTERN.test(imageUrl)) {
      const match = DATA_IMAGE_PATTERN.exec(imageUrl);
      const base64 = match?.[2] ?? '';
      const buffer = decodeLimitedBase64(base64, 'Reference image');
      const optimized = await optimizeReferenceImage(buffer);

      return this.writeReferenceImage(optimized, 'png');
    }

    const localAssetPath = this.localReferenceAssetPath(imageUrl);

    if (localAssetPath) {
      const optimizedUrl =
        await this.tryWriteOptimizedLocalReference(localAssetPath);

      if (optimizedUrl) {
        return optimizedUrl;
      }
    }

    if (imageUrl.startsWith('/')) {
      assertPublicAssetBaseUrl(this.publicAssetBaseUrl);

      return `${this.publicAssetBaseUrl.replace(/\/+$/, '')}${imageUrl}`;
    }

    const parsed = parseHttpUrl(imageUrl);

    if (isPrivateOrLocalHost(parsed.hostname)) {
      throw new BadRequestException('Reference image URL host is not allowed');
    }

    return parsed.href;
  }

  private localReferenceAssetPath(imageUrl: string): string | undefined {
    const pathname = this.ownReferencePathname(imageUrl);

    if (!pathname) {
      return undefined;
    }

    const roots = [
      { prefix: '/generated/layout3d/', root: join(process.cwd(), 'generated', 'layout3d') },
      {
        prefix: '/layout-elements/',
        root: join(process.cwd(), '..', '布局元素'),
      },
      {
        prefix: '/sample-images/',
        root: join(process.cwd(), '..', '样本图片'),
      },
      {
        prefix: '/images/',
        root: join(process.cwd(), '..', 'images'),
      },
      {
        prefix: '/generated/super-canvas/',
        root: join(process.cwd(), 'generated', 'super-canvas'),
      },
      {
        prefix: `${this.publicPathPrefix.replace(/\/+$/, '')}/`,
        root: this.outputDir,
      },
    ];

    for (const { prefix, root } of roots) {
      if (!pathname.startsWith(prefix)) {
        continue;
      }

      const relativePath = safeDecodePath(pathname.slice(prefix.length));

      if (!relativePath) {
        return undefined;
      }

      const candidate = resolve(root, relativePath);

      if (isPathInside(root, candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private ownReferencePathname(imageUrl: string): string | undefined {
    if (imageUrl.startsWith('/')) {
      return imageUrl;
    }

    try {
      const image = new URL(imageUrl);
      const base = new URL(this.publicAssetBaseUrl);

      return image.origin === base.origin ? image.pathname : undefined;
    } catch {
      return undefined;
    }
  }

  private async tryWriteOptimizedLocalReference(
    localAssetPath: string,
  ): Promise<string | undefined> {
    try {
      const buffer = await readFile(localAssetPath);
      const optimized = await optimizeReferenceImage(buffer);

      return this.writeReferenceImage(optimized, 'png');
    } catch {
      return undefined;
    }
  }

  private async writeReferenceImage(
    buffer: Buffer,
    extension: string,
  ): Promise<string> {
    assertPublicAssetBaseUrl(this.publicAssetBaseUrl);
    const filename = basename(
      `final-reference-${Date.now()}-${randomUUID()}.${extension}`,
    );

    await mkdir(this.outputDir, { recursive: true });
    await writeFile(join(this.outputDir, filename), buffer);

    return `${this.publicAssetBaseUrl.replace(/\/+$/, '')}${
      this.publicPathPrefix
    }/${filename}`;
  }

  private async writeColorReferenceImage(
    colorScheme?: FinalColorScheme,
  ): Promise<string | undefined> {
    const buffer = await createColorReferenceImage(colorScheme);

    if (!buffer) {
      return undefined;
    }

    return this.writeReferenceImage(buffer, 'png');
  }

  private async writeColorizedLayoutReferenceImages(
    designPackage: FinalDesignPackage,
  ): Promise<string[]> {
    const colorRegions = designPackage.colorScheme?.regions ?? [];
    const urls: string[] = [];
    const usedKeys = new Set<string>();

    for (const region of colorRegions) {
      const componentId = region.componentId?.trim();
      const category = (region.category || region.name).trim();

      if (!componentId || !category || !isHexColor(region.color)) {
        continue;
      }

      const key = `${category}:${componentId}`;

      if (usedKeys.has(key)) {
        continue;
      }

      usedKeys.add(key);

      const layoutImageUrl =
        region.layoutElementImageUrl ||
        `/layout-elements/${encodePathSegment(category)}/${encodePathSegment(
          componentId,
        )}.png`;
      const localAssetPath = this.localReferenceAssetPath(layoutImageUrl);

      if (!localAssetPath) {
        continue;
      }

      try {
        const source = await readFile(localAssetPath);
        const colorized = await createColorizedLayoutReferenceImage(
          source,
          region.color,
        );
        const optimized = await optimizeReferenceImage(colorized);

        urls.push(await this.writeReferenceImage(optimized, 'png'));
      } catch {
        continue;
      }
    }

    return urls;
  }

  private async readGeneratedImage(image: FinalProposalImage): Promise<Buffer> {
    if (image.type === 'base64') {
      return decodeLimitedBase64(image.value, 'Generated image');
    }

    const response = await this.fetchImpl(image.value);

    if (!response.ok) {
      throw new Error(
        `Generated image HTTP error ${response.status ?? 0} ${
          response.statusText ?? ''
        }`.trim(),
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Generated image exceeds maximum size');
    }

    return buffer;
  }
}

function parseHttpUrl(value: string): URL {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Reference image URL must be http or https');
    }

    return url;
  } catch {
    throw new BadRequestException('Reference image URL must be http or https');
  }
}

function decodeLimitedBase64(base64Value: string, label: string): Buffer {
  const buffer = Buffer.from(base64Value, 'base64');

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new BadRequestException(`${label} exceeds maximum size`);
  }

  return buffer;
}

function assertPublicAssetBaseUrl(baseUrl: string): void {
  const url = parseHttpUrl(baseUrl);

  if (isPrivateOrLocalHost(url.hostname)) {
    throw new BadRequestException(
      'PUBLIC_ASSET_BASE_URL must be a public http(s) URL to use local reference images',
    );
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  const const172 = /^172\.(\d{1,2})\./.exec(normalized);

  return Boolean(
    const172 && Number(const172[1]) >= 16 && Number(const172[1]) <= 31,
  );
}

function layoutReferenceImageUrls(designPackage: FinalDesignPackage): string[] {
  const componentsMap = designPackage.layoutScheme?.componentsMap;

  if (!componentsMap) {
    return [];
  }

  return Object.entries(componentsMap)
    .map(([category, componentId]) => {
      const normalizedComponentId = componentId?.trim();

      if (!category.trim() || !normalizedComponentId) {
        return undefined;
      }

      return `/layout-elements/${encodePathSegment(
        category,
      )}/${encodePathSegment(normalizedComponentId)}.png`;
    })
    .filter((url): url is string => Boolean(url));
}

function caseReferenceImageUrls(designPackage: FinalDesignPackage): string[] {
  return designPackage.selectedCases
    .map((caseRef) => caseRef.image)
    .filter((url): url is string => Boolean(url));
}

function normalizeReferenceImageCandidate(
  candidate?: string,
): string | undefined {
  const normalized = candidate?.trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('/') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }

  if (normalized.startsWith('样本图片/')) {
    return `/sample-images/${encodePath(
      normalized.replace(/^样本图片\/+/, ''),
    )}`;
  }

  if (
    ['images/', 'sample-images/', 'layout-elements/', 'generated/'].some(
      (prefix) => normalized.startsWith(prefix),
    )
  ) {
    return `/${encodePath(normalized)}`;
  }

  return `/images/${encodePath(normalized)}`;
}

function encodePath(value: string): string {
  return value.split('/').filter(Boolean).map(encodePathSegment).join('/');
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, '/');
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

function safeDecodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return undefined;
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), candidate);

  return Boolean(relativePath) && !relativePath.startsWith('..');
}

function openAiQualityFromEnv(value?: string): OpenAiImageQuality {
  return ['low', 'medium', 'high', 'auto'].includes(value ?? '')
    ? (value as OpenAiImageQuality)
    : 'low';
}

function openAiOutputFormatFromEnv(value?: string): OpenAiOutputFormat {
  return ['png', 'jpeg', 'webp'].includes(value ?? '')
    ? (value as OpenAiOutputFormat)
    : 'png';
}

function openAiBackgroundFromEnv(value?: string): OpenAiBackground {
  return ['opaque', 'transparent', 'auto'].includes(value ?? '')
    ? (value as OpenAiBackground)
    : 'opaque';
}

function openAiRequestModeFromEnv(value?: string): OpenAiImageRequestMode {
  return ['auto', 'generations', 'edits'].includes(value ?? '')
    ? (value as OpenAiImageRequestMode)
    : 'auto';
}

function includeOptionalOpenAiImageParameters(value?: string): boolean {
  return value?.trim().toLowerCase() === 'false' ? false : true;
}

function parseIntegerEnv(
  value: string | undefined,
  fallback: number,
  options: { min: number },
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= options.min ? parsed : fallback;
}

function finalProposalImageProviderFromEnv(): 'openai' | 'jimeng' {
  const provider = process.env.FINAL_PROPOSAL_IMAGE_PROVIDER?.trim().toLowerCase();

  return provider === 'jimeng' ? 'jimeng' : 'openai';
}

function extensionForGeneratedImage(image: FinalProposalImage): string {
  if (image.type === 'base64') {
    return '.png';
  }

  const extension = extname(new URL(image.value).pathname).toLowerCase();

  return ['.png', '.jpg', '.jpeg', '.webp'].includes(extension)
    ? extension
    : '.png';
}
