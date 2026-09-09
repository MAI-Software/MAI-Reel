import { describe, expect, it } from 'vitest';
import { overlayBox } from '../engine/render';
import { pick } from '../ui/framing';
import type { Overlay, Project } from '../types';

const overlay = (over: Partial<Overlay> = {}): Overlay => ({
  id: 'o1',
  assetId: 'a1',
  start: 0,
  duration: 4,
  srcIn: 0,
  x: 0.5,
  y: 0.5,
  scale: 0.4,
  ...over,
});

const project = (overlays: Overlay[]): Project =>
  ({ clips: [], texts: [], overlays, aspect: '9:16', fps: 30, mode: 'build', seed: 1, template: 'punch' }) as unknown as Project;

describe('overlayBox', () => {
  it('centres the box and keeps the source ratio', () => {
    const box = overlayBox(overlay(), 1000, 2000, 0.5);
    expect(box.w).toBe(400);
    expect(box.h).toBe(800);
    expect(box.x).toBe(300);
    expect(box.y).toBe(600);
  });

  it('scales with the canvas', () => {
    const small = overlayBox(overlay(), 500, 1000, 1);
    const big = overlayBox(overlay(), 1000, 2000, 1);
    expect(big.w).toBe(small.w * 2);
  });
});

describe('pick', () => {
  const ratio = () => 1; // a square source keeps the maths obvious

  it('finds the layer under the point', () => {
    const found = pick(project([overlay()]), ratio, 1, 0.5, 0.5);
    expect(found?.id).toBe('o1');
  });

  it('ignores a point outside every layer', () => {
    expect(pick(project([overlay()]), ratio, 1, 0.05, 0.05)).toBeNull();
  });

  it('ignores layers that are not on screen at this instant', () => {
    expect(pick(project([overlay({ start: 5, duration: 2 })]), ratio, 1, 0.5, 0.5)).toBeNull();
  });

  it('returns the topmost layer when two overlap', () => {
    const found = pick(project([overlay(), overlay({ id: 'o2' })]), ratio, 1, 0.5, 0.5);
    expect(found?.id).toBe('o2');
  });
});
