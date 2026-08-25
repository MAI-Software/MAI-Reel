import type { Aspect, Effect, Enhance, Grade, MediaAsset, Project, TextOverlay } from '../types';
import { fontCss, styleById } from '../data/typography';

export const SIZES: Record<Aspect, [number, number]> = {
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
};

/** Safe zones: fraction of the frame reserved by the platform UI (Meta / TikTok overlays). */
export const SAFE = { top: 0.14, bottom: 0.2, side: 0.06 };
export const TRANSITION_DUR = 0.32;

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

const smooth = (p: number) => p * p * (3 - 2 * p);
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const GRADE_FILTERS: Record<Grade, string> = {
  none: '',
  vivid: 'saturate(1.35) contrast(1.12)',
  warm: 'sepia(0.18) saturate(1.22) brightness(1.03)',
  cool: 'saturate(1.12) hue-rotate(12deg) contrast(1.06)',
  mono: 'grayscale(1) contrast(1.16)',
  film: 'sepia(0.26) saturate(0.86) contrast(1.1) brightness(0.98)',
  vhs: 'saturate(1.45) contrast(0.94) hue-rotate(-6deg) brightness(1.05)',
  dream: 'brightness(1.07) saturate(1.18) contrast(0.92)',
  night: 'brightness(0.86) contrast(1.2) saturate(0.82)',
};

const VIGNETTE: Grade[] = ['film', 'vhs', 'night'];

interface Motion {
  zoom: number;
  panX: number;
  panY: number;
  rot: number;
  blur: number;
}

function effectMotion(effect: Effect, p: number, seconds: number): Motion {
  const e = smooth(p);
  const base: Motion = { zoom: 1, panX: 0, panY: 0, rot: 0, blur: 0 };
  switch (effect) {
    case 'zoom-in':
      return { ...base, zoom: 1 + 0.14 * e };
    case 'zoom-out':
      return { ...base, zoom: 1.14 - 0.14 * e };
    case 'pan-left':
      return { ...base, zoom: 1.12, panX: 0.8 - 1.6 * e };
    case 'pan-right':
      return { ...base, zoom: 1.12, panX: -0.8 + 1.6 * e };
    case 'pan-up':
      return { ...base, zoom: 1.14, panY: 0.8 - 1.6 * e };
    case 'pan-down':
      return { ...base, zoom: 1.14, panY: -0.8 + 1.6 * e };
    case 'punch': {
      // hard zoom on the cut, settling fast, then a slow creep
      const hit = clamp01(p / 0.22);
      return { ...base, zoom: 1.22 - 0.22 * easeOut(hit) + 0.05 * p };
    }
    case 'shake': {
      const amp = 0.035 * (1 - 0.5 * p);
      return {
        ...base,
        zoom: 1.1,
        panX: Math.sin(seconds * 17) * amp,
        panY: Math.cos(seconds * 13.5) * amp,
        rot: Math.sin(seconds * 9) * 0.004,
      };
    }
    case 'rotate':
      return { ...base, zoom: 1.16, rot: (-0.035 + 0.07 * e) };
    case 'blur-in': {
      const k = clamp01(p / 0.35);
      return { ...base, zoom: 1.1 - 0.06 * easeOut(k), blur: 18 * (1 - easeOut(k)) };
    }
    case 'drift':
      return { ...base, zoom: 1.15, panX: -0.5 + e, panY: 0.5 - e };
    default:
      return base;
  }
}

/**
 * Audio-reactive camera move for the entertainment mode: it never adds pixels on top of the
 * footage, it only breathes the framing so already-edited clips keep their captions intact.
 */
