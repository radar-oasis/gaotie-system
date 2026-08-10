import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

interface PrototypeState {
  archivedVersion: string | null;
  candidatesGenerated: boolean;
  comparisonOpen: boolean;
  demoStep: number;
  generatedMotif: boolean;
  motifSettings: {
    elongation: number;
  };
  layout: {
    windowBand: string;
    waistline: string;
    noseSide: string;
  };
  colors: {
    body: string;
    motif: string;
    structure: string;
    waistline: string;
    windowBand: string;
  };
  paletteExtracted: boolean;
  refinedVersionCreated: boolean;
  caseNote: string;
  selectedCandidateId: string | null;
  selectedCaseId: string | null;
  motifs: {
    main: string | null;
    secondary: string[];
  };
  selectedNodeId: string;
}

interface PrototypeWindow extends Window {
  prototypeApi: {
    getState: () => PrototypeState;
    reset: () => void;
  };
}

const prototypePath = fileURLToPath(
  new URL('../../prototypes/guided-node-canvas-chinese-culture-demo.html', import.meta.url),
);

async function loadPrototype() {
  const html = await readFile(prototypePath, 'utf8');
  const window = new Window({
    url: 'http://localhost/prototypes/guided-node-canvas-chinese-culture-demo.html',
  });

  window.document.write(html);
  for (const script of window.document.querySelectorAll('script:not([src])')) {
    window.eval(script.textContent ?? '');
  }
  await window.happyDOM.waitUntilComplete();

  return {
    document: window.document,
    html,
    window: window as PrototypeWindow,
  };
}

function click(document: Document, selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);

  if (!element) {
    throw new Error(`Missing clickable element: ${selector}`);
  }

  element.click();
}

function input(document: Document, selector: string, value: string): void {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);

  if (!element) {
    throw new Error(`Missing input element: ${selector}`);
  }

  element.value = value;
  const EventConstructor = element.ownerDocument.defaultView?.Event;

  if (!EventConstructor) {
    throw new Error('Missing window Event constructor');
  }

  element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
}

function prepareDesignPackage(document: Document): void {
  click(document, '[data-node-id="motif-transform"]');
  click(document, '[data-action="generate-motif"]');
  click(document, '[data-node-id="layout-v1"]');
  click(document, '[data-action="apply-layout-recommendation"]');
  click(document, '[data-node-id="color-v1"]');
  click(document, '[data-action="extract-palette"]');
  click(document, '[data-node-id="design-package"]');
}

