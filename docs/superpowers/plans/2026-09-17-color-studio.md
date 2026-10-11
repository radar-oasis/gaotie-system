# Color Studio Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans; test-first, preserve all unrelated dirty files, no commits or deployment.

**Goal:** Replace layout-bound color page with optional conversational color studio, real Codex image search, uploaded references, boards and palettes saved per project, selectable in final generation.

**Architecture:** Keep legacy color state for compatibility; add a separate versioned studio object into existing project snapshots. New backend local-only authenticated endpoints run restricted Codex search/chat and secure image extraction. Final color reference uses palette-only mode and explicit override text; do not impose region painting for new palettes.

**Tech Stack:** React/TypeScript, NestJS, Codex CLI, sharp, ColorThief.

## Accepted interaction and contract

Studio state: messages `{id,role:'user'|'assistant',text}`, images `{id,title,imageUrl,sourceUrl}`, boards `{id,name,images,createdAt}`, palettes `{id,name,colors:[{hex,role,proportion}],rationale,source:'image'|'suggestion',createdAt}`, activePaletteId `string|null`, autoSearchKey `string`, lastCandidates `string[]`. Stored in project workspace; no layout dependency.

`POST /color-studio/chat` JSON `{message,context:string[],history:{role,text}[],mode:'chat'|'search'|'palette',candidateColors?:string[]}` -> `{reply,images:[{id,title,imageUrl,sourceUrl}],palette?:{name,colors:[{hex,role,proportion}],rationale}}`. Missing mode defaults chat. Search uses actual built-in web search. Palette mode respects candidates if provided. Invalid model JSON/errors are surfaced, never mocked.

`POST /color-studio/extract` JSON `{imageUrls:string[]}` -> `{colors:string[]}`. Bounded list, HTTPS public only, DNS checks and pinned resolution for each request; reject redirect/private targets, size/type limits. Multi-image palette balanced by image rather than image dimensions. `POST /color-studio/upload` multipart image -> `{image:{id,title,imageUrl,sourceUrl},colors:string[]}` with generated server image URL; enforce local/auth and byte/pixel limits. Upload may use existing static generated directory, no arbitrary file path.

## Tasks

- [ ] Backend: write failing validation/extraction/adapter tests, run Jest RED, implement color-studio module, verify GREEN/build. Reuse existing local-access guard pattern; no secrets/config dumps, no changes to codex-image client. Restrict process tools and timeout/concurrency; read-only search and JSON text output only.
- [ ] Frontend: write failing studio/snapshot tests. Add studio types and state, replace ColorConfigPage with responsive chat + image board + palette shelf, no mandatory layout. Abort stale requests on project change. Auto-search once for each project initial context; changed context prompts explicit refresh. Buttons for search, direct palette, extract selected, upload, rename/save boards and palettes; error/retry/cancel and next-step always accessible.
- [ ] Persistence: add studio field to workspace snapshot normalization/capture/hydration, defaults for old snapshots; project switching must not leak state.
- [ ] Final generation: test optional palette and prompt behavior; add final palette selector including none and legacy option. Palette-only reference independent of regions; user text is explicit color override with visible explanation; new palette must not colorize train layout or inherit legacy colors when none selected.
- [ ] Verification: focused tests, full frontend/backend tests/builds, real local Codex search and extraction smoke; browser interaction if available; inspect changes, report limitations and launch local system for user.

## Acceptance examples

```text
No selected layout + user asks red tones -> reply + suggested palette -> save -> refresh preserves it.
Culture tags selected -> enter studio -> one actual image search -> select images -> extract -> palette -> save as named variant.
Two saved palettes -> final selector chooses each -> submitted colorScheme palette matches chosen one.
No color selected -> final request has no new colorScheme, user may type red tones directly.
Project A request pending -> switch B -> no A response writes into B state.
Remote image private IP/redirect/oversize -> reject without fetching internal services.
```

## Delivery and verification — 2026-09-17

Implementation and verification tasks above are complete. Existing project and legacy color data were preserved; no commit or deployment was performed.

- Frontend: 34 test suites / 171 tests passed; production build passed after the final navigation fix. Backend: 38 suites / 323 tests passed; build passed. Both repositories pass `git diff --check`.
- Live local browser: created a separate trial project “新项目 3”; generated and saved “色系1 · 克制朱红” from text without layout or image; refresh restored it.
- Live Codex image search returned three actual blue-and-white dragon porcelain photographs with source links; browser verified all three loaded. Saved “青花龙纹参考看板”.
- Extracted colors from the selected Ming porcelain image and generated “色系2 · 青花瓷白”: #F3F3F8 75%, #162D54 20%, #1B2728 5%. These are suggested design proportions, not measured image-area statistics.
- Browser verified entry into final generation, selection of either saved palette, and clearing the reference with “不使用色板”. A missed navigation callback was found during browser acceptance and fixed; the callback is now a required prop.
- Final-generation payload/prompt behavior is covered by tests. No real final image was generated in this acceptance run; aesthetic adherence remains for user trial.
- Initial-context auto-search and late-request cancellation/project isolation are covered by automated tests. Live trial used explicit dialogue; upload handling is tested but was not separately exercised through the browser.
- Local trial: http://127.0.0.1:5173 (backend 3001). Requires local Codex login and network access. Network search is slower than local operations, and external image availability/licensing are not guaranteed. Errors support retry/cancel.

Engineering-delivery and test-first skills guided the additive snapshot migration, separate palette-reference mode, preservation of legacy data, and regression tests. Systematic debugging guided the final navigation correction.