export function enhanceMotion(en: Enhance, t: number): Motion {
  const base: Motion = { zoom: 1, panX: 0, panY: 0, rot: 0, blur: 0 };
  if (!en.enabled) return base;
  const k = Math.max(0, Math.min(1, en.intensity));
  const idx = Math.floor(t * en.hz);
  const energy = en.envelope.length ? (en.envelope[Math.min(idx, en.envelope.length - 1)] ?? 0) : 0.3;

  let pulse = 0;
  for (const b of en.beats) {
    const d = t - b;
    if (d < -0.05) break;
    if (d >= -0.05 && d < 0.55) pulse = Math.max(pulse, Math.exp(-Math.max(0, d) * 7));
  }

  // voice accents get a slower, deeper push-in than a musical beat: that is the dramatic zoom
  let drama = 0;
  for (const a of en.accents ?? []) {
    const d = t - a;
    if (d < -0.05) break;
    if (d >= -0.05 && d < 1.6) drama = Math.max(drama, Math.exp(-Math.max(0, d) * 1.6));
  }
  const talking = (en.speech ?? []).some((s) => t >= s.start - 0.05 && t <= s.end + 0.2);
  const dramaK = drama * (en.drama ?? 0.6) * (talking ? 1 : 0.45);

  const zoomCap = en.protectCaptions ? 0.07 : 0.2;
  const zoom = 1 + k * Math.min(zoomCap, 0.02 + 0.035 * energy + 0.07 * pulse + 0.11 * dramaK);

  let panX = 0;
  let panY = 0;
  if (en.faceZoom && en.focus) {
    const pull = k * (0.35 + 0.4 * pulse + 0.5 * dramaK);
    panX = -(en.focus.x - 0.5) * 2 * pull;
    panY = (0.5 - en.focus.y) * 2 * pull;
  }
  if (en.shake) {
    const amp = k * (0.006 + 0.018 * energy);
    panX += Math.sin(t * 12.7) * amp;
    panY += Math.cos(t * 9.3) * amp;
  }
  const clampPan = en.protectCaptions ? 0.15 : 0.5;
  panX = Math.max(-clampPan, Math.min(clampPan, panX));
  panY = Math.max(-clampPan, Math.min(clampPan, panY));

  return { zoom, panX, panY, rot: en.shake ? Math.sin(t * 5.1) * 0.003 * k * (0.4 + energy) : 0, blur: 0 };
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
  private aspect: Aspect;
  /** Render scale: the preview runs at a fraction of the export resolution to stay smooth on phones. */
  private scale = 1;

  constructor(aspect: Aspect = '9:16', scale = 1) {
    this.canvas = document.createElement('canvas');
    this.snap = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.snapCtx = this.snap.getContext('2d', { alpha: false })!;
    this.aspect = aspect;
    this.scale = scale;
    this.resize(aspect);
  }

  /** Design units are authored against a 1080px-wide frame. */
  private get unit(): number {
    return this.canvas.width / 1080;
  }

  setScale(scale: number): void {
    if (this.scale === scale) return;
    this.scale = scale;
    this.resize(this.aspect);
  }

  resize(aspect: Aspect): void {
    this.aspect = aspect;
    const [w, h] = SIZES[aspect];
    this.canvas.width = Math.round(w * this.scale);
    this.canvas.height = Math.round(h * this.scale);
    this.snap.width = this.canvas.width;
    this.snap.height = this.canvas.height;
    this.lastIndex = -1;
  }

  private drawMedia(
    asset: MediaAsset,
    effect: Effect,
    p: number,
    seconds: number,
    alpha: number,
    grade: Grade = 'none',
    extra?: Motion,
  ): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const sw = asset.width;
    const sh = asset.height;
    if (!sw || !sh) return;
    const eff = effectMotion(effect, p, seconds);
    const m: Motion = extra
      ? {
          zoom: eff.zoom * extra.zoom,
          panX: Math.max(-1, Math.min(1, eff.panX + extra.panX)),
          panY: Math.max(-1, Math.min(1, eff.panY + extra.panY)),
          rot: eff.rot + extra.rot,
          blur: Math.max(eff.blur, extra.blur),
        }
      : eff;
    const scale = Math.max(dw / sw, dh / sh) * m.zoom;
    const w = sw * scale;
    const h = sh * scale;
    const x = (dw - w) / 2 + m.panX * ((w - dw) / 2);
    const y = (dh - h) / 2 + m.panY * ((h - dh) / 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    const filters = [
      m.blur > 0.2 ? `blur(${(m.blur * this.unit).toFixed(1)}px)` : '',
      GRADE_FILTERS[grade] ?? '',
    ]
      .filter(Boolean)
      .join(' ');
    if (filters) ctx.filter = filters;
    if (m.rot) {
      ctx.translate(dw / 2, dh / 2);
      ctx.rotate(m.rot);
      ctx.translate(-dw / 2, -dh / 2);
    }
    try {
      ctx.drawImage(asset.el as CanvasImageSource, x, y, w, h);
    } catch {
      /* frame not decodable yet */
    }
    ctx.restore();
    if (VIGNETTE.includes(grade)) this.drawVignette(alpha);
  }

  private drawVignette(alpha: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const g = ctx.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.34, dw / 2, dh / 2, Math.max(dw, dh) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dw, dh);
    ctx.restore();
  }

  /** Draws one text overlay with its entrance animation. */
  private drawText(o: TextOverlay, t: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const size = o.size * this.unit;
    const style = styleById(o.styleId);
    ctx.font = fontCss(o.fontId, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.tracking && 'letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * style.tracking}px`;
    }

    const life = Math.max(0.001, o.end - o.start);
    const local = t - o.start;
    const anim = o.anim ?? 'fade';
    const inP = clamp01(local / (anim === 'typewriter' ? Math.min(0.9, life * 0.5) : 0.26));
    const outP = clamp01((o.end - t) / 0.22);

    const maxW = dw * (1 - SAFE.side * 2) - 40 * this.unit;
    const full = style.uppercase ? o.text.toUpperCase() : o.text;
    const shown = anim === 'typewriter' ? full.slice(0, Math.max(1, Math.round(full.length * inP))) : full;
    const lines = wrapText(ctx, shown, maxW);
    const lh = size * 1.22;
    const blockH = lines.length * lh;
    const margin = 20 * this.unit;
    let top = o.y * dh - blockH / 2;
    top = Math.max(dh * SAFE.top + margin, Math.min(top, dh * (1 - SAFE.bottom) - blockH - margin));

    let alpha = Math.min(smooth(inP), smooth(outP));
    let scale = 1;
    let offsetY = 0;
    switch (anim) {
      case 'none':
        alpha = 1;
        break;
      case 'pop':
        scale = 0.72 + 0.28 * easeOut(inP) + 0.06 * Math.sin(Math.PI * inP);
        break;
      case 'slide-up':
        offsetY = (1 - easeOut(inP)) * 60 * this.unit;
        break;
      case 'bounce': {
        const b = easeOut(inP);
        offsetY = (1 - b) * -40 * this.unit;
        scale = 1 + 0.12 * Math.sin(Math.PI * inP);
        break;
      }
      case 'typewriter':
        alpha = smooth(outP);
        break;
      default:
        break;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dw / 2, top + blockH / 2 + offsetY);
    ctx.scale(scale, scale);
    ctx.translate(-dw / 2, -(top + blockH / 2));

    if (style.bg && lines.length) {
      const padX = size * 0.5;
      const padY = size * 0.34;
      const wBox = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      ctx.fillStyle = style.bg;
      roundRect(ctx, (dw - wBox) / 2, top - padY, wBox, blockH + padY * 2, size * 0.28);
      ctx.fill();
    }

    lines.forEach((line, i) => {
      const y = top + lh * i + lh / 2;
      if (anim === 'karaoke') {
        this.drawKaraokeLine(line, full, y, size, style, clamp01(local / life));
        return;
      }
      if (style.stroke) {
        ctx.lineWidth = size * (style.strokeWidth ?? 0.14);
        ctx.strokeStyle = style.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, dw / 2, y);
      }
      if (style.glow) {
        ctx.shadowColor = style.glow.color;
        ctx.shadowBlur = size * style.glow.blur;
      } else if (style.shadow) {
        ctx.shadowColor = style.shadow.color;
        ctx.shadowBlur = size * (style.shadow.blur ?? 0.04);
        ctx.shadowOffsetX = size * style.shadow.dx;
        ctx.shadowOffsetY = size * style.shadow.dy;
      }
      ctx.fillStyle = style.fill;
      ctx.fillText(line, dw / 2, y);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });

    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    }
    ctx.restore();
  }

  /** Karaoke: words already "spoken" are filled with the accent colour, the rest stay dim. */
  private drawKaraokeLine(
    line: string,
    full: string,
    y: number,
    size: number,
    style: ReturnType<typeof styleById>,
    progress: number,
  ): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const words = line.split(' ');
    const totalWords = full.split(/\s+/).filter(Boolean).length || words.length;
    const spokenWords = progress * totalWords;
    const lineWidth = ctx.measureText(line).width;
    let x = (dw - lineWidth) / 2;
    const spaceW = ctx.measureText(' ').width;
    const startIndex = full.indexOf(line) >= 0 ? full.slice(0, full.indexOf(line)).split(/\s+/).filter(Boolean).length : 0;

    ctx.textAlign = 'left';
    words.forEach((word, i) => {
      const w = ctx.measureText(word).width;
      const done = startIndex + i < spokenWords;
      if (style.stroke) {
        ctx.lineWidth = size * (style.strokeWidth ?? 0.14);
        ctx.strokeStyle = style.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(word, x, y);
      }
      ctx.fillStyle = done ? '#EC4899' : style.fill;
      ctx.fillText(word, x, y);
      x += w + spaceW;
    });
    ctx.textAlign = 'center';
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
    ctx.setLineDash([18 * this.unit, 14 * this.unit]);
    ctx.lineWidth = 4 * this.unit;
    ctx.strokeRect(dw * SAFE.side, dh * SAFE.top, dw * (1 - SAFE.side * 2), dh * (1 - SAFE.top - SAFE.bottom));
    ctx.restore();
  }

  /** Renders the project at timeline second `t`. Call with increasing `t` so transitions blend. */
  draw(project: Project, resolve: Resolve, t: number, opts: { safeZones?: boolean } = {}): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;

    const i = clipIndexAt(project, t);
    // Snapshot the frame that is still on screen BEFORE clearing, so transitions blend
    // from the previous shot instead of from black.
    if (i !== this.lastIndex) {
      this.snapCtx.drawImage(this.canvas, 0, 0);
      this.lastIndex = i;
    }

    ctx.fillStyle = '#04070F';
    ctx.fillRect(0, 0, dw, dh);

    if (i >= 0) {
      const clip = project.clips[i]!;
      const asset = resolve(clip.assetId);
      const local = Math.max(0, Math.min(clip.duration, t - clip.start));
      const p = clip.duration > 0 ? local / clip.duration : 0;
      const raw = clip.transition !== 'cut' && i > 0 ? clamp01(local / TRANSITION_DUR) : 1;
      const tp = easeOut(raw);

      if (raw < 1) this.drawOutgoing(clip.transition, tp);

      if (asset) {
        const extra = project.enhance?.enabled ? enhanceMotion(project.enhance, t) : undefined;
        ctx.save();
        this.applyIncoming(clip.transition, tp, raw);
        this.drawMedia(
          asset,
          clip.effect,
          p,
          t,
          clip.transition === 'fade' || clip.transition === 'zoom' ? tp : 1,
          clip.grade ?? 'none',
          extra,
        );
        ctx.restore();
        if (clip.transition === 'flash' && raw < 1) {
          ctx.save();
          ctx.globalAlpha = (1 - raw) ** 1.6 * 0.9;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, dw, dh);
          ctx.restore();
        }
      }
    }

    for (const o of project.texts) {
      if (t >= o.start && t <= o.end) this.drawText(o, t);
    }
    if (opts.safeZones) this.drawSafeZones();
  }

  /** Paints the frozen previous frame while the new clip comes in. */
  private drawOutgoing(transition: Project['clips'][number]['transition'], tp: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    ctx.save();
    switch (transition) {
      case 'slide':
        ctx.drawImage(this.snap, -dw * tp * 0.35, 0);
        break;
      case 'whip':
        ctx.filter = `blur(${(1 - tp) * 14 * this.unit}px)`;
        ctx.drawImage(this.snap, -dw * tp, 0);
        break;
      case 'push-up':
        ctx.drawImage(this.snap, 0, -dh * tp);
        break;
      case 'zoom': {
        const s = 1 + 0.12 * tp;
        ctx.translate(dw / 2, dh / 2);
        ctx.scale(s, s);
        ctx.translate(-dw / 2, -dh / 2);
        ctx.drawImage(this.snap, 0, 0);
        break;
      }
      default:
        ctx.drawImage(this.snap, 0, 0);
        break;
    }
    ctx.restore();
  }

  /** Transforms the context so the incoming clip enters with the chosen motion. */
  private applyIncoming(transition: Project['clips'][number]['transition'], tp: number, raw: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    if (raw >= 1) return;
    switch (transition) {
      case 'slide':
        ctx.translate(dw * (1 - tp), 0);
        break;
      case 'whip':
        ctx.translate(dw * (1 - tp), 0);
        ctx.filter = `blur(${(1 - tp) * 12 * this.unit}px)`;
        break;
      case 'push-up':
        ctx.translate(0, dh * (1 - tp));
        break;
      case 'zoom': {
        const s = 1 + 0.18 * (1 - tp);
        ctx.translate(dw / 2, dh / 2);
        ctx.scale(s, s);
        ctx.translate(-dw / 2, -dh / 2);
        break;
      }
      case 'wipe': {
        const r = Math.hypot(dw, dh) * 0.55 * tp;
        ctx.beginPath();
        ctx.arc(dw / 2, dh / 2, Math.max(1, r), 0, Math.PI * 2);
        ctx.clip();
        break;
      }
      default:
        break;
    }
  }

  reset(): void {
    this.lastIndex = -1;
  }
}
