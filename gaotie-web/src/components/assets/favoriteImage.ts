import type { ImageLayer } from "../superCanvas/types";
import { exportLayersToPng } from "../superCanvas/renderCanvas";
import { getImageLayerCrop } from "../superCanvas/layerMath";
export async function exportFavorite(layer: ImageLayer): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片读取失败，请确认原图仍可访问"));
    img.src = layer.src;
  });
  const crop = getImageLayerCrop(layer);
  const angle = (layer.rotation * Math.PI) / 180;
  const width =
    Math.abs(layer.width * Math.cos(angle)) +
    Math.abs(layer.height * Math.sin(angle));
  const height =
    Math.abs(layer.width * Math.sin(angle)) +
    Math.abs(layer.height * Math.cos(angle));
  // Preserve source resolution instead of saving the small canvas preview.
  const scale = Math.min(
    (image.naturalWidth * (1 - crop.left - crop.right)) / layer.width,
    4096 / Math.max(width, height),
  );
  return exportLayersToPng(
    [
      {
        ...layer,
        x: 0,
        y: 0,
        width: layer.width * scale,
        height: layer.height * scale,
      },
    ],
    {
      x: ((layer.width - width) * scale) / 2,
      y: ((layer.height - height) * scale) / 2,
      width: Math.ceil(width * scale),
      height: Math.ceil(height * scale),
    },
    { transparent: true },
  );
}
