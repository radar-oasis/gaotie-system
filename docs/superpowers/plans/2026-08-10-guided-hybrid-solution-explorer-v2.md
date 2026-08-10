# Guided Hybrid Solution Explorer V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone interactive HTML demo that preserves the existing early-stage design modules and introduces a guided, editable node canvas only for downstream livery combination, proposal exploration, selection, and high-fidelity output.

**Architecture:** Create one self-contained HTML file with inline CSS, SVG, and deterministic JavaScript state. Use a six-stage view router rather than rendering all modules simultaneously. A Happy DOM Vitest file loads the HTML, executes the inline script, and validates each user-visible state transition; real browser verification covers drag behavior, responsive layout, and the complete scenario.

**Tech Stack:** HTML5, CSS3, inline SVG, vanilla JavaScript, Vitest, Happy DOM, Codex in-app browser.

---

## File Structure

- Create: `prototypes/guided-hybrid-solution-explorer-v2-demo.html` — standalone six-stage interactive demonstration.
- Create: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts` — DOM behavior contract for the standalone HTML.
- Preserve: `prototypes/guided-node-canvas-chinese-culture-demo.html` — first prototype for comparison.
- Preserve: all existing files under `gaotie-web/src` and `gaotie-server/src`.

### Task 1: Standalone Shell, Stage Router, and Demand Confirmation

**Files:**
- Create: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Create: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write the failing shell and demand-flow tests**

```ts
it('renders a six-stage standalone workflow at demand analysis', async () => {
  const { document, window } = await loadPrototype();
  expect(document.documentElement.lang).toBe('zh-CN');
  expect(document.querySelectorAll('[data-stage]')).toHaveLength(6);
  expect(window.prototypeApi.getState().activeStage).toBe('demand');
  expect(document.querySelector('[data-view="demand"]')).not.toBeNull();
});

