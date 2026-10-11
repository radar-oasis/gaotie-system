# Final Proposal Regenerate Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make final generation switch between “new generation” and “current proposal iteration” based on whether left-side design inputs still match the current proposal, and add a clear-current-proposal action.

**Architecture:** Add a deterministic fingerprint for the final design package and selected reference images. Store the fingerprint on each generated proposal snapshot, compare it with the current left-side inputs, and route the single primary button to `generate` when inputs changed or to `iterate` when they have not. Keep clearing local to final proposal state so layout, color, case, and canvas inputs remain intact.

**Tech Stack:** React, TypeScript, existing final proposal API/context, Vitest/React Testing Library.

---

### Task 1: Fingerprint Current Final Inputs

**Files:**
- Create: `gaotie-web/src/components/finalProposal/finalInputFingerprint.ts`
- Test: `gaotie-web/src/components/finalProposal/finalInputFingerprint.test.ts`

- [ ] **Step 1: Write tests for stable fingerprinting**

```ts
import { buildFinalInputFingerprint } from './finalInputFingerprint';
import type { FinalDesignPackage } from './finalProposalTypes';

const basePackage: FinalDesignPackage = {
  demandTags: [],
  selectedPatterns: [],
  selectedCases: [],
  layoutScheme: { id: 'layout-1', name: '方案1', componentsMap: { 车窗带: 'A2' } },
  colorScheme: {
    id: 'color-1',
    name: '色彩方案1',
    layoutSchemeId: 'layout-1',
    regions: [{ id: 'window', name: '车窗带', color: '#d5492a' }],
    createdAt: '2026-05-27T00:00:00.000Z',
  },
  canvasAssets: [{ id: 'capture-1', name: '截取 1', imageUrl: 'data:image/png;base64,AAA', source: 'capture' }],
};

it('is stable for the same semantic final inputs', () => {
  expect(buildFinalInputFingerprint(basePackage, ['a.png'])).toBe(
    buildFinalInputFingerprint(
      { ...basePackage, layoutScheme: { id: 'layout-2', name: '重命名', componentsMap: { 车窗带: 'A2' } } },
      ['a.png'],
    ),
  );
});

it('changes when selected references change', () => {
  expect(buildFinalInputFingerprint(basePackage, ['a.png'])).not.toBe(
    buildFinalInputFingerprint(basePackage, ['b.png']),
  );
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- finalInputFingerprint.test.ts`

- [ ] **Step 3: Implement `buildFinalInputFingerprint`**

Create a function that JSON-stringifies only semantic inputs: demand labels/topics, selected pattern ids/imageUrls, selected case ids/user descriptions/images, layout `componentsMap`, color regions names/colors/component ids, canvas asset ids/imageUrls/source, and sorted selected reference URLs.

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test -- finalInputFingerprint.test.ts`

### Task 2: Route Button To Generate Or Iterate

**Files:**
- Modify: `gaotie-web/src/components/finalProposal/FinalProposalPage.tsx`
- Modify: `gaotie-web/src/components/finalProposal/ProposalAdjustChat.tsx`
- Modify: `gaotie-web/src/components/finalProposal/finalProposalTypes.ts`
- Test: `gaotie-web/src/components/finalProposal/FinalProposalPage.test.tsx`

- [ ] **Step 1: Add tests**

Cover:
- With a current proposal whose stored fingerprint matches current inputs, clicking primary action with text calls iterate endpoint.
- After left-side selected references change, the primary action label becomes `基于新输入重新生成` and clicking calls generate endpoint.
- Clicking `清除当前效果` removes current preview and makes primary label `生成最终效果`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- FinalProposalPage.test.tsx`

- [ ] **Step 3: Implement mode detection**

In `FinalProposalPage.tsx`, compute `currentInputFingerprint`. Store `inputFingerprint` on generated proposal state. `isCurrentProposalStale = Boolean(currentProposal && currentProposal.inputFingerprint !== currentInputFingerprint)`.

- [ ] **Step 4: Update primary submit behavior**

Pass a `mode` to `ProposalAdjustChat`: `generate`, `regenerate`, or `iterate`. For `regenerate`, call `onGenerate(input)`. For `iterate`, require non-empty input and call `onIterate(input)`.

- [ ] **Step 5: Add clear action**

Add `onClearCurrentProposal` prop. In page, set current proposal to `null`, clear adjustment history, clear error message. Do not clear design package inputs.

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- finalInputFingerprint.test.ts FinalProposalPage.test.tsx`

### Task 3: Verification And Deployment

**Files:**
- Build artifacts only.

- [ ] **Step 1: Run web tests**

Run: `npm test`

- [ ] **Step 2: Build frontend**

Run: `VITE_API_BASE_URL=http://8.210.235.216 npm run build`

- [ ] **Step 3: Deploy frontend**

Run: `rsync -az --delete -e "ssh -i ../default.pem -o StrictHostKeyChecking=accept-new" dist/ root@8.210.235.216:/opt/gaotie-system/gaotie-web/dist/`

- [ ] **Step 4: Smoke check**

Open/curl `http://8.210.235.216` and confirm frontend assets respond.
