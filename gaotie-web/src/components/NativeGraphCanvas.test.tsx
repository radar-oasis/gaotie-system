// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import NativeGraphCanvas from "./NativeGraphCanvas";
import type { NativeGraph } from "../utils/nativeGraph";
const mock = vi.hoisted(() => ({
  instances: [] as Array<{
    data: unknown;
    options: unknown;
    setOptions: ReturnType<typeof vi.fn>;
    startSimulation: ReturnType<typeof vi.fn>;
    events: Record<string, (event: { nodes: string[] }) => void>;
    moveTo: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("vis-network/standalone", async (importOriginal) => ({
  ...await importOriginal<typeof import("vis-network/standalone")>(),
  Network: class {
    events: Record<string, (event: { nodes: string[] }) => void> = {};
    moveTo = vi.fn();
    setOptions = vi.fn();
    startSimulation = vi.fn();
    options: unknown;
    data: unknown;
    constructor(
      _host: unknown,
      data: unknown,
      options: unknown,
    ) {
      this.data = data;
      this.options = options;
      mock.instances.push(this);
    }
    on(name: string, fn: (event: { nodes: string[] }) => void) {
      this.events[name] = fn;
    }
    once(name: string, fn: (event: { nodes: string[] }) => void) { this.events[name] = fn; }
    fit() {}
    destroy() {}
    getPositions() {
      return { a: { x: 12, y: 34 } };
    }
    getViewPosition() {
      return { x: 20, y: 40 };
    }
    getScale() {
      return 0.8;
    }
  },
}));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it("wires double-click separately and preserves existing layout and camera on expansion", async () => {
  const graph: NativeGraph = {
    nodes: [{ id: "a", labels: ["Pattern"], label: "龙纹", properties: {} }],
    relationships: [],
    patterns: [],
    total: 1,
    offset: 0,
    pageSize: 24,
    patternCount: 1,
    truncated: false,
  };
  const select = vi.fn(),
    expand = vi.fn(),
    container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <NativeGraphCanvas graph={graph} onSelect={select} onExpand={expand} />,
      ),
    );
    const first = mock.instances.at(-1)!;
    first.events.stabilizationIterationsDone({ nodes: [] });
    first.events.click({ nodes: ["a"] });
    expect(select).toHaveBeenCalledWith("a");
    expect(expand).not.toHaveBeenCalled();
    first.events.doubleClick({ nodes: ["a"] });
    expect(expand).toHaveBeenCalledWith("a");
    await act(async () =>
      root.render(
        <NativeGraphCanvas
          graph={{
            ...graph,
            nodes: [
              ...graph.nodes,
              { id: "b", labels: ["Motif"], label: "龙", properties: {} },
            ],
            relationships: [
              { id: "r", from: "a", to: "b", type: "CONTAINS_MOTIF" },
            ],
          }}
          onSelect={select}
          onExpand={expand}
        />,
      ),
    );
    const next = mock.instances.at(-1)!;
    expect((next.data as {nodes: {get: () => unknown}}).nodes.get()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "a", x: 12, y: 34 }),
      ]));
    expect(next.moveTo).toHaveBeenCalledWith({
      position: { x: 20, y: 40 },
      scale: 0.8,
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps edges visible and runs spring physics only during a node drag and settling", async () => {
  vi.useFakeTimers();
  const graph: NativeGraph = {
    nodes: [
      { id: "a", labels: ["Motif"], label: "龙", properties: {} },
      { id: "b", labels: ["Pattern"], label: "龙纹", properties: {} },
    ],
    relationships: [{ id: "r", from: "b", to: "a", type: "CONTAINS_MOTIF" }],
    patterns: [], total: 1, offset: 0, pageSize: 24, patternCount: 1, truncated: false,
  };
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<NativeGraphCanvas graph={graph} onSelect={() => {}} />));
    const instance = mock.instances.at(-1)!;
    const nodes = (instance.data as { nodes: { get: (id: string) => unknown } }).nodes;
    expect(instance.options).toMatchObject({ interaction: { hideEdgesOnDrag: false } });
    instance.events.dragStart({ nodes: [] });
    expect(instance.startSimulation).not.toHaveBeenCalled();
    instance.events.dragStart({ nodes: ["a"] });
    expect(instance.setOptions).toHaveBeenCalledWith(expect.objectContaining({
      physics: expect.objectContaining({ enabled: true }),
    }));
    expect(instance.startSimulation).toHaveBeenCalledTimes(1);
    instance.setOptions.mockClear();
    instance.events.stabilized({ nodes: [] });
    expect(instance.setOptions).not.toHaveBeenCalled();
    instance.events.dragEnd({ nodes: ["a"] });
    expect(instance.setOptions).not.toHaveBeenCalled();
    expect(nodes.get("a")).toMatchObject({ fixed: true, x: 12, y: 34 });
    vi.advanceTimersByTime(3000);
    expect(instance.setOptions).toHaveBeenCalledWith({ physics: { enabled: false } });
    expect(nodes.get("a")).toMatchObject({ fixed: false, x: 12, y: 34 });
    instance.setOptions.mockClear();
    instance.events.dragStart({ nodes: ["a"] });
    instance.events.dragEnd({ nodes: ["a"] });
    await act(async () => root.unmount());
    const calls = instance.setOptions.mock.calls.length;
    vi.runAllTimers();
    expect(instance.setOptions).toHaveBeenCalledTimes(calls);
  } finally {
    vi.useRealTimers();
  }
});

it("does not freeze an unfinished initial layout during a StrictMode remount", async () => {
  mock.instances.length = 0;
  const root = createRoot(document.createElement('div'));
  const graph: NativeGraph = { nodes: [
    { id: 'a', labels: ['project'], label: '默认项目', properties: {} },
    { id: 'b', labels: ['proposal'], label: '方案', properties: {} },
  ], relationships: [{id:'r',from:'a',to:'b',type:'包含'}], patterns: [], total:2,offset:0,pageSize:2,patternCount:0,truncated:false };
  try {
    await act(async () => root.render(<StrictMode><NativeGraphCanvas graph={graph} onSelect={() => {}} /></StrictMode>));
    expect(mock.instances).toHaveLength(2);
    for (const instance of mock.instances) expect(instance.options).toMatchObject({ physics: { enabled: true } });
  } finally { await act(async () => root.unmount()); }
});
