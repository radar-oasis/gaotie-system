import { Injectable } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import {
  GenerateJimengImageInput,
  GenerateJimengImageResult,
  JimengImage,
  generateJimengImage,
} from './jimeng-client';
import {
  GenerateOpenAiImageInput,
  GenerateOpenAiImageResult,
  OpenAiImage,
  OpenAiImageRequestMode,
  generateOpenAiImage,
} from '../final-proposals/openai-image-client';
import { TransparentizeResult, transparentizeImage } from './transparentize';
import { inspectGeneratedAlpha } from './inspect-generated-alpha';
import { generateCodexImage, type PromptTrace } from '../codex-image/codex-image-client';
import { loadReferenceImage } from '../image-reference/load-reference-image';
import { assertGenerationActive, GenerationOptions } from '../image-reference/generation-cancellation';

export interface GenerateTransparentAssetInput {
  prompt: string;
  referenceImageUrl?: string;
  referenceImageUrls?: string[];
}

export interface GenerateTransparentAssetResult {
  imageUrl: string;
  taskId: string;
  confidence: TransparentizeResult['confidence'];
  transparentPixelRatio: number;
  promptTrace?: Pick<PromptTrace, 'originalPrompt' | 'optimizedPrompt' | 'mode'>;
}

export type CanvasGenerationStage = 'preparing' | 'optimizing' | 'generating' | 'processing';
export interface CanvasGenerationOptions extends GenerationOptions {
  onProgress?: (stage: CanvasGenerationStage) => void;
}

type JimengGenerator = (
  input: GenerateJimengImageInput,
) => Promise<GenerateJimengImageResult>;

type OpenAiGenerator = (
  input: GenerateOpenAiImageInput,
) => Promise<GenerateOpenAiImageResult>;

type Transparentizer = (input: Buffer) => Promise<TransparentizeResult>;

