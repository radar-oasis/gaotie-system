import { useEffect, useMemo, useRef, useState } from "react";
import type { Pattern } from "../context/ImageSearchContext";
import { apiUrl, resolveBackendImageUrl } from "../utils/backendUrls";
import "./PatternGraph.css";

type Node = { id: string; kind: string; label: string; patternId?: string };
type Edge = { id: string; source: string; target: string; label: string };
type Graph = { nodes: Node[]; edges: Edge[]; truncated: boolean };
type Point = { x: number; y: number };
const kinds: Record<string, string> = {
  pattern: "纹样",
  motif: "意象",
  category: "类别",
  dynasty: "朝代",
  material: "材质",
  carrier: "载体",
  layout: "构图",
};
const BATCH_SIZE = 12;

// A bounded, deterministic force layout: no continuous animation or new dependency.
function arrange(nodes: Node[], edges: Edge[]) {
  const positions = new Map(
    nodes.map((node, i) => [
      node.id,
      {
        x: 500 + Math.cos(i * 2.39996) * (node.kind === "motif" ? 110 : 260),
        y: 330 + Math.sin(i * 2.39996) * (node.kind === "motif" ? 90 : 220),
      },
    ]),
  );
  for (let step = 0; step < 110; step++) {
    const forces = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));
    nodes.forEach((a, i) =>
      nodes.slice(i + 1).forEach((b) => {
        const pa = positions.get(a.id)!,
          pb = positions.get(b.id)!;
        const dx = pa.x - pb.x,
          dy = pa.y - pb.y;
        const d = Math.max(1, Math.hypot(dx, dy)),
          force = Math.min(25, 8000 / (d * d) + Math.max(0, 132 - d) * 0.4);
        forces.get(a.id)!.x += (dx / d) * force;
        forces.get(a.id)!.y += (dy / d) * force;
        forces.get(b.id)!.x -= (dx / d) * force;
        forces.get(b.id)!.y -= (dy / d) * force;
      }),
    );
    edges.forEach((edge) => {
      const a = positions.get(edge.source),
        b = positions.get(edge.target);
      if (!a || !b) return;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        d = Math.max(1, Math.hypot(dx, dy));
      const force = (d - 190) * 0.015;
      forces.get(edge.source)!.x += (dx / d) * force;
      forces.get(edge.source)!.y += (dy / d) * force;
      forces.get(edge.target)!.x -= (dx / d) * force;
      forces.get(edge.target)!.y -= (dy / d) * force;
    });
    nodes.forEach((node) => {
      const p = positions.get(node.id)!,
        f = forces.get(node.id)!;
      p.x = Math.max(65, Math.min(935, p.x + f.x + (500 - p.x) * 0.002));
      p.y = Math.max(60, Math.min(590, p.y + f.y + (320 - p.y) * 0.002));
    });
  }
  return positions;
}

