# Train surface and layout controls refinement

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated geometry work and review; preserve the existing dirty working tree, do not stage or commit unrelated work.

**Goal:** Implement the user-approved four refinements: region terminology, visual form selection, smooth train surfaces and contour-following painting, and consistent generation/remove UI.

**Architecture:** Keep version-1 configuration keys and both model identifiers compatible. Improve the reference model and its shared surface sampler; use that sampler for option previews so their coverage agrees with rendering. UI-only fixes must not change generation requests or selected intent data.

**Tech Stack:** React, TypeScript, Three.js, Vitest, CSS.

## Approved scope

- Heading: 车体分区. Labels: 流线型头部、车顶过渡区、车窗带、窗下侧墙、车门、裙板. Retain existing 腰线 function.
- Thumbnail-only paint choices with accessible button names, selected outline and checkmark.
- Continuous rounded reference head, curved window overlays without coarse flat triangulation, sealed front. Curved paint coverage joins the roof/window-underbody boundaries. Preserve glazing and lamps.
- Gray/white generation placeholder, charcoal typography, lime status accent; geometrically centered remove cross.
- This is a design reference model, not engineering geometry. Do not replace it with an external asset or modify saved records.

## Task 1 — reference geometry and sampler

Files: layout3d/referenceTrainProfile.ts, referenceTrainGeometry.ts, layout3d.ts and focused geometry/surface tests.
- [x] Add regression tests for finite smooth geometry, sealed front, conforming window faces, contour-dependent upper/lower paint boundaries and transition continuity.
- [x] Run focused tests and observe the failures before modifying production code.
- [x] Repair surface construction and shared coverage calculations, keeping config enums unchanged.
- [x] Run focused tests; inspect side, front and head-detail views in browser.

## Task 2 — layout option UI

Files: layout3d/Layout3DEditor.tsx, Layout3DEditor.css, new PaintFormPreview.tsx, related tests.
- [x] Test accessible thumbnail controls, all seven regions, selection and saved config compatibility.
- [x] Build previews using sampleTrainSurface on a consistent side projection, with white silhouette and dark coverage, no visible form names.
- [x] Rename labels and heading, selected charcoal outline/lime checkmark, keyboard focus.
- [x] Run editor tests, preserving save/export behavior.

## Task 3 — existing workspace details

Files: SelectedTagItem.tsx, PatternSearch.css, superCanvas/SuperCanvasPage.tsx, SuperCanvasPage.css and tests.
- [x] Test remove control and generation placeholder semantics first.
- [x] Replace font-glyph remove cross with CSS geometry; neutralize placeholder border/text/spinner including selected state.
- [x] Keep generated image output and cancellation behavior unchanged.

## Task 4 — verification and review

- [x] Run VITE_API_BASE_URL=http://localhost:3000 npm test in gaotie-web.
- [x] Run npm run build in gaotie-web.
- [x] Review spec coverage then code quality; address concrete findings.
- [x] Inspect actual local page, multiple train views, option selection, accessible focus and narrow layout. No paid image-generation requests.
- [x] Record verification results and remaining limitations.

## Implementation and verification record

- Implemented all four approved refinements in the existing working tree. Saved configuration schema and generic V1 sampling remain compatible; no database migration or saved-record rewrite.
- Reference shell now closes at a rounded pole. Side glazing and outlines are subdivided/reprojected onto the actual shell. Existing bogie openings remain intentional.
- Shared moving paint edges join upper coverage to the roof and lower coverage to the below-window sidewall. Narrow neighboring options use narrow endpoints. Paired contour samples reduce diagonal color stepping.
- Preview controls use the corresponding V1/V2 shell and sampler, preserve adjacent choices, and retain thin waist lines. Visible labels are removed; accessible names and focus outlines remain.
- Generation placeholder uses neutral gray/white, charcoal and lime, with reduced-motion handling. Selected intent remove cross uses centered CSS strokes instead of a font glyph.
- Spec review caught and corrected abrupt aft transitions, narrow-option discontinuities and V1 thumbnail mismatch.
- Frontend full suite: 40 files / 223 tests passed. Production build passed with the existing >500 kB Three.js chunk warning.
- Browser checks: head detail, side and front views, form switching, visible keyboard focus, 768 px layout without horizontal overflow, no console errors. No paid generation was requested; generation lifecycle and remove interactions were checked with mocked tests.
- Limitations: this remains a design-reference model, not engineering geometry. Thumbnail graphics simplify non-paint detail. Earlier saved raster exports are not regenerated automatically; save a new version to export the improved model.
