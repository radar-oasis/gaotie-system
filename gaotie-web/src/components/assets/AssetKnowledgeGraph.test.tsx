// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssetKnowledgeGraph from './AssetKnowledgeGraph';

const visualization = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  fit: vi.fn(),
  focus: vi.fn(),
  selectNodes: vi.fn(),
}));
vi.mock('vis-network/standalone', () => ({
  DataSet: class {
    items: unknown[];
    constructor(items: unknown[]) { this.items = items; }
  },
  Network: class {
    constructor(...args: unknown[]) { visualization.create(...args); }
    on() {}
    once() {}
    setOptions() {}
    destroy = visualization.destroy;
    fit = visualization.fit;
    focus = visualization.focus;
    selectNodes = visualization.selectNodes;
    getPositions() { return {}; }
    getViewPosition() { return { x: 0, y: 0 }; }
    getScale() { return 1; }
    moveTo() {}
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const projectNode = { id: 'project:p1', label: '山海项目', kind: 'project' };
const patternNode = { id: 'original:cloud', label: '汉代云气纹', kind: 'original-pattern', imageUrl: '/images/cloud.png' };
const proposalNode = { id: 'proposal:a1', label: '云海涂装方案', kind: 'proposal', assetId: 'a1', imageUrl: '/assets/a1/image' };
const overview = {
  nodes: [projectNode, patternNode, proposalNode],
  edges: [
    { id: 'e1', source: 'project:p1', target: 'proposal:a1', label: '包含方案' },
    { id: 'e2', source: 'original:cloud', target: 'proposal:a1', label: '来源纹样' },
  ],
  matches: [{ assetId: 'a1', name: '云海涂装方案', kind: 'proposal', paths: [['original:cloud', 'proposal:a1']] }],
  status: { truncated: false },
};
const answer = (reply: string) => ({ ...overview, reply });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const fetchMock = vi.fn<typeof fetch>();
const mounted: { root: Root; el: HTMLDivElement }[] = [];

async function mount(projectId = 'p1') {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  const onOpenAsset = vi.fn();
  mounted.push({ root, el });
  const render = async (id: string) => {
    await act(async () => { root.render(<AssetKnowledgeGraph projectId={id} onOpenAsset={onOpenAsset} />); await import('../NativeGraphCanvas'); });
  };
  await render(projectId);
  return { el, onOpenAsset, render };
}
function findButton(el: HTMLElement, text: string) {
  const button = Array.from(el.querySelectorAll('button')).find(item => item.textContent?.trim() === text || item.getAttribute('aria-label') === text);
  expect(button, `missing button: ${text}`).toBeDefined();
  return button!;
}
async function typeMessage(el: HTMLElement, message: string) {
  const input = el.querySelector<HTMLTextAreaElement>('textarea[aria-label="图谱对话"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, message);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function sendMessage(el: HTMLElement, message: string) {
  await typeMessage(el, message);
  await act(async () => findButton(el, '发送图谱问题').click());
}
function lastRequestBody() {
  return JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
}

describe('asset knowledge graph conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(response(overview));
  });
  afterEach(async () => {
    for (const { root, el } of mounted.splice(0)) {
      await act(async () => root.unmount());
      el.remove();
    }
    vi.unstubAllGlobals();
  });

  it('loads the complete project graph and offers a single conversation without hop controls', async () => {
    const { el, onOpenAsset } = await mount();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/assets/graph');
    expect(new URL(String(url)).searchParams.get('projectId')).toBe('p1');
    expect(new URL(String(url)).searchParams.has('hops')).toBe(false);
    expect(init?.credentials).toBe('include');
    expect(el.querySelectorAll('textarea')).toHaveLength(1);
    expect(el.textContent).not.toContain('关系跳数');
    expect(el.querySelector('fieldset')).toBeNull();
    expect(findButton(el, '发送图谱问题').disabled).toBe(true);
    expect(findButton(el, '发送图谱问题').textContent).toBe('');
    expect(findButton(el, '发送图谱问题').querySelector('svg')).not.toBeNull();
    expect(el.querySelector('[aria-label="资产关系图"]')).not.toBeNull();
    expect(el.querySelector('.asset-knowledge__results')?.textContent).toContain('汉代云气纹 → 云海涂装方案');
    expect(visualization.create).toHaveBeenCalledOnce();
    expect(visualization.create.mock.calls[0][2]).toMatchObject({ interaction: { dragNodes: true, dragView: true, zoomView: true, hideEdgesOnDrag: false } });
    expect(visualization.create.mock.calls[0][1].nodes.items).toEqual(expect.arrayContaining([expect.objectContaining({ shape: 'circle' })]));
    await act(async () => el.querySelector<HTMLButtonElement>('.asset-knowledge__results button')!.click());
    expect(onOpenAsset).toHaveBeenCalledWith('a1');
  });

  it('sends with Enter but preserves Shift+Enter and Chinese input composition', async () => {
    fetchMock.mockResolvedValueOnce(response(answer('找到云海涂装方案。')));
    const { el } = await mount();
    await typeMessage(el, '山海项目有哪些方案？');
    const input = el.querySelector('textarea')!;
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(lastRequestBody().message).toBe('山海项目有哪些方案？');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['项目', '山海项目有哪些涂装方案？', '山海项目中找到云海涂装方案。'],
    ['方案', '云海涂装方案采用了哪些纹样？', '云海涂装方案采用了汉代云气纹。'],
    ['纹样', '哪些方案采用了汉代云气纹？', '找到采用汉代云气纹的云海涂装方案。'],
  ])('submits a %s question through the actual Send button', async (_, question, reply) => {
    fetchMock.mockResolvedValueOnce(response(answer(reply)));
    const { el } = await mount();
    await sendMessage(el, `  ${question}  `);
    const [url, init] = fetchMock.mock.calls[1];
    expect(new URL(String(url)).pathname).toBe('/assets/graph/chat');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(lastRequestBody()).toEqual({ message: question, projectId: 'p1', history: [] });
    expect(el.querySelector('[role="log"]')?.textContent).toContain(question);
    expect(el.querySelector('[role="log"]')?.textContent).toContain(reply);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('includes both messages from the previous turn in a follow-up', async () => {
    const first = '山海项目有哪些方案？';
    const reply = '该项目包含云海涂装方案。';
    fetchMock.mockResolvedValueOnce(response(answer(reply)));
    fetchMock.mockResolvedValueOnce(response(answer('该方案采用汉代云气纹。')));
    const { el } = await mount();
    await sendMessage(el, first);
    await sendMessage(el, '这个方案采用了什么纹样？');
    expect(lastRequestBody()).toEqual({
      projectId: 'p1', message: '这个方案采用了什么纹样？',
      history: [{ role: 'user', content: first }, { role: 'assistant', content: reply }],
    });
    expect(el.querySelectorAll('.asset-knowledge__message')).toHaveLength(4);
    expect(el.querySelector('[role="log"]')?.textContent).toContain('该方案采用汉代云气纹。');
  });

  it('keeps a failed question retryable without adding a fabricated successful reply', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: '图谱服务暂不可用' }, 503));
    fetchMock.mockResolvedValueOnce(response(answer('已找到云海涂装方案。')));
    const { el } = await mount();
    const question = '哪些方案采用了汉代云气纹？';
    await sendMessage(el, question);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('图谱服务暂不可用');
    expect(el.querySelector('[role="log"]')).toBeNull();
    expect(el.textContent).not.toContain('已更新相关资产与关系');
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(question);
    expect(el.querySelector('.asset-knowledge__results')?.textContent).toContain('云海涂装方案');
    await act(async () => findButton(el, '重试').click());
    expect(lastRequestBody()).toEqual({ message: question, projectId: 'p1', history: [] });
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('.asset-knowledge__message')).toHaveLength(2);
    expect(el.querySelector('[role="log"]')?.textContent).toContain('已找到云海涂装方案。');
  });

  it('retries the initial graph load after a network failure', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error('网络已断开'));
    fetchMock.mockResolvedValueOnce(response(overview));
    const { el } = await mount();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('网络已断开');
    expect(el.querySelector('[aria-label="资产关系图"]')).toBeNull();
    await act(async () => findButton(el, '重试').click());
    expect(new URL(String(fetchMock.mock.calls[1][0])).pathname).toBe('/assets/graph');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('[aria-label="资产关系图"]')).not.toBeNull();
  });

  it('disables duplicate sends until the current conversation request finishes', async () => {
    const delayed = deferred<Response>();
    fetchMock.mockReturnValueOnce(delayed.promise);
    const { el } = await mount();
    await sendMessage(el, '山海项目有哪些方案？');
    expect(findButton(el, '发送图谱问题').disabled).toBe(true);
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(true);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('正在理解问题');
    await act(async () => findButton(el, '发送图谱问题').click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => delayed.resolve(response(answer('找到云海涂装方案。'))));
    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(false);
  });

  it('aborts an old project overview and ignores its late response', async () => {
    const oldRequest = deferred<Response>();
    fetchMock.mockReset();
    fetchMock.mockReturnValueOnce(oldRequest.promise);
    fetchMock.mockResolvedValueOnce(response({ nodes: [], edges: [], matches: [], status: {} }));
    const { el, render } = await mount('p1');
    const signal = fetchMock.mock.calls[0][1]?.signal;
    await render('p2');
    expect(signal?.aborted).toBe(true);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('projectId')).toBe('p2');
    await act(async () => oldRequest.resolve(response(overview)));
    expect(el.textContent).not.toContain('云海涂装方案');
    expect(el.querySelector('[aria-label="资产关系图"]')).toBeNull();
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it('cancels a pending conversation when projects change and starts the new history empty', async () => {
    const oldReply = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response(answer('旧项目已有云海方案。')));
    fetchMock.mockReturnValueOnce(oldReply.promise);
    fetchMock.mockResolvedValueOnce(response({ nodes: [], edges: [], matches: [], status: {} }));
    fetchMock.mockResolvedValueOnce(response({ nodes: [], edges: [], matches: [], status: {}, reply: '新项目还没有方案。' }));
    const { el, render } = await mount('p1');
    await sendMessage(el, '旧项目有哪些方案？');
    await sendMessage(el, '它采用了什么纹样？');
    const oldSignal = fetchMock.mock.calls[2][1]?.signal;
    await render('p2');
    expect(oldSignal?.aborted).toBe(true);
    expect(el.querySelector('[role="log"]')).toBeNull();
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
    await act(async () => oldReply.resolve(response(answer('不应显示的旧项目回答'))));
    expect(el.textContent).not.toContain('不应显示的旧项目回答');
    expect(el.textContent).not.toContain('云海涂装方案');
    await sendMessage(el, '新项目有哪些方案？');
    expect(lastRequestBody()).toEqual({ message: '新项目有哪些方案？', projectId: 'p2', history: [] });
    expect(el.querySelector('[role="log"]')?.textContent).toContain('新项目还没有方案。');
  });

  it.each([
    [projectNode, '我想查看项目「山海项目」中的涂装方案'],
    [proposalNode, '请展示方案「云海涂装方案」的纹样和布局关系'],
    [patternNode, '哪些方案采用了「汉代云气纹」？'],
  ])('submits a contextual question from the $label node', async (node, expectedMessage) => {
    fetchMock.mockResolvedValueOnce(response(answer('已找到关联资产。')));
    const { el } = await mount();
    await act(async () => findButton(el, node.label).click());
    await act(async () => findButton(el, '查询相关方案').click());
    expect(lastRequestBody()).toEqual({ message: expectedMessage, projectId: 'p1', history: [] });
    expect(el.querySelector('[role="log"]')?.textContent).toContain('已找到关联资产。');
  });
});