type ImageFetch = (
  url: string,
  init?: { signal?: AbortSignal; redirect?: 'error' },
) => Promise<{
  body?: {
    getReader: () => {
      read: () => Promise<{
        done?: boolean;
        value?: Uint8Array;
      }>;
    };
  } | null;
  headers?: {
    get: (name: string) => string | null;
  };
  ok?: boolean;
  status?: number;
  statusText?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

interface SuperCanvasServiceDependencies {
  fetchImpl?: ImageFetch;
  filenameGenerator?: () => string;
  jimengGenerator?: JimengGenerator;
  openAiGenerator?: OpenAiGenerator;
  maxDownloadBytes?: number;
  outputDir?: string;
  publicAssetBaseUrl?: string;
  publicPathPrefix?: string;
  downloadTimeoutMs?: number;
  transparentizer?: Transparentizer;
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_JIMENG_MAX_POLLS = 120;
const DEFAULT_JIMENG_POLL_DELAY_MS = 1000;
const DEFAULT_ARK_IMAGE_MODEL = 'doubao-seedream-5-0-260128';
export const LOCAL_REFERENCE_PUBLIC_BASE_ERROR =
  'SUPER_CANVAS_PUBLIC_BASE_URL must be a public http(s) URL to use local reference images';
const DATA_IMAGE_REFERENCE_PATTERN =
  /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

@Injectable()
export class SuperCanvasService {
  private fetchImpl: ImageFetch = defaultFetchImage;
  private filenameGenerator: () => string = () =>
    `super-canvas-${Date.now()}-${randomUUID()}.png`;
  private jimengGenerator: JimengGenerator = generateJimengImage;
  private openAiGenerator: OpenAiGenerator = generateOpenAiImage;
  private maxDownloadBytes = DEFAULT_MAX_DOWNLOAD_BYTES;
  private outputDir = join(process.cwd(), 'generated', 'super-canvas');
  // Data URL references are stored locally first; deployed environments must set this to a publicly reachable backend origin.
  private publicAssetBaseUrl =
    process.env.SUPER_CANVAS_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  private publicPathPrefix = '/generated/super-canvas';
  private downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS;
  private readonly generationTimeoutMs = parseIntegerEnv(
    process.env.SUPER_CANVAS_GENERATION_TIMEOUT_MS,
    180_000,
    { min: 1 },
  );
  private readonly jimengMaxPolls = parseIntegerEnv(
    process.env.SUPER_CANVAS_JIMENG_MAX_POLLS,
    DEFAULT_JIMENG_MAX_POLLS,
    { min: 1 },
  );
  private readonly jimengPollDelayMs = parseIntegerEnv(
    process.env.SUPER_CANVAS_JIMENG_POLL_DELAY_MS,
    DEFAULT_JIMENG_POLL_DELAY_MS,
    { min: 0 },
  );
  private transparentizer: Transparentizer = transparentizeImage;

  static createForTest(
    dependencies: SuperCanvasServiceDependencies,
  ): SuperCanvasService {
    const service = new SuperCanvasService();
    service.configure(dependencies);
    return service;
  }

  private configure(dependencies: SuperCanvasServiceDependencies): void {
    this.fetchImpl = dependencies.fetchImpl ?? this.fetchImpl;
    this.filenameGenerator =
      dependencies.filenameGenerator ?? this.filenameGenerator;
    this.jimengGenerator = dependencies.jimengGenerator ?? this.jimengGenerator;
    this.openAiGenerator =
      dependencies.openAiGenerator ?? this.openAiGenerator;
    this.maxDownloadBytes =
      dependencies.maxDownloadBytes ?? this.maxDownloadBytes;
    this.outputDir = dependencies.outputDir ?? this.outputDir;
    this.publicAssetBaseUrl =
      dependencies.publicAssetBaseUrl ?? this.publicAssetBaseUrl;
    this.publicPathPrefix =
      dependencies.publicPathPrefix ?? this.publicPathPrefix;
    this.downloadTimeoutMs =
      dependencies.downloadTimeoutMs ?? this.downloadTimeoutMs;
    this.transparentizer = dependencies.transparentizer ?? this.transparentizer;
  }

  async generateTransparentAsset(
    input: GenerateTransparentAssetInput,
    options: CanvasGenerationOptions = {},
  ): Promise<GenerateTransparentAssetResult> {
    assertGenerationActive(options.signal);
    options.onProgress?.('preparing');
    const useCodex = process.env.LOCAL_CODEX_IMAGE_ENABLED === 'true';
    const referenceImageUrls = useCodex ? getReferenceImageUrls(input) : await Promise.all(
      getReferenceImageUrls(input).map((referenceImageUrl) =>
        this.resolveReferenceImageUrl(referenceImageUrl),
      ),
    );
    const provider = superCanvasImageProviderFromEnv();
    const referenceImages = useCodex
      ? await Promise.all(referenceImageUrls.map(url => loadReferenceImage(url)))
      : [];
    assertGenerationActive(options.signal);
    if (!useCodex) options.onProgress?.('generating');
    const imageResult = useCodex
      ? await generateCodexImage({
          prompt: input.prompt,
          analyzeMotif: false,
          reasoningEffort: 'low',
          onDiagnostic: async report => {
            const directory = join(this.outputDir, '..', 'generation-diagnostics');
            await mkdir(directory, {recursive:true});
            await writeFile(join(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({recordedAt:new Date().toISOString(),...report},null,2), {mode:0o600});
          },
          referenceImages,
          signal: options.signal,
          onProgress: options.onProgress,
        })
      : provider === 'openai'
        ? await this.generateWithOpenAi(input.prompt, referenceImageUrls)
        : await this.generateWithJimeng(input.prompt, referenceImageUrls);
    assertGenerationActive(options.signal);
    const firstImage = imageResult.images[0];

    if (!firstImage) {
      throw new Error(
        `${provider === 'openai' ? 'OpenAI-compatible image' : 'Jimeng'} task ${
          imageResult.taskId
        } returned no images`,
      );
    }

    options.onProgress?.('processing');
    const imageBuffer = await this.readGeneratedImage(firstImage);
    assertGenerationActive(options.signal);
    const transparentized = useCodex
      ? await inspectGeneratedAlpha(imageBuffer)
      : await this.transparentizer(imageBuffer);
    const filename = basename(this.filenameGenerator());

    assertGenerationActive(options.signal);
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(join(this.outputDir, filename), transparentized.buffer);
    if ('promptTrace' in imageResult && imageResult.promptTrace) {
      const auditDir = join(this.outputDir, '..', 'prompt-audits');
      await mkdir(auditDir, { recursive: true });
      await writeFile(join(auditDir, `${filename}.prompt.json`), JSON.stringify({
        taskId: imageResult.taskId, referenceHashes: referenceImages.map(buffer => createHash('sha256').update(buffer).digest('hex')), ...imageResult.promptTrace,
      }, null, 2), { mode: 0o600 });
    }

    return {
      imageUrl: `${this.publicPathPrefix.replace(/\/$/, '')}/${filename}`,
      taskId: imageResult.taskId,
      confidence: transparentized.confidence,
      transparentPixelRatio: transparentized.transparentPixelRatio,
      ...('promptTrace' in imageResult && imageResult.promptTrace ? {
        promptTrace: {
          originalPrompt: imageResult.promptTrace.originalPrompt,
          optimizedPrompt: imageResult.promptTrace.optimizedPrompt,
          mode: imageResult.promptTrace.mode,
        },
      } : {}),
    };
  }

  private async generateWithJimeng(
    prompt: string,
    referenceImageUrls: string[],
  ): Promise<GenerateJimengImageResult> {
    const accessKeyId = process.env.JIMENG_ACCESS_KEY_ID;
    const secretAccessKey = process.env.JIMENG_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      const missingCredentials = [
        accessKeyId ? undefined : 'JIMENG_ACCESS_KEY_ID',
        secretAccessKey ? undefined : 'JIMENG_SECRET_ACCESS_KEY',
      ].filter((name): name is string => Boolean(name));

      throw new Error(
        `Missing Jimeng credentials: set ${missingCredentials.join(' and ')}`,
      );
    }

    return this.jimengGenerator({
      prompt,
      ...(referenceImageUrls.length > 0 ? { imageUrls: referenceImageUrls } : {}),
      accessKeyId,
      secretAccessKey,
      maxPolls: this.jimengMaxPolls,
      pollDelayMs: this.jimengPollDelayMs,
    });
  }

  private async generateWithOpenAi(
    prompt: string,
    referenceImageUrls: string[],
  ): Promise<GenerateOpenAiImageResult> {
    const apiKey =
      process.env.SUPER_CANVAS_ARK_API_KEY ??
      process.env.ARK_API_KEY ??
      process.env.SUPER_CANVAS_OPENAI_API_KEY ??
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Missing Super Canvas image credentials: set ARK_API_KEY or SUPER_CANVAS_OPENAI_API_KEY',
      );
    }

    const isArkProvider = isSuperCanvasArkProvider();

    return this.openAiGenerator({
      apiKey,
      baseUrl:
        process.env.SUPER_CANVAS_ARK_BASE_URL ??
        process.env.ARK_IMAGE_BASE_URL ??
        process.env.SUPER_CANVAS_OPENAI_BASE_URL ??
        process.env.OPENAI_BASE_URL,
      prompt,
      ...(referenceImageUrls.length > 0 ? { imageUrls: referenceImageUrls } : {}),
      generationImageField: isArkProvider,
      model:
        process.env.SUPER_CANVAS_ARK_MODEL ??
        process.env.ARK_IMAGE_MODEL ??
        process.env.SUPER_CANVAS_OPENAI_IMAGE_MODEL ??
        (isArkProvider ? DEFAULT_ARK_IMAGE_MODEL : 'gpt-image-2'),
      promptContext: 'transparent-asset',
      requestMode: openAiRequestModeFromEnv(
        process.env.SUPER_CANVAS_OPENAI_IMAGE_REQUEST_MODE,
        'auto',
      ),
      includeOptionalImageParameters: includeOptionalOpenAiImageParameters(
        process.env.SUPER_CANVAS_OPENAI_INCLUDE_OPTIONAL_PARAMS,
        isArkProvider ? false : true,
      ),
      requestTimeoutMs: this.generationTimeoutMs,
    });
  }

  private async readGeneratedImage(
    image: JimengImage | OpenAiImage,
  ): Promise<Buffer> {
    if (image.type === 'base64') {
      return decodeLimitedBase64({
        base64Value: image.value,
        errorPrefix: 'Generated image',
        maxBytes: this.maxDownloadBytes,
      });
    }

    return downloadGeneratedImage({
      errorPrefix: 'Generated image',
      fetchImpl: this.fetchImpl,
      maxBytes: this.maxDownloadBytes,
      timeoutMs: this.downloadTimeoutMs,
      url: image.value,
    });
  }

  private async resolveReferenceImageUrl(
    referenceImageUrl: string,
  ): Promise<string> {
    // Ark supports inline images. Keep local files off public tunnels and never
    // permit arbitrary loopback services or redirects through this exception.
    if (isSuperCanvasArkProvider()) {
      if (isDataImageReference(referenceImageUrl)) {
        parseDataImageReference(referenceImageUrl, this.maxDownloadBytes);
        return referenceImageUrl;
      }
      const url = new URL(referenceImageUrl, `http://127.0.0.1:${process.env.PORT ?? '3000'}`);
      if (isPrivateReferenceHost(url.hostname)) {
        const ownHost = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
        const path = decodeURIComponent(url.pathname);
        const assetPath = /^\/(images|sample-images|layout-elements|generated\/super-canvas|generated\/final-proposals|generated\/layout3d)\//.test(path);
        if (!ownHost || url.protocol !== 'http:' || url.port !== (process.env.PORT ?? '3000') ||
            url.username || url.password || !assetPath || path.includes('\\') || path.split('/').includes('..')) {
          throw new Error('Reference image URL host is not allowed');
        }
        const { buffer, contentType } = await downloadImage({
          errorPrefix: 'Reference image',
          fetchImpl: (target, init) => this.fetchImpl(target, { ...init, redirect: 'error' }),
          maxBytes: this.maxDownloadBytes,
          timeoutMs: this.downloadTimeoutMs,
          url: url.href,
        });
        const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
          throw new Error('Reference image must be PNG, JPEG or WebP');
        }
        return `data:${mime};base64,${buffer.toString('base64')}`;
      }
    }
    if (isDataImageReference(referenceImageUrl)) {
      const { buffer, extension } = parseDataImageReference(
        referenceImageUrl,
        this.maxDownloadBytes,
      );

      assertPublicAssetBaseUrlForLocalReferences(this.publicAssetBaseUrl);

      return this.writeReferenceImage(buffer, extension);
    }

    const referenceUrl = parseReferenceHttpUrl(
      referenceImageUrl,
      this.publicAssetBaseUrl,
    );

    if (isOwnReferenceUrl(referenceUrl, this.publicAssetBaseUrl)) {
      assertPublicAssetBaseUrlForLocalReferences(this.publicAssetBaseUrl);

      const { buffer, contentType } = await downloadImage({
        errorPrefix: 'Reference image',
        fetchImpl: this.fetchImpl,
        maxBytes: this.maxDownloadBytes,
        timeoutMs: this.downloadTimeoutMs,
        url: referenceUrl.href,
      });
      const extension = extensionForReferenceResponse(
        contentType,
        referenceUrl.pathname,
      );

      return this.writeReferenceImage(buffer, extension);
    }

    if (isPrivateReferenceHost(referenceUrl.hostname)) {
      throw new Error('Reference image URL host is not allowed');
    }

    return referenceImageUrl;
  }

  private async writeReferenceImage(
    buffer: Buffer,
    extension: string,
  ): Promise<string> {
    assertPublicAssetBaseUrlForLocalReferences(this.publicAssetBaseUrl);

    const filename = filenameWithExtension(this.filenameGenerator(), extension);

    await mkdir(this.outputDir, { recursive: true });
    await writeFile(join(this.outputDir, filename), buffer);

    return `${this.publicAssetBaseUrl.replace(/\/$/, '')}${this.publicPathPrefix.replace(
      /\/$/,
      '',
    )}/${filename}`;
  }
}

