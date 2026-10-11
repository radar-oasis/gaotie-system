import { expect, it } from "vitest";
import { mergeNativeExpansion, type NativeGraph } from "./nativeGraph";
it("merges expansions by database ID without duplicating edges or changing search totals", () => {
  const node = { id: "a", label: "龙", labels: ["Motif"], properties: {} };
  const graph: NativeGraph = {
    nodes: [node],
    relationships: [],
    patterns: [],
    total: 701,
    offset: 24,
    pageSize: 24,
    patternCount: 24,
    truncated: false,
  };
  const addition = {
    nodes: [node, { ...node, id: "b" }],
    relationships: [{ id: "r", from: "a", to: "b", type: "HAS_SUBCLASS" }],
    patterns: [],
    hasMore: false,
    nextOffset: 1,
  };
  const result = mergeNativeExpansion(
    mergeNativeExpansion(graph, addition),
    addition,
  );
  expect(result.nodes).toHaveLength(2);
  expect(result.relationships).toHaveLength(1);
  expect(result.total).toBe(701);
  expect(result.offset).toBe(24);
});
