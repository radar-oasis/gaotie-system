import { buildTransparentAssetPrompt } from '../super-canvas/motif-prompt';
export { TRANSPARENT_ASSET_PROMPT_BODY_LIMIT } from '../super-canvas/motif-prompt';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_FINAL_PROMPT_LENGTH = 32000;
const FINAL_PROPOSAL_PROMPT_CONSTRAINT =
  'Create one clean side-view high-speed train livery design. Use uploaded reference images as visual guidance for train layout, color placement, motif placement, and case reference placement. Preserve the train body proportions, windows, doors, and nose structure. Use the selected color swatches on their named train regions. If a reference case describes the CR mark location, use that placement logic without copying unrelated text. Do not render labels such as A1, A2, C1, F2, ids, watermarks, or annotation boxes. Produce a polished realistic proposal image on an opaque clean white or very light studio background.';

export type OpenAiPromptContext =
  | 'final-proposal'
  | 'transparent-asset'
  | 'raw';
export type OpenAiImageRequestMode = 'auto' | 'generations' | 'edits';
export type OpenAiImageQuality = 'low' | 'medium' | 'high' | 'auto';
export type OpenAiOutputFormat = 'png' | 'jpeg' | 'webp';
export type OpenAiBackground = 'opaque' | 'transparent' | 'auto';

export type OpenAiImage =
  | { type: 'url'; value: string }
  | { type: 'base64'; value: string };

export interface GenerateOpenAiImageInput {
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  imageUrls?: string[];
  // Seedream accepts references in generations JSON; opt-in avoids changing other providers.
  generationImageField?: boolean;
  model?: string;
  quality?: OpenAiImageQuality;
  size?: string;
  outputFormat?: OpenAiOutputFormat;
  background?: OpenAiBackground;
  promptContext?: OpenAiPromptContext;
  requestMode?: OpenAiImageRequestMode;
  includeOptionalImageParameters?: boolean;
  fetchImpl?: OpenAiFetch;
  requestTimeoutMs?: number;
  maxReferenceBytes?: number;
}

export interface GenerateOpenAiImageResult {
  taskId: string;
  requestId?: string;
  images: OpenAiImage[];
}

export type OpenAiFetch = (
  url: string,
  init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string | FormData;
    signal?: AbortSignal;
  },
) => Promise<OpenAiHttpResponse>;

interface OpenAiHttpResponse {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: {
    get: (name: string) => string | null;
  };
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface OpenAiImagesResponse {
  created?: number;
  data?: unknown;
}

interface OpenAiImagesResponseItem {
  url?: unknown;
  b64_json?: unknown;
}

export function buildOpenAiFinalProposalPrompt(prompt: string): string {
  return buildOpenAiImagePrompt(prompt, { promptContext: 'final-proposal' });
}

export function buildOpenAiImagePrompt(
  prompt: string,
  options: { promptContext?: OpenAiPromptContext } = {},
): string {
  const promptContext = options.promptContext ?? 'final-proposal';
  if (promptContext === 'transparent-asset')
    return buildTransparentAssetPrompt(prompt);
  const constraint =
    promptContext === 'final-proposal' ? FINAL_PROPOSAL_PROMPT_CONSTRAINT : '';
  const maxPromptLength = MAX_FINAL_PROMPT_LENGTH;
  const suffix = constraint ? `\n\n${constraint}` : '';
  const normalizedPrompt = prompt.trim();
  const promptLimit = Math.max(0, maxPromptLength - suffix.length);

  return `${normalizedPrompt.slice(0, promptLimit)}${suffix}`.slice(
    0,
    maxPromptLength,
  );
}

export async function generateOpenAiImage(
  input: GenerateOpenAiImageInput,
): Promise<GenerateOpenAiImageResult> {
  const referenceImageUrls = input.imageUrls?.filter(Boolean) ?? [];
  const requestMode = input.requestMode ?? 'auto';

  return requestMode === 'edits' ||
    (requestMode === 'auto' && referenceImageUrls.length > 0)
    ? generateOpenAiImageEdit(input, referenceImageUrls)
    : generateOpenAiImageFromPrompt(input);
}

async function generateOpenAiImageFromPrompt(
  input: GenerateOpenAiImageInput,
): Promise<GenerateOpenAiImageResult> {
  const includeOptionalParameters =
    input.includeOptionalImageParameters ?? true;
  const body: Record<string, unknown> = {
    model: input.model ?? 'gpt-image-2',
    prompt: buildOpenAiImagePrompt(input.prompt, {
      promptContext: input.promptContext,
    }),
  };

  if (input.generationImageField && input.imageUrls?.length) {
    body.image = input.imageUrls;
  }

  if (includeOptionalParameters) {
    body.quality = input.quality ?? 'low';
    body.size = input.size ?? '1536x1024';
    body.output_format = input.outputFormat ?? 'png';
    body.background = input.background ?? 'opaque';
  }

  const response = await fetchWithTimeout({
    fetchImpl: input.fetchImpl ?? defaultFetch,
    requestTimeoutMs: input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    url: openAiEndpoint(input.baseUrl, '/images/generations'),
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  });

  return parseOpenAiImagesResponse(response);
}

async function generateOpenAiImageEdit(
  input: GenerateOpenAiImageInput,
  imageUrls: string[],
): Promise<GenerateOpenAiImageResult> {
  const fetchImpl = input.fetchImpl ?? defaultFetch;
  const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const includeOptionalParameters =
    input.includeOptionalImageParameters ?? true;
  const formData = new FormData();

  formData.append('model', input.model ?? 'gpt-image-2');
  formData.append(
    'prompt',
    buildOpenAiImagePrompt(input.prompt, {
      promptContext: input.promptContext,
    }),
  );

  if (includeOptionalParameters) {
    formData.append('quality', input.quality ?? 'low');
    formData.append('size', input.size ?? '1536x1024');
    formData.append('output_format', input.outputFormat ?? 'png');
    formData.append('background', input.background ?? 'opaque');
  }

  for (const [index, imageUrl] of imageUrls.entries()) {
    const reference = await downloadReferenceImage({
      fetchImpl,
      maxBytes: input.maxReferenceBytes ?? DEFAULT_MAX_REFERENCE_BYTES,
      requestTimeoutMs,
      url: imageUrl,
    });

    formData.append(
      'image[]',
      new Blob([new Uint8Array(reference.buffer)], {
        type: reference.contentType,
      }),
      `reference-${index + 1}.${extensionForContentType(reference.contentType)}`,
    );
  }

  const response = await fetchWithTimeout({
    fetchImpl,
    requestTimeoutMs,
    url: openAiEndpoint(input.baseUrl, '/images/edits'),
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: formData,
    },
  });

