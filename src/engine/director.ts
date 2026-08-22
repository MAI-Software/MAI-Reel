import type { Effect, Grade, MediaAsset, Project, TemplateId, TextAnim } from '../types';
import type { MediaStats } from '../analysis/frames';
import { scoreProject } from '../analysis/score';
import { buildProject, relayout, type BuildOptions } from './autoedit';
import { t, tf } from '../i18n';

export interface StylePack {
  id: string;
  template: TemplateId;
  grade: Grade;
  fontId: string;
  styleId: string;
  anim: TextAnim;
}

/** One-tap looks: pacing + colour + type + text animation in a single choice. */
export const STYLE_PACKS: StylePack[] = [
  { id: 'viral', template: 'punch', grade: 'vivid', fontId: 'anton', styleId: 'pop', anim: 'pop' },
  { id: 'vlog', template: 'flow', grade: 'none', fontId: 'poppins', styleId: 'box', anim: 'slide-up' },
  { id: 'cinema', template: 'story', grade: 'film', fontId: 'montserrat', styleId: 'clean', anim: 'fade' },
  { id: 'retro', template: 'punch', grade: 'vhs', fontId: 'archivo', styleId: 'sticker', anim: 'bounce' },
  { id: 'neon', template: 'punch', grade: 'night', fontId: 'bebas', styleId: 'cyber', anim: 'pop' },
  { id: 'dream', template: 'flow', grade: 'dream', fontId: 'poppins', styleId: 'ghost', anim: 'fade' },
  { id: 'sport', template: 'punch', grade: 'cool', fontId: 'archivo', styleId: 'alert', anim: 'bounce' },
  { id: 'luxury', template: 'story', grade: 'warm', fontId: 'montserrat', styleId: 'gold', anim: 'fade' },
  { id: 'doc', template: 'story', grade: 'mono', fontId: 'atkinson', styleId: 'contrast', anim: 'slide-up' },
  { id: 'karaoke', template: 'flow', grade: 'vivid', fontId: 'anton', styleId: 'lemon', anim: 'karaoke' },
  { id: 'ocean', template: 'flow', grade: 'cool', fontId: 'poppins', styleId: 'ocean', anim: 'slide-up' },
  { id: 'bold', template: 'punch', grade: 'vivid', fontId: 'bebas', styleId: 'shadow', anim: 'pop' },
];

export function packById(id: string): StylePack {
  return STYLE_PACKS.find((p) => p.id === id) ?? STYLE_PACKS[0]!;
}

export function packLabel(pack: StylePack): string {
  return t(`pack.${pack.id}`);
}

export interface DirectorContext {
  assets: MediaAsset[];
  stats: MediaStats;
  bpm?: number;
  beats?: number[];
  hook?: string;
  cta?: string;
  script?: string;
  aspect: Project['aspect'];
  /** assetId → visual strength, used to promote the best frame to the opening shot. */
  assetRank?: Map<string, number>;
}

/** A decision kept as data so it can be re-rendered when the UI language changes. */
export interface Reason {
  key: string;
  n?: number;
  s?: number;
  tplKey?: string;
  gradeKey?: string;
  packId?: string;
  score?: number;
}

export function formatReason(r: Reason): string {
  if (r.packId) return `${t(`pack.${r.packId}`)}: ${r.score}/100`;
  return tf(r.key, {
    n: r.n ?? '',
    s: r.s ?? '',
    tpl: r.tplKey ? t(r.tplKey) : '',
    grade: r.gradeKey ? t(r.gradeKey) : '',
  });
}

