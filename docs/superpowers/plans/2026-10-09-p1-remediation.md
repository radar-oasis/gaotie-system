# P1 remediation, 2026-10-09

Approved scope: the seven P1 findings in `output/e2e-20261009/issues.json`, requested by the user after the real end-to-end audit. Preserve existing work; do not commit or deploy. Baseline source backup: `output/p1-20261009/source-before.tar.gz`.

## Implementation sequence

1. F01 + F07 — persist selected references in project state/snapshots, migrate old snapshots, reconcile only removed materials; scope proposal history by project and guard late responses. Exclude archive indexes from new project snapshots. Test remount, restore, project switching and ownership.
2. F02 — configure the case graph connection, bounded dependency checks and startup preflight, actionable unavailable state with an explicit skip route. Verify valid case results against the available dataset and clearly distinguish fallback data if used.
3. F03 + F04 + F06 — project palette/color facts; preserve original/generated/cropped/favorite identities; save stable proposal lineage and expose graph relations and conversation queries. Test source types, crop distinction, color reverse lookup and renamed/reordered parent archives.
4. F05 — distinguish full regeneration from controlled local editing; normalized edit region, deterministic outside-region protection, preview/acceptance checks for layout constraints. Test invalid regions, protected pixels, and workflow states. Model compliance remains subject to visual review, never inferred from prompts.
5. Review each slice for acceptance and quality; run relevant tests, then complete frontend/backend suites and builds. Restart local services, verify the real UI and API workflow, record results and remaining limitations in the remediation report.

## Completion criteria

- Every P1 has a code change, meaningful regression coverage, and a recorded verification outcome.
- Current project references survive navigation/refresh and archives do not leak across project workspaces.
- Case dependency failure responds promptly and successful results can be selected.
- Palette, provenance and version relationships can be retrieved through the graph, not just stored in opaque JSON.
- Local edit preserves pixels outside the chosen region; layout review is explicit before acceptance/archive.
- No claim that generative layout compliance has been solved without image evidence.

## Progress

- [x] Read findings and approve implementation scope from user's instruction.
- [x] Back up affected source tree.
- [x] F01/F07
- [x] F02
- [x] F03/F04/F06
- [x] F05
- [x] Integrated tests and walkthrough

## Verified outcome

All seven P1 implementations are delivered. Frontend: 59 files / 312 tests with explicit API test origin; backend: 60 suites / 510 tests. Both builds passed. Real V3 local edit preserved all pixels outside the selected region and its archived pixels match generated output. Case search and palette/version graph queries were verified in the UI. See `output/p1-20261009/report.html`. Historical missing provenance remains unknown; a single live generation does not establish model-wide layout reliability; P2 test-environment isolation remains open.
