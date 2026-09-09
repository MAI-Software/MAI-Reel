import type { Aspect, Enhance, Frame, MediaAsset, Overlay, Platform, Project, TextOverlay } from '../types';
import { fontCss, styleById } from '../data/typography';
import { effectById, gradeById, transitionById, type Ease, type MotionSpec } from '../data/effects';

export const SIZES: Record<Aspect, [number, number]> = {
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
  '1:1': [1080, 1080],
};

/** Safe zones: fraction of the frame reserved by the platform UI (Meta / TikTok overlays). */
export interface SafeArea {
  top: number;
  bottom: number;
  side: number;
  /** The action rail (like, comment, share) lives on the right of every app. */
  right: number;
}

/**
 * Fractions of the frame each app covers with its own interface. Measured from the published
 * layout guides: the caption block at the bottom, the header at the top and the action rail.
 */
export const SAFE_AREAS: Record<Platform, SafeArea> = {
  generic: { top: 0.14, bottom: 0.2, side: 0.06, right: 0.06 },
  tiktok: { top: 0.1, bottom: 0.24, side: 0.06, right: 0.2 },
  reels: { top: 0.13, bottom: 0.22, side: 0.06, right: 0.16 },
  shorts: { top: 0.1, bottom: 0.16, side: 0.06, right: 0.14 },
};

export function safeAreaFor(platform: Platform | undefined): SafeArea {
  return SAFE_AREAS[platform ?? 'generic'] ?? SAFE_AREAS.generic;
}

/** Kept for the code that only needs the default insets. */
export const SAFE = SAFE_AREAS.generic;

const clampRange = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Pixel box of a layered source inside a canvas of dw x dh. */
export function overlayBox(
  overlay: { x: number; y: number; scale: number },
  dw: number,
  dh: number,
  ratio: number,
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(0, overlay.scale) * dw;
  const h = ratio > 0 ? w / ratio : w;
  return { x: overlay.x * dw - w / 2, y: overlay.y * dh - h / 2, w, h };
}
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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function easeWith(kind: Ease | undefined, p: number): number {
  const x = clamp01(p);
  switch (kind) {
    case 'linear':
      return x;
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'spring': {
      // overshoots once and settles, which reads as a bounce
      const k = 1 - (1 - x) ** 3;
      return k + Math.sin(x * Math.PI * 2) * 0.08 * (1 - x);
    }
    case 'punch':
      // almost all of the move happens in the first fifth
      return 1 - (1 - x) ** 6;
    case 'steps':
      return Math.round(x * 4) / 4;
    case 'smooth':
    default:
      return x * x * (3 - 2 * x);
  }
}

export interface Motion {
  zoom: number;
  panX: number;
  panY: number;
  rot: number;
  blur: number;
}

const STILL: Motion = { zoom: 1, panX: 0, panY: 0, rot: 0, blur: 0 };

/** Interpolates a declarative move at progress `p` of a shot playing at `seconds`. */
export function motionOf(spec: MotionSpec, p: number, seconds: number): Motion {
  const hold = spec.hold ?? 0;
  const raw = hold > 0 ? clamp01((p - hold) / Math.max(0.001, 1 - hold)) : clamp01(p);
  const k = easeWith(spec.ease, raw);

  let zoom = spec.zoom ? mix(spec.zoom[0], spec.zoom[1], k) : 1;
  let panX = spec.pan ? mix(spec.pan[0][0], spec.pan[1][0], k) : 0;
  let panY = spec.pan ? mix(spec.pan[0][1], spec.pan[1][1], k) : 0;
  let rot = spec.rot ? mix(spec.rot[0], spec.rot[1], k) : 0;
  const blur = spec.blur ? mix(spec.blur[0], spec.blur[1], k) : 0;

  if (spec.breathe) zoom += Math.sin(seconds * spec.breathe.freq * Math.PI * 2) * spec.breathe.amp;
  if (spec.shake) {
    const decay = spec.shake.decay ? Math.max(0, 1 - raw * 2.2) : 1;
    const amp = spec.shake.amp * decay;
    panX += Math.sin(seconds * spec.shake.freq) * amp;
    panY += Math.cos(seconds * spec.shake.freq * 0.82) * amp;
    rot += Math.sin(seconds * spec.shake.freq * 0.5) * amp * 0.35;
  }
  // the vertigo look: the frame rotates back as it pushes in
  if (spec.counterRot) rot -= (zoom - 1) * spec.counterRot * 0.6;

  return { zoom, panX, panY, rot, blur };
}

