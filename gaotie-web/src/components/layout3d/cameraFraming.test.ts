import { expect, it } from 'vitest';
import { workspaceFrameOffset, workspaceFrameScale } from './cameraFraming';

it('fits side and top views between floating panels only in the desktop workspace', () => {
  expect(workspaceFrameScale('side', 2.2, true)).toBe(1.75);
  expect(workspaceFrameScale('top', 2.2, true)).toBe(1.75);
  expect(workspaceFrameScale('side', 1.3, true)).toBe(1);
  expect(workspaceFrameScale('side', 2.2, false)).toBe(1);
});

it('reserves upper space for floating cards without changing exports or narrow layouts', () => {
  expect(workspaceFrameOffset('perspective', 12, 2.2, true)).toBeCloseTo(4.8);
  expect(workspaceFrameOffset('perspective', 12, 2.2, false)).toBe(0);
  expect(workspaceFrameOffset('perspective', 12, 1.3, true)).toBe(0);
  expect(workspaceFrameOffset('front', 3.4, 2, true)).toBe(0);
});