function getReferenceImageUrls(input: GenerateTransparentAssetInput): string[] {
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    return input.referenceImageUrls;
  }

  return input.referenceImageUrl ? [input.referenceImageUrl] : [];
}

function superCanvasImageProviderFromEnv(): 'jimeng' | 'openai' {
  return isSuperCanvasArkProvider() ||
    process.env.SUPER_CANVAS_IMAGE_PROVIDER?.trim().toLowerCase() === 'openai'
    ? 'openai'
    : 'jimeng';
}

function isSuperCanvasArkProvider(): boolean {
  return process.env.SUPER_CANVAS_IMAGE_PROVIDER?.trim().toLowerCase() === 'ark';
}

function openAiRequestModeFromEnv(
  value: string | undefined,
  fallback: OpenAiImageRequestMode,
): OpenAiImageRequestMode {
  return ['auto', 'generations', 'edits'].includes(value ?? '')
    ? (value as OpenAiImageRequestMode)
    : fallback;
}

function includeOptionalOpenAiImageParameters(
  value: string | undefined,
  fallback: boolean,
): boolean {
  return value?.trim().toLowerCase() === 'false' ? false : fallback;
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

function assertPublicAssetBaseUrlForLocalReferences(
  publicAssetBaseUrl: string,
): void {
  let publicBaseUrl: URL;

  try {
    publicBaseUrl = new URL(publicAssetBaseUrl);
  } catch {
    throw new Error(LOCAL_REFERENCE_PUBLIC_BASE_ERROR);
  }

  if (
    (publicBaseUrl.protocol !== 'http:' &&
      publicBaseUrl.protocol !== 'https:') ||
    isPrivateReferenceHost(publicBaseUrl.hostname)
  ) {
    throw new Error(LOCAL_REFERENCE_PUBLIC_BASE_ERROR);
  }
}

function isDataImageReference(value: string): boolean {
  return /^data:image\//i.test(value);
}

function parseDataImageReference(
  value: string,
  maxBytes: number,
): { buffer: Buffer; extension: string } {
  const match = DATA_IMAGE_REFERENCE_PATTERN.exec(value);

  if (!match || !match[1] || !match[2] || match[2].length % 4 === 1) {
    throw new Error('Malformed data image reference');
  }

  const extension = extensionForMimeSubtype(match[1]);
  const buffer = decodeLimitedBase64({
    base64Value: match[2],
    errorPrefix: 'Reference image',
    maxBytes,
  });

  return { buffer, extension };
}

function extensionForMimeSubtype(subtype: string): string {
  const normalizedSubtype = subtype.toLowerCase();

  if (normalizedSubtype === 'jpeg' || normalizedSubtype === 'jpg') {
    return '.jpg';
  }

  return `.${normalizedSubtype}`;
}

function parseReferenceHttpUrl(value: string, publicAssetBaseUrl: string): URL {
  const url = value.startsWith('/')
    ? parseRootRelativeReferenceUrl(value, publicAssetBaseUrl)
    : new URL(value);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Reference image URL must be http or https');
  }

  return url;
}