export function effectMotion(effectId: string, p: number, seconds: number): Motion {
  const def = effectById(effectId);
  if (!def.motion || Object.keys(def.motion).length === 0) return STILL;
  return motionOf(def.motion, p, seconds);
}

/**
 * Audio-reactive camera move for the boost mode: it never adds pixels on top of the footage,
 * it only breathes the framing so already-edited clips keep their captions intact.
 */
export function enhanceMotion(en: Enhance, t: number): Motion {
  const base: Motion = { ...STILL };
  if (!en.enabled) return base;
  const k = clamp01(en.intensity);
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
  /** Scratch buffer for the pixelate transition. */
  private tmp: HTMLCanvasElement;
  private lastIndex = -1;
  /** Safe area of the project being drawn; set on every draw call. */
  private safe: SafeArea = SAFE_AREAS.generic;
  private aspect: Aspect;
  private scale = 1;

  constructor(aspect: Aspect = '9:16', scale = 1) {
    this.canvas = document.createElement('canvas');
    this.snap = document.createElement('canvas');
    this.tmp = document.createElement('canvas');
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
    effectId: string,
    p: number,
    seconds: number,
    alpha: number,
    gradeId = 'none',
    extra?: Motion,
    focus?: { x: number; y: number },
    frame?: Frame,
  ): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const sw = asset.width;
    const sh = asset.height;
    if (!sw || !sh) return;

    const eff = effectMotion(effectId, p, seconds);
    const m: Motion = extra
      ? {
          zoom: eff.zoom * extra.zoom,
          panX: Math.max(-1, Math.min(1, eff.panX + extra.panX)),
          panY: Math.max(-1, Math.min(1, eff.panY + extra.panY)),
          rot: eff.rot + extra.rot,
          blur: Math.max(eff.blur, extra.blur),
        }
      : eff;

    const grade = gradeById(gradeId);
    const hand = frame ?? { zoom: 1, x: 0, y: 0 };
    const scale = Math.max(dw / sw, dh / sh) * m.zoom * hand.zoom;
    const w = sw * scale;
    const h = sh * scale;
    // a horizontal video cropped to 9:16 loses most of its width, so the crop starts on the
    // subject instead of on the middle of the frame; the effect's pan still moves from there
    const baseX = focus ? clampRange(dw / 2 - focus.x * w, dw - w, 0) : (dw - w) / 2;
    const baseY = focus ? clampRange(dh / 2 - focus.y * h, dh - h, 0) : (dh - h) / 2;
    // a hand-set frame is a deliberate choice, so it is not pushed back inside the cover bounds
    const x = frame
      ? baseX + m.panX * ((w - dw) / 2) + hand.x * dw
      : clampRange(baseX + m.panX * ((w - dw) / 2), Math.min(0, dw - w), Math.max(0, dw - w));
    const y = frame
      ? baseY + m.panY * ((h - dh) / 2) + hand.y * dh
      : clampRange(baseY + m.panY * ((h - dh) / 2), Math.min(0, dh - h), Math.max(0, dh - h));

    ctx.save();
    ctx.globalAlpha = alpha;
    const filters = [m.blur > 0.2 ? `blur(${(m.blur * this.unit).toFixed(1)}px)` : '', grade.filter]
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

    if (grade.wash) this.fill(grade.wash[0], grade.wash[1] * alpha);
    if (grade.vignette) this.drawVignette(grade.vignette * alpha);
    if (grade.letterbox) this.drawLetterbox(grade.letterbox);
  }

  private fill(color: string, alpha: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  private drawVignette(strength: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const g = ctx.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.34, dw / 2, dh / 2, Math.max(dw, dh) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, strength)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dw, dh);
    ctx.restore();
  }

  private drawLetterbox(fraction: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const bar = dh * fraction;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, dw, bar);
    ctx.fillRect(0, dh - bar, dw, bar);
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

    const maxW = dw * (1 - this.safe.side - this.safe.right) - 40 * this.unit;
    const full = style.uppercase ? o.text.toUpperCase() : o.text;
    const shown = anim === 'typewriter' ? full.slice(0, Math.max(1, Math.round(full.length * inP))) : full;
    const lines = wrapText(ctx, shown, maxW);
    const lh = size * 1.22;
    const blockH = lines.length * lh;
    const margin = 20 * this.unit;
    let top = o.y * dh - blockH / 2;
    top = Math.max(dh * this.safe.top + margin, Math.min(top, dh * (1 - this.safe.bottom) - blockH - margin));

    let alpha = Math.min(easeWith('smooth', inP), easeWith('smooth', outP));
    let scale = 1;
    let offsetY = 0;
    switch (anim) {
      case 'none':
        alpha = 1;
        break;
      case 'pop':
        scale = 0.72 + 0.28 * easeWith('out', inP) + 0.06 * Math.sin(Math.PI * inP);
        break;
      case 'slide-up':
        offsetY = (1 - easeWith('out', inP)) * 60 * this.unit;
        break;
      case 'bounce': {
        const b = easeWith('out', inP);
        offsetY = (1 - b) * -40 * this.unit;
        scale = 1 + 0.12 * Math.sin(Math.PI * inP);
        break;
      }
      case 'typewriter':
        alpha = easeWith('smooth', outP);
        break;
      default:
        break;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = (dw * this.safe.side + dw * (1 - this.safe.right)) / 2;
    ctx.translate(cx, top + blockH / 2 + offsetY);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -(top + blockH / 2));

    if (style.bg && lines.length) {
      const padX = size * 0.5;
      const padY = size * 0.34;
      const wBox = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      ctx.fillStyle = style.bg;
      roundRect(ctx, cx - wBox / 2, top - padY, wBox, blockH + padY * 2, size * 0.28);
      ctx.fill();
    }

    lines.forEach((line, i) => {
      const y = top + lh * i + lh / 2;
      if (anim === 'karaoke') {
        this.drawKaraokeLine(line, full, y, size, style, clamp01(local / life), o, t, cx);
        return;
      }
      if (style.stroke) {
        ctx.lineWidth = size * (style.strokeWidth ?? 0.14);
        ctx.strokeStyle = style.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, cx, y);
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
      ctx.fillText(line, cx, y);
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
    overlay?: TextOverlay,
    t = 0,
    cx?: number,
  ): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const words = line.split(' ');
    const totalWords = full.split(/\s+/).filter(Boolean).length || words.length;
    // real transcription times when they exist; otherwise the block is filled at a steady rate
    const timings = overlay?.words;
    const spokenWords = timings?.length
      ? timings.filter((w) => w.start <= t).length
      : progress * totalWords;
    const currentWord = timings?.length ? timings.findIndex((w) => w.start <= t && w.end > t) : -1;
    const lineWidth = ctx.measureText(line).width;
    let x = (cx ?? dw / 2) - lineWidth / 2;
    const spaceW = ctx.measureText(' ').width;
    const startIndex = full.indexOf(line) >= 0 ? full.slice(0, full.indexOf(line)).split(/\s+/).filter(Boolean).length : 0;

    ctx.textAlign = 'left';
    words.forEach((word, i) => {
      const w = ctx.measureText(word).width;
      const index = startIndex + i;
      const done = index < spokenWords;
      const speaking = index === currentWord;
      if (style.stroke) {
        ctx.lineWidth = size * (style.strokeWidth ?? 0.14);
        ctx.strokeStyle = style.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(word, x, y);
      }
      ctx.fillStyle = speaking ? '#FFD166' : done ? '#EC4899' : style.fill;
      ctx.fillText(word, x, y);
      x += w + spaceW;
    });
    ctx.textAlign = 'center';
  }

  /** Draws one layered source inside its box, cropped to fill and with rounded corners. */
  private drawOverlay(overlay: Overlay, asset: MediaAsset): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const box = overlayBox(overlay, dw, dh, asset.width / (asset.height || 1));
    if (box.w < 4 || box.h < 4) return;

    const sw = asset.width;
    const sh = asset.height;
    const scale = Math.max(box.w / sw, box.h / sh);
    const w = sw * scale;
    const h = sh * scale;

    ctx.save();
    const radius = Math.min(box.w, box.h) * (overlay.radius ?? 0.06);
    roundRect(ctx, box.x, box.y, box.w, box.h, radius);
    ctx.clip();
    ctx.drawImage(asset.el as CanvasImageSource, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    ctx.restore();

    // a hairline keeps the layer readable over a busy shot
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * this.unit;
    ctx.stroke();
    ctx.restore();
  }

  private drawSafeZones(): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const safe = this.safe;
    ctx.save();
    ctx.fillStyle = 'rgba(236,72,153,0.14)';
    ctx.fillRect(0, 0, dw, dh * safe.top);
    ctx.fillRect(0, dh * (1 - safe.bottom), dw, dh * safe.bottom);
    ctx.fillRect(dw * (1 - safe.right), dh * safe.top, dw * safe.right, dh * (1 - safe.top - safe.bottom));
    ctx.strokeStyle = 'rgba(236,72,153,0.9)';
    ctx.setLineDash([18 * this.unit, 14 * this.unit]);
    ctx.lineWidth = 4 * this.unit;
    ctx.strokeRect(
      dw * safe.side,
      dh * safe.top,
      dw * (1 - safe.side - safe.right),
      dh * (1 - safe.top - safe.bottom),
    );
    ctx.restore();
  }

  /** Renders the project at timeline second `t`. Call with increasing `t` so transitions blend. */
  draw(project: Project, resolve: Resolve, t: number, opts: { safeZones?: boolean } = {}): void {
    const { ctx } = this;
    this.safe = safeAreaFor(project.platform);
    const dw = this.canvas.width;
    const dh = this.canvas.height;

    const i = clipIndexAt(project, t);
    // snapshot what is still on screen BEFORE clearing, so transitions blend from the
    // previous shot instead of from black
    if (i !== this.lastIndex) {
      this.snapCtx.drawImage(this.canvas, 0, 0);
      this.lastIndex = i;
    }

    ctx.fillStyle = '#04070F';
    ctx.fillRect(0, 0, dw, dh);

    if (i >= 0) {
      const clip = project.clips[i]!;
      const asset = resolve(clip.assetId);
      const def = transitionById(clip.transition);
      const dur = def.duration ?? TRANSITION_DUR;
      const local = Math.max(0, Math.min(clip.duration, t - clip.start));
      const p = clip.duration > 0 ? local / clip.duration : 0;
      const raw = dur > 0 && i > 0 ? clamp01(local / dur) : 1;
      const tp = easeWith('out', raw);
      const extra = project.enhance?.enabled ? enhanceMotion(project.enhance, t) : undefined;

      if (raw < 1) this.drawOutgoing(def, tp, raw);

      if (asset) {
        ctx.save();
        const alpha = this.applyIncoming(def, tp, raw);
        this.drawMedia(asset, clip.effect, p, t, alpha, clip.grade ?? 'none', extra, clip.focus, clip.frame);
        ctx.restore();
        if (raw < 1) this.drawOverlayPhase(def, tp, raw);
      }
    }

    for (const overlay of project.overlays ?? []) {
      if (t >= overlay.start && t < overlay.start + overlay.duration) {
        const asset = resolve(overlay.assetId);
        if (asset) this.drawOverlay(overlay, asset);
      }
    }

    for (const o of project.texts) {
      if (t >= o.start && t <= o.end) this.drawText(o, t);
    }
    if (opts.safeZones) this.drawSafeZones();
  }

  /** Paints the frozen previous frame while the new clip comes in. */
  private drawOutgoing(def: ReturnType<typeof transitionById>, tp: number, raw: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    ctx.save();
    switch (def.kind) {
      case 'slide':
        ctx.drawImage(this.snap, def.dir === 'right' ? dw * tp * 0.35 : -dw * tp * 0.35, 0);
        break;
      case 'push':
        ctx.drawImage(this.snap, 0, def.dir === 'down' ? dh * tp : -dh * tp);
        break;
      case 'blur': {
        const shift = def.dir === 'right' ? dw * tp : def.dir === 'left' ? -dw * tp : 0;
        ctx.filter = `blur(${(1 - tp) * 16 * this.unit}px)`;
        ctx.globalAlpha = def.dir ? 1 : 1 - tp * 0.6;
        ctx.drawImage(this.snap, shift, 0);
        break;
      }
      case 'zoom': {
        const s = def.dir === 'down' ? 1 - 0.12 * tp : 1 + 0.14 * tp;
        ctx.translate(dw / 2, dh / 2);
        ctx.scale(s, s);
        ctx.translate(-dw / 2, -dh / 2);
        ctx.drawImage(this.snap, 0, 0);
        break;
      }
      case 'spin': {
        ctx.translate(dw / 2, dh / 2);
        ctx.rotate(tp * 0.4);
        ctx.scale(1 + tp * 0.2, 1 + tp * 0.2);
        ctx.translate(-dw / 2, -dh / 2);
        ctx.drawImage(this.snap, 0, 0);
        break;
      }
      case 'pixel': {
        const blocks = Math.max(4, Math.round(mix(160, 8, tp)));
        this.drawPixelated(this.snap, blocks);
        break;
      }
      case 'glitch': {
        ctx.drawImage(this.snap, 0, 0);
        this.drawGlitchSlices(this.snap, 1 - tp);
        break;
      }
      default:
        ctx.drawImage(this.snap, 0, 0);
        break;
    }
    ctx.restore();
    void raw;
  }

  /** Transforms the context so the incoming clip enters, and returns the alpha to draw it with. */
  private applyIncoming(def: ReturnType<typeof transitionById>, tp: number, raw: number): number {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    if (raw >= 1) return 1;

    switch (def.kind) {
      case 'fade':
        return tp;
      case 'dip':
        // out to the colour in the first half, in from it during the second
        return raw < 0.5 ? 0 : clamp01((raw - 0.5) * 2);
      case 'slide':
        ctx.translate(def.dir === 'right' ? -dw * (1 - tp) : dw * (1 - tp), 0);
        return 1;
      case 'push':
        ctx.translate(0, def.dir === 'down' ? -dh * (1 - tp) : dh * (1 - tp));
        return 1;
      case 'blur': {
        if (def.dir) ctx.translate(def.dir === 'right' ? -dw * (1 - tp) : dw * (1 - tp), 0);
        ctx.filter = `blur(${(1 - tp) * 14 * this.unit}px)`;
        return def.dir ? 1 : tp;
      }
      case 'zoom': {
        const s = def.dir === 'down' ? 1 + 0.22 * (1 - tp) : 1 - 0.16 * (1 - tp);
        ctx.translate(dw / 2, dh / 2);
        ctx.scale(s, s);
        ctx.translate(-dw / 2, -dh / 2);
        return tp;
      }
      case 'spin': {
        ctx.translate(dw / 2, dh / 2);
        ctx.rotate(-(1 - tp) * 0.5);
        ctx.scale(mix(0.7, 1, tp), mix(0.7, 1, tp));
        ctx.translate(-dw / 2, -dh / 2);
        return tp;
      }
      case 'wipe': {
        const r = Math.hypot(dw, dh) * 0.55 * tp;
        ctx.beginPath();
        ctx.arc(dw / 2, dh / 2, Math.max(1, r), 0, Math.PI * 2);
        ctx.clip();
        return 1;
      }
      case 'bars': {
        const count = 8;
        ctx.beginPath();
        for (let b = 0; b < count; b++) {
          if (def.dir === 'down') {
            const bh = dh / count;
            ctx.rect(0, b * bh, dw, bh * tp);
          } else {
            const bw = dw / count;
            ctx.rect(b * bw, 0, bw * tp, dh);
          }
        }
        ctx.clip();
        return 1;
      }
      case 'glitch':
        return tp > 0.35 ? 1 : 0;
      case 'pixel':
        return raw > 0.5 ? 1 : 0;
      default:
        return 1;
    }
  }

  /** Colour flashes and glitch noise painted on top once the incoming frame is down. */
  private drawOverlayPhase(def: ReturnType<typeof transitionById>, tp: number, raw: number): void {
    const { ctx } = this;
    switch (def.kind) {
      case 'flash':
        this.fill(def.color ?? '#FFFFFF', (1 - raw) ** 1.6 * 0.9);
        break;
      case 'dip': {
        // full colour in the middle of the transition, gone at both ends
        const k = 1 - Math.abs(raw - 0.5) * 2;
        this.fill(def.color ?? '#000000', k);
        break;
      }
      case 'glitch':
        if (raw > 0.35) this.drawGlitchSlices(this.canvas, 1 - tp);
        break;
      case 'pixel':
        if (raw > 0.5) {
          const blocks = Math.max(4, Math.round(mix(10, 200, (raw - 0.5) * 2)));
          this.drawPixelated(this.canvas, blocks);
        }
        break;
      default:
        break;
    }
    void ctx;
  }

  /** Scales the frame down to `blocks` wide and back up with smoothing off. */
  private drawPixelated(source: CanvasImageSource, blocks: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const small = Math.max(4, Math.round(blocks));
    const smallH = Math.max(4, Math.round((small * dh) / dw));
    this.tmp.width = small;
    this.tmp.height = smallH;
    const tctx = this.tmp.getContext('2d')!;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(source, 0, 0, small, smallH);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.tmp, 0, 0, dw, dh);
    ctx.restore();
  }

  /** Horizontal slices offset sideways with an RGB fringe: the classic digital tear. */
  private drawGlitchSlices(source: CanvasImageSource, strength: number): void {
    const { ctx } = this;
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    const slices = 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * strength;
    for (let s = 0; s < slices; s++) {
      const y = (dh / slices) * s;
      const h = dh / slices;
      const shift = (Math.sin(s * 12.9898 + strength * 78.233) * 43758.5453 % 1) * dw * 0.06 * strength;
      ctx.drawImage(source, 0, y, dw, h, shift, y, dw, h);
    }
    ctx.restore();
  }

  reset(): void {
    this.lastIndex = -1;
  }
}