export default function PatternGraph({
  patterns,
  selectedIds,
  onToggle,
  onPreview,
}: {
  patterns: Pattern[];
  selectedIds: Set<string>;
  onToggle: (p: Pattern) => void;
  onPreview: (p: Pattern) => void;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [batch, setBatch] = useState(0);
  const [focus, setFocus] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState<Record<string, Point>>({});
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id?: string;
    x: number;
    y: number;
    start: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [large, setLarge] = useState(false);
  const ids = JSON.stringify(
    patterns
      .slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE)
      .map((p) => p.id),
  );
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((value) =>
        Math.max(0.5, Math.min(2.5, value - event.deltaY * 0.001)),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [graph]);
  useEffect(() => {
    const controller = new AbortController();
    setGraph(null);
    setError(false);
    setFocus("");
    setExpanded(new Set());
    setMoved({});
    setPan({ x: 0, y: 0 });
    setScale(1);
    fetch(apiUrl("/image-search/graph"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternIds: JSON.parse(ids) }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("graph");
        return (await response.json()) as Graph;
      })
      .then((data) => {
        if (!controller.signal.aborted) setGraph(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [ids, retry]);
  const visible = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const shown = new Set(
      graph.nodes
        .filter((n) => n.kind === "pattern" || n.kind === "motif")
        .map((n) => n.id),
    );
    for (const edge of graph.edges)
      if (expanded.has(edge.source) || expanded.has(edge.target)) {
        shown.add(edge.source);
        shown.add(edge.target);
      }
    return {
      nodes: graph.nodes.filter((n) => shown.has(n.id)),
      edges: graph.edges.filter(
        (e) => shown.has(e.source) && shown.has(e.target),
      ),
    };
  }, [graph, expanded]);
  const positions = useMemo(
    () => arrange(visible.nodes, visible.edges),
    [visible],
  );
  const current = graph?.nodes.find((n) => n.id === focus);
  const pattern = patterns.find((p) => p.id === current?.patternId);
  const adjacent = new Set([
    focus,
    ...visible.edges
      .filter((e) => e.source === focus || e.target === focus)
      .flatMap((e) => [e.source, e.target]),
  ]);
  const point = (id: string) => moved[id] ?? positions.get(id)!;
  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setMoved({});
  };
  return (
    <div
      className={`pattern-graph${large ? " is-large" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setLarge(false);
      }}
    >
      <div className="pattern-graph__top">
        <div>
          <strong>纹样关系图谱</strong>
          <span>基于知识图谱 · 当前结果的局部关系</span>
        </div>
        <span>
          {graph
            ? `${visible.nodes.length} 个节点 · ${visible.edges.length} 条关系`
            : "连接图谱"}
        </span>
        <button
          className="pattern-graph__size"
          aria-pressed={large}
          onClick={() => setLarge((v) => !v)}
        >
          {large ? "收起视图" : "放大视图"}
        </button>
      </div>
      {error ? (
        <div className="pattern-graph__empty" role="alert">
          图谱暂时无法加载
          <button onClick={() => setRetry((v) => v + 1)}>重试</button>
        </div>
      ) : !graph ? (
        <div className="pattern-graph__empty" role="status">
          <span className="pattern-spinner" />
          正在加载关系…
        </div>
      ) : !graph.nodes.length ? (
        <div className="pattern-graph__empty">当前纹样暂无可展示的图谱节点</div>
      ) : (
        <>
          <svg
            ref={svg}
            viewBox="0 0 1000 660"
            role="group"
            aria-label="关系图谱"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const id =
                (e.target as Element)
                  .closest("[data-node]")
                  ?.getAttribute("data-node") ?? undefined;
              suppressClick.current = false;
              drag.current = {
                id,
                x: e.clientX,
                y: e.clientY,
                start: id ? point(id) : pan,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || !svg.current) return;
              const rect = svg.current.getBoundingClientRect();
              const factor = 1 / Math.min(rect.width / 1000, rect.height / 660) / scale;
              const dx = (e.clientX - d.x) * factor,
                dy = (e.clientY - d.y) * factor;
              if (Math.abs(dx) + Math.abs(dy) > 5) {
                d.moved = true;
                suppressClick.current = true;
                svg.current.setPointerCapture?.(e.pointerId);
              }
              if (!d.moved) return;
              if (d.id)
                setMoved((v) => ({
                  ...v,
                  [d.id!]: { x: d.start.x + dx, y: d.start.y + dy },
                }));
              else setPan({ x: d.start.x + dx, y: d.start.y + dy });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <g
              transform={`translate(500 330) scale(${scale}) translate(${-500 + pan.x} ${-330 + pan.y})`}
            >
              {visible.edges.map((edge) => {
                const a = point(edge.source),
                  b = point(edge.target),
                  active = focus === edge.source || focus === edge.target;
                return (
                  <g
                    key={edge.id}
                    className={`pattern-graph__edge${active ? " is-active" : ""}`}
                    opacity={focus && !active ? 0.18 : 1}
                  >
                    <path
                      d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + 20} ${(a.y + b.y) / 2 - 20} ${b.x} ${b.y}`}
                    />
                    {active && (
                      <text x={(a.x + b.x) / 2 + 10} y={(a.y + b.y) / 2 - 12}>
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {visible.nodes.map((node) => {
                const p = point(node.id),
                  asset = patterns.find((p) => p.id === node.patternId),
                  isImage = node.kind === "pattern";
                return (
                  <foreignObject
                    key={node.id}
                    x={p.x - (isImage ? 48 : 55)}
                    y={p.y - (isImage ? 48 : 22)}
                    width={isImage ? 96 : 110}
                    height={isImage ? 113 : 48}
                    opacity={focus && !adjacent.has(node.id) ? 0.3 : 1}
                  >
                    <button
                      data-node={node.id}
                      className={`pattern-graph__node is-${node.kind}${focus === node.id ? " is-focused" : ""}${asset && selectedIds.has(asset.id) ? " is-selected" : ""}`}
                      aria-label={`图谱节点 ${node.label}`}
                      aria-pressed={focus === node.id}
                      title={node.label}
                      onClick={() => {
                        if (!suppressClick.current) setFocus(node.id);
                        suppressClick.current = false;
                      }}
                    >
                      {asset && (
                        <img
                          src={resolveBackendImageUrl(asset.imageUrl)}
                          alt=""
                          draggable={false}
                          onError={(e) => {
                            e.currentTarget.style.visibility = "hidden";
                          }}
                        />
                      )}
                      {!isImage && node.kind !== "motif" && (
                        <small>{kinds[node.kind]}</small>
                      )}
                      <span>{node.label}</span>
                      {asset && selectedIds.has(asset.id) && <i>✓</i>}
                    </button>
                  </foreignObject>
                );
              })}
            </g>
          </svg>
          {current && (
            <div className="pattern-graph__detail">
              <div>
                <small>{kinds[current.kind]}</small>
                <strong>{current.label}</strong>
              </div>
              <button
                aria-label="展开关联"
                aria-expanded={expanded.has(current.id)}
                onClick={() =>
                  setExpanded((v) => {
                    const next = new Set(v);
                    if (next.has(current.id)) next.delete(current.id);
                    else next.add(current.id);
                    return next;
                  })
                }
              >
                {expanded.has(current.id) ? "收起关联" : "展开关联"}
              </button>
              {pattern && (
                <>
                  <button onClick={() => onPreview(pattern)}>放大图片</button>
                  <button
                    className="pattern-graph__add"
                    aria-label={`${selectedIds.has(pattern.id) ? "取消选择" : "选择"} ${pattern.name}`}
                    onClick={() => onToggle(pattern)}
                  >
                    {selectedIds.has(pattern.id) ? "已选 ✓" : "加入素材 +"}
                  </button>
                </>
              )}
              <button aria-label="取消节点聚焦" onClick={() => setFocus("")}>
                ×
              </button>
            </div>
          )}
        </>
      )}
      <div className="pattern-graph__bottom">
        <div className="pattern-graph__legend">
          <span>● 意象</span>
          <span>○ 关联信息</span>
          <span>拖动节点 / 滚轮缩放</span>
        </div>
        <div className="pattern-graph__tools">
          <button
            aria-label="缩小图谱"
            onClick={() => setScale((v) => Math.max(0.5, v - 0.2))}
          >
            −
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            aria-label="放大图谱"
            onClick={() => setScale((v) => Math.min(2.5, v + 0.2))}
          >
            +
          </button>
          <button onClick={reset}>复位</button>
        </div>
      </div>
      {(patterns.length > BATCH_SIZE || graph?.truncated) && (
        <div className="pattern-graph__range">
          <span>
            当前展示第 {batch * BATCH_SIZE + 1}–
            {Math.min((batch + 1) * BATCH_SIZE, patterns.length)} 张纹样
            {graph?.truncated ? " · 关联节点已限量" : ""}
          </span>
          <button disabled={batch === 0} onClick={() => setBatch((v) => v - 1)}>
            上一组
          </button>
          <button
            disabled={(batch + 1) * BATCH_SIZE >= patterns.length}
            onClick={() => setBatch((v) => v + 1)}
          >
            下一组
          </button>
        </div>
      )}
    </div>
  );
}