function parseRootRelativeReferenceUrl(
  value: string,
  publicAssetBaseUrl: string,
): URL {
  assertPublicAssetBaseUrlForLocalReferences(publicAssetBaseUrl);

  return new URL(value, publicAssetBaseUrl);
}

function isOwnReferenceUrl(url: URL, publicAssetBaseUrl: string): boolean {
  const publicBaseOrigin = parsePublicAssetBaseOrigin(publicAssetBaseUrl);

  if (publicBaseOrigin !== undefined && url.origin === publicBaseOrigin) {
    return true;
  }

  return isLoopbackReferenceHost(url.hostname) && url.port === '3000';
}

function parsePublicAssetBaseOrigin(
  publicAssetBaseUrl: string,
): string | undefined {
  try {
    return new URL(publicAssetBaseUrl).origin;
  } catch {
    return undefined;
  }
}

function isPrivateReferenceHost(hostname: string): boolean {
  const normalizedHost = normalizeReferenceHost(hostname);
  const mappedIpv4Host = mappedIpv4ReferenceHost(normalizedHost);

  return (
    isLoopbackReferenceHost(normalizedHost) ||
    (mappedIpv4Host !== undefined &&
      isPrivateIpv4ReferenceHost(mappedIpv4Host)) ||
    isPrivateIpv4ReferenceHost(normalizedHost) ||
    isPrivateIpv6ReferenceHost(normalizedHost)
  );
}