  return parseOpenAiImagesResponse(response);
}

async function downloadReferenceImage(input: {
  fetchImpl: OpenAiFetch;
  maxBytes: number;
  requestTimeoutMs: number;
  url: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetchWithTimeout({
    fetchImpl: input.fetchImpl,
    requestTimeoutMs: input.requestTimeoutMs,
    url: input.url,
    init: { method: 'GET' },
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength > input.maxBytes) {
    throw new Error('OpenAI reference image exceeds maximum size');
  }

  return {
    buffer,
    contentType:
      response.headers?.get('content-type')?.split(';')[0]?.trim() ||
      'image/png',
  };
}

async function parseOpenAiImagesResponse(
  response: OpenAiHttpResponse,
): Promise<GenerateOpenAiImageResult> {
  if (!response.ok) {
    const responseText = response.text ? await response.text() : '';
    const status = response.status ?? 0;
    const statusText = response.statusText ?? '';
    const suffix = responseText ? `: ${responseText}` : '';

    throw new Error(`OpenAI image HTTP error ${status} ${statusText}${suffix}`);
  }

  const requestId = response.headers?.get('x-request-id') ?? undefined;
  const payload = (await response.json()) as OpenAiImagesResponse;
  const images = parseOpenAiImages(payload);

  if (images.length === 0) {
    throw new Error('OpenAI image response returned no images');
  }

  return {
    taskId: `openai-${payload.created ?? Date.now()}`,
    requestId,
    images,
  };
}

function parseOpenAiImages(payload: OpenAiImagesResponse): OpenAiImage[] {
  const data = Array.isArray(payload.data) ? payload.data : [];

  return data.flatMap((item): OpenAiImage[] => {
    const image = item as OpenAiImagesResponseItem;

    if (typeof image.b64_json === 'string' && image.b64_json.trim()) {
      return [{ type: 'base64', value: image.b64_json }];
    }

    if (typeof image.url === 'string' && image.url.trim()) {
      return [{ type: 'url', value: image.url }];
    }

    return [];
  });
}

async function fetchWithTimeout(input: {
  fetchImpl: OpenAiFetch;
  init: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string | FormData;
  };
  requestTimeoutMs: number;
  url: string;
}): Promise<OpenAiHttpResponse> {
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutId = setTimeout(
      () => abortController.abort(),
      input.requestTimeoutMs,
    );

    return await input.fetchImpl(input.url, {
      ...input.init,
      signal: abortController.signal,
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `图像生成服务请求超时（已等待 ${Math.round(input.requestTimeoutMs / 1000)} 秒）。未自动重试；请稍后再试，避免重复计费。`,
      );
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function defaultFetch(
  url: string,
  init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string | FormData;
    signal?: AbortSignal;
  },
): Promise<OpenAiHttpResponse> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable; provide fetchImpl');
  }

  return fetch(url, init);
}

function extensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();

  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'jpg';
  }

  if (normalized.includes('webp')) {
    return 'webp';
  }

  return 'png';
}

function openAiEndpoint(baseUrl: string | undefined, pathname: string): string {
  const normalizedBase = normalizeOpenAiBaseUrl(baseUrl);

  return `${normalizedBase}${pathname}`;
}

function normalizeOpenAiBaseUrl(baseUrl: string | undefined): string {
  const rawBase = (baseUrl || DEFAULT_OPENAI_BASE_URL)
    .trim()
    .replace(/\/+$/, '');

  return /\/(?:v\d+|api\/v\d+)$/i.test(rawBase) ? rawBase : `${rawBase}/v1`;
}
