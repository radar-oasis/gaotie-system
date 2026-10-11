import { describe, expect, it } from 'vitest';
import { createTrainScene } from './trainScene';

describe('train studio scene', () => {
  it('shows a subdued ground grid only in the interactive workspace', () => {
    const live = createTrainScene(true);
    expect(live.getObjectByName('workspace-ground')).toBeDefined();
    expect(live.getObjectByName('workspace-ground')!.position.y).toBeLessThan(0);
    expect(createTrainScene().getObjectByName('workspace-ground')).toBeUndefined();
  });
});
