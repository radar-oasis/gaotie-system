// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AssetsPage from "./AssetsPage";
vi.mock("./AssetKnowledgeGraph", () => ({ default: ({ projectId, onOpenAsset }: { projectId: string; onOpenAsset: (id: string) => void }) => <div data-testid="graph" data-project={projectId}><button onClick={() => onOpenAsset("a")}>打开图谱资产</button></div> }));
import * as api from "./assetApi";
vi.mock("./assetApi", () => ({
  listAssets: vi.fn(),
  getAsset: vi.fn(),
  removeAsset: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const sample: api.Asset = {
  id: "a",
  kind: "pattern",
  name: "云纹",
  imageUrl: "/a.png",
  projectId: "p1",
  projectName: "山海",
  theme: "",
  imagery: "",
  createdAt: "2026-10-06T10:00:00Z",
};
const mount = async (onReusePattern?: (asset: api.Asset) => Promise<void> | void, overview = false) => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(<AssetsPage onReusePattern={onReusePattern} />));
  if (!overview) await act(async () => (el.querySelectorAll("[role=tab]")[1] as HTMLButtonElement).click());
  return {
    el,
    close: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
  };
};
describe("asset library", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getAsset).mockResolvedValue(sample);
    vi.mocked(api.removeAsset).mockResolvedValue({});
    vi.mocked(api.listAssets).mockResolvedValue([
      sample,
      {
        ...sample,
        id: "b",
        kind: "proposal",
        name: "海韵方案",
        projectId: "p2",
        projectName: "海韵",
      },
    ]);
  });
  it("opens with the full graph before favorites and proposals", async () => {
    const { el, close } = await mount(undefined, true);
    const tabs = el.querySelectorAll('[role=tab]');
    expect(tabs[0].textContent).toBe('方案图谱');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].textContent).toContain('收藏纹样');
    expect(tabs[2].textContent).toContain('涂装方案');
    expect(el.querySelector('[data-testid=graph]')).not.toBeNull();
    await close();
  });
  it("filters asset types and projects without mixing projects", async () => {
    const { el, close } = await mount();
    expect(el.querySelectorAll(".asset-card")).toHaveLength(1);
    expect(el.querySelector(".asset-card")?.textContent).toContain("云纹");
    await act(async () => {
      (el.querySelectorAll("[role=tab]")[2] as HTMLButtonElement).click();
    });
    expect(el.querySelector(".asset-card")?.textContent).toContain("海韵方案");
    await act(async () => {
      (el.querySelector('[aria-label="按项目筛选"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (el.querySelector('[role="option"][data-value="p1"]') as HTMLButtonElement).click();
    });
    expect(el.querySelectorAll(".asset-card")).toHaveLength(0);
    expect(el.textContent).toContain("没有匹配的资产");
    await close();
  });
  it("shows recoverable errors instead of an empty collection", async () => {
    vi.mocked(api.listAssets).mockRejectedValueOnce(new Error("网络中断"));
    const { el, close } = await mount();
    expect(el.querySelector("[role=alert]")?.textContent).toContain("网络中断");
    await act(async () => {
      (el.querySelector("[role=alert] button") as HTMLButtonElement).click();
    });
    expect(el.querySelectorAll(".asset-card")).toHaveLength(1);
    await close();
  });
  it("displays only actually adopted pattern references in a saved proposal", async () => {
    vi.mocked(api.getAsset).mockResolvedValue({
      ...sample,
      id: "b",
      kind: "proposal",
      theme: "山海相逢",
      imagery: "祥云",
      payload: {
        version: 1,
        packageSnapshot: {
          demandTags: [],
          selectedPatterns: [],
          selectedCases: [],
          selectedReferenceImageUrls: ["/used.png"],
          canvasAssets: [
            {
              id: "x",
              name: "采用的祥云",
              source: "capture",
              imageUrl: "/used.png",
              provenance: { version: 1, originalPrompt: "采用的生成提示", sourcePatterns: [{ id: "used-root", name: "实际来源云纹", imageUrl: "/root-used.png" }], references: [] },
            },
            {
              id: "y",
              name: "未采用",
              source: "capture",
              imageUrl: "/unused.png",
              provenance: { version: 1, originalPrompt: "无关生成提示", sourcePatterns: [{ id: "unused-root", name: "未采用的原始纹样", imageUrl: "/root-unused.png" }], references: [] },
            },
          ],
        },
      },
    });
    const { el, close } = await mount();
    await act(async () => {
      (el.querySelectorAll("[role=tab]")[2] as HTMLButtonElement).click();
    });
    await act(async () => {
      (el.querySelector(".asset-card__open") as HTMLButtonElement).click();
    });
    expect(el.querySelector("dialog")?.textContent).toContain("山海相逢");
    expect(el.querySelector("dialog")?.textContent).toContain("采用的祥云");
    expect(el.querySelector('dialog img[src$="unused.png"]')).toBeNull();
    expect(el.querySelector("dialog")?.textContent).toContain("实际来源云纹");
    expect(el.querySelector("dialog")?.textContent).not.toContain("未采用的原始纹样");
    expect(el.querySelector("dialog")?.textContent).not.toContain("无关生成提示");
    await close();
  });
  it("offers visible card deletion with cancel, failure and retry", async () => {
    const { el, close } = await mount();
    const deleteButton = el.querySelector('[aria-label="删除 云纹"]') as HTMLButtonElement;
    expect(deleteButton).not.toBeNull();
    await act(async () => deleteButton.click());
    expect(api.removeAsset).not.toHaveBeenCalled();
    await act(async () => Array.from(el.querySelectorAll<HTMLButtonElement>('dialog button')).find(b => b.textContent === '保留')?.click());
    expect(el.querySelector('dialog')).toBeNull();
    expect(el.querySelectorAll('.asset-card')).toHaveLength(1);
    vi.mocked(api.removeAsset).mockRejectedValueOnce(new Error('删除失败，请重试'));
    await act(async () => deleteButton.click());
    await act(async () => Array.from(el.querySelectorAll<HTMLButtonElement>('dialog button')).find(b => b.textContent === '确认删除')?.click());
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('删除失败');
    expect(el.querySelectorAll('.asset-card')).toHaveLength(1);
    await act(async () => Array.from(el.querySelectorAll<HTMLButtonElement>('dialog button')).find(b => b.textContent === '确认删除')?.click());
    expect(el.querySelectorAll('.asset-card')).toHaveLength(0);
    expect(api.removeAsset).toHaveBeenCalledTimes(2);
    expect(api.getAsset).not.toHaveBeenCalled();
    await close();
  });
  it("shows saved provenance and lets a favorite continue in the canvas", async () => {
    const saved: api.Asset = { ...sample, payload: { provenance: {
      version: 1, originalPrompt: '将云纹简化', optimizedPrompt: '保留流动轮廓',
      sourcePatterns: [{ id: 'root', name: '汉代云气纹', imageUrl: '/root.png', dynasty: '汉' }],
      references: [{ imageUrl: '/reference.png', name: '原始参考' }],
    } } };
    vi.mocked(api.getAsset).mockResolvedValue(saved);
    const onReuse = vi.fn().mockRejectedValueOnce(new Error('画布加载失败')).mockResolvedValueOnce(undefined);
    const { el, close } = await mount(onReuse);
    await act(async () => (el.querySelector('.asset-card__open') as HTMLButtonElement).click());
    const dialog = el.querySelector('dialog')!;
    expect(dialog.textContent).toContain('汉代云气纹');
    expect(dialog.textContent).toContain('将云纹简化');
    expect(dialog.textContent).toContain('保留流动轮廓');
    expect(dialog.querySelector('img[src$="reference.png"]')).not.toBeNull();
    const resume = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === '继续调整')!;
    await act(async () => resume.click());
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('画布加载失败');
    await act(async () => resume.click());
    expect(onReuse).toHaveBeenLastCalledWith(saved);
    expect(el.querySelector('dialog')).toBeNull();
    await close();
  });
  it("does not invent the missing origins of a legacy favorite", async () => {
    const { el, close } = await mount();
    await act(async () => (el.querySelector('.asset-card__open') as HTMLButtonElement).click());
    expect(el.querySelector('dialog')?.textContent).toContain('未记录来源纹样');
    expect(el.querySelector('dialog')?.textContent).toContain('未记录参考原图');
    await close();
  });
  it("lets the project filter select by keyboard and close with Escape", async () => {
    const { el, close } = await mount();
    const trigger = el.querySelector('[aria-label="按项目筛选"]') as HTMLButtonElement;
    expect(trigger.tagName).toBe('BUTTON');
    await act(async () => trigger.click());
    await act(async () => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(trigger.textContent).toContain('山海');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => trigger.click());
    await act(async () => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await close();
  });

  it("shares the project with the graph and opens its asset details", async () => {
    const { el, close } = await mount();
    await act(async () => (el.querySelector('[aria-label="按项目筛选"]') as HTMLButtonElement).click());
    await act(async () => (el.querySelector('[data-value="p1"]') as HTMLButtonElement).click());
    await act(async () => (el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]).click());
    expect(el.querySelector('[data-testid="graph"]')?.getAttribute('data-project')).toBe('p1');
    expect(el.querySelector('[aria-label="搜索资产"]')).toBeNull();
    await act(async () => (el.querySelector('[data-testid="graph"] button') as HTMLButtonElement).click());
    expect(api.getAsset).toHaveBeenCalledWith('a');
    expect(el.querySelector('dialog')?.textContent).toContain('云纹');
    await close();
  });
  it("retries an unavailable detail without losing the selected asset", async () => {
    vi.mocked(api.getAsset).mockRejectedValueOnce(new Error('详情读取失败'));
    const { el, close } = await mount();
    await act(async () => (el.querySelector('.asset-card__open') as HTMLButtonElement).click());
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('详情读取失败');
    await act(async () => (el.querySelector('[role="alert"] button') as HTMLButtonElement).click());
    expect(el.querySelector('dialog')?.textContent).toContain('云纹');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    await close();
  });

});
