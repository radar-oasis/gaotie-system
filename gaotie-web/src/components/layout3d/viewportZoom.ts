export const MIN_VIEWPORT_ZOOM = .6;
export const MAX_VIEWPORT_ZOOM = 5;
export function nextViewportZoom(current: number, direction: 1 | -1): number {
  return Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, current * 1.2 ** direction));
}
export function viewportZoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}
