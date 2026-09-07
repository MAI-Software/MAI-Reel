import type { MediaAsset } from '../types';
import { seek } from '../engine/media';
import { detectFocus } from './focus';

export interface ShotProfile {
  assetId: string;
  kind: 'image' | 'video';
  /** Source shape, which decides how much room a pan really has. */
  orientation: 'portrait' | 'landscape' | 'square';
  luma: number;
  contrast: number;
  colorfulness: number;
  sharpness: number;
  /** Edge density: how much detail competes for attention, 0..1 */
  busyness: number;
  /** Warm (skin, sunset) vs cold (sky, screens) bias, -1 … 1 */
  warmth: number;
  /** Subject position and how much of the frame it takes. */
  subject: { x: number; y: number; coverage: number } | null;
  /** Rough guess that the frame carries burned-in text or graphics. */
  textLikely: boolean;
  /** Mean absolute frame difference inside a video clip, 0..1 */
  motion: number;
}

const W = 96;
const H = 96;

function ctx2d(): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c.getContext('2d', { willReadFrequently: true })!;
}

function grab(ctx: CanvasRenderingContext2D, el: CanvasImageSource): Uint8ClampedArray | null {
  try {
    ctx.drawImage(el, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  } catch {
    return null;
  }
}

interface Stats {
  luma: number;
  contrast: number;
  colorfulness: number;
  sharpness: number;
  busyness: number;
  warmth: number;
  textLikely: boolean;
}

function statsOf(px: Uint8ClampedArray): Stats {
  const n = W * H;
  const gray = new Float32Array(n);
  let sum = 0;
  let warm = 0;
  let rgSum = 0;
  let ybSum = 0;
  let rgSq = 0;
  let ybSq = 0;

  for (let i = 0; i < n; i++) {
    const r = px[i * 4]!;
    const g = px[i * 4 + 1]!;
    const b = px[i * 4 + 2]!;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    gray[i] = y;
    sum += y;
    warm += (r - b) / 255;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg;
    ybSum += yb;
    rgSq += rg * rg;
    ybSq += yb * yb;
  }

  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (gray[i]! - mean) ** 2;
  const std = Math.sqrt(varSum / n);

  const rgMean = rgSum / n;
  const ybMean = ybSum / n;
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - rgMean * rgMean));
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - ybMean * ybMean));
  const colorfulness = Math.sqrt(rgStd * rgStd + ybStd * ybStd) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean);

  // gradients, split by direction: text and UI produce far more horizontal edges than nature
  let gradAll = 0;
  let strongH = 0;
  let strongV = 0;
  const rowEdges = new Float32Array(H);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      const dx = Math.abs(gray[i]! - gray[i + 1]!);
      const dy = Math.abs(gray[i]! - gray[i + W]!);
      gradAll += dx + dy;
      if (dx > 40) strongV++;
      if (dy > 40) strongH++;
      rowEdges[y] = rowEdges[y]! + dx;
    }
  }
  const gradMean = gradAll / (2 * (W - 1) * (H - 1));

  // text sits in a few dense rows rather than spread over the frame
  let rowMean = 0;
  for (let y = 0; y < H; y++) rowMean += rowEdges[y]!;
  rowMean /= H;
  let peaky = 0;
  for (let y = 0; y < H; y++) if (rowEdges[y]! > rowMean * 2.2) peaky++;

  return {
    luma: mean / 255,
    contrast: Math.min(1, std / 80),
    colorfulness: Math.min(1, colorfulness / 110),
    sharpness: Math.min(1, gradMean / 22),
    busyness: Math.min(1, gradMean / 14),
    warmth: Math.max(-1, Math.min(1, (warm / n) * 4)),
    textLikely: peaky >= 4 && strongV > strongH * 0.8,
  };
}

function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const ia = i * 4;
    sum += Math.abs(a[ia]! - b[ia]!) + Math.abs(a[ia + 1]! - b[ia + 1]!) + Math.abs(a[ia + 2]! - b[ia + 2]!);
  }
  return Math.min(1, (sum / (n * 3 * 255)) * 4);
}

/**
 * Reads one asset the way an editor glances at a clip: how bright and busy it is, whether
 * there is a subject and where, whether it already carries text, and how much it moves.
 * The director turns that into a camera move that suits the shot.
 */
export async function profileAsset(asset: MediaAsset): Promise<ShotProfile> {
  const ctx = ctx2d();
  const samples: Uint8ClampedArray[] = [];

  if (asset.kind === 'video') {
    const v = asset.el as HTMLVideoElement;
    const was = v.currentTime;
    const duration = asset.srcDuration || v.duration || 0;
    for (const f of [0.15, 0.5, 0.85]) {
      await seek(v, duration * f);
      const px = grab(ctx, v);
      if (px) samples.push(px);
    }
    v.currentTime = was;
  } else {
    const px = grab(ctx, asset.el as CanvasImageSource);
    if (px) samples.push(px);
  }

  const measured = samples.map(statsOf);
  const avg = <K extends keyof Stats>(key: K): number =>
    measured.length ? measured.reduce((a, s) => a + (s[key] as number), 0) / measured.length : 0;

  let motion = 0;
  for (let i = 1; i < samples.length; i++) motion += diff(samples[i - 1]!, samples[i]!);
  motion = samples.length > 1 ? motion / (samples.length - 1) : 0;

  const focus = await detectFocus(asset, asset.kind === 'video' ? 2 : 1);
  const ratio = asset.height ? asset.width / asset.height : 1;

  return {
    assetId: asset.id,
    kind: asset.kind,
    orientation: ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square',
    luma: avg('luma'),
    contrast: avg('contrast'),
    colorfulness: avg('colorfulness'),
    sharpness: avg('sharpness'),
    busyness: avg('busyness'),
    warmth: avg('warmth'),
    subject: focus ? { x: focus.x, y: focus.y, coverage: focus.coverage } : null,
    textLikely: measured.some((m) => m.textLikely),
    motion,
  };
}

export async function profileAssets(assets: MediaAsset[]): Promise<Map<string, ShotProfile>> {
  const out = new Map<string, ShotProfile>();
  for (const asset of assets) {
    try {
      out.set(asset.id, await profileAsset(asset));
    } catch {
      /* an unreadable asset just gets no profile */
    }
  }
  return out;
}
