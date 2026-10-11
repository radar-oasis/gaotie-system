import type {
  CanvasPatternReference,
  CanvasPoint,
  ImageCrop,
  ImageLayer,
} from './types';

const MAX_IMAGE_SIDE = 240;
const MIN_IMAGE_SIDE = 24;
const MIN_VISIBLE_CROP_RATIO = 0.05;
const roundCropValue = (value: number): number => Number(value.toFixed(4));

type CreateImageLayerInput = {
  id: string;
  name: string;
  src: string;
  dropPoint: CanvasPoint;
  naturalWidth: number;
  naturalHeight: number;
  sourcePattern?: CanvasPatternReference;
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

export type ImageCropEdge = keyof ImageCrop;

// Controls describe visible edges; stored crop values always refer to the source image.
export const getSourceCropEdge = (layer: ImageLayer, edge: ImageCropEdge): ImageCropEdge => {
  if (layer.flipX && (edge === 'left' || edge === 'right')) return edge === 'left' ? 'right' : 'left';
  if (layer.flipY && (edge === 'top' || edge === 'bottom')) return edge === 'top' ? 'bottom' : 'top';
  return edge;
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

const validateZoom = (zoom: number): void => {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error('Canvas zoom must be a finite positive number.');
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
  sourcePattern,
}: CreateImageLayerInput): ImageLayer => {
  validateNaturalDimensions(naturalWidth, naturalHeight);

  const scale = getInitialScale(naturalWidth, naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;

  const layer: ImageLayer = {
    id,
    type: 'image',
    name,
    src,
    x: dropPoint.x - width / 2,
    y: dropPoint.y - height / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    crop: createDefaultImageCrop(),
  };

  if (sourcePattern) {
    layer.sourcePattern = sourcePattern;
  }

  return layer;
};

export const createDefaultImageCrop = (): ImageCrop => ({
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

export const getImageLayerCrop = (layer: ImageLayer): ImageCrop => ({
  ...createDefaultImageCrop(),
  ...layer.crop,
});

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

export const rotateImageLayer = (
  layer: ImageLayer,
  rotation: number,
): ImageLayer => {
  if (!Number.isFinite(rotation)) {
    throw new Error('Image rotation must be a finite number.');
  }

  return {
    ...layer,
    rotation,
  };
};

export const resizeImageLayer = (
  layer: ImageLayer,
  size: { width: number; height: number },
): ImageLayer => {
  validateNaturalDimensions(size.width, size.height);

  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const width = Math.max(MIN_IMAGE_SIDE, size.width);
  const height = Math.max(MIN_IMAGE_SIDE, size.height);

  return {
    ...layer,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
};

export const updateImageLayerCrop = (
  layer: ImageLayer,
  edge: ImageCropEdge,
  value: number,
): ImageLayer => {
  if (!Number.isFinite(value)) {
    throw new Error('Image crop must be a finite number.');
  }

  const crop = getImageLayerCrop(layer);
  const nextCrop = { ...crop };
  const boundedValue = Math.min(1 - MIN_VISIBLE_CROP_RATIO, Math.max(0, value));

  if (edge === 'left') {
    nextCrop.left = roundCropValue(Math.min(
      boundedValue,
      1 - MIN_VISIBLE_CROP_RATIO - crop.right,
    ));
  } else if (edge === 'right') {
    nextCrop.right = roundCropValue(Math.min(
      boundedValue,
      1 - MIN_VISIBLE_CROP_RATIO - crop.left,
    ));
  } else if (edge === 'top') {
    nextCrop.top = roundCropValue(Math.min(
      boundedValue,
      1 - MIN_VISIBLE_CROP_RATIO - crop.bottom,
    ));
  } else {
    nextCrop.bottom = roundCropValue(Math.min(
      boundedValue,
      1 - MIN_VISIBLE_CROP_RATIO - crop.top,
    ));
  }

  const fullWidth = layer.width / (1 - crop.left - crop.right);
  const fullHeight = layer.height / (1 - crop.top - crop.bottom);
  const width = fullWidth * (1 - nextCrop.left - nextCrop.right);
  const height = fullHeight * (1 - nextCrop.top - nextCrop.bottom);
  const dx = fullWidth * (nextCrop.left - crop.left - nextCrop.right + crop.right) / 2 * (layer.flipX ? -1 : 1);
  const dy = fullHeight * (nextCrop.top - crop.top - nextCrop.bottom + crop.bottom) / 2 * (layer.flipY ? -1 : 1);
  const angle = layer.rotation * Math.PI / 180;
  return {
    ...layer,
    x: layer.x + layer.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - width / 2,
    y: layer.y + layer.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - height / 2,
    width,
    height,
    crop: nextCrop,
  };
};

export const cropLayerFromPointer = (
  layer: ImageLayer,
  handle: string,
  start: CanvasPoint,
  current: CanvasPoint,
): ImageLayer => {
  const crop = getImageLayerCrop(layer);
  const angle = layer.rotation * Math.PI / 180;
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
  const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const deltaX = localX * (1 - crop.left - crop.right) / layer.width;
  const deltaY = localY * (1 - crop.top - crop.bottom) / layer.height;
  let result = layer;
  if (handle.includes('w')) {
    const edge = layer.flipX ? 'right' : 'left';
    result = updateImageLayerCrop(result, edge, crop[edge] + deltaX);
  }
  if (handle.includes('e')) {
    const edge = layer.flipX ? 'left' : 'right';
    result = updateImageLayerCrop(result, edge, crop[edge] - deltaX);
  }
  if (handle.includes('n')) {
    const edge = layer.flipY ? 'bottom' : 'top';
    result = updateImageLayerCrop(result, edge, crop[edge] + deltaY);
  }
  if (handle.includes('s')) {
    const edge = layer.flipY ? 'top' : 'bottom';
    result = updateImageLayerCrop(result, edge, crop[edge] - deltaY);
  }
  return result;
};

export const resolveDropPoint = ({
  clientX,
  clientY,
  canvasRect,
  pan,
  zoom,
}: ResolveDropPointInput): CanvasPoint => {
  validateZoom(zoom);

  return {
    x: (clientX - canvasRect.left - pan.x) / zoom,
    y: (clientY - canvasRect.top - pan.y) / zoom,
  };
};
