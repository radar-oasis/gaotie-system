// @vitest-environment happy-dom
import { expect, it, vi, afterEach } from "vitest";
import { exportFavorite } from "./favoriteImage";
import { exportLayersToPng } from "../superCanvas/renderCanvas";
vi.mock("../superCanvas/renderCanvas", () => ({
  exportLayersToPng: vi.fn().mockResolvedValue("png"),
}));
afterEach(() => vi.unstubAllGlobals());
it("exports an edited favorite at source resolution with transparency and rotated bounds", async () => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 1200;
      naturalHeight = 800;
      crossOrigin = "";
      onload?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  await exportFavorite({
    id: "ai-1",
    type: "image",
    generated: true,
    name: "云纹",
    src: "/img.png",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    rotation: 90,
    opacity: 0.8,
    flipX: true,
  });
  expect(exportLayersToPng).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        width: 1200,
        height: 800,
        rotation: 90,
        flipX: true,
        opacity: 0.8,
      }),
    ],
    expect.objectContaining({ width: 801, height: 1200 }),
    { transparent: true },
  );
});
