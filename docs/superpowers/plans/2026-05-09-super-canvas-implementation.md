# Super Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "超级画布" page with draggable motif assets, uploadable train mockups, brush annotations, region capture, and Jimeng 4.0 image generation with transparent PNG post-processing.

**Architecture:** Keep the frontend page local to `gaotie-web/src/components/superCanvas`, with pure utilities for layer math and rendering helpers. Add a focused backend super-canvas module under `gaotie-server/src/super-canvas` for Volcengine signing, Jimeng 4.0 task submit/poll, transparent-image post-processing, and the `/super-canvas/generate` API. Generated PNG files are written under `gaotie-server/generated/super-canvas` and served statically.

**Tech Stack:** React 19, Vite, TypeScript, TDesign icons, NestJS, Jest, Vitest, Sharp, Volcengine Jimeng image generation 4.0 (`jimeng_t2i_v40`).

---

## File Structure

Backend files:

- Create `gaotie-server/src/super-canvas/transparentize.ts`: deterministic background-to-alpha PNG post-processing.
- Create `gaotie-server/src/super-canvas/transparentize.spec.ts`: Sharp-based regression tests for transparentizing white backgrounds.
- Create `gaotie-server/src/super-canvas/volcengine-signer.ts`: AK/SK request signer for Volcengine `cv` APIs.
- Create `gaotie-server/src/super-canvas/volcengine-signer.spec.ts`: deterministic signer tests with fixed dates.
- Create `gaotie-server/src/super-canvas/jimeng-client.ts`: Jimeng 4.0 submit/poll client and response parsing.
- Create `gaotie-server/src/super-canvas/jimeng-client.spec.ts`: parser and polling tests with mocked `fetch`.
- Create `gaotie-server/src/super-canvas/super-canvas.service.ts`: orchestration service that calls Jimeng, post-processes the result, and writes generated PNG assets.
- Create `gaotie-server/src/super-canvas/super-canvas.controller.ts`: `POST /super-canvas/generate`.
- Create `gaotie-server/src/super-canvas/super-canvas.controller.spec.ts`: controller validation and service delegation tests.
- Modify `gaotie-server/src/app.module.ts`: register `SuperCanvasController` and `SuperCanvasService`.
- Modify `gaotie-server/src/main.ts`: serve `generated/super-canvas` under `/generated/super-canvas/`.
- Modify `gaotie-server/package.json` and lockfile: add `sharp`.

Frontend files:

- Modify `gaotie-web/package.json` and lockfile: add `vitest` and a `test` script.
- Create `gaotie-web/src/components/superCanvas/types.ts`: layer, tool, capture, and generation response types.
- Create `gaotie-web/src/components/superCanvas/imageUrls.ts`: pattern/backend URL resolver.
- Create `gaotie-web/src/components/superCanvas/layerMath.ts`: pure helpers for canvas coordinates, layer creation, scale, and bounds.
- Create `gaotie-web/src/components/superCanvas/layerMath.test.ts`: Vitest tests for layer math.
- Create `gaotie-web/src/components/superCanvas/renderCanvas.ts`: draw image/stroke layers to an offscreen canvas and export captures.
- Create `gaotie-web/src/components/superCanvas/superCanvasApi.ts`: frontend API wrapper for `/super-canvas/generate`.
- Create `gaotie-web/src/components/superCanvas/SuperCanvasPage.tsx`: full page UI and interactions.
- Create `gaotie-web/src/components/superCanvas/SuperCanvasPage.css`: canvas page styling.
- Modify `gaotie-web/src/App.tsx`: add the `canvas` tab and render `SuperCanvasPage`.
- Modify `gaotie-web/src/components/TopNav.tsx`: add the fourth navigation button.

---

### Task 1: Backend Transparent PNG Post-Processor

**Files:**
- Create: `gaotie-server/src/super-canvas/transparentize.spec.ts`
- Create: `gaotie-server/src/super-canvas/transparentize.ts`
- Modify: `gaotie-server/package.json`
- Modify: `gaotie-server/package-lock.json`

- [ ] **Step 1: Install image-processing dependency**

Run:

```bash
cd gaotie-server
npm install sharp
```

Expected: `package.json` gains `sharp` under dependencies and `package-lock.json` updates.

- [ ] **Step 2: Write the failing transparentize test**

Create `src/super-canvas/transparentize.spec.ts`:

```ts
import sharp from 'sharp';
import { transparentizeImage } from './transparentize';

async function alphaAt(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3];
}

describe('transparentizeImage', () => {
  it('turns a simple white background transparent while keeping the motif opaque', async () => {
    const input = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 8,
              height: 8,
              channels: 4,
              background: '#0052d9',
            },
          })
            .png()
            .toBuffer(),
          left: 6,
          top: 6,
        },
      ])
      .png()
      .toBuffer();

    const result = await transparentizeImage(input);

    expect(result.confidence).toBe('high');
    expect(await alphaAt(result.buffer, 0, 0)).toBe(0);
    expect(await alphaAt(result.buffer, 10, 10)).toBeGreaterThan(240);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd gaotie-server
npm test -- transparentize.spec.ts
```

Expected: FAIL because `./transparentize` does not exist or `transparentizeImage` is not exported.

- [ ] **Step 4: Create the transparentize implementation**

Create `src/super-canvas/transparentize.ts`:

