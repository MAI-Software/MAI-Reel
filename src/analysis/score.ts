import type { Project } from '../types';
import type { MediaStats } from './frames';
import { SAFE, totalDuration } from '../engine/render';
import { styleById } from '../data/typography';
import { t } from '../i18n';

export type FactorId = 'hook' | 'duration' | 'pace' | 'format' | 'text' | 'quality' | 'loop';

export interface Factor {
  id: FactorId;
  score: number;
  max: number;
  /** Raw measurements shown in the UI so the score is auditable. */
  detail: string[];
}

export interface Tip {
  id: string;
  factor: FactorId;
  lost: number;
  sources: string[];
}

export interface ScoreResult {
  total: number;
  factors: Factor[];
  tips: Tip[];
  measured: {
    duration: number;
    cuts: number;
    avgShot: number;
    textCoverage: number;
    luma: number;
    contrast: number;
    sharpness: number;
    motion: number;
    loopDiff: number;
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 1 inside [lo,hi], decaying linearly to 0 at [min,max]. */
function bell(v: number, min: number, lo: number, hi: number, max: number): number {
  if (v >= lo && v <= hi) return 1;
  if (v < lo) return clamp01((v - min) / (lo - min));
  return clamp01((max - v) / (max - hi));
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export interface ScoreContext {
  /** Beat grid of the music, in timeline seconds. */
  beats?: number[];
  /** A music track is loaded. */
  music?: boolean;
}

/** Relative luminance of a hex or rgba() colour, 0..1. Unknown colours read as mid grey. */
function colorLuma(color: string): number {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(color);
  if (rgb) {
    const [r = 128, g = 128, b = 128] = rgb[1]!.split(',').map((v) => Number(v.trim()));
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  }
  return 0.5;
}

export function scoreProject(project: Project, media: MediaStats, audio: ScoreContext = {}): ScoreResult {
  const duration = totalDuration(project);
  const cuts = Math.max(0, project.clips.length - 1);
  const avgShot = project.clips.length ? duration / project.clips.length : 0;
  const hook = project.texts.find((t) => t.role === 'hook');
  const others = project.texts.filter((t) => t.role !== 'hook');
  const textCoverage = duration
    ? clamp01(project.texts.reduce((acc, t) => acc + Math.max(0, t.end - t.start), 0) / duration)
    : 0;
  const g = media.global;
  const first = media.firstFrame ?? g;

  // 1. Hook (20)
  let hookScore = 0;
  const hookDetail: string[] = [];
  if (hook) {
    const early = hook.start <= 0.3;
    const short = hook.text.trim().length <= 60;
    hookScore += early && short ? 8 : early || short ? 5 : 3;
    hookDetail.push(`"${hook.text.slice(0, 32)}" @${round1(hook.start)}s`);
  } else {
    hookDetail.push(t('detail.noHook'));
  }
  const firstClip = project.clips[0];
  const openPace = firstClip ? bell(firstClip.duration, 0, 0.5, 2, 4) : 0;
  hookScore += openPace * 6;
  hookDetail.push(`${t('detail.shot1')} ${round1(firstClip?.duration ?? 0)}s`);
  const openVisual = clamp01(first.contrast * 0.6 + first.sharpness * 0.4);
  hookScore += openVisual * 6;
  hookDetail.push(`${t('detail.contrast')} ${round1(first.contrast * 100)}%`);

  // 2. Duration (15)
  const durScore = bell(duration, 2, 7, 21, 60) * 15;

  // 3. Pace (15) — length, movement, and whether the cuts land on the music and the voice
  const cutTimes = project.clips.slice(1).map((c) => c.start);
  const onBeat = audio.beats?.length
    ? cutTimes.filter((c) => audio.beats!.some((b) => Math.abs(b - c) < 0.14)).length / Math.max(1, cutTimes.length)
    : 0;
  const spokenCuts = project.clips.filter((c) => c.spoken).length / Math.max(1, project.clips.length);
  let paceScore = 0;
  if (cuts === 0) {
    paceScore = clamp01(media.motion * 2.2) * 8;
  } else {
    const sync = audio.beats?.length ? onBeat : spokenCuts;
    paceScore = bell(avgShot, 0.2, 0.8, 2.6, 6) * 10 + clamp01(media.motion * 2) * 2 + clamp01(sync) * 3;
  }

  // 4. Format (10)
  const aspectScore = project.aspect === '9:16' ? 10 : project.aspect === '4:5' ? 7 : 5;
  const outside = project.texts.filter((t) => t.y < SAFE.top || t.y > 1 - SAFE.bottom).length;
  const formatScore = Math.max(0, aspectScore - outside * 2);

  // 5. Text (15) — presence, size, dwell time and whether it can be read over the picture
  let textScore = 0;
  if (others.length >= 1) textScore += 4;
  if (project.texts.every((t) => t.size >= 48) && project.texts.length) textScore += 3;
  if (project.texts.length && project.texts.every((t) => t.end - t.start >= 1.2)) textScore += 2;
  textScore += clamp01(textCoverage / 0.35) * 3;

  let legibility = 1;
  if (project.texts.length) {
    const scores = project.texts.map((overlay) => {
      const style = styleById(overlay.styleId);
      // a box or a heavy outline carries its own contrast with it
      if (style.bg || (style.stroke && (style.strokeWidth ?? 0) >= 0.12)) return 1;
      const clip = project.clips.find((c) => overlay.start >= c.start && overlay.start < c.start + c.duration);
      const behind = media.perClip.find((c) => c.clipId === clip?.id)?.stats.luma ?? g.luma;
      return clamp01(Math.abs(colorLuma(style.fill) - behind) / 0.45);
    });
    legibility = scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  textScore += legibility * 3;

  // 6. Visual quality (15)
  const qualityScore =
    bell(g.luma, 0.05, 0.32, 0.72, 0.95) * 5 +
    clamp01(g.contrast / 0.45) * 5 +
    clamp01(g.sharpness / 0.35) * 3 +
    clamp01(g.colorfulness / 0.3) * 2;

  // 7. Loop & close (10)
  const loopScore = clamp01(1 - media.loopDiff / 0.45) * 6 + (project.texts.some((t) => t.role === 'cta') ? 4 : 0);

  const factors: Factor[] = [
    { id: 'hook', score: hookScore, max: 20, detail: hookDetail },
    { id: 'duration', score: durScore, max: 15, detail: [`${round1(duration)}s`] },
    {
      id: 'pace',
      score: paceScore,
      max: 15,
      detail: [
        `${cuts} ${t('detail.cuts')}`,
        `${round1(avgShot)}s ${t('detail.perShot')}`,
        `${t('detail.motion')} ${round1(media.motion * 100)}%`,
        audio.beats?.length
          ? `${Math.round(onBeat * 100)}% ${t('detail.onBeat')}`
          : `${Math.round(spokenCuts * 100)}% ${t('detail.onVoice')}`,
      ],
    },
    { id: 'format', score: formatScore, max: 10, detail: [project.aspect] },
    {
      id: 'text',
      score: textScore,
      max: 15,
      detail: [
        `${project.texts.length} ${t('detail.texts')}`,
        `${Math.round(textCoverage * 100)}% ${t('detail.coverage')}`,
        `${Math.round(legibility * 100)}% ${t('detail.legible')}`,
      ],
    },
    {
      id: 'quality',
      score: qualityScore,
      max: 15,
      detail: [
        `${t('detail.light')} ${Math.round(g.luma * 100)}%`,
        `${t('detail.contrast')} ${Math.round(g.contrast * 100)}%`,
        `${t('detail.sharp')} ${Math.round(g.sharpness * 100)}%`,
      ],
    },
    { id: 'loop', score: loopScore, max: 10, detail: [`${t('detail.loop')} ${Math.round(media.loopDiff * 100)}%`] },
  ];

  const total = Math.max(1, Math.min(100, Math.round(factors.reduce((a, f) => a + f.score, 0))));

  const tips: Tip[] = [];
  const push = (id: string, factor: FactorId, lost: number, sources: string[]) => {
    if (lost > 0.5) tips.push({ id, factor, lost, sources });
  };

  if (!hook) push('tip.hook.missing', 'hook', 8, ['meta-reels', 'tiktok-cc']);
  else if (hook.text.trim().length > 60) push('tip.hook.long', 'hook', 3, ['tiktok-cc']);
  if (firstClip && firstClip.duration > 2.5) push('tip.hook.slow', 'hook', (1 - openPace) * 6, ['tiktok-cc']);
  if (openVisual < 0.5) push('tip.hook.flat', 'hook', (1 - openVisual) * 6, ['meta-reels']);
  if (duration < 7) push('tip.duration.short', 'duration', 15 - durScore, ['meta-reels', 'yt-shorts']);
  else if (duration > 21) push('tip.duration.long', 'duration', 15 - durScore, ['meta-reels', 'yt-shorts']);
  if (cuts === 0) push('tip.pace.nocuts', 'pace', 15 - paceScore, ['tiktok-cc']);
  else if (avgShot > 2.6) push('tip.pace.slow', 'pace', 15 - paceScore, ['tiktok-cc']);
  else if (avgShot < 0.8) push('tip.pace.fast', 'pace', 15 - paceScore, ['tiktok-cc']);
  if (project.aspect !== '9:16') push('tip.format.aspect', 'format', 10 - formatScore, ['meta-reels', 'yt-shorts']);
  if (others.length === 0) push('tip.text.none', 'text', 5, ['meta-captions', 'yt-shorts']);
  if (textCoverage < 0.3) push('tip.text.coverage', 'text', 3, ['meta-captions']);
  if (legibility < 0.6) push('tip.text.contrast', 'text', (1 - legibility) * 3, ['meta-captions']);
  if (audio.beats?.length && cuts > 1 && onBeat < 0.4) push('tip.pace.offbeat', 'pace', (1 - onBeat) * 3, ['tiktok-cc']);
  if (!audio.music && !project.clips.some((c) => c.spoken)) push('tip.audio.none', 'pace', 2, ['tiktok-cc']);
  if (g.luma < 0.32) push('tip.quality.dark', 'quality', 5, ['meta-reels']);
  else if (g.luma > 0.72) push('tip.quality.bright', 'quality', 3, ['meta-reels']);
  if (g.sharpness < 0.25) push('tip.quality.soft', 'quality', 3, ['meta-reels']);
  if (media.loopDiff > 0.45) push('tip.loop.diff', 'loop', 6 - loopScore, ['tiktok-cc']);
  if (!project.texts.some((t) => t.role === 'cta')) push('tip.loop.cta', 'loop', 4, ['meta-reels']);

  tips.sort((a, b) => b.lost - a.lost);

  return {
    total,
    factors,
    tips,
    measured: {
      duration,
      cuts,
      avgShot,
      textCoverage,
      luma: g.luma,
      contrast: g.contrast,
      sharpness: g.sharpness,
      motion: media.motion,
      loopDiff: media.loopDiff,
    },
  };
}
