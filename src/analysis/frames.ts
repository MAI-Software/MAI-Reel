import type { MediaAsset, Project } from '../types';
import { seek } from '../engine/media';

export interface FrameStats {
  /** Mean luminance, 0..1 */
  luma: number;
  /** Luminance standard deviation, 0..1 (global contrast) */
  contrast: number;
  /** Hasler-Süsstrunk colorfulness, normalised 0..1 */
  colorfulness: number;
  /** Mean gradient energy, normalised 0..1 (proxy for sharpness / detail) */
  sharpness: number;
}

export interface ClipStats {
  clipId: string;
  stats: FrameStats;
  /** Mean absolute frame difference inside the clip, 0..1 */
  motion: number;
}

export interface MediaStats {
  perClip: ClipStats[];
  global: FrameStats;
  motion: number;
  /** First frame vs last frame difference, 0..1 (0 = seamless loop) */
  loopDiff: number;
  firstFrame: FrameStats | null;
}

const W = 96;
const H = 96;

function makeCtx(): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c.getContext('2d', { willReadFrequently: true })!;
}

function grabPixels(ctx: CanvasRenderingContext2D, el: CanvasImageSource): Uint8ClampedArray | null {
  try {
    ctx.drawImage(el, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  } catch {
    return null;
  }
}

function statsOf(px: Uint8ClampedArray): FrameStats {
  const n = W * H;
  const gray = new Float32Array(n);
  let sum = 0;
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
  const colorfulness =
    Math.sqrt(rgStd * rgStd + ybStd * ybStd) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean);

  let grad = 0;
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      grad += Math.abs(gray[i]! - gray[i + 1]!) + Math.abs(gray[i]! - gray[i + W]!);
    }
  }
  const gradMean = grad / (2 * (W - 1) * (H - 1));

  return {
    luma: mean / 255,
    contrast: Math.min(1, std / 80),
    colorfulness: Math.min(1, colorfulness / 110),
    sharpness: Math.min(1, gradMean / 22),
  };
}

function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const ia = i * 4;
    sum += Math.abs(a[ia]! - b[ia]!) + Math.abs(a[ia + 1]! - b[ia + 1]!) + Math.abs(a[ia + 2]! - b[ia + 2]!);
  }
  return Math.min(1, sum / (n * 3 * 255) * 4);
}

const empty: FrameStats = { luma: 0, contrast: 0, colorfulness: 0, sharpness: 0 };

/** Samples the source media of every clip and derives image-quality + motion metrics. */
export async function analyzeMedia(
  project: Project,
  resolve: (id: string) => MediaAsset | undefined,
): Promise<MediaStats> {
  const ctx = makeCtx();
  const perClip: ClipStats[] = [];
  let firstPx: Uint8ClampedArray | null = null;
  let lastPx: Uint8ClampedArray | null = null;
  let firstFrame: FrameStats | null = null;

  for (const clip of project.clips) {
    const asset = resolve(clip.assetId);
    if (!asset) continue;
    const samples: Uint8ClampedArray[] = [];

    if (asset.kind === 'video') {
      const v = asset.el as HTMLVideoElement;
      const wasTime = v.currentTime;
      const points = [0.05, 0.5, 0.95].map((f) => clip.srcIn + clip.duration * f);
      for (const p of points) {
        await seek(v, p);
        const px = grabPixels(ctx, v);
        if (px) samples.push(px);
      }
      v.currentTime = wasTime;
    } else {
      const px = grabPixels(ctx, asset.el as CanvasImageSource);
      if (px) samples.push(px);
    }

    if (!samples.length) continue;
    const frameStats = samples.map(statsOf);
    const avg: FrameStats = {
      luma: mean(frameStats.map((s) => s.luma)),
      contrast: mean(frameStats.map((s) => s.contrast)),
      colorfulness: mean(frameStats.map((s) => s.colorfulness)),
      sharpness: mean(frameStats.map((s) => s.sharpness)),
    };
    let motion = 0;
    for (let i = 1; i < samples.length; i++) motion += diff(samples[i - 1]!, samples[i]!);
    motion = samples.length > 1 ? motion / (samples.length - 1) : 0;

    perClip.push({ clipId: clip.id, stats: avg, motion });
    if (!firstPx) {
      firstPx = samples[0]!;
      firstFrame = frameStats[0]!;
    }
    lastPx = samples[samples.length - 1]!;
  }

  const global: FrameStats = perClip.length
    ? {
        luma: mean(perClip.map((c) => c.stats.luma)),
        contrast: mean(perClip.map((c) => c.stats.contrast)),
        colorfulness: mean(perClip.map((c) => c.stats.colorfulness)),
        sharpness: mean(perClip.map((c) => c.stats.sharpness)),
      }
    : empty;

  return {
    perClip,
    global,
    motion: perClip.length ? mean(perClip.map((c) => c.motion)) : 0,
    loopDiff: firstPx && lastPx ? diff(firstPx, lastPx) : 1,
    firstFrame,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
