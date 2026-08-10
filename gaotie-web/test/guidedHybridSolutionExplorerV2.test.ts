import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

interface ExplorerNode {
  id: string;
  type: string;
  selectedAssetId?: string | null;
  x?: number;
  y?: number;
}

interface ExplorerEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface PrototypeState {
  activeStage: string;
  demandConfirmed: boolean;
  intentions: string[];
  recommendationRound: number;
  preferredStyles: string[];
  reducedStyles: string[];
  selectedPatternIds: string[];
  generatedVariants: Array<{ id: string }>;
  selectedVariantId: string | null;
  motifPlacement: { x: number; y: number; scale: number };
  captures: Array<{ id: string }>;
  explorerNodes: ExplorerNode[];
  explorerEdges: ExplorerEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  paletteAssets: Array<{
    id: string;
    description: string;
    colors?: string[];
    excludedColors?: string[];
  }>;
  proposals: Array<{ id: string }>;
  selectedProposalIds: string[];
  selectedSceneIds: string[];
  highFidelityOutputs: Array<{ id: string }>;
}

interface PrototypeWindow extends Window {
  prototypeApi: {
    getState: () => PrototypeState;
    reset: () => void;
  };
}

const prototypePath = fileURLToPath(
  new URL('../../prototypes/guided-hybrid-solution-explorer-v2-demo.html', import.meta.url),
);

async function loadPrototype() {
  const html = await readFile(prototypePath, 'utf8');
  const window = new Window({
    url: 'http://localhost/prototypes/guided-hybrid-solution-explorer-v2-demo.html',
  });

  window.document.write(html);
  for (const script of window.document.querySelectorAll('script:not([src])')) {
    window.eval(script.textContent ?? '');
  }
  await window.happyDOM.waitUntilComplete();

  return { document: window.document, html, window: window as PrototypeWindow };
}

function click(document: Document, selector: string): void {
  const element = document.querySelector<Element>(selector);
  if (!element) throw new Error(`Missing clickable element: ${selector}`);
  if ('click' in element && typeof element.click === 'function') {
    element.click();
    return;
  }
  const MouseEventConstructor = element.ownerDocument.defaultView?.MouseEvent;
  if (!MouseEventConstructor) throw new Error('Missing MouseEvent constructor');
  element.dispatchEvent(new MouseEventConstructor('click', { bubbles: true }));
}

function input(document: Document, selector: string, value: string): void {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`Missing input element: ${selector}`);
  element.value = value;
  const EventConstructor = element.ownerDocument.defaultView?.Event;
  if (!EventConstructor) throw new Error('Missing Event constructor');
  element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
}

function advanceToRecommendation(document: Document): void {
  click(document, '[data-action="confirm-demand"]');
}

function advanceToTransform(document: Document): void {
  advanceToRecommendation(document);
  click(document, '[data-pattern-id="minimal-dragon"] [data-action="select-pattern"]');
  click(document, '[data-action="confirm-patterns"]');
}

function advanceToCompose(document: Document): void {
  advanceToTransform(document);
  click(document, '[data-action="generate-variants"]');
  click(document, '[data-action="capture-state"]');
  click(document, '[data-action="confirm-captures"]');
}

function buildCompleteBranch(document: Document): void {
  advanceToCompose(document);
  click(document, '[data-add-node="generator"]');
  click(document, '[data-add-node="capture"]');
  click(document, '[data-add-node="layout"]');
  click(document, '[data-add-node="palette"]');
}

