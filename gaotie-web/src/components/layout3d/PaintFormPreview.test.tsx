import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultLayout3D, withPaintForm } from './layout3d';
import PaintFormPreview from './PaintFormPreview';

describe('paint form previews', () => {
  it('retains existing settings without mutating the saved configuration', () => {
    const source = defaultLayout3D(); source.windowBand.crossDoors = true;
    const next = withPaintForm(source, 'windowBand', 'long');
    expect(next.windowBand).toEqual({ mode: 'long', crossDoors: true });
    expect(source.windowBand.mode).toBe('none');
    expect(withPaintForm(source, 'skirt', 'true').skirt).toBe(true);
  });
  it('uses the legacy silhouette and embedded window masks for V1', () => {
    const source = defaultLayout3D(); source.model = 'generic-train-v1';
    const legacy = renderToStaticMarkup(<PaintFormPreview config={source} />);
    const reference = renderToStaticMarkup(<PaintFormPreview config={defaultLayout3D()} />);
    expect(legacy).not.toContain('data-reference-details');
    expect(reference).toContain('data-reference-details');
    expect(legacy).toContain('data-model="generic-train-v1"');
    expect(legacy).not.toEqual(reference);
  });
  it('keeps even the thin waist line visible in the thumbnail', () => {
    const config = defaultLayout3D();
    config.waist = { mode: 'single', width: 'thin', crossDoors: false };
    const markup = renderToStaticMarkup(<PaintFormPreview config={config} />);
    expect(markup.includes('fill="#30343b"')).toBe(true);
  });
});
