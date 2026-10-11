# Layout workspace UI implementation plan

> Use subagent-driven-development for the editor composition, with parent implementing independent shell/viewport controls and browser checks. Preserve the dirty working tree; no commits or data cleanup.

**Goal:** Implement the user-approved reference layout as a functional UI, retaining refined geometry and previous terminology/thumbnail decisions.

**Architecture:** Existing global left nav is extended to layout. A single stage holds TrainViewport behind floating region/options cards. Compact title/mode header, centered camera controls and top-right draft/new-model actions. Bottom version tray contains name, save, and horizontally scrollable saved previews. Preserve network contracts, model masks, save/export and legacy mode.

**Tech stack:** React, Three.js, CSS, Vitest.

## Tasks
All four tasks below completed and verified on 2026-09-20 (details in verification record).
- [ ] Editor composition: add regression tests for floating stage, bottom version tray and preserved save/load/errors. Refactor LayoutElementsPage mode header and Layout3DEditor view markup/CSS; remove promotional text. Keep 2D functional and name/status accessible; no decorative nonfunctional controls. Regions use soft lime selected row. Retain no visible form names, charcoal/white/lime palette.
- [ ] Shell: test layout uses existing seven-item left navigation. Extend App shell class conditions and TopNav branch, replace layout icon with an appropriate train outline.
- [ ] Viewport: add real zoom +/-/percentage/reset controls driven by OrbitControls state; verify via tests and browser. Make viewport occupy stage, position existing camera controls at top, retain picking/export and refined model. Avoid simulated zoom values or exporting selection tint.
- [ ] Verification: run full frontend tests/build; check desktop/narrow-screen overlap, tab focus, camera presets, zoom, options, version empty/loading/error states and legacy mode. Review spec and code quality. No paid generation or destructive changes.

## Visual decisions
- Reference image guides structure, not exact model fidelity. Use actual live 3D model, not a replacement screenshot.
- Keep selected regions and option cards visually floating above a continuous neutral stage. On narrow screens cards reflow to avoid covering the train.
- Preserve seven regions including waist and all existing modules, especially case search.
- Version save stays manual; no forced next-step navigation. Only existing operations exposed.

## Verification record
- Full frontend suite: 44 files / 231 tests passed. Production build passed; existing Three.js bundle size warning remains (~590 KB).
- Scoped lint passed for viewport, scene, framing, zoom and navigation implementation.
- Browser: 1440×900 desktop composition inspected; actual zoom 100→120→reset100 verified. Region selection, thumbnail option, side preset and legacy 2D round-trip verified without saving user data.
- Side/top workspace framing now reserves width for floating controls; export framing is unchanged. Side-view overlap was reproduced and corrected.
- Responsive checks at 768×900 and 396×850 showed no document/editor horizontal overflow. Floating cards reflow below the stage. Temporary viewport override reset.
- Independent spec and quality reviews approved the UI scope. Existing save-on-unmount request lifecycle concern remains outside this visual refactor; no new save behavior introduced.
- No paid generation, database cleanup or saved-version writes performed. Existing model geometry retained.
