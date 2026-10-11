import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import GraphNodePicker from "./GraphNodePicker";
import type { Pattern } from "../context/ImageSearchContext";
import { apiUrl, resolveBackendImageUrl } from "../utils/backendUrls";
import {
  mergeNativeExpansion,
  type NativeExpansion,
  nodeKinds,
  relationshipNames,
  type NativeGraph,
  type NativeSearchQuery,
} from "../utils/nativeGraph";
import type { GraphControls } from "./NativeGraphCanvas";
import "./Neo4jPatternBrowser.css";
const NativeGraphCanvas = lazy(() => import("./NativeGraphCanvas"));
export default function Neo4jPatternBrowser({
  patterns,
  query,
  kind = "direct",
  selectedIds = new Set<string>(),
  onToggle,
  onPreview,
}: {
  patterns: Pattern[];
  query?: NativeSearchQuery;
  kind?: "direct" | "related";
  selectedIds?: Set<string>;
  onToggle?: (p: Pattern) => void;
  onPreview?: (p: Pattern) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [graph, setGraph] = useState<NativeGraph | null>(null);
  const [error, setError] = useState(false);
  const [focus, setFocus] = useState("");
  const [large, setLarge] = useState(false);
  const [allRelations, setAllRelations] = useState(false);
  const controls = useRef<GraphControls>(null);
  const [expandedVisible, setExpandedVisible] = useState<Set<string>>(
    new Set(),
  );
  const [expansions, setExpansions] = useState<
    Record<string, { nextOffset: number; hasMore: boolean }>
  >({});
  const [expanding, setExpanding] = useState("");
  const [expansionMessage, setExpansionMessage] = useState("");
  const expansionRequest = useRef<AbortController | null>(null);
  const expansionScope = useRef("");
  const body = JSON.stringify({
    ...(query ? { query } : { patternIds: patterns.map((p) => p.id) }),
    kind,
    offset,
  });
  useEffect(() => {
    expansionScope.current = body;
    expansionRequest.current?.abort();
    expansionRequest.current = null;
    setExpandedVisible(new Set());
    setExpansions({});
    setExpanding("");
    setExpansionMessage("");
    const controller = new AbortController();
    setGraph(null);
    setError(false);
    setFocus("");
    fetch(apiUrl("/image-search/native-graph"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("graph");
        return (await response.json()) as NativeGraph;
      })
      .then((data) => {
        if (!controller.signal.aborted) setGraph(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      expansionRequest.current?.abort();
    };
  }, [body, revision]);
  const expandNode = async (nodeId: string) => {
    if (
      !graph ||
      !graph.nodes.some((n) => n.id === nodeId) ||
      expansionRequest.current ||
      expansionScope.current !== body
    )
      return;
    setFocus(nodeId);
    if (expansions[nodeId]?.hasMore === false) {
      setExpansionMessage("该节点的直接关联已全部展开");
      return;
    }
    const controller = new AbortController();
    expansionRequest.current = controller;
    setExpanding(nodeId);
    setExpansionMessage("正在展开关联节点…");
    try {
      const response = await fetch(
        apiUrl("/image-search/native-graph/expand"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId,
            offset: expansions[nodeId]?.nextOffset ?? 0,
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("expand");
      const data = (await response.json()) as NativeExpansion;
      if (controller.signal.aborted) return;
      const merged = mergeNativeExpansion(graph, data);
      if (merged.nodes.length > 1000 || merged.relationships.length > 4000) {
        setExpansionMessage("当前画布关联较多，请切换一组纹样后继续探索");
        return;
      }
      setGraph(merged);
      setExpandedVisible(
        (previous) => new Set([...previous, ...data.nodes.map((n) => n.id)]),
      );
      setExpansions((previous) => ({
        ...previous,
        [nodeId]: { nextOffset: data.nextOffset, hasMore: data.hasMore },
      }));
      const added = merged.nodes.length - graph.nodes.length;
      setExpansionMessage(
        data.hasMore
          ? "已展开一批关联，可再次双击或点击继续展开"
          : data.relationships.length
            ? `关联已展开${added ? `，新增 ${added} 个节点` : ""}`
            : "该节点暂无其他直接关联",
      );
    } catch {
      if (!controller.signal.aborted)
        setExpansionMessage("展开失败，请再次双击节点或点击重试");
    } finally {
      if (expansionRequest.current === controller) {
        expansionRequest.current = null;
        setExpanding("");
      }
    }
  };
  const keywords = JSON.stringify(query?.groups[0]?.keywords ?? []);
  const visibleGraph = useMemo(() => {
    if (!graph || allRelations) return graph;
    const terms = JSON.parse(keywords) as string[];
    const anchors = graph.nodes.filter(
      (n) =>
        n.labels.includes("Motif") &&
        terms.some((t) => t === n.label || t === `${n.label}纹`),
    );
    const shown = new Set(
      graph.nodes
        .filter(
          (n) =>
            expandedVisible.has(n.id) ||
            n.labels.includes("Pattern") ||
            (anchors.length
              ? anchors.some((a) => a.id === n.id)
              : n.labels.includes("Motif")),
        )
        .map((n) => n.id),
    );
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => shown.has(n.id)),
      relationships: graph.relationships.filter(
        (r) => shown.has(r.from) && shown.has(r.to),
      ),
    };
  }, [graph, allRelations, keywords, expandedVisible]);
  const current = graph?.nodes.find((n) => n.id === focus);
  const patternId = current?.properties.Pattern_ID;
  const pattern = [...(graph?.patterns ?? []), ...patterns].find(
    (p) => p.id === patternId,
  );
  const adjacent =
    graph?.relationships.filter((r) => r.from === focus || r.to === focus) ??
    [];
  const title = query?.groups[0]?.label;
  return (
    <section
      className={`neo4j-native${large ? " is-large" : ""}`}
      aria-label="Neo4j 原生节点图谱"
      onKeyDown={(e) => {
        if (e.key === "Escape") setLarge(false);
      }}
    >
      <header className="neo4j-native__header">
        <div>
          <strong>{title ? `${title} · 纹样关系` : "纹样关系探索"}</strong>
          <span>
            Neo4j 真实节点与关系 · {query ? "当前检索范围" : "当前已加载结果"}
          </span>
        </div>
        <div className="neo4j-native__actions">
          <button
            aria-pressed={allRelations}
            onClick={() => setAllRelations((v) => !v)}
          >
            {allRelations ? "收起属性节点" : "展开属性节点"}
          </button>
          <button
            type="button"
            aria-pressed={large}
            onClick={() => setLarge((v) => !v)}
          >
            {large ? "收起视图" : "放大视图"}
          </button>
        </div>
      </header>
      <div className="neo4j-native__legend">
        {Object.entries(nodeKinds)
          .filter(([kind]) =>
            visibleGraph?.nodes.some((n) => n.labels.includes(kind)),
          )
          .map(([kind, item]) => (
            <span key={kind}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        <span className="neo4j-native__counts">
          {graph
            ? `${visibleGraph?.nodes.length} 个节点 · ${visibleGraph?.relationships.length} 条关系`
            : ""}
        </span>
      </div>
      {expansionMessage && (
        <p className="neo4j-native__hint" role="status">
          {expansionMessage}
        </p>
      )}
      {error ? (
        <div className="neo4j-native__empty" role="alert">
          图谱暂时无法加载
          <button onClick={() => setRevision((v) => v + 1)}>重试</button>
        </div>
      ) : !graph ? (
        <div className="neo4j-native__empty" role="status">
          <span className="pattern-spinner" />
          正在加载纹样关系…
        </div>
      ) : !graph.nodes.length ? (
        <div className="neo4j-native__empty">当前范围暂无图谱节点</div>
      ) : (
        <div className="neo4j-native__body">
          <div className="neo4j-native__stage">
            <Suspense
              fallback={
                <div className="neo4j-native__empty">正在绘制关系…</div>
              }
            >
              <NativeGraphCanvas
                graph={visibleGraph!}
                ref={controls}
                onSelect={setFocus}
                onExpand={expandNode}
              />
            </Suspense>
            <div className="neo4j-native__tools">
              <button
                onClick={() => controls.current?.zoom(1.25)}
                aria-label="放大图谱"
              >
                ＋
              </button>
              <button
                onClick={() => controls.current?.zoom(0.8)}
                aria-label="缩小图谱"
              >
                −
              </button>
              <button onClick={() => controls.current?.fit()}>适应画布</button>
            </div>
          </div>
          <aside className="neo4j-native__detail" aria-label="节点信息">
              <GraphNodePicker
                value={focus}
                options={graph.nodes.map((n) => ({
                  value: n.id,
                  label: `${n.label} · ${nodeKinds[n.labels[0]]?.label ?? n.labels[0]}`,
                }))}
                onChange={(value) => {
                  const id = String(value ?? "");
                  setFocus(id);
                  if (id && visibleGraph?.nodes.some((n) => n.id === id))
                    controls.current?.focus(id);
                }}
              />
            {current ? (
              <>
                <small>
                  {current.labels
                    .map((label) => nodeKinds[label]?.label ?? label)
                    .join(" · ")}
                </small>
                <h3>{current.label}</h3>
                <button
                  type="button"
                  disabled={
                    !!expanding || expansions[current.id]?.hasMore === false
                  }
                  onClick={() => expandNode(current.id)}
                >
                  {expanding === current.id
                    ? "正在展开…"
                    : expansions[current.id]?.hasMore === false
                      ? "关联已全部展开"
                      : expansions[current.id]
                        ? "继续展开关联"
                        : "展开此节点关联"}
                </button>
                {pattern && (
                  <>
                    <img
                      src={resolveBackendImageUrl(pattern.imageUrl)}
                      alt={pattern.name}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="neo4j-native__actions">
                      {onToggle && (
                        <button onClick={() => onToggle(pattern)}>
                          {selectedIds.has(pattern.id)
                            ? "移出已选纹样"
                            : "加入已选纹样"}
                        </button>
                      )}
                      {onPreview && (
                        <button onClick={() => onPreview(pattern)}>
                          查看大图
                        </button>
                      )}
                    </div>
                  </>
                )}
                <dl>
                  {Object.entries(current.properties)
                    .filter(([key]) => key !== "图片链接")
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                </dl>
                <h4>关联节点 · {adjacent.length}</h4>
                <div className="neo4j-native__neighbors">
                  {adjacent.map((rel) => {
                    const id = rel.from === focus ? rel.to : rel.from;
                    const neighbor = graph.nodes.find((n) => n.id === id);
                    return (
                      <button
                        key={rel.id}
                        onClick={() => {
                          setFocus(id);
                          if (visibleGraph?.nodes.some((n) => n.id === id))
                            controls.current?.focus(id);
                          else setAllRelations(true);
                        }}
                      >
                        <span>{relationshipNames[rel.type] ?? rel.type}</span>
                        {neighbor?.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="neo4j-native__guide">
                <span>探索纹样之间的联系</span>
                <p>
                  点击母题查看本组关联纹样；点击纹样查看图片和信息。展开属性节点可查看朝代、材质和载体。
                </p>
                <p>双击节点展开直接关联；拖动节点带动关联节点，滚动鼠标缩放。</p>
              </div>
            )}
          </aside>
        </div>
      )}
      {expandedVisible.size > 0 && (
        <p className="neo4j-native__hint">
          已沿节点展开关联，新增邻居不受当前检索条件限制。
        </p>
      )}
      <footer className="neo4j-native__footer">
        <span>
          {graph
            ? `显示 ${graph.patternCount ? offset + 1 : 0}–${Math.min(offset + graph.patternCount, graph.total)} / ${graph.total} 个${kind === "related" ? "相关灵感" : "匹配纹样"}`
            : "正在读取知识图谱"}
          {graph && graph.total > graph.pageSize ? " · 分批浏览全部结果" : ""}
        </span>
        <div className="neo4j-native__actions">
          <button
            aria-label="上一组纹样"
            disabled={!graph || offset === 0}
            onClick={() =>
              setOffset((v) => Math.max(0, v - (graph?.pageSize ?? 24)))
            }
          >
            上一组
          </button>
          <button
            aria-label="下一组纹样"
            disabled={!graph || offset + graph.pageSize >= graph.total}
            onClick={() => setOffset((v) => v + (graph?.pageSize ?? 24))}
          >
            下一组
          </button>
        </div>
      </footer>
      {graph?.truncated && (
        <p className="neo4j-native__hint">
          本组关系较多，已展示前 2000 条关系记录。
        </p>
      )}
    </section>
  );
}
