# Color studio UI

## Latest approved revision: wide dialogue + stacked results
User approved third preview. Implemented a 42/58 two-column desktop workspace: wide dialogue with no avatars, right-side horizontal image board, horizontal palette proposal and saved shelf stacked vertically. Matching subtle white rounded surfaces restored. Palette name and save live in the proposal heading. Extra images remain available by horizontal scrolling; all existing operations preserved.

Revision verification: full 45 files / 238 tests and build; browser checks at 1440px and 390px, no horizontal page overflow. No explicit search/generation calls made for verification. Viewport override reset.

Approved visual: second open, spacious preview. No user/robot icons in dialogue.

- Retain existing color studio state/API contracts: conversation, search/upload images, up to six selections, extraction, palette save/select, board save/load, failure/retry and cancellation.
- Use global left module nav, charcoal/white/cool-gray/lime palette. Remove promotional header and forced next-step action.
- Three open desktop zones: conversation; image board; palette proposal. Use fine separators, no surrounding large cards. Saved palettes below results, compact saved board controls retained.
- Context and explanation become collapsed disclosures. Messages have subtle borders, user bubble gray, no avatars.
- Two image columns, unobtrusive selection controls and source links. Large palette strip with concise color rows; compact strips in saved shelf.
- Narrow screens reflow into readable sections; messages remain independently scrollable on desktop. Keep keyboard labels/focus and visible errors.
- Test first: title/no forced next step, hidden context, no avatar, upload/extract/save and existing regressions. Run full suite/build and inspect browser without paid generation or project writes.

## Verification
- Open workspace, shared sidebar, no avatar dialogue, compact palette shelf and folded explanations implemented; service/state contracts retained.
- 45 frontend test files / 238 tests passed. Build passed with pre-existing Three.js chunk-size warning. ColorConfigPage lint and diff whitespace checks passed.
- Browser checked actual existing empty-result state at 1440px and 390px: no horizontal overflow, responsive zones and no message avatars. Temporary viewport reset.
- Palette creation/save, chosen reference, collapsed rationale and image error/retry verified via mocked service component tests. No manual paid search/generation requests invoked for preview testing; existing page auto-search/autosave behavior was not changed.
