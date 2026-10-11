import { createVolcengineSignedRequest } from './volcengine-signer';
import { buildTransparentAssetPrompt } from './motif-prompt';
export { TRANSPARENT_ASSET_PROMPT_BODY_LIMIT } from './motif-prompt';

const JIMENG_VERSION = '2022-08-31';
const JIMENG_REQ_KEY = 'jimeng_t2i_v40';
const SUBMIT_ACTION = 'CVSync2AsyncSubmitTask';
const GET_RESULT_ACTION = 'CVSync2AsyncGetResult';
const FINAL_PROPOSAL_MAX_PROMPT_LENGTH = 1200;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const FINAL_PROPOSAL_PROMPT_CONSTRAINT =
  'Create one clean side-view high-speed train livery design. Use reference images as visual guidance for layout, color, motif placement, and case placement. Preserve train body proportions, windows, doors, and nose structure. Do not copy internal labels, ids, watermarks, model codes, or unrelated text.';

export type JimengPromptContext = 'transparent-asset' | 'final-proposal';

export type JimengImage =
  | { type: 'url'; value: string }
  | { type: 'base64'; value: string };

export interface GenerateJimengImageInput {
  prompt: string;
  accessKeyId: string;
  secretAccessKey: string;
  imageUrls?: string[];
  fetchImpl?: FetchImpl;
  pollDelayMs?: number;
  maxPolls?: number;
  requestTimeoutMs?: number;
  promptContext?: JimengPromptContext;
}

export interface GenerateJimengImageResult {
  taskId: string;
  requestId?: string;
  images: JimengImage[];
}

type FetchImpl = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<JimengHttpResponse>;

interface JimengHttpResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}

interface JimengApiResponse {
  code?: number;
  data?: {
    status?: string;
    task_id?: string;
    image_urls?: unknown;
    binary_data_base64?: unknown;
  };
  message?: string;
  request_id?: string;
}

export function buildJimengPrompt(
  prompt: string,
  options: { promptContext?: JimengPromptContext } = {},
): string {
  const isFinalProposal = options.promptContext === 'final-proposal';
  if (!isFinalProposal) return buildTransparentAssetPrompt(prompt);
  const constraint = FINAL_PROPOSAL_PROMPT_CONSTRAINT;
  const maxPromptLength = FINAL_PROPOSAL_MAX_PROMPT_LENGTH;
  const suffix = `\n\n${constraint}`;
  const normalizedPrompt = prompt.trim();
  const promptLimit = Math.max(0, maxPromptLength - suffix.length);

  return `${normalizedPrompt.slice(0, promptLimit)}${suffix}`.slice(
    0,
    maxPromptLength,
  );
}

export function parseJimengImages(response: JimengApiResponse): JimengImage[] {
  if (response.code !== 10000 || response.data?.status !== 'done') {
    return [];
  }

  const imageUrls = Array.isArray(response.data.image_urls)
    ? response.data.image_urls
    : [];
  const base64Images = Array.isArray(response.data.binary_data_base64)
    ? response.data.binary_data_base64
    : [];

  return [
    ...imageUrls
      .filter(isNonBlankString)
      .map((value) => ({ type: 'url' as const, value })),
    ...base64Images
      .filter(isNonBlankString)
      .map((value) => ({ type: 'base64' as const, value })),
  ];
}

export async function generateJimengImage(
  input: GenerateJimengImageInput,
): Promise<GenerateJimengImageResult> {
  const fetchImpl = input.fetchImpl ?? defaultFetch;
  const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const submitBody = {
    req_key: JIMENG_REQ_KEY,
    prompt: buildJimengPrompt(input.prompt, {
      promptContext: input.promptContext,
    }),
    ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
    force_single: true,
    return_url: true,
  };
  const submitResponse = await requestJimengApi({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    action: SUBMIT_ACTION,
    body: submitBody,
    fetchImpl,
    requestTimeoutMs,
  });
  const taskId = submitResponse.data?.task_id;

  if (!taskId) {
    throw new Error('Jimeng submit response missing task_id');
  }

  const maxPolls = input.maxPolls ?? 30;
  const pollDelayMs = input.pollDelayMs ?? 1000;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (pollDelayMs > 0) {
      await delay(pollDelayMs);
    }

    const resultResponse = await requestJimengApi({
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      action: GET_RESULT_ACTION,
      body: {
        req_key: JIMENG_REQ_KEY,
        task_id: taskId,
        req_json: JSON.stringify({ return_url: true }),
      },
      fetchImpl,
      requestTimeoutMs,
    });
    const status = resultResponse.data?.status;

    if (status === 'expired' || status === 'not_found') {
      throw new Error(`Jimeng task ${taskId} ${status}`);
    }

    if (status === 'done') {
      const images = parseJimengImages(resultResponse);

      if (images.length === 0) {
        throw new Error(`Jimeng task ${taskId} completed without images`);
      }

      return {
        taskId,
        requestId: resultResponse.request_id ?? submitResponse.request_id,
        images,
      };
    }
  }

  throw new Error(`Jimeng task ${taskId} timed out after ${maxPolls} polls`);
}

async function requestJimengApi(input: {
  accessKeyId: string;
  secretAccessKey: string;
  action: string;
  body: Record<string, unknown>;
  fetchImpl: FetchImpl;
  requestTimeoutMs: number;
}): Promise<JimengApiResponse> {
  const signedRequest = createVolcengineSignedRequest({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    action: input.action,
    version: JIMENG_VERSION,
    body: JSON.stringify(input.body),
  });
  const response = await fetchWithTimeout({
    action: input.action,
    fetchImpl: input.fetchImpl,
    request: signedRequest,
    requestTimeoutMs: input.requestTimeoutMs,
  });

  if (!response.ok) {
    const responseText = response.text ? await response.text() : '';
    const status = response.status ?? 0;
    const statusText = response.statusText ?? '';
    const suffix = responseText ? `: ${responseText}` : '';

    throw new Error(`Jimeng HTTP error ${status} ${statusText}${suffix}`);
  }

  const payload = (await response.json()) as JimengApiResponse;

  if (payload.code !== 10000) {
    throw new Error(
      `Jimeng API error ${payload.code ?? 'unknown'}: ${
        payload.message ?? 'Unknown error'
      }`,
    );
  }

  return payload;
}

async function defaultFetch(
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
): Promise<JimengHttpResponse> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable; provide fetchImpl');
  }

  return fetch(url, init);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function fetchWithTimeout(input: {
  action: string;
  fetchImpl: FetchImpl;
  request: {
    method: 'POST';
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  requestTimeoutMs: number;
}): Promise<JimengHttpResponse> {
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      reject(
        new Error(
          `Jimeng request ${input.action} timed out after ${input.requestTimeoutMs}ms`,
        ),
      );
    }, input.requestTimeoutMs);
  });

  try {
    return await Promise.race([
      input.fetchImpl(input.request.url, {
        method: input.request.method,
        headers: input.request.headers,
        body: input.request.body,
        signal: abortController.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
