import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { DataSet, Network, type Node } from "vis-network/standalone";
import {
  nodeKinds,
  relationshipNames,
  type NativeGraph,
} from "../utils/nativeGraph";
export interface GraphControls {
  fit: () => void;
  zoom: (factor: number) => void;
  focus: (id: string) => void;
}
const NativeGraphCanvas = forwardRef<
  GraphControls,
  {
    graph: NativeGraph;
    onSelect: (id: string) => void;
    onExpand?: (id: string) => void;
    nodeColors?: Record<string, string>;
    formatLabel?: (label: string) => string;
    ariaLabel?: string;
  }
>(function NativeGraphCanvas({ graph, onSelect, onExpand, nodeColors, formatLabel, ariaLabel = 'Neo4j 真实节点关系画布' }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const network = useRef<Network | null>(null);
  const select = useRef(onSelect);
  const expand = useRef(onExpand);
  const previous = useRef<{
    positions: Record<string, { x: number; y: number }>;
    center: { x: number; y: number };
    scale: number;
  } | null>(null);
  useEffect(() => {
    expand.current = onExpand;
  }, [onExpand]);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useImperativeHandle(
    ref,
    () => ({
      fit: () => network.current?.fit({ animation: true }),
      zoom: (factor) => {
        const n = network.current;
        if (n)
          n.moveTo({
            scale: Math.max(0.08, Math.min(3, n.getScale() * factor)),
          });
      },
      focus: (id) => {
        network.current?.selectNodes([id]);
        network.current?.focus(id, { scale: 1, animation: true });
      },
    }),
    [],
  );
  useEffect(() => {
    if (!host.current) return;
    const motifs = graph.nodes.filter(
      (node) => !node.labels.includes("Pattern"),
    );
    const radial = motifs.length === 1 && motifs[0].labels.includes("Motif");
    const leaves = graph.nodes.filter((node) =>
      node.labels.includes("Pattern"),
    );
    const saved = previous.current;
    const preserve =
      !!saved && graph.nodes.some((node) => saved.positions[node.id]);
    const position = (id: string) => {
      if (preserve && saved) {
        if (saved.positions[id]) return saved.positions[id];
        const edge = graph.relationships.find(
          (r) =>
            (r.from === id && saved.positions[r.to]) ||
            (r.to === id && saved.positions[r.from]),
        );
        const origin = edge
          ? saved.positions[edge.from === id ? edge.to : edge.from]
          : saved.center;
        const index = graph.nodes.findIndex((node) => node.id === id);
        const angle = index * 2.39996,
          radius = 130 + (index % 3) * 45;
        return {
          x: origin.x + Math.cos(angle) * radius,
          y: origin.y + Math.sin(angle) * radius,
        };
      }
      if (!radial) return {};
      const index = leaves.findIndex((p) => p.id === id);
      if (index < 0) return { x: 0, y: 0 };
      const rings = leaves.length > 16;
      const ring = rings ? index % 2 : 0;
      const count = rings
        ? Math.ceil((leaves.length - ring) / 2)
        : leaves.length;
      const angle =
        (2 * Math.PI * (rings ? Math.floor(index / 2) + ring * 0.5 : index)) /
        count;
      const radius = rings ? (ring ? 350 : 195) : 280;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    };
    const nodes = new DataSet<Node>(
      graph.nodes.map((node) => ({
        id: node.id,
        ...position(node.id),
        label: formatLabel ? formatLabel(node.label) :
          node.label.length > 12
            ? `${node.label.slice(0, 6)}\n${node.label.slice(6, 11)}…`
            : node.label.replace(/(.{6})(?=.)/g, "$1\n"),
        shape: "circle",
        margin: node.labels.includes("Pattern")
          ? { top: 10, right: 10, bottom: 10, left: 10 }
          : { top: 22, right: 22, bottom: 22, left: 22 },
        widthConstraint: { minimum: 70, maximum: 90 },
        scaling: { label: { drawThreshold: 0 } },
        size: node.labels.includes("Pattern") ? 18 : 25,
        color: {
          background: nodeColors?.[node.labels[0]] ?? nodeKinds[node.labels[0]]?.color ?? "#ccd6e2",
          border: "#ffffff",
          highlight: { background: "#fff0a6", border: "#bfa05e" },
        },
        font: {
          size: node.labels.includes("Pattern") ? 13 : 18,
          color: "#344155",
          face: "sans-serif",
        },
        borderWidth: 2,
      })),
    );
    const n = new Network(
      host.current,
      {
        nodes,
        edges: graph.relationships.map((rel) => ({
          id: rel.id,
          from: rel.from,
          to: rel.to,
          label: relationshipNames[rel.type] ?? rel.type,
          arrows: "to",
          color: { color: "#c7cfd9", highlight: "#7189a6" },
          width: 0.8,
          font: {
            size: 9,
            color: "#7c8da2",
            strokeWidth: 3,
            strokeColor: "#f8fafc",
            align: "middle",
          },
          smooth: { enabled: true, type: "continuous", roundness: 0.15 },
        })),
      },
      {
        autoResize: true,
        layout: { randomSeed: 17, improvedLayout: false },
        interaction: {
          hover: true,
          zoomView: true,
          dragNodes: true,
          dragView: true,
          hideEdgesOnDrag: false,
        },
        physics: {
          enabled: !radial && !preserve,
          solver: "barnesHut",
          barnesHut: {
            gravitationalConstant: -2500,
            centralGravity: 0.12,
            springLength: 155,
            springConstant: 0.06,
            avoidOverlap: 1,
          },
          stabilization: { iterations: 220 },
        },
      },
    );
    network.current = n;
    let layoutReady = radial || preserve;
    let draggingNode = false;
    let hasDragged = false;
    let anchoredIds: string[] = [];
    const releaseAnchors = () => {
      const ids = anchoredIds;
      anchoredIds = [];
      if (ids.length) nodes.update(ids.map((id) => ({ id, fixed: false })));
    };
    let settlingTimer: ReturnType<typeof setTimeout> | undefined;
    const stopSettling = () => {
      if (draggingNode) return;
      clearTimeout(settlingTimer);
      n.setOptions({ physics: { enabled: false } });
      releaseAnchors();
    };
    if (preserve && saved)
      n.moveTo({ position: saved.center, scale: saved.scale });
    else if (radial) n.fit();
    n.on("doubleClick", (event) => {
      if (event.nodes[0]) expand.current?.(String(event.nodes[0]));
    });
    n.on("click", (event) => select.current(String(event.nodes[0] ?? "")));
    n.on("dragStart", (event) => {
      if (!event.nodes.length) return;
      draggingNode = true;
      hasDragged = true;
      releaseAnchors();
      clearTimeout(settlingTimer);
      n.setOptions({
        physics: {
          enabled: true,
          stabilization: false,
          barnesHut: { centralGravity: 0, damping: 0.35 },
        },
      });
      n.startSimulation();
    });
    n.on("dragEnd", (event) => {
      if (!draggingNode) return;
      anchoredIds = event.nodes.map(String);
      const positions = n.getPositions(anchoredIds);
      nodes.update(anchoredIds.map((id) => ({ id, ...positions[id], fixed: true })));
      draggingNode = false;
      // Allow connected nodes to settle without leaving the canvas moving forever.
      settlingTimer = setTimeout(stopSettling, 2500);
    });
    n.on("stabilized", () => {
      if (hasDragged) stopSettling();
    });
    n.once("stabilizationIterationsDone", () => {
      layoutReady = true;
      if (hasDragged) return;
      n.setOptions({ physics: false });
      if (!preserve) n.fit();
    });
    return () => {
      clearTimeout(settlingTimer);
      // StrictMode can clean up before the first simulation has spread nodes out.
      // Only reuse an established layout, otherwise run the initial simulation again.
      previous.current = layoutReady || hasDragged ? {
        positions: n.getPositions(),
        center: n.getViewPosition(),
        scale: n.getScale(),
      } : null;
      n.destroy();
      network.current = null;
    };
  }, [graph, nodeColors, formatLabel]);
  return (
    <div
      ref={host}
      className="neo4j-native__canvas"
      role="img"
      aria-label={ariaLabel}
    />
  );
});
export default NativeGraphCanvas;