```ts
import sharp from 'sharp';

export type TransparencyConfidence = 'high' | 'low';

export interface TransparentizeResult {
  buffer: Buffer;
  confidence: TransparencyConfidence;
  transparentPixelRatio: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelAt(data: Buffer, width: number, x: number, y: number): Rgb {
  const index = (y * width + x) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
  };
}

function estimateBackground(data: Buffer, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const sampleSize = Math.max(1, Math.floor(Math.min(width, height) * 0.08));

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      samples.push(pixelAt(data, width, x, y));
      samples.push(pixelAt(data, width, width - 1 - x, y));
      samples.push(pixelAt(data, width, x, height - 1 - y));
      samples.push(pixelAt(data, width, width - 1 - x, height - 1 - y));
    }
  }

  const total = samples.reduce(
    (sum, color) => ({
      r: sum.r + color.r,
      g: sum.g + color.g,
      b: sum.b + color.b,
    }),
    { r: 0, g: 0, b: 0 },
  );

  return {
    r: Math.round(total.r / samples.length),
    g: Math.round(total.g / samples.length),
    b: Math.round(total.b / samples.length),
  };
}

export async function transparentizeImage(
  input: Buffer,
): Promise<TransparentizeResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const background = estimateBackground(data, info.width, info.height);
  const transparentThreshold = 52;
  const feather = 32;
  let transparentPixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    const distance = colorDistance(
      { r: data[index], g: data[index + 1], b: data[index + 2] },
      background,
    );

    if (distance <= transparentThreshold) {
      data[index + 3] = 0;
      transparentPixels += 1;
      continue;
    }

    if (distance <= transparentThreshold + feather) {
      const alpha = Math.round(
        ((distance - transparentThreshold) / feather) * 255,
      );
      data[index + 3] = Math.min(data[index + 3], alpha);
      transparentPixels += 1;
    }
  }

  const pixelCount = info.width * info.height;
  const transparentPixelRatio = transparentPixels / pixelCount;
  const buffer = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  return {
    buffer,
    confidence: transparentPixelRatio > 0.08 ? 'high' : 'low',
    transparentPixelRatio,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd gaotie-server
npm test -- transparentize.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gaotie-server/package.json gaotie-server/package-lock.json gaotie-server/src/super-canvas/transparentize.ts gaotie-server/src/super-canvas/transparentize.spec.ts
git commit -m "Add super canvas transparent image processing"
```

---

### Task 2: Volcengine AK/SK Signer

**Files:**
- Create: `gaotie-server/src/super-canvas/volcengine-signer.spec.ts`
- Create: `gaotie-server/src/super-canvas/volcengine-signer.ts`

- [ ] **Step 1: Write the failing signer test**

Create `src/super-canvas/volcengine-signer.spec.ts`:

```ts
import { createVolcengineSignedRequest } from './volcengine-signer';

describe('createVolcengineSignedRequest', () => {
  it('creates a signed Jimeng cv request with deterministic headers', () => {
    const request = createVolcengineSignedRequest({
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      action: 'CVSync2AsyncSubmitTask',
      version: '2022-08-31',
      body: JSON.stringify({ req_key: 'jimeng_t2i_v40', prompt: '龙纹' }),
      now: new Date('2026-05-09T00:00:00.000Z'),
    });

    expect(request.url).toBe(
      'https://visual.volcengineapi.com/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31',
    );
    expect(request.headers.host).toBe('visual.volcengineapi.com');
    expect(request.headers['x-date']).toBe('20260509T000000Z');
    expect(request.headers['x-content-sha256']).toHaveLength(64);
    expect(request.headers.authorization).toContain('HMAC-SHA256');
    expect(request.headers.authorization).toContain(
      'Credential=AKTEST/20260509/cn-north-1/cv/request',
    );
    expect(request.headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-content-sha256;x-date',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd gaotie-server
npm test -- volcengine-signer.spec.ts
```

Expected: FAIL because `./volcengine-signer` does not exist.

- [ ] **Step 3: Create signer implementation**

Create `src/super-canvas/volcengine-signer.ts`:

```ts
import { createHash, createHmac } from 'crypto';

interface SignedRequestInput {
  accessKeyId: string;
  secretAccessKey: string;
  action: string;
  version: string;
  body: string;
  now?: Date;
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const HOST = 'visual.volcengineapi.com';
const REGION = 'cn-north-1';
const SERVICE = 'cv';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function formatDate(date: Date): string {
  return formatAmzDate(date).slice(0, 8);
}

function canonicalQuery(action: string, version: string): string {
  return `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`;
}

export function createVolcengineSignedRequest(
  input: SignedRequestInput,
): SignedRequest {
  const now = input.now ?? new Date();
  const xDate = formatAmzDate(now);
  const shortDate = formatDate(now);
  const payloadHash = hash(input.body);
  const query = canonicalQuery(input.action, input.version);

  const canonicalHeaders = [
    'content-type:application/json',
    `host:${HOST}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`,
  ].join('\n');

  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = [
    'POST',
    '/',
    query,
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const kDate = hmac(input.secretAccessKey, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign)
    .digest('hex');

  return {
    url: `https://${HOST}/?${query}`,
    body: input.body,
    headers: {
      'content-type': 'application/json',
      host: HOST,
      'x-content-sha256': payloadHash,
      'x-date': xDate,
      authorization: [
        'HMAC-SHA256',
        `Credential=${input.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(', '),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd gaotie-server
npm test -- volcengine-signer.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gaotie-server/src/super-canvas/volcengine-signer.ts gaotie-server/src/super-canvas/volcengine-signer.spec.ts
git commit -m "Add Volcengine request signing"
```

---

### Task 3: Jimeng 4.0 Client

**Files:**
- Create: `gaotie-server/src/super-canvas/jimeng-client.spec.ts`
- Create: `gaotie-server/src/super-canvas/jimeng-client.ts`

- [ ] **Step 1: Write failing Jimeng client tests**

Create `src/super-canvas/jimeng-client.spec.ts`:

```ts
import {
  buildJimengPrompt,
  generateJimengImage,
  parseJimengImages,
} from './jimeng-client';

describe('parseJimengImages', () => {
  it('parses returned image URLs', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: { status: 'done', image_urls: ['https://example.com/a.png'] },
        message: 'Success',
      }),
    ).toEqual([{ type: 'url', value: 'https://example.com/a.png' }]);
  });

  it('parses returned base64 images', () => {
    expect(
      parseJimengImages({
        code: 10000,
        data: { status: 'done', binary_data_base64: ['abc'] },
        message: 'Success',
      }),
    ).toEqual([{ type: 'base64', value: 'abc' }]);
  });
});

describe('buildJimengPrompt', () => {
  it('adds plain-background constraints for post-processing', () => {
    const prompt = buildJimengPrompt('生成京张长城纹样');

    expect(prompt).toContain('生成京张长城纹样');
    expect(prompt).toContain('single clean motif');
    expect(prompt).toContain('plain white or solid light background');
    expect(prompt.length).toBeLessThanOrEqual(800);
  });
});

describe('generateJimengImage', () => {
  it('submits a task and polls until an image URL is available', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { task_id: 'task-1' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: { status: 'generating' },
          message: 'Success',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 10000,
          data: {
            status: 'done',
            image_urls: ['https://example.com/result.png'],
          },
          message: 'Success',
        }),
      });

    const result = await generateJimengImage({
      prompt: '生成龙纹',
      accessKeyId: 'AKTEST',
      secretAccessKey: 'SKTEST',
      fetchImpl,
      pollDelayMs: 0,
      maxPolls: 3,
    });

    expect(result.taskId).toBe('task-1');
    expect(result.images).toEqual([
      { type: 'url', value: 'https://example.com/result.png' },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd gaotie-server
npm test -- jimeng-client.spec.ts
```

Expected: FAIL because `./jimeng-client` does not exist.

- [ ] **Step 3: Create Jimeng client implementation**

Create `src/super-canvas/jimeng-client.ts`:

```ts
import { createVolcengineSignedRequest } from './volcengine-signer';

type FetchLike = typeof fetch;

interface JimengImageGenerationInput {
  prompt: string;
  accessKeyId: string;
  secretAccessKey: string;
  referenceImageUrls?: string[];
  fetchImpl?: FetchLike;
  pollDelayMs?: number;
  maxPolls?: number;
}

interface JimengResponse {
  code: number;
  data?: {
    task_id?: string;
    status?: string;
    image_urls?: string[];
    binary_data_base64?: string[];
  } | null;
  message?: string;
  request_id?: string;
}

export interface JimengImage {
  type: 'url' | 'base64';
  value: string;
}

export interface JimengGenerationResult {
  taskId: string;
  requestId?: string;
  images: JimengImage[];
}

const REQ_KEY = 'jimeng_t2i_v40';
const VERSION = '2022-08-31';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertSuccess(response: JimengResponse) {
  if (response.code !== 10000) {
    throw new Error(
      `Jimeng API error: ${response.code} ${response.message ?? 'Unknown error'} ${response.request_id ?? ''}`.trim(),
    );
  }
}

export function buildJimengPrompt(prompt: string): string {
  const suffix = [
    'single clean motif',
    'plain white or solid light background',
    'no shadows',
    'no mockup background',
    'centered subject',
  ].join(', ');
  return `${prompt.trim()}. ${suffix}`.slice(0, 800);
}

export function parseJimengImages(response: JimengResponse): JimengImage[] {
  assertSuccess(response);
  const data = response.data;
  if (!data || data.status !== 'done') {
    return [];
  }

  const urlImages =
    data.image_urls?.map((value) => ({ type: 'url' as const, value })) ?? [];
  const base64Images =
    data.binary_data_base64?.map((value) => ({
      type: 'base64' as const,
      value,
    })) ?? [];

  return [...urlImages, ...base64Images];
}

async function postJimeng(
  input: {
    action: string;
    body: Record<string, unknown>;
    accessKeyId: string;
    secretAccessKey: string;
    fetchImpl: FetchLike;
  },
): Promise<JimengResponse> {
  const body = JSON.stringify(input.body);
  const signedRequest = createVolcengineSignedRequest({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    action: input.action,
    version: VERSION,
    body,
  });

  const response = await input.fetchImpl(signedRequest.url, {
    method: 'POST',
    headers: signedRequest.headers,
    body: signedRequest.body,
  });

  const json = (await response.json()) as JimengResponse;
  if (!response.ok) {
    throw new Error(
      `Jimeng HTTP error: ${response.status} ${json.message ?? ''}`.trim(),
    );
  }
  assertSuccess(json);
  return json;
}

export async function generateJimengImage(
  input: JimengImageGenerationInput,
): Promise<JimengGenerationResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const submitResponse = await postJimeng({
    action: 'CVSync2AsyncSubmitTask',
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    fetchImpl,
    body: {
      req_key: REQ_KEY,
      prompt: buildJimengPrompt(input.prompt),
      image_urls: input.referenceImageUrls ?? [],
      force_single: true,
      return_url: true,
    },
  });

  const taskId = submitResponse.data?.task_id;
  if (!taskId) {
    throw new Error('Jimeng submit response did not include task_id');
  }

  const maxPolls = input.maxPolls ?? 30;
  const pollDelayMs = input.pollDelayMs ?? 2000;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (poll > 0 || pollDelayMs > 0) {
      await sleep(pollDelayMs);
    }

    const resultResponse = await postJimeng({
      action: 'CVSync2AsyncGetResult',
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      fetchImpl,
      body: {
        req_key: REQ_KEY,
        task_id: taskId,
        req_json: JSON.stringify({ return_url: true }),
      },
    });

    const status = resultResponse.data?.status;
    if (status === 'done') {
      const images = parseJimengImages(resultResponse);
      if (images.length === 0) {
        throw new Error('Jimeng completed without image output');
      }
      return {
        taskId,
        requestId: resultResponse.request_id,
        images,
      };
    }

    if (status === 'not_found' || status === 'expired') {
      throw new Error(`Jimeng task ${status}`);
    }
  }

  throw new Error('Jimeng task timed out');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd gaotie-server
npm test -- jimeng-client.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gaotie-server/src/super-canvas/jimeng-client.ts gaotie-server/src/super-canvas/jimeng-client.spec.ts
git commit -m "Add Jimeng 4 image generation client"
```

---

### Task 4: Backend Super Canvas API

**Files:**
- Create: `gaotie-server/src/super-canvas/super-canvas.controller.spec.ts`
- Create: `gaotie-server/src/super-canvas/super-canvas.controller.ts`
- Create: `gaotie-server/src/super-canvas/super-canvas.service.ts`
- Modify: `gaotie-server/src/app.module.ts`
- Modify: `gaotie-server/src/main.ts`

- [ ] **Step 1: Write the failing controller test**

Create `src/super-canvas/super-canvas.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { SuperCanvasController } from './super-canvas.controller';
import { SuperCanvasService } from './super-canvas.service';

describe('SuperCanvasController', () => {
  const service = {
    generateTransparentAsset: jest.fn(),
  } as unknown as jest.Mocked<SuperCanvasService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an empty prompt', async () => {
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({ prompt: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates valid generation requests to the service', async () => {
    service.generateTransparentAsset.mockResolvedValue({
      imageUrl: 'http://localhost:3000/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });
    const controller = new SuperCanvasController(service);

    await expect(
      controller.generate({
        prompt: '生成长城纹样',
        referenceImageUrl: 'http://localhost:3000/images/a.png',
      }),
    ).resolves.toEqual({
      imageUrl: 'http://localhost:3000/generated/super-canvas/a.png',
      taskId: 'task-1',
      confidence: 'high',
      transparentPixelRatio: 0.4,
    });

    expect(service.generateTransparentAsset).toHaveBeenCalledWith({
      prompt: '生成长城纹样',
      referenceImageUrl: 'http://localhost:3000/images/a.png',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd gaotie-server
npm test -- super-canvas.controller.spec.ts
```

Expected: FAIL because the controller/service files do not exist.

- [ ] **Step 3: Create service and controller**

Create `src/super-canvas/super-canvas.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { generateJimengImage, type JimengImage } from './jimeng-client';
import {
  transparentizeImage,
  type TransparencyConfidence,
} from './transparentize';

interface GenerateTransparentAssetInput {
  prompt: string;
  referenceImageUrl?: string;
}

export interface GenerateTransparentAssetResult {
  imageUrl: string;
  taskId: string;
  confidence: TransparencyConfidence;
  transparentPixelRatio: number;
}

const GENERATED_DIR = join(process.cwd(), 'generated', 'super-canvas');

@Injectable()
export class SuperCanvasService {
  async generateTransparentAsset(
    input: GenerateTransparentAssetInput,
  ): Promise<GenerateTransparentAssetResult> {
    const accessKeyId = process.env.JIMENG_ACCESS_KEY_ID;
    const secretAccessKey = process.env.JIMENG_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Jimeng credentials are not configured');
    }

    const generation = await generateJimengImage({
      prompt: input.prompt,
      referenceImageUrls: input.referenceImageUrl
        ? [input.referenceImageUrl]
        : undefined,
      accessKeyId,
      secretAccessKey,
    });

    const sourceBuffer = await this.readGeneratedImage(generation.images[0]);
    const processed = await transparentizeImage(sourceBuffer);
    await mkdir(GENERATED_DIR, { recursive: true });

    const fileName = `${Date.now()}-${randomUUID()}.png`;
    const filePath = join(GENERATED_DIR, fileName);
    await writeFile(filePath, processed.buffer);

    return {
      imageUrl: `http://localhost:3000/generated/super-canvas/${fileName}`,
      taskId: generation.taskId,
      confidence: processed.confidence,
      transparentPixelRatio: processed.transparentPixelRatio,
    };
  }

  private async readGeneratedImage(image: JimengImage): Promise<Buffer> {
    if (image.type === 'base64') {
      return Buffer.from(image.value, 'base64');
    }

    const response = await fetch(image.value);
    if (!response.ok) {
      throw new Error(`Failed to fetch generated image: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
```

Create `src/super-canvas/super-canvas.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  SuperCanvasService,
  type GenerateTransparentAssetResult,
} from './super-canvas.service';

interface GenerateRequestBody {
  prompt?: string;
  referenceImageUrl?: string;
}

@Controller('super-canvas')
export class SuperCanvasController {
  constructor(private readonly superCanvasService: SuperCanvasService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateRequestBody,
  ): Promise<GenerateTransparentAssetResult> {
    const prompt = body.prompt?.trim() ?? '';
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    return this.superCanvasService.generateTransparentAsset({
      prompt,
      referenceImageUrl: body.referenceImageUrl,
    });
  }
}
```

- [ ] **Step 4: Register controller, service, and static generated assets**

Modify `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Neo4jModule } from './neo4j.module';
import { SuperCanvasController } from './super-canvas/super-canvas.controller';
import { SuperCanvasService } from './super-canvas/super-canvas.service';

@Module({
  imports: [Neo4jModule],
  controllers: [AppController, SuperCanvasController],
  providers: [AppService, SuperCanvasService],
})
export class AppModule {}
```

Modify `src/main.ts` by adding this static mount after the existing static asset mounts:

```ts
  app.useStaticAssets(join(__dirname, '..', 'generated', 'super-canvas'), {
    prefix: '/generated/super-canvas/',
  });
```

If `__dirname` points to `dist`, use this exact expression instead so production and development builds both serve the project-level generated folder:

```ts
  app.useStaticAssets(join(process.cwd(), 'generated', 'super-canvas'), {
    prefix: '/generated/super-canvas/',
  });
```

- [ ] **Step 5: Run controller test to verify it passes**

Run:

```bash
cd gaotie-server
npm test -- super-canvas.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run backend build**

Run:

```bash
cd gaotie-server
npm run build
```

Expected: TypeScript/Nest build exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add gaotie-server/src/super-canvas/super-canvas.controller.ts gaotie-server/src/super-canvas/super-canvas.controller.spec.ts gaotie-server/src/super-canvas/super-canvas.service.ts gaotie-server/src/app.module.ts gaotie-server/src/main.ts
git commit -m "Add super canvas generation API"
```

---

### Task 5: Frontend Canvas Types and Utility Tests

**Files:**
- Modify: `gaotie-web/package.json`
- Modify: `gaotie-web/package-lock.json`
- Create: `gaotie-web/src/components/superCanvas/types.ts`
- Create: `gaotie-web/src/components/superCanvas/imageUrls.ts`
- Create: `gaotie-web/src/components/superCanvas/layerMath.ts`
- Create: `gaotie-web/src/components/superCanvas/layerMath.test.ts`

- [ ] **Step 1: Install frontend test runner**

Run:

```bash
cd gaotie-web
npm install -D vitest
```

Then add this script to `gaotie-web/package.json`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Create shared types**

Create `src/components/superCanvas/types.ts`:

```ts
export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ImageLayer {
  id: string;
  type: 'image';
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface StrokeLayer {
  id: string;
  type: 'stroke';
  color: string;
  size: number;
  points: CanvasPoint[];
}

export type CanvasLayer = ImageLayer | StrokeLayer;
export type CanvasTool = 'select' | 'brush' | 'capture';

export interface CaptureItem {
  id: string;
  name: string;
  src: string;
  createdAt: string;
}

export interface GenerationResponse {
  imageUrl: string;
  taskId: string;
  confidence: 'high' | 'low';
  transparentPixelRatio: number;
}
```

- [ ] **Step 3: Write failing utility tests**

Create `src/components/superCanvas/layerMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createImageLayer,
  getLayerBounds,
  resolveDropPoint,
  scaleImageLayer,
} from './layerMath';

describe('layerMath', () => {
  it('creates an image layer centered on the drop point', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '长城纹样',
      src: '/images/a.png',
      dropPoint: { x: 500, y: 300 },
      naturalWidth: 800,
      naturalHeight: 400,
    });

    expect(layer).toMatchObject({
      id: 'layer-1',
      type: 'image',
      name: '长城纹样',
      x: 380,
      y: 240,
      width: 240,
      height: 120,
    });
  });

  it('scales an image layer around its center', () => {
    const layer = createImageLayer({
      id: 'layer-1',
      name: '纹样',
      src: '/images/a.png',
      dropPoint: { x: 100, y: 100 },
      naturalWidth: 100,
      naturalHeight: 100,
    });

    const scaled = scaleImageLayer(layer, 2);

    expect(getLayerBounds(scaled)).toEqual({
      left: -20,
      top: -20,
      right: 220,
      bottom: 220,
    });
  });

  it('resolves pointer coordinates inside a zoomed canvas', () => {
    const point = resolveDropPoint({
      clientX: 260,
      clientY: 180,
      canvasRect: { left: 20, top: 30 },
      pan: { x: 100, y: 50 },
      zoom: 2,
    });

    expect(point).toEqual({ x: 70, y: 50 });
  });
});
```

- [ ] **Step 4: Run utility tests to verify they fail**

Run:

```bash
cd gaotie-web
npm test -- layerMath.test.ts
```

Expected: FAIL because `layerMath` does not exist.

- [ ] **Step 5: Create image URL and layer math utilities**

Create `src/components/superCanvas/imageUrls.ts`:

```ts
export function resolveBackendImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:')) return imageUrl;
  if (imageUrl.startsWith('http')) return imageUrl;
  if (imageUrl.startsWith('/')) return `http://localhost:3000${imageUrl}`;
  if (imageUrl.startsWith('images/')) return `http://localhost:3000/${imageUrl}`;
  return `http://localhost:3000/images/${imageUrl}`;
}
```

Create `src/components/superCanvas/layerMath.ts`:

```ts
import type { CanvasPoint, ImageLayer } from './types';

interface CreateImageLayerInput {
  id: string;
  name: string;
  src: string;
  dropPoint: CanvasPoint;
  naturalWidth: number;
  naturalHeight: number;
}

interface ResolveDropPointInput {
  clientX: number;
  clientY: number;
  canvasRect: Pick<DOMRect, 'left' | 'top'>;
  pan: CanvasPoint;
  zoom: number;
}

export function createImageLayer(input: CreateImageLayerInput): ImageLayer {
  const maxSide = 240;
  const scale = Math.min(
    maxSide / input.naturalWidth,
    maxSide / input.naturalHeight,
    1,
  );
  const width = Math.round(input.naturalWidth * scale);
  const height = Math.round(input.naturalHeight * scale);

  return {
    id: input.id,
    type: 'image',
    name: input.name,
    src: input.src,
    x: Math.round(input.dropPoint.x - width / 2),
    y: Math.round(input.dropPoint.y - height / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
  };
}

export function getLayerBounds(layer: ImageLayer) {
  return {
    left: Math.round(layer.x),
    top: Math.round(layer.y),
    right: Math.round(layer.x + layer.width),
    bottom: Math.round(layer.y + layer.height),
  };
}

export function scaleImageLayer(layer: ImageLayer, scale: number): ImageLayer {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const width = Math.max(24, Math.round(layer.width * scale));
  const height = Math.max(24, Math.round(layer.height * scale));

  return {
    ...layer,
    width,
    height,
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
  };
}

export function resolveDropPoint(input: ResolveDropPointInput): CanvasPoint {
  return {
    x: Math.round(
      (input.clientX - input.canvasRect.left - input.pan.x) / input.zoom,
    ),
    y: Math.round(
      (input.clientY - input.canvasRect.top - input.pan.y) / input.zoom,
    ),
  };
}
```

- [ ] **Step 6: Run utility tests to verify they pass**

Run:

```bash
cd gaotie-web
npm test -- layerMath.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add gaotie-web/package.json gaotie-web/package-lock.json gaotie-web/src/components/superCanvas/types.ts gaotie-web/src/components/superCanvas/imageUrls.ts gaotie-web/src/components/superCanvas/layerMath.ts gaotie-web/src/components/superCanvas/layerMath.test.ts
git commit -m "Add super canvas frontend utilities"
```

---

### Task 6: Frontend Rendering and API Helpers

**Files:**
- Create: `gaotie-web/src/components/superCanvas/renderCanvas.ts`
- Create: `gaotie-web/src/components/superCanvas/superCanvasApi.ts`

- [ ] **Step 1: Create canvas rendering helper**

Create `src/components/superCanvas/renderCanvas.ts`:

```ts
import type { CanvasLayer, CanvasPoint } from './types';

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function drawStroke(
  context: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  size: number,
) {
  if (points.length === 0) return;
  context.strokeStyle = color;
  context.lineWidth = size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
}

export async function exportLayersToPng(
  layers: CanvasLayer[],
  rect: CaptureRect,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
  }

  context.translate(-rect.x, -rect.y);

  for (const layer of layers) {
    if (layer.type === 'stroke') {
      drawStroke(context, layer.points, layer.color, layer.size);
      continue;
    }

    const image = await loadImage(layer.src);
    context.globalAlpha = layer.opacity;
    context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
    context.globalAlpha = 1;
  }

  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 2: Create frontend generation API helper**

Create `src/components/superCanvas/superCanvasApi.ts`:

```ts
import type { GenerationResponse } from './types';

interface GenerateTransparentAssetInput {
  prompt: string;
  referenceImageUrl?: string;
}

export async function generateTransparentAsset(
  input: GenerateTransparentAssetInput,
): Promise<GenerationResponse> {
  const response = await fetch('http://localhost:3000/super-canvas/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = (await response.json()) as Partial<GenerationResponse> & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? `生成失败：${response.status}`);
  }

  if (!body.imageUrl || !body.taskId) {
    throw new Error('生成接口返回缺少图片信息');
  }

  return {
    imageUrl: body.imageUrl,
    taskId: body.taskId,
    confidence: body.confidence ?? 'low',
    transparentPixelRatio: body.transparentPixelRatio ?? 0,
  };
}
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd gaotie-web
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add gaotie-web/src/components/superCanvas/renderCanvas.ts gaotie-web/src/components/superCanvas/superCanvasApi.ts
git commit -m "Add super canvas render and API helpers"
```

---

### Task 7: Super Canvas Page and Navigation

**Files:**
- Create: `gaotie-web/src/components/superCanvas/SuperCanvasPage.tsx`
- Create: `gaotie-web/src/components/superCanvas/SuperCanvasPage.css`
- Modify: `gaotie-web/src/App.tsx`
- Modify: `gaotie-web/src/components/TopNav.tsx`

- [ ] **Step 1: Create the page component**

Create `src/components/superCanvas/SuperCanvasPage.tsx` with these responsibilities:

```tsx
import { useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import {
  AiImageIcon,
  BrushIcon,
  CutIcon,
  DeleteIcon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'tdesign-icons-react';
import { useImageSearch } from '../../context/ImageSearchContext';
import { resolveBackendImageUrl } from './imageUrls';
import { createImageLayer, resolveDropPoint, scaleImageLayer } from './layerMath';
import { exportLayersToPng, type CaptureRect } from './renderCanvas';
import { generateTransparentAsset } from './superCanvasApi';
import type { CanvasLayer, CanvasTool, CaptureItem, ImageLayer, StrokeLayer } from './types';
import './SuperCanvasPage.css';
```

The component state must include:

```tsx
const [layers, setLayers] = useState<CanvasLayer[]>([]);
const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
const [tool, setTool] = useState<CanvasTool>('select');
const [zoom, setZoom] = useState(1);
const [pan] = useState({ x: 0, y: 0 });
const [brushColor, setBrushColor] = useState('#111827');
const [brushSize, setBrushSize] = useState(4);
const [captures, setCaptures] = useState<CaptureItem[]>([]);
const [prompt, setPrompt] = useState('');
const [isGenerating, setIsGenerating] = useState(false);
const [statusMessage, setStatusMessage] = useState('');
const [leftCollapsed, setLeftCollapsed] = useState(false);
const [rightCollapsed, setRightCollapsed] = useState(false);
const [leftWidth, setLeftWidth] = useState(260);
const [rightWidth, setRightWidth] = useState(260);
```

The rendered layout must use:

```tsx
return (
  <div className="super-canvas">
    <aside className="super-canvas__panel super-canvas__panel--left">...</aside>
    <main className="super-canvas__workspace">...</main>
    <aside className="super-canvas__panel super-canvas__panel--right">...</aside>
  </div>
);
```

The left panel must map `selectedPatterns` from `useImageSearch()` and set drag data:

```tsx
event.dataTransfer.setData(
  'application/x-super-canvas-asset',
  JSON.stringify({
    name: pattern.name,
    src: resolveBackendImageUrl(pattern.imageUrl),
  }),
);
```

The canvas drop handler must:

```tsx
const data = event.dataTransfer.getData('application/x-super-canvas-asset');
const asset = JSON.parse(data) as { name: string; src: string };
const image = new Image();
image.onload = () => {
  const point = resolveDropPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    canvasRect: canvasRef.current!.getBoundingClientRect(),
    pan,
    zoom,
  });
  setLayers((prev) => [
    ...prev,
    createImageLayer({
      id: `layer-${Date.now()}`,
      name: asset.name,
      src: asset.src,
      dropPoint: point,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }),
  ]);
};
image.src = asset.src;
```

The page must include toolbar buttons for select, brush, capture, upload, delete, zoom in, and zoom out. Use icon-only buttons with `title` text.

- [ ] **Step 2: Add upload, brush, capture, and generation handlers**

Add these handlers in `SuperCanvasPage.tsx`:

```tsx
function handleUpload(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const src = String(reader.result);
    const image = new Image();
    image.onload = () => {
      setLayers((prev) => [
        ...prev,
        createImageLayer({
          id: `upload-${Date.now()}`,
          name: file.name,
          src,
          dropPoint: { x: 640, y: 360 },
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        }),
      ]);
    };
    image.src = src;
  };
  reader.readAsDataURL(file);
}

function moveSelected(deltaX: number, deltaY: number) {
  setLayers((prev) =>
    prev.map((layer) =>
      layer.id === selectedLayerId && layer.type === 'image'
        ? { ...layer, x: layer.x + deltaX, y: layer.y + deltaY }
        : layer,
    ),
  );
}

function deleteSelected() {
  setLayers((prev) => prev.filter((layer) => layer.id !== selectedLayerId));
  setSelectedLayerId(null);
}

async function captureRect(rect: CaptureRect) {
  const src = await exportLayersToPng(layers, rect);
  setCaptures((prev) => [
    {
      id: `capture-${Date.now()}`,
      name: `框选 ${prev.length + 1}`,
      src,
      createdAt: new Date().toISOString(),
    },
    ...prev,
  ]);
}

async function handleGenerate() {
  const text = prompt.trim();
  if (!text) return;

  const selected = layers.find((layer) => layer.id === selectedLayerId);
  setIsGenerating(true);
  setStatusMessage('正在调用即梦 4.0 生成图片...');
  try {
    const result = await generateTransparentAsset({
      prompt: text,
      referenceImageUrl:
        selected?.type === 'image' ? selected.src : undefined,
    });
    const image = new Image();
    image.onload = () => {
      setLayers((prev) => [
        ...prev,
        createImageLayer({
          id: `generated-${Date.now()}`,
          name: 'AI 生成纹样',
          src: result.imageUrl,
          dropPoint: { x: 720, y: 380 },
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        }),
      ]);
    };
    image.src = result.imageUrl;
    setStatusMessage(
      result.confidence === 'high'
        ? '已生成透明底 PNG'
        : '已生成 PNG，透明化效果可能不完整',
    );
  } catch (error) {
    setStatusMessage(error instanceof Error ? error.message : '生成失败');
  } finally {
    setIsGenerating(false);
  }
}
```

- [ ] **Step 3: Add page CSS**

Create `src/components/superCanvas/SuperCanvasPage.css` with:

```css
.super-canvas {
  display: flex;
  height: 100%;
  min-height: 0;
  background: #f4f6f8;
  color: #1f2937;
}

.super-canvas__panel {
  display: flex;
  flex-direction: column;
  min-width: 56px;
  height: 100%;
  background: #ffffff;
  border-color: #e5e7eb;
  border-style: solid;
}

.super-canvas__panel--left {
  border-width: 0 1px 0 0;
}

.super-canvas__panel--right {
  border-width: 0 0 0 1px;
}

.super-canvas__workspace {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.super-canvas__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.super-canvas__tool-button {
  width: 32px;
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  color: #4b5563;
  cursor: pointer;
}

.super-canvas__tool-button.is-active {
  border-color: #0052d9;
  color: #0052d9;
  background: #eef4ff;
}

.super-canvas__stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: #fbfaf2;
  background-image:
    linear-gradient(#d6d3c8 1px, transparent 1px),
    linear-gradient(90deg, #d6d3c8 1px, transparent 1px);
  background-size: 80px 80px;
}

.super-canvas__surface {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}

.super-canvas__layer {
  position: absolute;
  user-select: none;
}

.super-canvas__layer.is-selected {
  outline: 2px solid #0052d9;
  outline-offset: 2px;
}

.super-canvas__generation-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
}

.super-canvas__prompt {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.super-canvas__primary {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: #0052d9;
  color: #ffffff;
  cursor: pointer;
}
```

- [ ] **Step 4: Add navigation integration**

Modify `src/App.tsx`:

```tsx
import SuperCanvasPage from './components/superCanvas/SuperCanvasPage';

type TabType = 'demand' | 'image' | 'layout' | 'canvas';

{activeTab === 'canvas' && <SuperCanvasPage />}
```

Modify `src/components/TopNav.tsx`:

```tsx
interface TopNavProps {
  activeTab: 'demand' | 'image' | 'layout' | 'canvas';
  onTabChange: (tab: 'demand' | 'image' | 'layout' | 'canvas') => void;
}
```

Add a fourth button after "布局元素":

```tsx
<button
  onClick={() => onTabChange('canvas')}
  style={{
    padding: '8px 20px',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s',
    backgroundColor: activeTab === 'canvas' ? '#0052d9' : '#f3f4f6',
    color: activeTab === 'canvas' ? '#ffffff' : '#666666',
  }}
>
  超级画布
</button>
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd gaotie-web
npm run build
```

Expected: build exits with code 0. Fix unused imports, missing icons, and strict TypeScript errors immediately.

- [ ] **Step 6: Commit**

```bash
git add gaotie-web/src/components/superCanvas/SuperCanvasPage.tsx gaotie-web/src/components/superCanvas/SuperCanvasPage.css gaotie-web/src/App.tsx gaotie-web/src/components/TopNav.tsx
git commit -m "Add super canvas page"
```

---

### Task 8: Full Verification

**Files:**
- Verify all files changed by Tasks 1-7.

- [ ] **Step 1: Run backend tests**

Run:

```bash
cd gaotie-server
npm test
```

Expected: all Jest suites pass.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd gaotie-server
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
cd gaotie-web
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd gaotie-web
npm run build
```

Expected: build exits with code 0.

- [ ] **Step 5: Start local services**

If services are not already running:

```bash
cd gaotie-server
npm run start:dev
```

In another terminal:

```bash
cd gaotie-web
npm run dev
```

Expected:

- backend listens on `http://localhost:3000`;
- frontend listens on `http://localhost:5173`.

- [ ] **Step 6: Manual browser smoke test**

Open `http://localhost:5173` and verify:

- "超级画布" appears in the top navigation.
- selected images from "意象图片检索" appear in the left panel.
- a selected image can be dragged into the canvas.
- uploaded train white-film image appears as an image layer.
- selecting a layer shows a selected outline.
- delete removes the selected layer.
- brush mode creates visible strokes.
- capture mode saves a PNG into the right panel.
- generation with an empty prompt is disabled or rejected.
- generation with a prompt calls `POST /super-canvas/generate`.
- generated result is placed on the canvas after the backend returns an image URL.

- [ ] **Step 7: Final commit for verification fixes**

If verification required small fixes:

```bash
git add gaotie-server gaotie-web
git commit -m "Stabilize super canvas verification"
```

Skip this commit when there are no verification changes.

---

## Self-Review

Spec coverage:

- New navigation tab and page: Task 7.
- Left selected-pattern panel: Task 7.
- Center canvas with image placement, upload, selection, scale, delete, brush, capture: Tasks 5-7.
- Right capture panel: Task 7.
- Bottom generation bar: Task 7.
- Jimeng 4.0 backend integration with `jimeng_t2i_v40`: Tasks 2-4.
- Transparent PNG post-processing: Task 1 and Task 4.
- Generated static assets: Task 4.
- Error handling and verification: Tasks 4, 7, 8.

Placeholder scan:

- The plan uses exact file paths, commands, request shapes, core code, and expected results.
- It does not rely on unspecified future work.

Type consistency:

- `GenerationResponse` matches the backend `GenerateTransparentAssetResult`.
- `CanvasLayer`, `ImageLayer`, `StrokeLayer`, and `CaptureItem` are defined once in `types.ts` and reused by helpers and page code.
- Backend controller delegates to `SuperCanvasService.generateTransparentAsset`, matching the service method signature.