function isLoopbackReferenceHost(hostname: string): boolean {
  const normalizedHost = normalizeReferenceHost(hostname);
  const mappedIpv4Host = mappedIpv4ReferenceHost(normalizedHost);

  return (
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost === '::1' ||
    normalizedHost.startsWith('127.') ||
    (mappedIpv4Host !== undefined && isLoopbackReferenceHost(mappedIpv4Host))
  );
}

function isPrivateIpv4ReferenceHost(hostname: string): boolean {
  const octets = hostname.split('.');

  if (octets.length !== 4 || !octets.every((octet) => /^\d+$/.test(octet))) {
    return false;
  }

  const numbers = octets.map(Number);

  if (numbers.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }

  const [first = 0, second = 0] = numbers;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function isPrivateIpv6ReferenceHost(hostname: string): boolean {
  const normalizedHost = normalizeReferenceHost(hostname);

  return (
    normalizedHost === '::1' ||
    normalizedHost.startsWith('fe8') ||
    normalizedHost.startsWith('fe9') ||
    normalizedHost.startsWith('fea') ||
    normalizedHost.startsWith('feb') ||
    normalizedHost.startsWith('fc') ||
    normalizedHost.startsWith('fd')
  );
}

function normalizeReferenceHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.+$/, '');
}

