import type { CanvasLayer } from './types';

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
): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
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

    const image = await loadImage(layer.src);
    context.globalAlpha = layer.opacity;
    context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
    context.globalAlpha = 1;
  }

  return canvas.toDataURL('image/png');
};
