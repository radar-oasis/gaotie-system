// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import Neo4jPatternBrowser from "./Neo4jPatternBrowser";
vi.mock("./NativeGraphCanvas", () => ({
  default: ({
    onSelect,
    onExpand,
  }: {
    onSelect: (id: string) => void;
    onExpand: (id: string) => void;
  }) => (
    <button onClick={() => onSelect("n1")} onDoubleClick={() => onExpand("n1")}>
      选择图节点
    </button>
  ),
}));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const pattern = {
  id: "P1",
  name: "龙纹",
  imageUrl: "1.jpg",
  dynasty: "唐",
  description: "",
};
const response = {
  nodes: [
    {
      id: "n1",
      labels: ["Pattern"],
      label: "龙纹",
      properties: { Pattern_ID: "P1", 名称: "龙纹" },
    },
  ],
  relationships: [],
  patterns: [pattern],
  total: 81,
  offset: 0,
  pageSize: 40,
  patternCount: 40,
  truncated: false,
};
it("automatically requests the entire search scope, supports selection and pages beyond image results", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => response });
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  const toggle = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Neo4jPatternBrowser
          patterns={[pattern]}
          query={{
            groups: [{ id: "龙", label: "龙", keywords: ["龙"] }],
            dynasties: ["唐"],
          }}
          selectedIds={new Set()}
          onToggle={toggle}
        />,
      ),
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("81");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      offset: 0,
      query: { dynasties: ["唐"] },
    });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="下一组纹样"]')!
        .click(),
    );
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).offset).toBe(40);
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "选择图节点")!
        .click(),
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent === "加入已选纹样")!
        .click(),
    );
    expect(toggle).toHaveBeenCalledWith(pattern);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
it("shows a recoverable failure instead of requiring database login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<Neo4jPatternBrowser patterns={[pattern]} />),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "暂时无法加载",
    );
    expect(container.textContent).toContain("重试");
    expect(container.querySelector("iframe")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("double-click expands real neighbors once and keeps the search results", async () => {
  const extra = {
    nodes: [
      {
        id: "n2",
        label: "银器",
        labels: ["Material"],
        properties: { material_name: "银器" },
      },
    ],
    relationships: [
      { id: "r1", from: "n1", to: "n2", type: "MADE_OF_MATERIAL" },
    ],
    patterns: [],
    hasMore: false,
    nextOffset: 1,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => response })
    .mockResolvedValue({ ok: true, json: async () => extra });
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<Neo4jPatternBrowser patterns={[pattern]} />),
    );
    const node = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "选择图节点",
    )!;
    await act(async () =>
      node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    expect(fetcher.mock.calls[1][0]).toContain("/native-graph/expand");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      nodeId: "n1",
      offset: 0,
    });
    expect(container.textContent).toContain("2 个节点 · 1 条关系");
    expect(container.textContent).toContain("银器");
    await act(async () =>
      node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("直接关联已全部展开");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