function mappedIpv4ReferenceHost(hostname: string): string | undefined {
  const normalizedHost = normalizeReferenceHost(hostname);
  const mappedPrefixes = ['::ffff:', '0:0:0:0:0:ffff:'];
  const mappedPrefix = mappedPrefixes.find((prefix) =>
    normalizedHost.startsWith(prefix),
  );

  if (!mappedPrefix) {
    return undefined;
  }

  const mappedValue = normalizedHost.slice(mappedPrefix.length);

  if (isIpv4ReferenceHost(mappedValue)) {
    return mappedValue;
  }

  const hextets = mappedValue.split(':');

  if (
    hextets.length !== 2 ||
    !hextets.every((hextet) => /^[0-9a-f]{1,4}$/.test(hextet))
  ) {
    return undefined;
  }

  const [high, low] = hextets.map((hextet) => parseInt(hextet, 16));

  if (
    high === undefined ||
    low === undefined ||
    high > 0xffff ||
    low > 0xffff
  ) {
    return undefined;
  }

  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(
    '.',
  );
}

function isIpv4ReferenceHost(hostname: string): boolean {
  const octets = hostname.split('.');

  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet)) &&
    octets.map(Number).every((octet) => octet >= 0 && octet <= 255)
  );
}

function extensionForReferenceResponse(
  contentType: string | undefined,
  pathname: string,
): string {
  const extensionFromContentType = contentType
    ? extensionForContentType(contentType)
    : undefined;

  if (extensionFromContentType) {
    return extensionFromContentType;
  }

  return extensionForPath(pathname) ?? '.png';
}

function extensionForContentType(contentType: string): string | undefined {
  const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase();

  if (mimeType === 'image/png') {
    return '.png';
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return '.jpg';
  }

  if (mimeType === 'image/webp') {
    return '.webp';
  }

  return undefined;
}

