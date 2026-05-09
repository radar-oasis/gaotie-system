# Super Canvas Design

Date: 2026-05-09

## Goal

Add a "超级画布" page to the existing gaotie system. The page lets users compose train livery concepts from selected motif images, generated transparent-pattern assets, uploaded train body white-film images, brush annotations, and captured regions.

## Current Context

The project has a React/Vite frontend in `gaotie-web` and a Nest backend in `gaotie-server`.

The existing image-search flow stores chosen motif images in `ImageSearchContext.selectedPatterns`. The new canvas page will reuse that state as its left-side asset source, so images selected in "意象图片检索" naturally become draggable canvas inputs.

The frontend already calls the backend at `http://localhost:3000`. The new image-generation endpoint will follow that pattern and keep all Volcengine/Jimeng credentials on the backend.

## User Experience

The top navigation gains a fourth tab: "超级画布".

The page has three main regions:

- Left resizable asset panel: shows motif images selected in the image-search module. Each item is draggable into the canvas. The panel can be collapsed or widened to leave more workspace.
- Center infinite-style canvas: users can place images, upload train white-film images, move and scale layers, select a motif for generation, draw annotations with a brush, and define capture rectangles.
- Right resizable capture panel: stores images produced by rectangular captures. Captured images can be previewed and dragged back into the canvas.

At the bottom of the canvas is a generation bar. When a canvas motif is selected, the user can type an image-generation instruction and submit. The system returns a transparent-background PNG asset and places it back on the canvas.

## Canvas Interactions

The first version will support these layer types:

- `image`: selected motif, uploaded train body, generated transparent asset, or captured region.
- `stroke`: brush/annotation path.

Image layers support:

- drag to move;
- select by click;
- resize through a compact scale control or corner handle;
- delete selected layer;
- keep ordering by creation order, with selected layer rendered above peers.

Brush mode supports:

- freehand drawing on the canvas;
- configurable color and size in a compact toolbar;
- generated strokes become canvas layers and are included in captures.

Capture mode supports:

- drag a rectangle over the canvas;
- export the visible content inside the rectangle as a PNG data URL;
- save it into the right capture panel.

Upload supports:

- local image upload from the toolbar;
- automatic placement near the center of the visible canvas;
- intended use case: train body white-film/base mockup.

## Image Generation Flow

Frontend request:

```json
{
  "prompt": "用户输入的生图需求描述",
  "referenceImageUrl": "可选，选中画布纹样的图片 URL 或 data URL",
  "forceSingle": true
}
```

Backend endpoint:

- `POST /super-canvas/generate`

Backend behavior:

1. Validate prompt and optional selected reference image.
2. Submit a Jimeng image-generation 4.0 task.
3. Poll until the task status is `done`, or fail on timeout/error status.
4. Fetch the generated image from `image_urls` or decode `binary_data_base64`.
5. Run transparent-background post-processing.
6. Save the processed PNG under a backend-served generated asset path.
7. Return a generated asset URL and task metadata.

Jimeng 4.0 API configuration:

- `req_key`: `jimeng_t2i_v40`
- submit action: `CVSync2AsyncSubmitTask`
- result action: `CVSync2AsyncGetResult`
- version: `2022-08-31`
- endpoint: `https://visual.volcengineapi.com`
- region: `cn-north-1`
- service: `cv`

Credentials must be read from environment variables, not frontend code:

- `JIMENG_ACCESS_KEY_ID`
- `JIMENG_SECRET_ACCESS_KEY`

## Transparent-Background Post-Processing

The first implementation uses deterministic post-processing for generated PNGs:

1. Decode the generated image.
2. Detect likely background pixels from image borders and corners.
3. Convert similar pixels to alpha transparency.
4. Save as PNG.

This works best for simple or near-solid backgrounds. If the generated image has complex backgrounds, the backend still returns a PNG but marks the transparency confidence as low so the UI can show a short warning.

Prompt construction will also guide Jimeng toward easier post-processing:

- "single clean motif";
- "plain white or solid light background";
- "no shadows";
- "no mockup background";
- "centered subject".

This keeps the first version usable while leaving room to replace the post-processor with a stronger cutout/material-extraction service later.

## Architecture

Frontend additions:

- `SuperCanvasPage.tsx`: page shell, panel layout, toolbar, generation bar.
- canvas state hooks/helpers for layers, selection, drag, resize, brush, and capture.
- utility to resolve image URLs consistently with the existing motif components.
- integration in `App.tsx` and `TopNav.tsx`.

Backend additions:

- controller methods under `/super-canvas`.
- service methods for Jimeng submit/poll and transparent PNG post-processing.
- small signing helper for Volcengine AK/SK requests.
- static serving for generated canvas assets.

Generated assets should be stored in a local generated folder, for example `gaotie-server/generated/super-canvas`, and served from `/generated/super-canvas/...`.

## Error Handling

Frontend:

- Disable generation when no prompt is entered.
- If no layer is selected, allow text-only generation.
- Show progress states: submitting, generating, processing, complete.
- Show backend error messages in the generation bar.
- If transparency confidence is low, place the image but show a non-blocking warning.

Backend:

- Reject empty prompts with `400`.
- Return upstream Jimeng errors with request id when available.
- Timeout polling after a fixed window.
- Never log AK/SK values.
- Validate generated images before writing files.

## Testing

Backend unit tests:

- Volcengine signing helper builds deterministic authorization headers.
- Jimeng response parsing accepts `image_urls` and `binary_data_base64`.
- generation endpoint rejects empty prompt.
- transparent post-processing turns simple white backgrounds transparent.

Frontend build/type verification:

- TypeScript build.
- Manual browser verification for drag/drop, upload, generate-result placement, brush, capture, and responsive/collapsible panels.

## First-Version Scope

Included:

- new page and navigation tab;
- left selected-pattern asset panel;
- center canvas with image layers, move, resize, select, delete;
- upload base image;
- brush annotations;
- rectangular capture to right panel;
- backend Jimeng 4.0 integration;
- transparent PNG post-processing.

Not included in first version:

- multi-user collaboration;
- persistent saved canvas documents;
- advanced layer history/undo stack;
- complex semantic cutout beyond deterministic background transparency.
