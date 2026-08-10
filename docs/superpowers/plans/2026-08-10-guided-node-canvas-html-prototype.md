# Guided Node Canvas HTML Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, single-file interactive HTML prototype that demonstrates a complete Chinese-culture high-speed-rail livery co-creation workflow on a guided node canvas.

**Architecture:** The production artifact is one self-contained HTML file with inline SVG, CSS, workflow data, state reducer-style functions, render functions, and DOM event handlers. Automated interaction tests load that file in Happy DOM, execute its inline script, and verify user-visible state changes without contacting a backend.

**Tech Stack:** HTML5, inline SVG, CSS, vanilla JavaScript, Vitest, Happy DOM.

---

## File Map

- Create: `prototypes/guided-node-canvas-chinese-culture-demo.html` — complete standalone interactive prototype.
- Create: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts` — behavioral tests for workflow navigation and cross-node interactions.
- Reference: `docs/superpowers/specs/2026-08-10-guided-node-canvas-html-prototype-design.md` — approved behavior and scenario.

No existing React or backend implementation file is modified. This keeps the prototype independent from the current dirty worktree and prevents the experiment from changing production behavior.

### Task 1: Establish the standalone shell and deterministic workflow data

**Files:**
- Create: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Create: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write the failing shell test**

Create a Vitest test that reads the target HTML, loads it into Happy DOM, waits for script evaluation, and asserts the required application regions and initial state:

```ts
expect(document.title).toContain('中国文化主题高铁涂装');
expect(document.querySelector('[data-app="guided-canvas"]')).not.toBeNull();
expect(document.querySelector('[data-region="stage-nav"]')).not.toBeNull();
expect(document.querySelector('[data-region="node-canvas"]')).not.toBeNull();
expect(document.querySelector('[data-region="inspector"]')).not.toBeNull();
expect(document.querySelector('[data-node-id="brief"]')?.classList.contains('is-current')).toBe(true);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd gaotie-web && npm test -- test/guidedNodeCanvasPrototype.test.ts
```

Expected: FAIL because the HTML file does not exist.

- [ ] **Step 3: Implement the minimum standalone shell**

Create the HTML document with these stable landmarks:

```html
<body>
  <div class="app-shell" data-app="guided-canvas">
    <header class="topbar"></header>
    <aside class="stage-nav" data-region="stage-nav"></aside>
    <main class="canvas-shell" data-region="node-canvas"></main>
    <aside class="inspector" data-region="inspector"></aside>
    <footer class="demo-timeline" data-region="demo-timeline"></footer>
  </div>
</body>
```

Add inline JavaScript with immutable `INITIAL_STATE`, a `workflowNodes` record, an `edges` list, and `window.prototypeApi` exposing `getState()` and `reset()` for deterministic tests.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same Vitest command. Expected: PASS with one shell test.

- [ ] **Step 5: Commit the shell**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add guided node canvas prototype shell"
```

### Task 2: Implement node selection, stages, path focus, and guided playback

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing navigation tests**

Add tests that click the motif-transform node, click a stage navigation item, step forward, toggle branch visibility, and reset:

```ts
click('[data-node-id="motif-transform"]');
expect(document.querySelector('[data-region="inspector"]')?.textContent).toContain('纹样转化');

click('[data-stage="layout"]');
expect(document.querySelector('[data-node-id="layout-v1"]')?.classList.contains('is-current')).toBe(true);

click('[data-action="next-step"]');
expect(window.prototypeApi.getState().demoStep).toBe(1);

click('[data-action="toggle-branches"]');
expect(document.body.classList.contains('show-all-branches')).toBe(true);

click('[data-action="reset-demo"]');
expect(window.prototypeApi.getState().selectedNodeId).toBe('brief');
```

- [ ] **Step 2: Run the tests and verify RED**

Expected: FAIL because handlers and node-specific inspectors do not exist.

- [ ] **Step 3: Implement navigation behavior**

Add state actions and renderers with these public functions:

```js
function selectNode(nodeId) {}
function selectStage(stageId) {}
function setDemoStep(step) {}
function toggleBranches() {}
function toggleFocusMode() {}
function resetDemo() {}
function renderAll() {}
```

The canvas renders only nodes unlocked by `demoStep`; direct node selection unlocks the selected stage for free exploration. Stage selection resolves to the stage's primary node. The current path gets `is-current-path`; unused branches get `is-muted` unless all branches are visible.

- [ ] **Step 4: Run the tests and verify GREEN**

Expected: all navigation tests pass.