describe('guided node canvas HTML prototype', () => {
  it('renders the standalone application shell at the brief node', async () => {
    const { document } = await loadPrototype();

    expect(document.title).toContain('中国文化主题高铁涂装');
    expect(document.querySelector('[data-app="guided-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-region="stage-nav"]')).not.toBeNull();
    expect(document.querySelector('[data-region="node-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-region="inspector"]')).not.toBeNull();
    expect(
      document.querySelector('[data-node-id="brief"]')?.classList.contains('is-current'),
    ).toBe(true);
  });

  it('selects a workflow node and renders its inspector', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="motif-transform"]');

    expect(window.prototypeApi.getState().selectedNodeId).toBe('motif-transform');
    expect(document.querySelector('[data-region="inspector"]')?.textContent).toContain(
      '纹样转化',
    );
  });

  it('uses stage navigation to focus the stage primary node', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-stage="layout"]');

    expect(window.prototypeApi.getState().selectedNodeId).toBe('layout-v1');
    expect(
      document.querySelector('[data-node-id="layout-v1"]')?.classList.contains('is-current'),
    ).toBe(true);
  });

  it('advances the guided scenario and resets it to the brief', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-action="next-step"]');
    expect(window.prototypeApi.getState().demoStep).toBe(1);

    click(document, '[data-action="reset-demo"]');
    expect(window.prototypeApi.getState()).toMatchObject({
      demoStep: 0,
      selectedNodeId: 'brief',
    });
  });

  it('toggles visibility of inactive workflow branches', async () => {
    const { document } = await loadPrototype();

    click(document, '[data-action="toggle-branches"]');

    expect(document.body.classList.contains('show-all-branches')).toBe(true);
  });

  it('selects a main motif and an auxiliary motif', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="motif-retrieval"]');
    click(document, '[data-motif-id="dragon"] [data-role="main-motif"]');
    click(document, '[data-motif-id="cloud"] [data-role="secondary-motif"]');

    expect(window.prototypeApi.getState().motifs).toMatchObject({
      main: 'dragon',
      secondary: ['cloud'],
    });
  });

  it('updates the structured motif prompt from transformation controls', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="motif-transform"]');
    input(document, '[data-control="elongation"]', '92');

    expect(window.prototypeApi.getState().motifSettings.elongation).toBe(92);
    expect(document.querySelector('[data-output="structured-prompt"]')?.textContent).toContain(
      '92%',
    );
  });

  it('creates a versioned transformed motif asset', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="motif-transform"]');
    click(document, '[data-action="generate-motif"]');

    expect(window.prototypeApi.getState().generatedMotif).toBe(true);
    expect(
      document.querySelector('[data-node-id="motif-v1"]')?.classList.contains('is-complete'),
    ).toBe(true);
  });

  it('applies a sparse AI layout recommendation to the train preview', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="layout-v1"]');
    click(document, '[data-action="apply-layout-recommendation"]');

    expect(window.prototypeApi.getState().layout).toMatchObject({
      noseSide: 'G2',
      waistline: 'B2',
      windowBand: 'A3',
    });
    expect(document.querySelector('[data-output="density-budget"]')?.textContent).toContain(
      '42%',
    );
    expect(
      document
        .querySelector('[data-train-zone="windowBand"]')
        ?.classList.contains('is-active'),
    ).toBe(true);
  });

  it('changes one layout zone without forcing every train region to be used', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="layout-v1"]');
    click(document, '[data-layout-zone="windowBand"]');
    click(document, '[data-layout-option="A1"]');

    expect(window.prototypeApi.getState().layout.windowBand).toBe('A1');
    expect(window.prototypeApi.getState().layout.waistline).toBe('none');
  });

  it('extracts a four-color cultural palette from the simulated moodboard', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="color-v1"]');
    click(document, '[data-action="extract-palette"]');

    expect(window.prototypeApi.getState().paletteExtracted).toBe(true);
    expect(document.querySelectorAll('[data-palette-color]')).toHaveLength(4);
  });

  it('assigns a palette color to a selected train region', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="color-v1"]');
    click(document, '[data-action="extract-palette"]');
    click(document, '[data-color-region="windowBand"]');
    click(document, '[data-palette-color="#B8322A"]');

    expect(window.prototypeApi.getState().colors.windowBand).toBe('#B8322A');
    expect(
      document.querySelector('[data-train-zone="windowBand"]')?.getAttribute('fill'),
    ).toBe('#B8322A');
  });

  it('selects an optional case reference and records a scoped reuse note', async () => {
    const { document, window } = await loadPrototype();

    click(document, '[data-node-id="case-ref"]');
    click(document, '[data-case-id="cr400bf-redline"]');
    input(document, '[data-control="case-note"]', '仅参考车窗带线条位置与车头侧收束比例');

    expect(window.prototypeApi.getState()).toMatchObject({
      caseNote: '仅参考车窗带线条位置与车头侧收束比例',
      selectedCaseId: 'cr400bf-redline',
    });
  });

  it('shows typed readiness for required and optional design-package inputs', async () => {
    const { document } = await loadPrototype();

    prepareDesignPackage(document);

    expect(
      document.querySelector('[data-package-input="motif"]')?.classList.contains('is-ready'),
    ).toBe(true);
    expect(document.querySelector('[data-package-input="case"]')?.textContent).toContain(
      '可选',
    );
    expect(document.querySelector('[data-output="package-status"]')?.textContent).toContain(
      '可以生成',
    );
  });

  it('generates three visibly distinct candidate branches from a ready package', async () => {
    const { document, window } = await loadPrototype();

    prepareDesignPackage(document);
    click(document, '[data-action="generate-candidates"]');

    expect(window.prototypeApi.getState()).toMatchObject({
      candidatesGenerated: true,
      selectedNodeId: 'proposal-a',
    });
    expect(document.querySelectorAll('[data-candidate-id]')).toHaveLength(3);
    expect(document.querySelector('[data-candidate-id="proposal-a"]')?.textContent).toContain(
      '平衡型',
    );
    expect(document.querySelector('[data-candidate-id="proposal-c"]')?.textContent).toContain(
      '文化强化',
    );
  });

  it('opens a three-way comparison with explicit evaluation dimensions', async () => {
    const { document, window } = await loadPrototype();

    prepareDesignPackage(document);
    click(document, '[data-action="generate-candidates"]');
    click(document, '[data-action="open-comparison"]');

    expect(window.prototypeApi.getState().comparisonOpen).toBe(true);
    expect(document.querySelector('[data-region="comparison-modal"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-comparison-candidate]')).toHaveLength(3);
    expect(document.querySelector('[data-region="comparison-modal"]')?.textContent).toContain(
      '文化契合度',
    );
    expect(document.querySelector('[data-region="comparison-modal"]')?.textContent).toContain(
      '用户控制度',
    );
  });

  it('accepts an AI suggestion by creating A-1 without overwriting proposal A', async () => {
    const { document, window } = await loadPrototype();

    prepareDesignPackage(document);
    click(document, '[data-action="generate-candidates"]');
    click(document, '[data-action="select-candidate"]');
    click(document, '[data-action="evaluate-selected"]');
    click(document, '[data-action="accept-ai-suggestion"]');

    expect(window.prototypeApi.getState()).toMatchObject({
      refinedVersionCreated: true,
      selectedCandidateId: 'proposal-a1',
      selectedNodeId: 'proposal-a1',
    });
    expect(
      document.querySelector('[data-node-id="proposal-a"]')?.classList.contains('is-complete'),
    ).toBe(true);
    expect(
      document.querySelector('[data-node-id="proposal-a1"]')?.classList.contains('is-complete'),
    ).toBe(true);
    expect(document.querySelector('[data-output="version-lineage"]')?.textContent).toContain(
      '方案 A → 方案 A-1',
    );
  });

  it('archives the refined version together with the reproducible process record', async () => {
    const { document, window } = await loadPrototype();

    prepareDesignPackage(document);
    click(document, '[data-action="generate-candidates"]');
    click(document, '[data-action="select-candidate"]');
    click(document, '[data-action="evaluate-selected"]');
    click(document, '[data-action="accept-ai-suggestion"]');
    click(document, '[data-action="archive-version"]');

    expect(window.prototypeApi.getState()).toMatchObject({
      archivedVersion: 'proposal-a1',
      selectedNodeId: 'archive',
    });
    expect(document.querySelector('[data-output="archive-summary"]')?.textContent).toContain(
      '方案 A-1',
    );
    expect(document.querySelector('[data-output="archive-summary"]')?.textContent).toContain(
      '提示词',
    );
    expect(document.querySelector('[data-output="archive-summary"]')?.textContent).toContain(
      '演化路径',
    );
  });

  it('switches between process flow and focused editing views', async () => {
    const { document } = await loadPrototype();

    click(document, '[data-action="set-view"][data-view="workspace"]');
    expect(document.body.classList.contains('workspace-view')).toBe(true);

    click(document, '[data-action="set-view"][data-view="flow"]');
    expect(document.body.classList.contains('workspace-view')).toBe(false);
  });

  it('closes the comparison dialog with Escape', async () => {
    const { document, window } = await loadPrototype();

    prepareDesignPackage(document);
    click(document, '[data-action="generate-candidates"]');
    click(document, '[data-action="open-comparison"]');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(window.prototypeApi.getState().comparisonOpen).toBe(false);
    expect(document.querySelector('[data-region="comparison-modal"]')).toBeNull();
  });

  it('remains a self-contained, labelled, keyboard-focusable HTML artifact', async () => {
    const { document, html } = await loadPrototype();

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.querySelector('[data-region="node-canvas"]')?.getAttribute('aria-label')).toBe(
      '设计流程节点画布',
    );
    expect(document.querySelectorAll('button:not([type])')).toHaveLength(0);
    expect(document.querySelectorAll('script[src], link[rel="stylesheet"]')).toHaveLength(0);
    expect(html).not.toMatch(/\b(?:TODO|TBD)\b/);
  });
});
