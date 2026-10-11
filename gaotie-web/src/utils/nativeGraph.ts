import type { Pattern, SearchGroupInput } from "../context/ImageSearchContext";
export interface NativeSearchQuery {
  groups: SearchGroupInput[];
  dynasties?: string[];
  materials?: string[];
  carriers?: string[];
  layouts?: string[];
}
export interface NativeNode {
  id: string;
  labels: string[];
  label: string;
  properties: Record<string, unknown>;
}
export interface NativeGraph {
  nodes: NativeNode[];
  relationships: { id: string; from: string; to: string; type: string }[];
  patterns: Pattern[];
  total: number;
  offset: number;
  pageSize: number;
  patternCount: number;
  truncated: boolean;
}
export const nodeKinds: Record<string, { label: string; color: string }> = {
  Pattern: { label: "纹样", color: "#a9ddf4" },
  Motif: { label: "母题", color: "#c5d78f" },
  Dynasty: { label: "朝代", color: "#c9bffc" },
  Material: { label: "材质", color: "#ffdfb0" },
  Carrier: { label: "载体", color: "#73d4dc" },
  Layout: { label: "构图", color: "#dfa991" },
  Level1: { label: "一级类别", color: "#ffa890" },
  Level2: { label: "二级类别", color: "#ffc3a7" },
};
export const relationshipNames: Record<string, string> = {
  CONTAINS_MOTIF: "包含母题",
  BELONGS_TO_DYNASTY: "所属朝代",
  MADE_OF_MATERIAL: "材质",
  APPLIED_ON_CARRIER: "应用载体",
  HAS_LAYOUT: "构图",
  HAS_SUBCLASS: "下属类别",
};

export interface NativeExpansion {
  nodes: NativeNode[];
  relationships: NativeGraph["relationships"];
  patterns: Pattern[];
  hasMore: boolean;
  nextOffset: number;
}
export function mergeNativeExpansion(
  graph: NativeGraph,
  addition: NativeExpansion,
): NativeGraph {
  const merge = <T extends { id: string }>(existing: T[], extra: T[]) => [
    ...new Map([...existing, ...extra].map((item) => [item.id, item])).values(),
  ];
  return {
    ...graph,
    nodes: merge(graph.nodes, addition.nodes),
    relationships: merge(graph.relationships, addition.relationships),
    patterns: merge(addition.patterns, graph.patterns),
  };
}
