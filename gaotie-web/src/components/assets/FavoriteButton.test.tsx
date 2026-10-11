// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import FavoriteButton from "./FavoriteButton";
import { favoriteImage } from "./assetApi";
vi.mock("./assetApi", () => ({ favoriteImage: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each(['project', 'unmount'])('ignores a saved response after %s changes the view', async mode => {
  const host = document.createElement('div'), root = createRoot(host);
  const status = vi.fn(), saved = vi.fn();
  let finish!: (asset: Awaited<ReturnType<typeof favoriteImage>>) => void;
  vi.mocked(favoriteImage).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const render = (projectId: string) => root.render(<FavoriteButton projectId={projectId} name="龙纹" getImage={async () => 'data:image/png;base64,abc'} onStatus={status} onSaved={saved} />);
  await act(async () => render('a'));
  await act(async () => host.querySelector('button')!.click());
  await act(async () => mode === 'project' ? render('b') : root.unmount());
  await act(async () => finish({ id: 'old', name: '龙纹-9' } as never));
  try {
    expect(saved).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    if (mode === 'project') {
      expect(host.querySelector('button')!.disabled).toBe(false);
      expect(host.querySelector('button')!.getAttribute('aria-pressed')).toBe('false');
    }
  } finally { if (mode === 'project') await act(async () => root.unmount()); }
});
it("does not report a saved favorite until persistence succeeds and allows retry after failure", async () => {
  const host = document.createElement("div"),
    root = createRoot(host),
    status = vi.fn(),
    saved = vi.fn();
  vi.mocked(favoriteImage)
    .mockRejectedValueOnce(new Error("保存失败"))
    .mockResolvedValueOnce({ id: "a", name: "完整龙纹-7" } as never);
  await act(async () =>
    root.render(
      <FavoriteButton
        projectId="p"
        name="龙纹"
        getImage={async () => "data:image/png;base64,abc"}
        onStatus={status}
        onSaved={saved}
      />,
    ),
  );
  const button = host.querySelector("button")!;
  await act(async () => button.click());
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(status).toHaveBeenLastCalledWith("保存失败");
  expect(saved).not.toHaveBeenCalled();
  await act(async () => button.click());
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: "完整龙纹-7" }));
  expect(favoriteImage).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectId: "p", name: "龙纹" }),
  );
  await act(async () => root.unmount());
});