describe('guided hybrid solution explorer v2 HTML prototype', () => {
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

  it('records style feedback and refreshes a preference-aware second round', async () => {
    const { document, window } = await loadPrototype();
    advanceToRecommendation(document);

    click(document, '[data-pattern-id="minimal-dragon"] [data-action="more-like"]');
    click(
      document,
      '[data-pattern-id="traditional-round-dragon"] [data-action="less-like"]',
    );
    click(document, '[data-action="refresh-recommendations"]');

    expect(window.prototypeApi.getState()).toMatchObject({ recommendationRound: 2 });
    expect(window.prototypeApi.getState().preferredStyles).toContain('极简流线');
    expect(window.prototypeApi.getState().reducedStyles).toContain('传统线描');
    expect(document.querySelector('[data-output="recommendation-reason"]')?.textContent).toContain(
      '水平延展',
    );
  });

  it('requires at least one selected pattern before transformation', async () => {
    const { document } = await loadPrototype();
    advanceToRecommendation(document);

    expect(
      document.querySelector('[data-action="confirm-patterns"]')?.hasAttribute('disabled'),
    ).toBe(true);
    click(document, '[data-pattern-id="minimal-dragon"] [data-action="select-pattern"]');
    expect(
      document.querySelector('[data-action="confirm-patterns"]')?.hasAttribute('disabled'),
    ).toBe(false);
  });

  it('generates three motif variants from separate prompt branches', async () => {
    const { document, window } = await loadPrototype();
    advanceToTransform(document);

    click(document, '[data-action="generate-variants"]');

    expect(window.prototypeApi.getState().generatedVariants).toHaveLength(3);
    expect(document.querySelectorAll('[data-variant-id]')).toHaveLength(3);
  });

  it('changes motif placement and stores multiple named visual captures', async () => {
    const { document, window } = await loadPrototype();
    advanceToTransform(document);
    click(document, '[data-action="generate-variants"]');

    input(document, '[data-control="motif-x"]', '68');
    input(document, '[data-control="motif-scale"]', '1.25');
    click(document, '[data-action="capture-state"]');
    input(document, '[data-control="motif-x"]', '39');
    click(document, '[data-action="capture-state"]');

    expect(window.prototypeApi.getState().captures).toHaveLength(2);
    expect(document.querySelectorAll('[data-capture-id]')).toHaveLength(2);
  });

  it('starts the node canvas only at proposal composition with four precise node types', async () => {
    const { document } = await loadPrototype();
    advanceToCompose(document);

    expect(document.querySelector('[data-region="function-library"]')).not.toBeNull();
    expect(document.querySelector('[data-region="node-canvas"]')).not.toBeNull();
    expect(document.querySelector('[data-add-node="capture"]')).not.toBeNull();
    expect(document.querySelector('[data-add-node="layout"]')).not.toBeNull();
    expect(document.querySelector('[data-add-node="palette"]')).not.toBeNull();
    expect(document.querySelector('[data-add-node="generator"]')).not.toBeNull();
    expect(document.querySelector('[data-add-node="demand"]')).toBeNull();
    expect(document.querySelector('[data-add-node="semantic"]')).toBeNull();
  });

  it('auto-connects typed inputs to a generator and blocks incomplete generation', async () => {
    const { document, window } = await loadPrototype();
    advanceToCompose(document);

    click(document, '[data-add-node="generator"]');
    expect(
      document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled'),
    ).toBe(true);

    click(document, '[data-add-node="capture"]');
    click(document, '[data-add-node="layout"]');
    click(document, '[data-add-node="palette"]');

    const state = window.prototypeApi.getState();
    expect(state.explorerNodes.map((node) => node.type)).toEqual([
      'generator',
      'capture',
      'layout',
      'palette',
    ]);
    expect(state.explorerEdges.map((edge) => edge.type).sort()).toEqual([
      'capture',
      'layout',
      'palette',
    ]);
    expect(document.querySelectorAll('[data-edge-type]')).toHaveLength(3);
    expect(
      document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled'),
    ).toBe(false);
  });

  it('deletes and manually reconnects a typed layout edge through visible ports', async () => {
    const { document, window } = await loadPrototype();
    buildCompleteBranch(document);

    click(document, '[data-edge-type="layout"]');
    expect(window.prototypeApi.getState().selectedEdgeId).not.toBeNull();
    click(document, '[data-action="delete-edge"]');

    expect(window.prototypeApi.getState().explorerEdges.map((edge) => edge.type)).not.toContain(
      'layout',
    );
    expect(
      document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled'),
    ).toBe(true);

    click(document, '[data-port-output="layout"]');
    click(document, '[data-port-input="layout"]');

    expect(window.prototypeApi.getState().explorerEdges.map((edge) => edge.type)).toContain(
      'layout',
    );
    expect(
      document.querySelector('[data-action="generate-proposal"]')?.hasAttribute('disabled'),
    ).toBe(false);
  });

  it('turns a cultural moodboard into an editable palette and AI color-use description', async () => {
    const { document, window } = await loadPrototype();
    buildCompleteBranch(document);

    click(document, '[data-node-type="palette"]');
    click(document, '[data-action="search-moodboard"]');
    click(document, '[data-action="extract-palette"]');

    expect(document.querySelectorAll('[data-moodboard-image]')).toHaveLength(3);
    expect(document.querySelector('[data-color="#30343B"]')).not.toBeNull();

    click(document, '[data-action="exclude-color"][data-color="#30343B"]');
    click(document, '[data-action="accept-color-guidance"]');

    const palette = window.prototypeApi.getState().paletteAssets[0];
    expect(palette.colors).not.toContain('#30343B');
    expect(palette.excludedColors).toContain('#30343B');
    expect(palette.description).toContain('银白金属色');
    expect(palette.description).toContain('青花蓝');
  });
});

export { click, input, loadPrototype };