function extensionForPath(pathname: string): string | undefined {
  const extension = extname(pathname).toLowerCase();

  if (extension === '.jpeg' || extension === '.jpg') {
    return '.jpg';
  }

  if (extension === '.png' || extension === '.webp') {
    return extension;
  }

  return undefined;
}

function estimateBase64DecodedBytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function decodeLimitedBase64(input: {
  base64Value: string;
  errorPrefix: string;
  maxBytes: number;
}): Buffer {
  const normalizedBase64 = input.base64Value.trim();

  if (!normalizedBase64 || normalizedBase64.length % 4 === 1) {
    throw new Error(`Malformed ${input.errorPrefix.toLowerCase()} base64`);
  }

  const estimatedBytes = estimateBase64DecodedBytes(normalizedBase64);

  if (estimatedBytes > input.maxBytes) {
    throw new Error(`${input.errorPrefix} exceeds ${input.maxBytes} bytes`);
  }

  const buffer = Buffer.from(normalizedBase64, 'base64');

  if (buffer.byteLength === 0) {
    throw new Error(`Malformed ${input.errorPrefix.toLowerCase()} base64`);
  }

  if (buffer.byteLength > input.maxBytes) {
    throw new Error(`${input.errorPrefix} exceeds ${input.maxBytes} bytes`);
  }

  return buffer;
}

function filenameWithExtension(value: string, extension: string): string {
  const filename = basename(value);
  const stem = filename.replace(/\.[^.]*$/, '');

  if (!stem || stem === '.' || stem === '..') {
    return `reference-${randomUUID()}${extension}`;
  }

  return `${stem}${extension}`;
}

async function downloadGeneratedImage(input: {
  errorPrefix: string;
  fetchImpl: ImageFetch;
  maxBytes: number;
  timeoutMs: number;
  url: string;
}): Promise<Buffer> {
  const { buffer } = await downloadImage(input);

  return buffer;
}

async function downloadImage(input: {
  errorPrefix: string;
  fetchImpl: ImageFetch;
  maxBytes: number;
  timeoutMs: number;
  url: string;
}): Promise<{ buffer: Buffer; contentType?: string }> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.url, {
      signal: abortController.signal,
    });

    if (response.ok === false) {
      const status = response.status ?? 0;
      const statusText = response.statusText ?? '';

      throw new Error(
        `${input.errorPrefix} fetch failed ${status} ${statusText}`,
      );
    }

    const contentLength = response.headers?.get('content-length');

    if (contentLength && Number(contentLength) > input.maxBytes) {
      throw new Error(`${input.errorPrefix} exceeds ${input.maxBytes} bytes`);
    }

    const contentType = response.headers?.get('content-type') ?? undefined;

    if (response.body?.getReader) {
      return {
        buffer: await readLimitedStream(
          response.body.getReader(),
          input.maxBytes,
          input.errorPrefix,
        ),
        contentType,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > input.maxBytes) {
      throw new Error(`${input.errorPrefix} exceeds ${input.maxBytes} bytes`);
    }

    return { buffer, contentType };
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `${input.errorPrefix} download timed out after ${input.timeoutMs}ms`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readLimitedStream(
  reader: ReturnType<
    NonNullable<Awaited<ReturnType<ImageFetch>>['body']>['getReader']
  >,
  maxBytes: number,
  errorPrefix: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return Buffer.concat(chunks, totalBytes);
    }

    if (!value) {
      continue;
    }

    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`${errorPrefix} exceeds ${maxBytes} bytes`);
    }

    chunks.push(chunk);
  }
}

async function defaultFetchImage(
  url: string,
  init?: { signal?: AbortSignal; redirect?: 'error' },
): Promise<{
  body?: {
    getReader: () => {
      read: () => Promise<{
        done?: boolean;
        value?: Uint8Array;
      }>;
    };
  } | null;
  headers?: {
    get: (name: string) => string | null;
  };
  ok?: boolean;
  status?: number;
  statusText?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable');
  }

  return fetch(url, init);
}
