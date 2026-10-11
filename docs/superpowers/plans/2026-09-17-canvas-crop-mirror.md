# Canvas crop and mirror implementation plan

用户已确认：非破坏性裁剪，保留图片缩放；水平和垂直镜像；画布与导出一致。本轮直接实施，不改动已有无关工作、不提交。

Architecture: ImageLayer width/height remain visible bounds. Derive full displayed source dimensions by dividing by retained crop fraction. Updating crop changes bounds and rotates the local center offset into world coordinates, keeping source pixels stationary. Mirror flags reflect the cropped region around its center. Pointer deltas are inverse-rotated, mapped to source edges for mirrored layers, and normalized by full source dimensions.

Tech: React, TypeScript, CSS transforms, Canvas2D, Vitest.

- [x] Add regression tests for bounds/scale invariance, rotated crop, repeated crop, mirrored crop, export and toggle UI; run failing tests.
- [x] Update layerMath.ts crop geometry and export pointer helper; add optional flipX/flipY to types.ts.
- [x] Update SuperCanvasPage.tsx to use shared pointer math and two quick edit buttons. Reflect clipping wrapper, not its controls. Export uses Canvas2D scale after rotation.
- [x] Run related tests, complete frontend suite and build. Inspect diff and record verification.

Verification: Regression tests initially reproduced unchanged crop bounds (200 instead of150), missing mirror buttons/export transform, and incorrect mirrored sidebar labels. Targeted canvas and snapshot suites pass after implementation. Full suite ran159 passing tests but colorConfig/colorStudio.test.ts failed to load its missing colorStudio module; full tsc build also blocked by the same unrelated in-progress file. No colorConfig changes made. Targeted math/export lint and Vite bundle verified separately. No claim of full-build success or browser visual acceptance.

Key acceptance: 200x100 at (10,20), crop left 25% => 150x100 at (60,20), not 200x100. At rotation 90deg center moves along world Y by25. A second right crop by20 canvas units must cut20 units regardless of prior crop. Toggling twice restores appearance. Existing snapshots without flags render unchanged.
