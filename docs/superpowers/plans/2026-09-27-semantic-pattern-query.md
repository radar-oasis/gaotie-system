# Semantic pattern retrieval implementation plan

Goal: Resolve conversational imagery and explicit facets, compile validated plans to parameterized read-only Cypher, and preserve grouped results, pagination and explanations.
Architecture: Catalog-grounded model interpretation plus deterministic longest-entity extraction and role disambiguation. Neo4j executes bounded motif/category/sibling paths and explicit facet conjunctions; existing result formatting ranks and paginates candidates. Known imagery cannot acquire an implicit carrier restriction. Name fallback stays labeled as name evidence.
Stack: NestJS, neo4j-driver, TypeScript, Jest, React/Vitest.

User approved the semantic-plan approach in this chat; implement in the current checkout, preserving unrelated work.

- [x] Add regression tests for 风筝 versus carrier intent, 唐代/唐朝 + 龙, unavailable model, multi-hop execution and pagination.
- [x] Add lexical extraction, dynasty normalization and explicit facet-role detection; protect known imagery from model reinterpretation and retain unknown text.
- [x] Compile groups and facets into parameterized Cypher with motif, category (1–2 taxonomy edges) and sibling paths; apply facets to every result.
- [x] Execute compiler through retrieval, preserving response/evidence. Pass raw input on frontend fallback for compound conditions.
- [x] Run server/browser tests and builds; verify real graph examples. Review changes and document limits.

Acceptance: bare 风筝 has no carrier filter and recalls all linked kite motifs plus labeled name matches; 唐代的龙纹样 retains 唐 and 龙 even offline; both lanes respect facets; invented entities/arbitrary Cypher are not executed; empty graph results never become stale cache matches.


## Verified outcome — 2026-09-27

- Root cause reproduced: model assigned 风筝 to both motif and carrier, reducing 42 imagery results to 1. Bare imagery now wins unless carrier language is explicit.
- Catalog-backed lexical recovery normalizes 唐/唐代/唐朝, consumes generic 图案/纹样 whole, and avoids treating 明亮/清新/鲜明/青铜色 or comparison objects as hard facets.
- Grounded model suggestions and application-owned Cypher compiler query CONTAINS_MOTIF, BELONGS_TO_DYNASTY, category paths of 1–2 HAS_SUBCLASS edges and sibling motifs. Query data is parameterized. Model-supplied Cypher is never executed.
- Known graph/category entities drive matching. Name fallback is explicitly reported as 名称匹配; unresolved partial words no longer count material/carrier-only matches as direct imagery hits.
- Graph candidates are fetched per query; catalog cache is used for vocabulary/name fallback and ranking context. Normalized filters are returned for frontend evidence and subsequent pages. Query failure is not replaced by stale catalog results.
- Dynasty policy: a canonical dynasty includes compound graph labels explicitly naming it (e.g. 唐、五代); simple dynasty terms do not automatically mean all ancestor/descendant periods. Results retain original labels. This is not historical inference beyond stored relations.

Live HTTP + Neo4j checks (scripts/verify-pattern-search.cjs):

| Query | Direct | Related |
| --- | ---: | ---: |
| 风筝 | 42 | 705 |
| 我想找一些和风筝有关的纹样 | 42 | 705 |
| 唐代的龙纹样 | 50 | 89 |
| 帮我找一些唐朝的龙纹图案 | 50 | 89 |
| 想找唐代有神兽感觉的纹样 | 133 | 0 |
| 风筝上的纹样 | 5 | 0 |
| 筝 (literal partial query) | 43 | 2758 |

All 42 kite results found by 筝 are covered by 风筝. Raw-input recovery retained 唐 and 龙, consecutive 10-item pages had no duplicate IDs, and native graph returned 87 nodes for its first result page. Related suggestions remain a separate lane and are not exact imagery claims.

Validation: server 46 suites / 416 tests; five affected frontend suites / 26 tests; server and frontend builds passed. Frontend build retains its existing large-chunk warning. Independent code review found two lexical-role issues; both were fixed and re-reviewed without remaining blockers. Browser UI was login-gated, so end-to-end verification used real HTTP endpoints plus component tests rather than a signed-in UI session. Local backend watch service was restarted on its existing port 3001 after a stalled rebuild.

Limitations: this supports the existing motif/category/facet schema and bounded graph paths, not unrestricted natural-language graph programs. Unknown concepts remain literal fallbacks; arbitrary negation, numeric/date comparisons and per-clause scoped facets are not introduced here. Database contents were not rewritten.
