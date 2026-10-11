/** Shift only the wide interactive perspective below the floating upper cards. */
export function workspaceFrameOffset(view: string, halfHeight: number, aspect: number, interactive: boolean): number {
  return interactive && view === 'perspective' && aspect >= 1.7 ? Math.min(5, halfHeight * .4) : 0;
}
// Keep full-length orthographic views clear of desktop floating controls.
export function workspaceFrameScale(view: string, aspect: number, interactive: boolean) {
  return interactive && aspect >= 1.7 && (view === 'side' || view === 'top') ? 1.75 : 1;
}
