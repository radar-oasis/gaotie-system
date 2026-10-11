# Canvas Prompt Enhancement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated backend work and staged review; main agent owns frontend integration. User authorized implementation in the current local project. No commits or unrelated cleanup.

**Goal:** Add a model-API enhancement panel with two editable directions, traceable rules and user-controlled generation.

**Architecture:** Separate Nest enhancement controller/service/rules from existing generation. Separate React panel/API/types from large canvas. Keep existing snapshot persistence for the applied prompt.

**Tech Stack:** React/TypeScript/Vitest, NestJS/Jest, existing model API.

## Task 1 Backend (delegated)

- [x] Write and run failing controller/service/rules tests for the exact contract in the design: originalPrompt remains original, two typed direction IDs, bounded metadata, no images, malformed/overlong output rejected.
- [x] Implement dedicated service and controller; register in app module. Environment-based model config; reuse existing configured text credential securely, never expose it. 30s timeout, bounded concurrent calls, sanitized errors.
- [x] Neutralize independent-motif suffix in both image adapters, export its body budget, reject overlong transparent-asset text while preserving final-proposal behavior. Tests assert `expect(() => buildJimengPrompt('龙'.repeat(900))).toThrow()` and neutral suffix permits line-art.
- [x] Run `npm test -- --runInBand` and `npm run build` in gaotie-server.

## Task 2 Frontend (main agent)

- [x] Add `PromptEnhancementPanel.test.tsx`: click optimize invokes only enhancement; source input unchanged; edit/apply selected candidate; restore original; changed input/references cancel pending result.
- [x] Implement `promptEnhancement.ts` request/response types and validation, `PromptEnhancementPanel.tsx`+CSS. Render panel immediately above current input; pass only selected image layers and their metadata, disabled while generation runs.
- [x] Add standalone API tests: non-ok/malformed body errors; POST bounded metadata with AbortSignal. Test panel provides persistent source and no automatic image generation.
- [x] Run focused tests, full frontend suite and build. Existing unrelated failures are reported, not rewritten blindly.

## Task 3 Verification and handoff

- [x] Independent spec review then code-quality review; fix reproducible issues.
- [x] Check actual local API configuration and one text-only enhancement request; no paid image generation.
- [x] Browser check input, optimize, directions, apply/restore and readable rule disclosure. If browser session unavailable, report the gap.
- [x] Update verified outcome, sources and manual comparison guidance. No claimed image-quality improvement without user tests.
