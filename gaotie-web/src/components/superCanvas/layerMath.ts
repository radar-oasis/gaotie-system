import type { CanvasPoint, ImageLayer } from './types';

const MAX_IMAGE_SIDE = 240;
const MIN_IMAGE_SIDE = 24;

type CreateImageLayerInput = {
  id: string;
  name: string;
  src: string;
  dropPoint: CanvasPoint;
  naturalWidth: number;
  naturalHeight: number;
};

type LayerBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ResolveDropPointInput = {
  clientX: number;
  clientY: number;
  canvasRect: Pick<DOMRect, 'left' | 'top'>;
  pan: CanvasPoint;
  zoom: number;
};

const validateNaturalDimensions = (
  naturalWidth: number,
  naturalHeight: number,
): void => {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    throw new Error('Image natural dimensions must be finite positive numbers.');
  }
};

const validateScale = (scale: number): void => {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('Image scale must be a finite positive number.');
  }
};

const getInitialScale = (naturalWidth: number, naturalHeight: number): number => {
  const maxSide = Math.max(naturalWidth, naturalHeight);

  return Math.min(1, MAX_IMAGE_SIDE / maxSide);
};

export const createImageLayer = ({
  id,
  name,
  src,
  dropPoint,
  naturalWidth,
  naturalHeight,
}: CreateImageLayerInput): ImageLayer => {
  validateNaturalDimensions(naturalWidth, naturalHeight);

  const scale = getInitialScale(naturalWidth, naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  return {
    id,
    type: 'image',
    name,
    src,
    x: dropPoint.x - width / 2,
    y: dropPoint.y - height / 2,
    width,
    height,
    naturalWidth,
    naturalHeight,
  };
};

export const getLayerBounds = (layer: ImageLayer): LayerBounds => ({
  left: Math.round(layer.x),
  top: Math.round(layer.y),
  right: Math.round(layer.x + layer.width),
  bottom: Math.round(layer.y + layer.height),
});

export const scaleImageLayer = (
  layer: ImageLayer,
  scale: number,
): ImageLayer => {
  validateScale(scale);

  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const requestedWidth = layer.width * scale;
  const requestedHeight = layer.height * scale;
  const smallestSide = Math.min(requestedWidth, requestedHeight);
  const minimumScale =
    smallestSide > 0 && smallestSide < MIN_IMAGE_SIDE
      ? MIN_IMAGE_SIDE / smallestSide
      : 1;
  const width = requestedWidth * minimumScale;
  const height = requestedHeight * minimumScale;

  return {
    ...layer,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
};

export const resolveDropPoint = ({
  clientX,
  clientY,
  canvasRect,
  pan,
  zoom,
}: ResolveDropPointInput): CanvasPoint => {
  const safeZoom = zoom || 1;

  return {
    x: (clientX - canvasRect.left - pan.x) / safeZoom,
    y: (clientY - canvasRect.top - pan.y) / safeZoom,
  };
};
