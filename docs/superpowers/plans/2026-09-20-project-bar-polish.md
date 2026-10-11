# Project bar and control polish

Approved by user on 2026-09-20. Preserve existing data and dirty working tree; no commits or deployment.

## Design and implementation
- Remove LayoutElementsPage mode switch and always render Layout3DEditor. Keep legacy data support, with no legacy UI entry.
- Replace ProjectBar native select with a custom rounded project menu. Selected option uses lime tint and check mark; buttons retain native keyboard activation. Arrow keys navigate options, Escape closes and restores focus, outside click dismisses.
- Double-click current name (or F2) starts inline rename. Enter submits, Escape cancels; invalid blank names and server failures retain input with an accessible message. No rename icon. Lock project switching during rename to avoid cross-project writes. Do not save on blur.
- Style header controls in neutral white/gray and black with 12px radii. Cancel generation uses the same 42px height/12px radius as AI conversion, with neutral hover rather than red.

## Verification steps
1. Add failing project-menu and inline-rename tests, including Escape, blank names, failure/retry and IME Enter. Add wrapper test asserting no 2D entry.
2. Implement ProjectBar.tsx and scoped ProjectBar.css, LayoutElementsPage wrapper and CanvasWorkspace.css styles.
3. Run focused tests, then full frontend suite with VITE_API_BASE_URL=http://localhost:3000 and npm run build.
4. Inspect menu and rename entry in browser without modifying user project data. Confirm layout no longer exposes mode switch. Review changes and record results.

## Results
- Implemented all approved changes. Legacy UI entry removed; stored layout data preserved.
- 45 frontend test files / 237 tests pass; production build passes, with existing 590 KB Three.js chunk warning. ProjectBar scoped lint passes.
- Browser confirmed floating menu renders above the 3D stage, selected row styling, double-click inline editing and Escape cancellation. No rename icon or layout mode switch remains; no horizontal overflow at the current 877px viewport.
- Tests cover rename success/error, blank input, IME Enter, menu selection/arrows/Escape and legacy-entry removal. Cancel styling was inspected in CSS; no paid image-generation request was triggered for testing.
- No project data renamed/deleted/created during browser checks.
