import type { MediaAsset } from '../types';
import { seek } from '../engine/media';

export interface FocusPoint {
  /** 0..1 of the frame width / height. */
  x: number;
  y: number;
  /** Share of the frame that matched, 0..1 — low values mean "not confident". */
  coverage: number;
}

const W = 64;
const H = 114;

/**
 * Finds the likely subject by looking for skin tones in YCbCr and taking their centroid.
 * No model, no network: good enough to know whether to push the framing up-left or up-right,
 * and it degrades to `null` when it is not confident.
 */
function focusOfPixels(px: Uint8ClampedArray): FocusPoint | null {
  let sumX = 0;
  let sumY = 0;
  let hits = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && luma > 50 && luma < 240;
      if (!isSkin) continue;
      // faces sit higher in the frame than hands or bodies, so weight the upper half more
      const weight = 1 + (1 - y / H) * 1.2;
      sumX += x * weight;
      sumY += y * weight;
      hits += weight;
    }
  }
  const coverage = hits / (W * H * 1.6);
  if (coverage < 0.012) return null;
  return { x: sumX / hits / W, y: sumY / hits / H, coverage };
}

/** Averages the subject position over a few frames of a clip. */
export async function detectFocus(asset: MediaAsset, samples = 3): Promise<FocusPoint | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const found: FocusPoint[] = [];
  const grab = () => {
    try {
      ctx.drawImage(asset.el as CanvasImageSource, 0, 0, W, H);
      const point = focusOfPixels(ctx.getImageData(0, 0, W, H).data);
      if (point) found.push(point);
    } catch {
      /* frame not ready */
    }
  };

  if (asset.kind === 'video') {
    const v = asset.el as HTMLVideoElement;
    const was = v.currentTime;
    const duration = asset.srcDuration || v.duration || 0;
    for (let i = 0; i < samples; i++) {
      await seek(v, (duration * (i + 0.5)) / samples);
      grab();
    }
    v.currentTime = was;
  } else {
    grab();
  }

  if (!found.length) return null;
  const n = found.length;
  return {
    x: found.reduce((a, p) => a + p.x, 0) / n,
    y: found.reduce((a, p) => a + p.y, 0) / n,
    coverage: found.reduce((a, p) => a + p.coverage, 0) / n,
  };
}
