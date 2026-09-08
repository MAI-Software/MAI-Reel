import type { Clip, Project, TemplateId } from '../types';
import type { ShotProfile } from '../analysis/shot';
import { EFFECTS, GRADES, TRANSITIONS, effectById, type EffectDef, type Energy, type TransitionDef } from '../data/effects';
import type { Rng } from './rng';
import { t, tf } from '../i18n';

/** How punchy each template wants the cutting to feel. */
const TEMPLATE_ENERGY: Record<TemplateId, Energy> = { punch: 2, flow: 1, story: 0 };

export interface ComposeContext {
  profiles: Map<string, ShotProfile>;
  template: TemplateId;
  rng: Rng;
  /** Beat times, so a shot that lands on one can hit harder. */
  beats?: number[];
  /** Forces one look for the whole reel; otherwise it is derived from the footage. */
  grade?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Weighted pick: higher score wins more often, but never always. */
function weightedPick<T>(rng: Rng, scored: Array<{ item: T; score: number }>): T | null {
  const usable = scored.filter((s) => s.score > 0);
  if (!usable.length) return scored[0]?.item ?? null;
  // squaring sharpens the preference without collapsing to "always the best one"
  const total = usable.reduce((a, s) => a + s.score ** 2, 0);
  let roll = rng() * total;
  for (const entry of usable) {
    roll -= entry.score ** 2;
    if (roll <= 0) return entry.item;
  }
  return usable[usable.length - 1]!.item;
}

function panDirection(effect: EffectDef): string | null {
  const pan = effect.motion.pan;
  if (!pan) return null;
  const dx = pan[1][0] - pan[0][0];
  const dy = pan[1][1] - pan[0][1];
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'x+' : 'x-';
  return dy > 0 ? 'y+' : 'y-';
}

/**
 * Scores one camera move against one shot. The measurements narrow the family (a busy frame
 * does not want a shaky push, a portrait crop has no room to pan sideways) and the roll picks
 * inside what is left, so the same footage keeps producing different edits.
 */
function scoreEffect(
  effect: EffectDef,
  shot: ShotProfile | undefined,
  wantedEnergy: Energy,
  recent: string[],
  lastPan: string | null,
): number {
  if (effect.id === 'none') return shot?.motion && shot.motion > 0.3 ? 0.6 : 0.05;

  let score = 1;

  // energy has to be close to what the template is going for
  const gap = Math.abs(effect.energy - wantedEnergy);
  score *= gap === 0 ? 1 : gap === 1 ? 0.55 : 0.15;

  if (!shot) return score;

  // footage that already moves does not need a big camera move on top
  if (shot.kind === 'video') {
    if (effect.suits === 'still') score *= 0.25;
    if (shot.motion > 0.3) score *= effect.energy >= 2 ? 0.3 : 0.8;
  } else if (effect.suits === 'video') {
    score *= 0.5;
  }

  // burned-in text or graphics: only moves that keep it readable
  if (shot.textLikely) score *= effect.safeForText ? 1.3 : 0.15;

  // a portrait source in a vertical frame has almost no width to travel across
  const dir = panDirection(effect);
  if (dir && shot.orientation === 'portrait' && (dir === 'x+' || dir === 'x-')) score *= 0.35;
  if (dir && shot.orientation === 'landscape' && (dir === 'x+' || dir === 'x-')) score *= 1.4;
  if (dir && shot.orientation === 'landscape' && (dir === 'y+' || dir === 'y-')) score *= 0.6;

  // a clear subject invites a push-in; without one, movement across the frame reads better
  const hasSubject = Boolean(shot.subject && shot.subject.coverage > 0.03);
  const isPush = Boolean(effect.motion.zoom && effect.motion.zoom[1] > effect.motion.zoom[0] && !dir);
  if (hasSubject) score *= isPush ? 1.5 : dir ? 0.8 : 1;
  else score *= isPush ? 0.8 : 1.15;

  // busy frames get calmer moves, empty ones can take more
  if (shot.busyness > 0.55) score *= effect.energy === 2 ? 0.45 : 1.2;
  if (shot.busyness < 0.2) score *= effect.energy === 0 ? 0.6 : 1.15;

  // a dark or soft shot loses what little detail it has behind a blur
  if (effect.motion.blur && (shot.luma < 0.3 || shot.sharpness < 0.2)) score *= 0.3;
  // a sharp, detailed still can carry a hard punch
  if (shot.sharpness > 0.45 && effect.energy === 2) score *= 1.25;

  // do not repeat what the last shots just did
  const recentIndex = recent.indexOf(effect.id);
  if (recentIndex >= 0) score *= recentIndex === 0 ? 0.1 : 0.35;
  // and do not pan twice in the same direction in a row
  if (dir && dir === lastPan) score *= 0.25;

  return score;
}

function scoreTransition(
  transition: TransitionDef,
  wantedEnergy: Energy,
  onBeat: boolean,
  shot: ShotProfile | undefined,
  recent: string[],
): number {
  let score = 1;
  const gap = Math.abs(transition.energy - wantedEnergy);
  score *= gap === 0 ? 1 : gap === 1 ? 0.6 : 0.2;

  // a plain cut is the most common choice in short form, so keep it likely
  if (transition.id === 'cut') score *= 1.8;
  // landing on a beat is where a flashy transition earns its place
  if (onBeat) score *= transition.energy === 2 ? 1.6 : 0.8;
  else if (transition.energy === 2) score *= 0.5;

  if (shot?.textLikely && transition.safeForText === false) score *= 0.4;
  if (shot && shot.luma > 0.7 && transition.id === 'dip-white') score *= 0.4;
  if (shot && shot.luma < 0.25 && transition.id === 'dip-black') score *= 0.4;

  const recentIndex = recent.indexOf(transition.id);
  if (recentIndex >= 0 && transition.id !== 'cut') score *= recentIndex === 0 ? 0.15 : 0.4;

  return score;
}

/** Picks one look for the whole reel out of what the footage actually is. */
export function pickGrade(profiles: ShotProfile[], rng: Rng, template: TemplateId): string {
  if (!profiles.length) return 'none';
  const avg = <K extends keyof ShotProfile>(key: K) =>
    profiles.reduce((a, p) => a + (p[key] as number), 0) / profiles.length;

  const luma = avg('luma');
  const warmth = avg('warmth');
  const colour = avg('colorfulness');
  const contrast = avg('contrast');

  const scored = GRADES.map((grade) => {
    let score = 0.35;
    if (grade.id === 'none') score = 0.5;

    // match the temperature the footage already has instead of fighting it
    if (grade.temperature === 'warm' && warmth > 0.08) score += 0.9;
    if (grade.temperature === 'cold' && warmth < -0.05) score += 0.9;
    if (grade.temperature === 'neutral') score += 0.3;

    if (colour < 0.22 && ['vivid', 'punchy', 'teal-orange', 'cyber'].includes(grade.id)) score += 1;
    if (colour > 0.5 && ['faded', 'film', 'pastel', 'bleach'].includes(grade.id)) score += 0.6;
    if (luma < 0.3 && ['night', 'lowkey', 'cyber', 'noir'].includes(grade.id)) score += 0.9;
    if (luma > 0.65 && ['highkey', 'pastel', 'faded', 'golden'].includes(grade.id)) score += 0.8;
    if (contrast < 0.25 && ['punchy', 'vivid', 'teal-orange'].includes(grade.id)) score += 0.7;

    // narrative edits lean cinematic, punchy ones lean saturated
    if (template === 'story' && ['film', 'noir', 'faded', 'golden', 'silver'].includes(grade.id)) score += 0.7;
    if (template === 'punch' && ['vivid', 'punchy', 'cyber', 'vhs', 'teal-orange'].includes(grade.id)) score += 0.7;

    return { item: grade.id, score };
  });

  return weightedPick(rng, scored) ?? 'none';
}

/**
 * Assigns a camera move, an entrance and a look to every shot of a timeline, reading each
 * clip's own profile and keeping the sequence varied.
 */
export function composeShots(project: Project, ctx: ComposeContext): Project {
  const wanted = TEMPLATE_ENERGY[ctx.template];
  const profiles = project.clips.map((c) => ctx.profiles.get(c.assetId));
  const grade = ctx.grade ?? pickGrade(profiles.filter(Boolean) as ShotProfile[], ctx.rng, ctx.template);

  const recentEffects: string[] = [];
  const recentTransitions: string[] = [];
  let lastPan: string | null = null;

  project.clips.forEach((clip: Clip, i) => {
    const shot = profiles[i];
    // the opening shot and the closing one carry more weight, so they get more energy
    const position = i === 0 ? 1 : i === project.clips.length - 1 ? 0.8 : 0;
    const energy = Math.min(2, Math.max(0, wanted + (position > 0.9 ? 1 : 0))) as Energy;

    const effect = weightedPick(
      ctx.rng,
      EFFECTS.map((e) => ({ item: e.id, score: scoreEffect(e, shot, energy, recentEffects, lastPan) })),
    );
    clip.effect = effect ?? 'zoom-in';

    const onBeat = Boolean(
      ctx.beats?.some((b) => Math.abs(b - clip.start) < 0.12) ||
        (shot?.motion ?? 0) > 0.4,
    );
    const transition =
      i === 0
        ? 'cut'
        : weightedPick(
            ctx.rng,
            TRANSITIONS.map((t) => ({
              item: t.id,
              score: scoreTransition(t, energy, onBeat, shot, recentTransitions),
            })),
          ) ?? 'cut';
    clip.transition = transition;
    clip.grade = grade;

    // a wide frame cropped to 9:16 should keep the subject, not the middle of the room
    const subject = shot?.subject;
    if (subject && subject.coverage > 0.02 && Math.hypot(subject.x - 0.5, subject.y - 0.5) > 0.06) {
      clip.focus = { x: subject.x, y: subject.y };
    } else {
      delete clip.focus;
    }

    recentEffects.unshift(clip.effect);
    recentEffects.length = Math.min(recentEffects.length, 3);
    recentTransitions.unshift(clip.transition);
    recentTransitions.length = Math.min(recentTransitions.length, 2);
    lastPan = panDirection(effectById(clip.effect));
  });

  return project;
}

/** Plain-language summary of what the composition decided, for the UI log. */
export function describeComposition(project: Project, profiles: Map<string, ShotProfile>): string[] {
  const notes: string[] = [];
  const all = project.clips.map((c) => profiles.get(c.assetId)).filter(Boolean) as ShotProfile[];
  if (!all.length) return notes;

  const withSubject = all.filter((p) => p.subject && p.subject.coverage > 0.03).length;
  const withText = all.filter((p) => p.textLikely).length;
  const busy = all.filter((p) => p.busyness > 0.55).length;
  const landscape = all.filter((p) => p.orientation === 'landscape').length;

  if (withSubject) notes.push(tf('shot.subject', { n: withSubject }));
  if (withText) notes.push(tf('shot.text', { n: withText }));
  if (busy) notes.push(tf('shot.busy', { n: busy }));
  if (landscape) notes.push(tf('shot.landscape', { n: landscape }));
  notes.push(tf('shot.variety', { n: new Set(project.clips.map((c) => c.effect)).size }));
  void t;
  return notes;
}

export const COMPOSE_ENERGY = TEMPLATE_ENERGY;
export { clamp01 };
