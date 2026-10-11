import { describe, expect, it } from 'vitest';
import { defaultLayout3D as newLayout, sampleTrainSurface, describeLayout3D, REGIONS } from './layout3d';
const defaultLayout3D = () => ({ ...newLayout(), model: 'generic-train-v1' as const });

describe('seven-region layout masks', () => {
  it('defaults to reference V2 and maps its actual doors independently of old door locations', () => {
    const c = newLayout(); c.windowBand = {mode:'long',crossDoors:false};
    expect(c.model).toBe('reference-train-v2');
    expect(sampleTrainSurface(c,1.15,2.25,1.5).paint).toBe('body');
    c.windowBand.crossDoors = true;
    expect(sampleTrainSurface(c,1.15,2.25,1.5).paint).toBe('windowBand');
    c.doors = 'white';
    expect(sampleTrainSurface(c,1.15,2.25,1.5).paint).toBe('body');
    expect(sampleTrainSurface(c,-8.8,2.25,1.5).region).toBe('doors');
  });
  it('starts white and exposes every region', () => {
    expect(REGIONS).toHaveLength(7);
    expect(sampleTrainSurface(defaultLayout3D(), 5, 1.5, 1.5).paint).toBe('body');
  });
  it('protects glazing even when a full door is painted', () => {
    const c = defaultLayout3D(); c.doors = 'full';
    expect(sampleTrainSurface(c, 1.6, 2.6, 1.5).paint).toBe('glass');
    expect(sampleTrainSurface(c, 1.6, 1.5, 1.5).paint).toBe('doors');
  });
  it('makes door crossing explicit and independent door white wins', () => {
    const c = defaultLayout3D(); c.windowBand.mode = 'long';
    expect(sampleTrainSurface(c, 1.6, 2.25, 1.5).paint).toBe('body');
    c.windowBand.crossDoors = true;
    expect(sampleTrainSurface(c, 1.6, 2.25, 1.5).paint).toBe('windowBand');
    c.doors = 'white';
    expect(sampleTrainSurface(c, 1.6, 2.25, 1.5).paint).toBe('body');
  });
  it('distinguishes narrow and wide lower/upper blocks and binary skirt', () => {
    const c = defaultLayout3D(); c.lowerSide = 'narrow'; c.roofSide = 'narrow';
    expect(sampleTrainSurface(c, 5, 1.3, 1.5).paint).toBe('lowerSide');
    expect(sampleTrainSurface(c, 5, 1.65, 1.5).paint).toBe('body');
    expect(sampleTrainSurface(c, 5, 3.12, 1.5).paint).toBe('body');
    c.lowerSide = 'wide'; c.roofSide = 'wide'; c.skirt = true;
    expect(sampleTrainSurface(c, 5, 1.65, 1.5).paint).toBe('lowerSide');
    expect(sampleTrainSurface(c, 5, 3.12, 1.5).paint).toBe('roofSide');
    expect(sampleTrainSurface(c, 5, 0.9, 1.5).paint).toBe('skirt');
  });
  it('renders a real gap between the two waist lines', () => {
    const c = defaultLayout3D(); c.waist.mode = 'double';
    expect(sampleTrainSurface(c, 5, 1.92, 1.5).paint).toBe('waist');
    expect(sampleTrainSurface(c, 5, 1.72, 1.5).paint).toBe('waist');
    expect(sampleTrainSurface(c, 5, 1.82, 1.5).paint).toBe('body');
  });
  it('keeps front-only paint off the side of the nose', () => {
    const c = defaultLayout3D(); c.nose = 'front';
    expect(sampleTrainSurface(c, -14.7, 1.45, 0.2).paint).toBe('nose');
    expect(sampleTrainSurface(c, -12, 1.5, 1).paint).toBe('body');
    c.nose = 'full';
    expect(sampleTrainSurface(c, -12, 1.5, 1).paint).toBe('nose');
  });
  it('describes short band without claiming full length', () => {
    const c = defaultLayout3D(); c.windowBand.mode = 'short';
    expect(describeLayout3D(c)).toContain('短带');
    expect(describeLayout3D(c)).toContain('裙板');
  });
  it('keeps nose paint below the windscreen and uses one-third upper coverage', () => {
    const c = defaultLayout3D(); c.nose = 'full'; c.roofSide = 'narrow';
    expect(sampleTrainSurface(c, -10.5, 3.625, 0).paint).not.toBe('nose');
    expect(sampleTrainSurface(c, -12.5, 2.3, 0).paint).toBe('nose');
    expect(sampleTrainSurface(c, 5, 3.45, 1).paint).toBe('roofSide');
    expect(sampleTrainSurface(c, 5, 3.4, 1).paint).toBe('body');
  });
});
