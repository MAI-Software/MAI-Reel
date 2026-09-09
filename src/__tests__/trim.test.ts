import { describe, expect, it } from 'vitest';
import { MIN_CLIP, clipAt, reorder, trimEnd, trimStart } from '../engine/trim';
import type { Clip, MediaAsset } from '../types';

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  assetId: 'a1',
  start: 0,
  duration: 3,
  srcIn: 2,
  effect: 'none',
  transition: 'cut',
  grade: 'none',
  ...over,
});

const video = (srcDuration: number): MediaAsset =>
  ({ id: 'a1', kind: 'video', name: 'v', url: '', el: {} as HTMLVideoElement, width: 1080, height: 1920, srcDuration }) as MediaAsset;

const image = (): MediaAsset =>
  ({ id: 'a1', kind: 'image', name: 'i', url: '', el: {} as HTMLImageElement, width: 1080, height: 1920, srcDuration: 0 }) as MediaAsset;

describe('trimStart', () => {
  it('walks the in point and keeps the out point', () => {
    const next = trimStart(clip(), video(30), 1);
    expect(next.srcIn).toBeCloseTo(3, 2);
    expect(next.duration).toBeCloseTo(2, 2);
  });

  it('never goes before the start of the footage', () => {
    const next = trimStart(clip({ srcIn: 0.5 }), video(30), -4);
    expect(next.srcIn).toBe(0);
    expect(next.duration).toBeCloseTo(3.5, 2);
  });

  it('never crosses the out point', () => {
    const next = trimStart(clip(), video(30), 10);
    expect(next.duration).toBeCloseTo(MIN_CLIP, 2);
    expect(next.srcIn + next.duration).toBeCloseTo(5, 2);
  });

  it('only shortens a still, which has nothing to walk through', () => {
    const next = trimStart(clip({ srcIn: 0 }), image(), 1);
    expect(next.srcIn).toBe(0);
    expect(next.duration).toBeCloseTo(2, 2);
  });
});

describe('trimEnd', () => {
  it('grows and shrinks the shot', () => {
    expect(trimEnd(clip(), video(30), 2).duration).toBeCloseTo(5, 2);
    expect(trimEnd(clip(), video(30), -1).duration).toBeCloseTo(2, 2);
  });

  it('stops at the end of the footage', () => {
    // in point at 2 s of a 6 s video leaves 4 s of room
    expect(trimEnd(clip(), video(6), 99).duration).toBeCloseTo(4, 2);
  });

  it('never goes under the minimum', () => {
    expect(trimEnd(clip(), video(30), -99).duration).toBeCloseTo(MIN_CLIP, 2);
  });

  it('lets a still be held for as long as the edit wants', () => {
    expect(trimEnd(clip({ srcIn: 0 }), image(), 20).duration).toBeCloseTo(23, 2);
  });
});

describe('reorder', () => {
  it('moves an item and keeps the rest in order', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when nothing moves', () => {
    expect(reorder(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(reorder(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('clipAt', () => {
  it('finds the shot covering an instant', () => {
    const clips = [clip({ id: 'a', start: 0, duration: 2 }), clip({ id: 'b', start: 2, duration: 3 })];
    expect(clipAt(clips, 0)).toBe(0);
    expect(clipAt(clips, 2.5)).toBe(1);
    // past the end it stays on the last shot instead of reporting nothing
    expect(clipAt(clips, 99)).toBe(1);
    expect(clipAt([], 1)).toBe(-1);
  });
});
