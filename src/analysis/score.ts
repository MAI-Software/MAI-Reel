import type { Project } from '../types';
import type { MediaStats } from './frames';
import { SAFE, totalDuration } from '../engine/render';

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

export function scoreProject(project: Project, media: MediaStats): ScoreResult {
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
    hookDetail.push(`hook:"${hook.text.slice(0, 32)}" @${round1(hook.start)}s`);
  } else {
    hookDetail.push('hook:none');
  }
  const firstClip = project.clips[0];
  const openPace = firstClip ? bell(firstClip.duration, 0, 0.5, 2, 4) : 0;
  hookScore += openPace * 6;
  hookDetail.push(`shot1:${round1(firstClip?.duration ?? 0)}s`);
  const openVisual = clamp01(first.contrast * 0.6 + first.sharpness * 0.4);
  hookScore += openVisual * 6;
  hookDetail.push(`contrast1:${round1(first.contrast * 100)}%`);

  // 2. Duration (15)
  const durScore = bell(duration, 2, 7, 21, 60) * 15;

  // 3. Pace (15)
  let paceScore = 0;
  if (cuts === 0) {
    paceScore = clamp01(media.motion * 2.2) * 8;
  } else {
    paceScore = bell(avgShot, 0.2, 0.8, 2.6, 6) * 12 + clamp01(media.motion * 2) * 3;
  }

  // 4. Format (10)
  const aspectScore = project.aspect === '9:16' ? 10 : project.aspect === '4:5' ? 7 : 5;
  const outside = project.texts.filter((t) => t.y < SAFE.top || t.y > 1 - SAFE.bottom).length;
  const formatScore = Math.max(0, aspectScore - outside * 2);

  // 5. Text (15)
  let textScore = 0;
  if (others.length >= 1) textScore += 5;
  if (project.texts.every((t) => t.size >= 48) && project.texts.length) textScore += 4;
  if (project.texts.length && project.texts.every((t) => t.end - t.start >= 1.2)) textScore += 3;
  textScore += clamp01(textCoverage / 0.35) * 3;

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
      detail: [`${cuts} cortes`, `${round1(avgShot)}s/plano`, `motion:${round1(media.motion * 100)}%`],
    },
    { id: 'format', score: formatScore, max: 10, detail: [project.aspect] },
    {
      id: 'text',
      score: textScore,
      max: 15,
      detail: [`${project.texts.length} textos`, `${Math.round(textCoverage * 100)}% del tiempo`],
    },
    {
      id: 'quality',
      score: qualityScore,
      max: 15,
      detail: [
        `luz:${Math.round(g.luma * 100)}%`,
        `contraste:${Math.round(g.contrast * 100)}%`,
        `nitidez:${Math.round(g.sharpness * 100)}%`,
      ],
    },
    { id: 'loop', score: loopScore, max: 10, detail: [`dif. bucle:${Math.round(media.loopDiff * 100)}%`] },
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