- [ ] **Step 5: Commit navigation**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add guided workflow navigation"
```

### Task 3: Implement motif retrieval, analysis, prompt engineering, and transformation

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing motif interaction tests**

Test main/secondary motif selection, slider-driven prompt generation, and creation of a transformed asset:

```ts
click('[data-node-id="motif-retrieval"]');
click('[data-motif-id="dragon"] [data-role="main-motif"]');
click('[data-motif-id="cloud"] [data-role="secondary-motif"]');
expect(window.prototypeApi.getState().motifs.main).toBe('dragon');
expect(window.prototypeApi.getState().motifs.secondary).toContain('cloud');

click('[data-node-id="motif-transform"]');
input('[data-control="elongation"]', '92');
expect(document.querySelector('[data-output="structured-prompt"]')?.textContent).toContain('92%');

click('[data-action="generate-motif"]');
expect(window.prototypeApi.getState().generatedMotif).toBe(true);
expect(document.querySelector('[data-node-id="motif-v1"]')?.classList.contains('is-complete')).toBe(true);
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL on missing motif selectors and prompt controls.

- [ ] **Step 3: Implement motif inspector**

Add three inline SVG motif cards, an AI visual-analysis panel, four range inputs, a live prompt builder, and a before/after comparison. Use this function contract:

```js
function buildMotifPrompt({ abstraction, elongation, simplification, repeatMode }) {
  return `保留龙首轮廓、龙身主要曲线与腾跃姿态；抽象程度 ${abstraction}%，横向延展 ${elongation}%，线条简化 ${simplification}%，重复方式为${repeatMode}……`;
}
```

`generateMotif()` sets `generatedMotif`, marks the output node complete, and selects `motif-v1` without contacting a service.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: motif tests pass.

- [ ] **Step 5: Commit motif workflow**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add interactive motif transformation"
```

### Task 4: Implement sparse layout configuration and live train preview

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing layout tests**

```ts
click('[data-node-id="layout-v1"]');
click('[data-layout-zone="windowBand"]');
click('[data-layout-option="A3"]');
click('[data-layout-zone="waistline"]');
click('[data-layout-option="B2"]');
expect(window.prototypeApi.getState().layout.windowBand).toBe('A3');
expect(window.prototypeApi.getState().layout.waistline).toBe('B2');
expect(document.querySelector('[data-output="density-budget"]')?.textContent).toContain('%');
expect(document.querySelector('[data-train-zone="windowBand"]')?.classList.contains('is-active')).toBe(true);
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because layout controls and preview classes are missing.

- [ ] **Step 3: Implement layout behavior**

Render seven region rows with `不使用` as the default. Provide an “采用 AI 推荐” action that chooses A3, B2, and G2 only. Implement:

```js
function calculateDensity(layout) {
  const weights = { windowBand: 22, waistline: 11, door: 16, roofSide: 18, lowerSide: 20, skirt: 16, noseSide: 9 };
  return Object.entries(layout).reduce((sum, [zone, value]) => sum + (value === 'none' ? 0 : weights[zone]), 0);
}
```

The inline train SVG applies `is-active` classes to selected regions and shows conflict warnings when density exceeds 60%.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: layout tests pass.

- [ ] **Step 5: Commit layout workflow**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add sparse livery layout controls"
```

### Task 5: Implement moodboard palette extraction and regional color assignment

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing color tests**

```ts
click('[data-node-id="color-v1"]');
click('[data-action="extract-palette"]');
expect(document.querySelectorAll('[data-palette-color]').length).toBe(4);
click('[data-color-region="windowBand"]');
click('[data-palette-color="#B8322A"]');
expect(window.prototypeApi.getState().colors.windowBand).toBe('#B8322A');
expect(document.querySelector('[data-train-zone="windowBand"]')?.getAttribute('fill')).toBe('#B8322A');
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL on missing palette actions.

- [ ] **Step 3: Implement color inspector**

Add an inline cultural moodboard and palette extraction animation. Store the fixed palette `['#B8322A', '#D4A746', '#F5F1E8', '#30343B']`. A region-selection control determines where the next palette click is assigned. Update both the inspector train preview and candidate方案 SVG variables.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: color tests pass.

- [ ] **Step 5: Commit color workflow**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add cultural palette configuration"
```

### Task 6: Implement optional case reference and design-package readiness

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing case and package tests**

```ts
click('[data-node-id="case-ref"]');
click('[data-case-id="cr400bf-redline"]');
input('[data-control="case-note"]', '仅参考车窗带线条位置与车头侧收束比例');
expect(window.prototypeApi.getState().selectedCaseId).toBe('cr400bf-redline');

click('[data-node-id="design-package"]');
expect(document.querySelector('[data-package-input="motif"]')?.classList.contains('is-ready')).toBe(true);
expect(document.querySelector('[data-package-input="case"]')?.textContent).toContain('可选');
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL on case selection and package readiness.

