// @vitest-environment happy-dom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import LayoutElementsPage from './LayoutElementsPage';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('./layout3d/Layout3DEditor', () => ({ default: ({modeSwitch}: {modeSwitch?: ReactNode}) => <div>三维工作台{modeSwitch}</div> }));
it('only exposes the 3D workspace without a mode switch', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => { root.render(<LayoutElementsPage />); });
  expect(host.querySelector('[aria-label="布局编辑模式"]')).toBeNull();
  // The editor must not receive the removed mode control either.
  expect(host.textContent).not.toContain('2D方案');
  await act(async () => root.unmount());
});
