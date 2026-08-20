import type { Aspect, Effect, MediaAsset, Project, TextOverlay } from '../types';

export const SIZES: Record<Aspect, [number, number]> = {
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
};

/** Safe zones: fraction of the frame reserved by the platform UI (Meta / TikTok overlays). */
export const SAFE = { top: 0.14, bottom: 0.2, side: 0.06 };
export const TRANSITION_DUR = 0.28;

export type Resolve = (id: string) => MediaAsset | undefined;

export function totalDuration(p: Project): number {
  const last = p.clips[p.clips.length - 1];
  return last ? last.start + last.duration : 0;
}

export function clipIndexAt(p: Project, t: number): number {
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i]!;
    if (t >= c.start && t < c.start + c.duration) return i;
  }
  return p.clips.length ? p.clips.length - 1 : -1;
}

function effectParams(effect: Effect, p: number): { zoom: number; panX: number; panY: number } {
  const e = p * p * (3 - 2 * p); // smoothstep
  switch (effect) {
    case 'zoom-in':
      return { zoom: 1 + 0.14 * e, panX: 0, panY: 0 };
    case 'zoom-out':
      return { zoom: 1.14 - 0.14 * e, panX: 0, panY: 0 };
    case 'pan-left':
      return { zoom: 1.12, panX: 0.8 - 1.6 * e, panY: 0 };
    case 'pan-right':
      return { zoom: 1.12, panX: -0.8 + 1.6 * e, panY: 0 };
    default:
      return { zoom: 1, panX: 0, panY: 0 };
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class ReelRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private snap: HTMLCanvasElement;
  private snapCtx: CanvasRenderingContext2D;
  private lastIndex = -1;

  constructor(aspect: Aspect = '9:16') {
    this.canvas = document.createElement('canvas');
    this.snap = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.snapCtx = this.snap.getContext('2d', { alpha: false })!;
    this.resize(aspect);
  }

  resize(aspect: Aspect): void {
    const [w, h] = SIZES[aspect];
    this.canvas.width = w;
    this.canvas.height = h;
    this.snap.width = w;
    this.snap.height = h;
    this.lastIndex = -1;
  }

  private drawMedia(asset: MediaAsset, effect: Effect, p: number, alpha: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const sw = asset.width;
    const sh = asset.height;
    if (!sw || !sh) return;
    const { zoom, panX, panY } = effectParams(effect, p);
    const scale = Math.max(dw / sw, dh / sh) * zoom;
    const w = sw * scale;
    const h = sh * scale;
    const x = (dw - w) / 2 + panX * ((w - dw) / 2);
    const y = (dh - h) / 2 + panY * ((h - dh) / 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    try {
      ctx.drawImage(asset.el as CanvasImageSource, x, y, w, h);
    } catch {
      /* frame not decodable yet */
    }
    ctx.restore();
  }

  private drawText(o: TextOverlay, t: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const size = o.size;
    const isHook = o.role === 'hook';
    ctx.font = `700 ${size}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = dw * (1 - SAFE.side * 2) - 40;
    const text = isHook ? o.text.toUpperCase() : o.text;
    const lines = wrapText(ctx, text, maxW);
    const lh = size * 1.22;
    const blockH = lines.length * lh;
    const appear = Math.min(1, Math.max(0, (t - o.start) / 0.22));
    const ease = appear * appear * (3 - 2 * appear);
    let top = o.y * dh - blockH / 2;
    top = Math.max(dh * SAFE.top + 20, Math.min(top, dh * (1 - SAFE.bottom) - blockH - 20));

    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(0, (1 - ease) * 18);
    if (o.role === 'caption' || o.role === 'cta') {
      const padX = size * 0.5;
      const padY = size * 0.34;
      const wBox = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      ctx.fillStyle = o.role === 'cta' ? '#EC4899' : 'rgba(4,7,18,0.62)';
      roundRect(ctx, (dw - wBox) / 2, top - padY, wBox, blockH + padY * 2, size * 0.28);
      ctx.fill();
    }
    lines.forEach((line, i) => {
      const y = top + lh * i + lh / 2;
      if (isHook) {
        ctx.lineWidth = size * 0.16;
        ctx.strokeStyle = 'rgba(4,7,18,0.9)';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, dw / 2, y);
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, dw / 2, y);
    });
    ctx.restore();
  }

  private drawSafeZones(): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    ctx.save();
    ctx.fillStyle = 'rgba(236,72,153,0.14)';
    ctx.fillRect(0, 0, dw, dh * SAFE.top);
    ctx.fillRect(0, dh * (1 - SAFE.bottom), dw, dh * SAFE.bottom);
    ctx.strokeStyle = 'rgba(236,72,153,0.9)';
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 4;
    ctx.strokeRect(dw * SAFE.side, dh * SAFE.top, dw * (1 - SAFE.side * 2), dh * (1 - SAFE.top - SAFE.bottom));
    ctx.restore();
  }

  /** Renders the project at timeline second `t`. Call with increasing `t` so transitions blend. */
  draw(project: Project, resolve: Resolve, t: number, opts: { safeZones?: boolean } = {}): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    ctx.fillStyle = '#04070F';
    ctx.fillRect(0, 0, dw, dh);

    const i = clipIndexAt(project, t);
    if (i >= 0) {
      const clip = project.clips[i]!;
      const asset = resolve(clip.assetId);
      if (i !== this.lastIndex) {
        this.snapCtx.drawImage(this.canvas, 0, 0);
        this.lastIndex = i;
      }
      const local = Math.max(0, Math.min(clip.duration, t - clip.start));
      const p = clip.duration > 0 ? local / clip.duration : 0;
      const tp = clip.transition !== 'cut' && i > 0 ? Math.min(1, local / TRANSITION_DUR) : 1;

      if (tp < 1) {
        ctx.drawImage(this.snap, clip.transition === 'slide' ? -dw * tp * 0.35 : 0, 0);
      }

      if (asset) {
        if (clip.transition === 'zoom' && tp < 1) {
          const s = 1 + 0.18 * (1 - tp);
          ctx.save();
          ctx.translate(dw / 2, dh / 2);
          ctx.scale(s, s);
          ctx.translate(-dw / 2, -dh / 2);
          this.drawMedia(asset, clip.effect, p, tp);
          ctx.restore();
        } else if (clip.transition === 'slide' && tp < 1) {
          ctx.save();
          ctx.translate(dw * (1 - tp), 0);
          this.drawMedia(asset, clip.effect, p, 1);
          ctx.restore();
        } else {
          this.drawMedia(asset, clip.effect, p, tp);
        }
      }
    }

    for (const o of project.texts) {
      if (t >= o.start && t <= o.end) this.drawText(o, t);
    }
    if (opts.safeZones) this.drawSafeZones();
  }

  reset(): void {
    this.lastIndex = -1;
  }
}
