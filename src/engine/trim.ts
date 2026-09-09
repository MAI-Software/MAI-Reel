import type { Clip, MediaAsset } from '../types';

/** No shot may be shorter than this: below it a cut reads as a glitch, not as an edit. */
export const MIN_CLIP = 0.4;

export interface TrimResult {
  srcIn: number;
  duration: number;
}

function sourceLength(asset: MediaAsset | undefined): number {
  // a still can be held for as long as the edit wants; a video cannot outlive its own footage
  if (!asset || asset.kind !== 'video') return Number.POSITIVE_INFINITY;
  return asset.srcDuration || Number.POSITIVE_INFINITY;
}

/**
 * Drags the left edge. On a video this walks the in point through the footage and keeps the
 * out point where it was; on a still there is nothing to walk, so it only shortens the shot.
 */
export function trimStart(clip: Clip, asset: MediaAsset | undefined, delta: number): TrimResult {
  const total = sourceLength(asset);
  const out = clip.srcIn + clip.duration;

  if (!Number.isFinite(total)) {
    return { srcIn: clip.srcIn, duration: Math.max(MIN_CLIP, clip.duration - delta) };
  }

  const srcIn = Math.min(Math.max(0, clip.srcIn + delta), out - MIN_CLIP);
  return { srcIn: round(srcIn), duration: round(out - srcIn) };
}

/** Drags the right edge: the shot grows or shrinks, never past the end of its source. */
export function trimEnd(clip: Clip, asset: MediaAsset | undefined, delta: number): TrimResult {
  const total = sourceLength(asset);
  const room = Number.isFinite(total) ? total - clip.srcIn : Number.POSITIVE_INFINITY;
  const duration = Math.min(Math.max(MIN_CLIP, clip.duration + delta), room);
  return { srcIn: clip.srcIn, duration: round(duration) };
}

/** Moves a shot to another position, keeping the rest in order. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved!);
  return next;
}

/** Which shot covers this instant of the timeline. */
export function clipAt(clips: Clip[], time: number): number {
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]!;
    if (time >= c.start && time < c.start + c.duration) return i;
  }
  return clips.length ? clips.length - 1 : -1;
}

const round = (v: number): number => Math.round(v * 100) / 100;
