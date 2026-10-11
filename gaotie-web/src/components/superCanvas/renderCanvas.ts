import type { CanvasLayer } from './types';
import { getImageLayerCrop } from './layerMath';

export type CaptureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

export const exportLayersToPng = async (
  layers: CanvasLayer[],
  rect: CaptureRect,
  options: { transparent?: boolean } = {},
): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
  }

  if (!options.transparent) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.translate(-rect.x, -rect.y);

  for (const layer of layers) {
    if (layer.type === 'stroke') {
      const [firstPoint, ...remainingPoints] = layer.points;

      if (!firstPoint) {
        continue;
      }

      context.strokeStyle = layer.color;
      context.lineWidth = layer.size;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(firstPoint.x, firstPoint.y);

      for (const point of remainingPoints) {
        context.lineTo(point.x, point.y);
      }

      context.stroke();
      continue;
    }

    if (layer.type === 'generation-placeholder') {
      continue;
    }

    const image = await loadImage(layer.src);
    const crop = getImageLayerCrop(layer);
    const naturalWidth = image.naturalWidth || layer.width;
    const naturalHeight = image.naturalHeight || layer.height;
    const sourceX = naturalWidth * crop.left;
    const sourceY = naturalHeight * crop.top;
    const sourceWidth = naturalWidth * (1 - crop.left - crop.right);
    const sourceHeight = naturalHeight * (1 - crop.top - crop.bottom);

    context.save();
    context.globalAlpha = layer.opacity;
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    if (layer.flipX || layer.flipY) {
      context.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    }
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      -layer.width / 2,
      -layer.height / 2,
      layer.width,
      layer.height,
    );
    context.restore();
    context.globalAlpha = 1;
  }

  return canvas.toDataURL('image/png');
};