export interface DirectorDecision {
  pack: StylePack;
  target: number;
  /** Why each choice was made, as re-translatable data. */
  reasons: Reason[];
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Picks the look and pacing that suit the footage and the music. */
function planFor(ctx: DirectorContext): DirectorDecision {
  const g = ctx.stats.global;
  const reasons: Reason[] = [];

  let template: TemplateId;
  if (ctx.bpm && ctx.bpm >= 110) {
    template = 'punch';
    reasons.push({ key: 'reason.bpm', n: ctx.bpm, tplKey: 'template.punch' });
  } else if (ctx.bpm && ctx.bpm >= 85) {
    template = 'flow';
    reasons.push({ key: 'reason.bpm', n: ctx.bpm, tplKey: 'template.flow' });
  } else if (ctx.assets.length >= 6 || ctx.stats.motion > 0.25) {
    template = 'punch';
    reasons.push({ key: 'reason.busy', tplKey: 'template.punch' });
  } else if (ctx.assets.length <= 2) {
    template = 'story';
    reasons.push({ key: 'reason.sparse', tplKey: 'template.story' });
  } else {
    template = 'flow';
    reasons.push({ key: 'reason.medium', tplKey: 'template.flow' });
  }

  let grade: Grade = 'none';
  if (g.colorfulness < 0.22) {
    grade = 'vivid';
    reasons.push({ key: 'reason.lowColor', n: Math.round(g.colorfulness * 100), gradeKey: 'grade.vivid' });
  } else if (g.luma < 0.3) {
    grade = 'night';
    reasons.push({ key: 'reason.dark', n: Math.round(g.luma * 100), gradeKey: 'grade.night' });
  } else if (g.contrast < 0.28) {
    grade = 'film';
    reasons.push({ key: 'reason.lowContrast', n: Math.round(g.contrast * 100), gradeKey: 'grade.film' });
  } else if (g.luma > 0.62) {
    grade = 'warm';
    reasons.push({ key: 'reason.bright', gradeKey: 'grade.warm' });
  }

  const candidates = STYLE_PACKS.filter((p) => p.template === template);
  const pack =
    candidates.find((p) => p.grade === grade) ??
    ({ ...(candidates[0] ?? STYLE_PACKS[0]!), grade } as StylePack);

  const perShot = template === 'punch' ? 1.1 : template === 'flow' ? 1.9 : 2.8;
  const target = clamp(Math.round(ctx.assets.length * perShot * 1.6), 8, 21);
  reasons.push({ key: 'reason.assets', n: ctx.assets.length, s: target });

  return { pack, target, reasons };
}

/** Effect chosen from each clip's own measurements. */
function effectFor(asset: MediaAsset, sharp: number, motion: number, index: number): Effect {
  if (asset.kind === 'video') return motion > 0.25 ? 'none' : 'zoom-in';
  if (sharp > 0.45) return index % 2 === 0 ? 'punch' : 'zoom-in';
  if (sharp < 0.2) return index % 2 === 0 ? 'drift' : 'blur-in';
  return index % 4 === 0 ? 'pan-left' : index % 4 === 1 ? 'zoom-out' : index % 4 === 2 ? 'pan-right' : 'zoom-in';
}

export interface DirectorResult {
  project: Project;
  decision: DirectorDecision;
  score: number;
  reasons: Reason[];
}

/**
 * Builds several candidate edits from the measured footage, scores each with the same public
 * rubric the UI shows, and returns the best one.
 */
export function autoDirect(ctx: DirectorContext): DirectorResult | null {
  if (!ctx.assets.length) return null;
  const plan = planFor(ctx);

  // strongest frame first: the opening shot is what decides retention
  const ordered = [...ctx.assets];
  if (ctx.assetRank && ordered.length > 1) {
    let bestIndex = 0;
    let bestValue = -1;
    ordered.forEach((asset, i) => {
      const value = ctx.assetRank!.get(asset.id) ?? 0;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    });
    if (bestIndex > 0) {
      const [opener] = ordered.splice(bestIndex, 1);
      ordered.unshift(opener!);
      plan.reasons.push({ key: 'reason.opener', n: bestIndex + 1 });
    }
  }

  const alternates = [plan.pack, ...STYLE_PACKS.filter((p) => p.id !== plan.pack.id).slice(0, 2)];
  let best: DirectorResult | null = null;
  const tried: Reason[] = [];

  for (const pack of alternates) {
    const opts: BuildOptions = {
      template: pack.template,
      aspect: ctx.aspect,
      target: plan.target,
      hook: ctx.hook,
      cta: ctx.cta,
      script: ctx.script,
      fontId: pack.fontId,
      styleId: pack.styleId,
      anim: pack.anim,
      beats: ctx.beats,
    };
    const project = relayout(buildProject(ordered, opts));
    project.clips.forEach((clip, i) => {
      const stat = ctx.stats.perClip.find((c) => c.clipId === clip.id);
      const asset = ctx.assets.find((a) => a.id === clip.assetId);
      if (asset) clip.effect = effectFor(asset, stat?.stats.sharpness ?? 0.3, stat?.motion ?? 0, i);
      clip.grade = pack.grade;
    });

    const result = scoreProject(project, ctx.stats);
    tried.push({ key: 'pack', packId: pack.id, score: result.total });
    if (!best || result.total > best.score) {
      best = { project, decision: { ...plan, pack }, score: result.total, reasons: [] };
    }
  }

  if (best) best.reasons = [...plan.reasons, ...tried];
  return best;
}
