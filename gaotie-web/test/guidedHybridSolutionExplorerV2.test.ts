import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

interface ExplorerNode {
  id: string;
  type: string;
  selectedAssetId?: string | null;
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
  paletteAssets: Array<{ id: string; description: string }>;
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
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing clickable element: ${selector}`);
  element.click();
}

function input(document: Document, selector: string, value: string): void {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`Missing input element: ${selector}`);
  element.value = value;
  const EventConstructor = element.ownerDocument.defaultView?.Event;
  if (!EventConstructor) throw new Error('Missing Event constructor');
  element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
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
});

export { click, input, loadPrototype };