- [ ] **Step 3: Implement case and package inspectors**

Render three compact case cards, editable reference notes, and a remove action. The design-package inspector lists five typed ports and computes readiness with `isPackageReady(state)`. Motif, layout, color, and train template are required; case is optional.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: case and package tests pass.

- [ ] **Step 5: Commit case/package workflow**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add case reference and design package"
```

### Task 7: Implement candidate branches, comparison, evaluation, and AI refinement

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing branch tests**

```ts
click('[data-node-id="design-package"]');
click('[data-action="generate-candidates"]');
expect(window.prototypeApi.getState().candidatesGenerated).toBe(true);
expect(document.querySelectorAll('[data-candidate-id]').length).toBe(3);

click('[data-action="select-candidate-a"]');
click('[data-action="open-compare"]');
expect(document.querySelector('[data-dialog="comparison"]')).not.toBeNull();

click('[data-action="accept-ai-suggestion"]');
expect(window.prototypeApi.getState().refinedVersionCreated).toBe(true);
expect(document.querySelector('[data-node-id="proposal-a1"]')?.classList.contains('is-complete')).toBe(true);

click('[data-action="archive-final"]');
expect(document.querySelector('[data-output="archive-summary"]')?.textContent).toContain('方案 A-1');
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because candidate nodes and refinement actions are absent.

- [ ] **Step 3: Implement branches and evaluation**

Render deterministic inline SVG variants A, B, and C. Implement candidate selection, favorite state, a modal comparison view, six fixed evaluation metrics, a dashed AI suggestion node, accept/dismiss actions, and non-destructive creation of A-1. `archiveFinal()` records the selected version and displays a provenance summary.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all branch tests pass.

- [ ] **Step 5: Commit branching workflow**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Add proposal branching and refinement"
```

### Task 8: Polish accessibility, responsive behavior, and browser verification

**Files:**
- Modify: `gaotie-web/test/guidedNodeCanvasPrototype.test.ts`
- Modify: `prototypes/guided-node-canvas-chinese-culture-demo.html`

- [ ] **Step 1: Write failing accessibility and integrity tests**

```ts
expect(document.documentElement.lang).toBe('zh-CN');
expect(document.querySelectorAll('button:not([type])').length).toBe(0);
expect(document.querySelectorAll('[data-node-id][tabindex="0"]').length).toBeGreaterThan(8);
expect(document.querySelectorAll('script[src], link[rel="stylesheet"]').length).toBe(0);
expect(html).not.toMatch(/TODO|TBD/);
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL until keyboard attributes and final inline-only constraints are satisfied.

- [ ] **Step 3: Implement polish**

Add visible focus styles, `aria-pressed`, `aria-current`, keyboard node activation, reduced-motion handling, a collapsible inspector below 1100px, empty/loading/success states, inline legends, and stable modal focus behavior. Ensure every button has `type="button"` and all images are SVG with accessible titles or decorative labels.

- [ ] **Step 4: Run automated verification**

Run:

```bash
cd gaotie-web && npm test -- test/guidedNodeCanvasPrototype.test.ts
npm test
npm run build
```

Expected: prototype tests pass, existing frontend tests pass, and the frontend build exits 0.

- [ ] **Step 5: Run local browser verification**

Serve the repository root with a local static server, open the prototype in the in-app browser, and verify:

1. guided playback reaches all ten scenario steps;
2. motif sliders update the structured prompt;
3. AI layout recommendation produces A3/B2/G2 and a density below 60%;
4. palette extraction and regional assignment update the train preview;
5. case reference can be selected, edited, and removed;
6. generation produces A/B/C without network requests;
7. accepting the AI suggestion creates A-1 while A remains visible;
8. comparison and final archive summary render correctly;
9. reset returns to the initial brief node;
10. the page remains usable at 1366×768 and 1920×1080.

- [ ] **Step 6: Commit verified prototype**

```bash
git add prototypes/guided-node-canvas-chinese-culture-demo.html gaotie-web/test/guidedNodeCanvasPrototype.test.ts
git commit -m "Polish and verify guided node canvas demo"
```

## Self-Review

- Spec coverage: Tasks 1—8 cover every required stage, interaction, human/AI encoding, deterministic simulation, comparison, provenance, and reset behavior.
- Placeholder scan: the plan contains no deferred implementation placeholders; the test explicitly rejects `TODO` and `TBD` in the artifact.
- Type consistency: the shared test API is consistently named `window.prototypeApi`; all node IDs and state keys are stable across tasks.
- Scope control: no current React page, API, database schema, or generation service is changed.