it('confirms the cultural intent before entering pattern recommendation', async () => {
  const { document, window } = await loadPrototype();
  click(document, '[data-intent="青花"]');
  click(document, '[data-action="confirm-demand"]');
  expect(window.prototypeApi.getState()).toMatchObject({
    activeStage: 'recommend',
    demandConfirmed: true,
  });
  expect(window.prototypeApi.getState().intentions).toContain('青花');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- test/guidedHybridSolutionExplorerV2.test.ts`

Expected: FAIL because the HTML file and `prototypeApi` do not exist.

- [ ] **Step 3: Implement the shell and deterministic state**

The HTML must initialize this state shape and expose a cloned read-only snapshot:

```js
const INITIAL_STATE = {
  activeStage: 'demand',
  demandConfirmed: false,
  intentions: ['龙纹', '祥云', '宫墙'],
  recommendationRound: 1,
  preferredStyles: [],
  reducedStyles: [],
  selectedPatternIds: [],
  generatedVariants: [],
  selectedVariantId: null,
  motifPlacement: { x: 54, y: 46, scale: 1 },
  captures: [],
  explorerNodes: [],
  explorerEdges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  pendingConnection: null,
  layoutAssets: [],
  paletteAssets: [],
  proposals: [],
  selectedProposalIds: [],
  selectedSceneIds: [],
  highFidelityOutputs: [],
};

window.prototypeApi = {
  getState: () => JSON.parse(JSON.stringify(state)),
  reset: resetDemo,
};
```

Render a top stage bar with `demand`, `recommend`, `transform`, `compose`, `select`, and `fidelity`. Disable direct navigation to a stage whose required upstream assets do not yet exist.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- test/guidedHybridSolutionExplorerV2.test.ts`

Expected: PASS for the first two tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Build v2 guided workflow shell"
```

### Task 2: Multi-Style Recommendation and Preference Feedback

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing preference-loop tests**

```ts
it('records positive and negative style feedback and refreshes recommendations', async () => {
  const { document, window } = await loadPrototypeAtRecommendation();
  click(document, '[data-pattern-id="minimal-dragon"] [data-action="more-like"]');
  click(document, '[data-pattern-id="traditional-round-dragon"] [data-action="less-like"]');
  click(document, '[data-action="refresh-recommendations"]');
  expect(window.prototypeApi.getState()).toMatchObject({ recommendationRound: 2 });
  expect(window.prototypeApi.getState().preferredStyles).toContain('极简流线');
  expect(window.prototypeApi.getState().reducedStyles).toContain('传统线描');
  expect(document.querySelector('[data-output="recommendation-reason"]')?.textContent)
    .toContain('水平延展');
});

it('requires at least one selected pattern before transformation', async () => {
  const { document } = await loadPrototypeAtRecommendation();
  expect(document.querySelector('[data-action="confirm-patterns"]')?.hasAttribute('disabled')).toBe(true);
  click(document, '[data-pattern-id="minimal-dragon"] [data-action="select-pattern"]');
  expect(document.querySelector('[data-action="confirm-patterns"]')?.hasAttribute('disabled')).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because feedback actions and the second recommendation round are absent.

- [ ] **Step 3: Implement recommendation groups and feedback actions**

Use four groups with local inline SVG thumbnails: `传统线描`, `几何抽象`, `极简流线`, and `现代融合`. Each pattern card has independent actions for selection, positive preference, and negative preference. The refresh action increments `recommendationRound` and changes both ordering and explanation without removing selected items.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 2**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Add preference-aware motif recommendations"
```

### Task 3: Visual Transformation Workspace and Multiple Capture Assets

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing transform and capture tests**

```ts
it('generates three motif variants from separate prompt branches', async () => {
  const { document, window } = await loadPrototypeAtTransform();
  click(document, '[data-action="generate-variants"]');
  expect(window.prototypeApi.getState().generatedVariants).toHaveLength(3);
  expect(document.querySelectorAll('[data-variant-id]')).toHaveLength(3);
});

it('changes motif placement and stores multiple named visual captures', async () => {
  const { document, window } = await loadPrototypeWithVariants();
  input(document, '[data-control="motif-x"]', '68');
  input(document, '[data-control="motif-scale"]', '1.25');
  click(document, '[data-action="capture-state"]');
  input(document, '[data-control="motif-x"]', '39');
  click(document, '[data-action="capture-state"]');
  expect(window.prototypeApi.getState().captures).toHaveLength(2);
  expect(document.querySelectorAll('[data-capture-id]')).toHaveLength(2);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because the visual workspace and capture state are absent.

- [ ] **Step 3: Implement the retained three-column transformation workspace**

Render selected sources and generated variants on the left, a large train white-model SVG in the center, and capture assets on the right. The selected motif is rendered over the train with CSS variables derived from `motifPlacement`. Range controls and pointer dragging both update the same state. `capture-state` creates immutable capture records:

```js
state.captures.push({
  id: `capture-${state.captures.length + 1}`,
  name: `截图 ${state.captures.length + 1}`,
  variantId: state.selectedVariantId,
  placement: { ...state.motifPlacement },
  previewVariant: state.generatedVariants.findIndex(item => item.id === state.selectedVariantId),
});
```

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 3**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Add visual motif transform and capture states"
```

### Task 4: Guided Node Canvas, Typed Inputs, and Automatic Connections

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing node-creation and readiness tests**

```ts
it('shows only downstream composition nodes in the solution explorer', async () => {
  const { document } = await loadPrototypeAtCompose();
  expect(document.querySelector('[data-node-type="demand"]')).toBeNull();
  expect(document.querySelector('[data-node-type="semantic"]')).toBeNull();
  expect(document.querySelector('[data-region="function-library"]')).not.toBeNull();
});

it('auto-connects capture, layout, and palette nodes to the active generation node', async () => {
  const { document, window } = await loadPrototypeAtCompose();
  click(document, '[data-add-node="capture"]');
  click(document, '[data-add-node="layout"]');
  click(document, '[data-add-node="palette"]');
  click(document, '[data-add-node="generator"]');
  expect(window.prototypeApi.getState().explorerEdges.map(edge => edge.type).sort())
    .toEqual(['capture', 'layout', 'palette']);
  expect(document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled')).toBe(false);
});
```

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement node state and compatible auto-wiring**

Use one normalized node record and one edge record:

```js
function createNode(type, config = {}) {
  return {
    id: `${type}-${++nodeSerial}`,
    type,
    x: config.x ?? 120,
    y: config.y ?? 120,
    selectedAssetId: config.selectedAssetId ?? null,
    description: config.description ?? '',
  };
}

function connectCompatibleInputs(generatorId) {
  const latestByType = ['capture', 'layout', 'palette']
    .map(type => [...state.explorerNodes].reverse().find(node => node.type === type));
  state.explorerEdges = state.explorerEdges.filter(edge => edge.to !== generatorId);
  latestByType.filter(Boolean).forEach(node => state.explorerEdges.push({
    id: `edge-${++edgeSerial}`,
    from: node.id,
    to: generatorId,
    type: node.type,
  }));
}
```

The SVG edge layer derives paths from node coordinates. Every edge includes a visible text label and an edge selection target.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 4**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Build guided typed solution canvas"
```

### Task 5: Editable Links, Layout and Independent Palette Workspaces

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing edge-editing and palette tests**

```ts
it('removes and reconnects a compatible typed input', async () => {
  const { document, window } = await loadCompleteCombination();
  click(document, '[data-edge-type="layout"]');
  click(document, '[data-action="delete-edge"]');
  expect(document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled')).toBe(true);
  click(document, '[data-port-output="layout"]');
  click(document, '[data-port-input="layout"]');
  expect(window.prototypeApi.getState().explorerEdges.some(edge => edge.type === 'layout')).toBe(true);
});

it('builds an independent palette and AI usage description', async () => {
  const { document, window } = await loadCompleteCombination();
  click(document, '[data-node-type="palette"]');
  click(document, '[data-action="search-moodboard"]');
  click(document, '[data-action="extract-node-palette"]');
  click(document, '[data-exclude-color="#30343B"]');
  click(document, '[data-action="accept-color-guidance"]');
  expect(window.prototypeApi.getState().paletteAssets[0].description).toContain('银白金属色');
  expect(window.prototypeApi.getState().paletteAssets[0].description).toContain('青花蓝');
});
```

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement click-to-reconnect ports and full node workspaces**

Layout nodes offer AI recommendation plus manual A1–G4 selection. Palette nodes offer local moodboard search, simulated upload, color exclusion, and a user-editable AI description. Port reconnection uses a pending output selection and rejects mismatched port types with a visible message.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 5**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Add editable links and node workspaces"
```

### Task 6: Multimodal Prompt Package and Controlled Combination Branches

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing prompt-package and branch tests**

```ts
it('shows three prompt images and composed text before generation', async () => {
  const { document } = await loadCompleteCombination();
  click(document, '[data-node-type="generator"]');
  expect(document.querySelectorAll('[data-prompt-image]')).toHaveLength(3);
  expect(document.querySelector('[data-output="composed-prompt"]')?.textContent).toContain('CR400BF');
  expect(document.querySelector('[data-output="composed-prompt"]')?.textContent).toContain('布局');
  expect(document.querySelector('[data-output="composed-prompt"]')?.textContent).toContain('银白金属色');
});

it('duplicates a combination and changes only its layout input', async () => {
  const { document, window } = await loadCompleteCombination();
  click(document, '[data-action="duplicate-combination"]');
  click(document, '[data-asset-layout="layout-2"]');
  expect(window.prototypeApi.getState().explorerNodes.filter(node => node.type === 'generator')).toHaveLength(2);
  expect(window.prototypeApi.getState().explorerEdges.filter(edge => edge.type === 'layout').map(edge => edge.from))
    .toEqual(expect.arrayContaining(['layout-1', 'layout-2']));
});
```

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement visible prompt packages and branch duplication**

Each generator resolves its three incoming edges to selected assets, then renders the visual reference, layout preview, palette card, descriptions, constraints, and editable composed prompt. Duplicate only the generator and its incoming edges; all source nodes remain shared until the user replaces one input.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 6**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Add multimodal packages and combination branches"
```

### Task 7: Proposal Generation, AI Evaluation, and Human Selection

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing proposal and selection tests**

```ts
it('generates visibly different proposals from three explicit combinations', async () => {
  const { document, window } = await loadThreeCombinations();
  click(document, '[data-action="generate-all-proposals"]');
  expect(window.prototypeApi.getState().proposals).toHaveLength(3);
  expect(document.querySelectorAll('[data-proposal-id]')).toHaveLength(3);
});

it('keeps AI advice separate from the human selection of one to four proposals', async () => {
  const { document, window } = await loadGeneratedProposals();
  click(document, '[data-action="request-ai-evaluation"]');
  expect(document.querySelector('[data-output="ai-evaluation"]')?.textContent).toContain('方案 A');
  click(document, '[data-proposal-id="proposal-a"] [data-action="select-proposal"]');
  click(document, '[data-proposal-id="proposal-c"] [data-action="select-proposal"]');
  expect(window.prototypeApi.getState().selectedProposalIds).toEqual(['proposal-a', 'proposal-c']);
});
```

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement deterministic fast proposals and evaluation evidence**

Generate proposal A as balanced red-gold, B as sparse blue-red, and C as culturally enhanced red-blue. Render six evaluation dimensions and a reasoned AI recommendation. Enforce the one-to-four selection limit without deleting unselected proposals.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 7**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Add proposal comparison and human selection"
```

### Task 8: High-Fidelity Scenes, Archive, and Recovery States

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing high-fidelity and recovery tests**

```ts
it('creates selected high-fidelity scenes without overwriting fast proposals', async () => {
  const { document, window } = await loadSelectedProposals();
  click(document, '[data-scene="platform"]');
  click(document, '[data-scene="motion"]');
  click(document, '[data-action="generate-fidelity"]');
  expect(window.prototypeApi.getState().highFidelityOutputs).toHaveLength(4);
  expect(window.prototypeApi.getState().proposals).toHaveLength(3);
});

it('preserves the reproducible archive and resets the demonstration', async () => {
  const { document, window } = await loadCompletedFidelity();
  click(document, '[data-action="open-archive"]');
  expect(document.querySelector('[data-output="lineage-summary"]')?.textContent)
    .toContain('截图 → 布局/色板 → 快速方案 → 高保真场景');
  click(document, '[data-action="reset-demo"]');
  expect(window.prototypeApi.getState().activeStage).toBe('demand');
});
```

- [ ] **Step 2: Run the tests and verify RED**

- [ ] **Step 3: Implement scene outputs, lineage archive, and reset**

Use local SVG scene frames for platform, station-view, motion, and detail. The archive groups requirements, selected motifs, captures, composition branches, proposal decisions, prompts, and scene outputs. Add a simulated failure control whose retry path preserves nodes and assets.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit Task 8**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Complete high fidelity output and archive"
```

### Task 9: Accessibility, Responsive Layout, Full Verification, and Browser Walkthrough

**Files:**
- Modify: `gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts`
- Modify: `prototypes/guided-hybrid-solution-explorer-v2-demo.html`

- [ ] **Step 1: Write failing artifact-quality tests**

```ts
it('is self-contained, labelled, and free of incomplete markers', async () => {
  const { document, html } = await loadPrototype();
  expect(document.querySelectorAll('script[src], link[rel="stylesheet"]')).toHaveLength(0);
  expect(document.querySelectorAll('button:not([type])')).toHaveLength(0);
  expect(document.querySelector('[data-region="main-workspace"]')?.getAttribute('aria-label')).toBeTruthy();
  expect(html).not.toMatch(/\b(?:TODO|TBD)\b/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

- [ ] **Step 3: Add keyboard, reduced-motion, and 1024-pixel responsive behavior**

Provide visible `:focus-visible`, Escape closing for dialogs, Enter/Space node activation, `prefers-reduced-motion`, collapsible sidebars, and horizontal node-canvas scrolling below 1180 pixels.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
cd /Users/lisensen/gaotie-system/gaotie-web
npm test -- test/guidedHybridSolutionExplorerV2.test.ts
npm test
npm run build
npm exec eslint -- test/guidedHybridSolutionExplorerV2.test.ts
cd /Users/lisensen/gaotie-system
git diff --check -- prototypes/guided-hybrid-solution-explorer-v2-demo.html gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts
```

Expected: all focused tests pass, the complete suite has zero failures, the Vite build exits successfully, the new test file has no lint errors, and the new files have no whitespace errors.

- [ ] **Step 5: Walk through the complete scenario in the in-app browser**

Serve `/Users/lisensen/gaotie-system` locally. Verify demand confirmation, recommendation feedback, variant generation, two captures, typed node auto-wiring, link deletion/reconnection, three combinations, proposal selection, two high-fidelity scenes, archive, Escape behavior, console logs, and 1024-pixel responsive layout.

- [ ] **Step 6: Commit Task 9**

```bash
git add gaotie-web/test/guidedHybridSolutionExplorerV2.test.ts prototypes/guided-hybrid-solution-explorer-v2-demo.html
git commit -m "Verify guided hybrid explorer v2"
```
