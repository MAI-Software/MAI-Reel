import type { Aspect, Clip, Effect, Enhance, MediaAsset, Project, TemplateId, TextAnim, TextOverlay, Transition } from '../types';
import { uid } from '../state';
import { DEFAULT_FONT, DEFAULT_STYLE } from '../data/typography';
import { makeRng, randomSeed, pick, jitter, type Rng } from './rng';

export interface TemplateSpec {
  id: TemplateId;
  minClip: number;
  maxClip: number;
  maxVideoClip: number;
  target: number;
  transitions: Transition[];
  effects: Effect[];
}

export const TEMPLATES: Record<TemplateId, TemplateSpec> = {
  punch: {
    id: 'punch',
    minClip: 0.7,
    maxClip: 1.4,
    maxVideoClip: 4,
    target: 12,
    transitions: ['cut', 'flash', 'cut', 'whip'],
    effects: ['punch', 'zoom-in', 'shake', 'zoom-out', 'pan-left', 'punch', 'pan-right'],
  },
  flow: {
    id: 'flow',
    minClip: 1.4,
    maxClip: 2.4,
    maxVideoClip: 6,
    target: 15,
    transitions: ['fade', 'slide', 'wipe', 'fade'],
    effects: ['pan-right', 'zoom-in', 'drift', 'pan-left', 'zoom-out', 'pan-up'],
  },
  story: {
    id: 'story',
    minClip: 2.2,
    maxClip: 3.4,
    maxVideoClip: 8,
    target: 20,
    transitions: ['fade', 'push-up', 'fade'],
    effects: ['zoom-in', 'blur-in', 'drift', 'rotate', 'zoom-out'],
  },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Effects and transitions are drawn from the template pool, never in a fixed rotation. */
function rollEffect(rng: Rng, spec: TemplateSpec, isVideo: boolean): Effect {
  if (isVideo) return rng() < 0.55 ? 'none' : 'zoom-in';
  return pick(rng, spec.effects);
}

function rollTransition(rng: Rng, spec: TemplateSpec, index: number): Transition {
  if (index === 0) return 'cut';
  // a hard cut now and then keeps a run of transitions from feeling mechanical
  return rng() < 0.25 ? 'cut' : pick(rng, spec.transitions);
}

export interface BuildOptions {
  template: TemplateId;
  aspect: Aspect;
  hook?: string;
  cta?: string;
  target?: number;
  keepTexts?: TextOverlay[];
  fontId?: string;
  styleId?: string;
  anim?: TextAnim;
  /** Beat grid (seconds from the reel start) used to snap every cut to the music. */
  beats?: number[];
  /** Optional script: split into timed caption blocks over the whole reel. */
  script?: string;
  enhance?: Enhance;
  /** Variation seed: the same seed rebuilds the same edit, a new one varies it. */
  seed?: number;
}

/** Builds a full timeline from the imported assets: durations, effects, transitions and text. */
export function buildProject(assets: MediaAsset[], opts: BuildOptions): Project {
  const spec = TEMPLATES[opts.template];
  const seed = opts.seed ?? randomSeed();
  const rng = makeRng(seed);
  const target = opts.target ?? spec.target;
  // With few stills the timeline would fall short of the target, so `flow`/`story` stretch each
  // shot (up to 2x the template cap) and `punch` keeps its cadence and cycles the assets instead.
  const cycle = opts.template === 'punch';
  const cap = cycle ? spec.maxClip : Math.min(spec.maxClip * 2, Math.max(spec.maxClip, target / Math.max(1, assets.length)));
  const perImage = clamp(target / Math.max(1, assets.length), spec.minClip, cap);

  const clips: Clip[] = [];
  let cursor = 0;

  const grid = opts.beats && opts.beats.length > 3 ? beatGrid(opts.beats, target, perImage) : null;
  if (grid) {
    grid.forEach((duration, i) => {
      const asset = assets[i % assets.length]!;
      clips.push({
        id: uid('c'),
        assetId: asset.id,
        start: cursor,
        duration: asset.kind === 'video' ? Math.min(duration, asset.srcDuration || duration) : duration,
        srcIn: 0,
        effect: rollEffect(rng, spec, asset.kind === 'video'),
        transition: rollTransition(rng, spec, i),
        grade: 'none',
      });
      cursor += clips[clips.length - 1]!.duration;
    });
  }

  if (!grid)
    assets.forEach((asset, i) => {
    const duration =
      asset.kind === 'video'
        ? clamp(asset.srcDuration || spec.maxVideoClip, spec.minClip, assets.length === 1 ? Math.max(target, spec.maxVideoClip) : spec.maxVideoClip)
        : clamp(jitter(rng, perImage, 0.18), spec.minClip * 0.8, cap * 1.25);
    clips.push({
      id: uid('c'),
      assetId: asset.id,
      start: cursor,
      duration,
      srcIn: 0,
      effect: rollEffect(rng, spec, asset.kind === 'video'),
      transition: rollTransition(rng, spec, i),
      grade: 'none',
    });
    cursor += duration;
  });

  const stills = assets.filter((a) => a.kind === 'image');
  if (!grid && cycle && stills.length && cursor < target * 0.85) {
    let i = clips.length;
    while (cursor < target - 0.2 && i < 120) {
      const asset = stills[i % stills.length]!;
      const duration = Math.min(clamp(jitter(rng, perImage, 0.2), spec.minClip * 0.8, cap), target - cursor);
      if (duration < spec.minClip * 0.6) break;
      clips.push({
        id: uid('c'),
        assetId: asset.id,
        start: cursor,
        duration,
        srcIn: 0,
        effect: rollEffect(rng, spec, false),
        transition: rollTransition(rng, spec, i),
        grade: 'none',
      });
      cursor += duration;
      i++;
    }
  }

  const total = cursor;
  const fontId = opts.fontId ?? DEFAULT_FONT;
  const styleId = opts.styleId ?? DEFAULT_STYLE;
  const anim: TextAnim = opts.anim ?? 'pop';
  const texts: TextOverlay[] = opts.keepTexts ? [...opts.keepTexts] : [];
  if (opts.hook && !texts.some((t) => t.role === 'hook')) {
    texts.push({
      id: uid('t'),
      text: opts.hook,
      start: 0,
      end: Math.min(2.6, total),
      role: 'hook',
      y: 0.3,
      size: 92,
      fontId,
      styleId,
      anim,
    });
  }
  if (opts.script && total > 1) {
    const hookEnd = texts.find((t) => t.role === 'hook')?.end ?? 0;
    texts.push(...buildCaptions(opts.script, hookEnd, Math.max(hookEnd, total - 2.4), fontId, styleId, anim));
  }
  if (opts.cta && total > 3 && !texts.some((t) => t.role === 'cta')) {
    texts.push({
      id: uid('t'),
      text: opts.cta,
      start: Math.max(0, total - 2.4),
      end: total,
      role: 'cta',
      y: 0.72,
      size: 54,
      fontId,
      styleId,
      anim,
    });
  }

  return {
    aspect: opts.aspect,
    fps: 30,
    mode: 'build',
    seed,
    template: opts.template,
    clips,
    texts,
    fontId,
    styleId,
    enhance: opts.enhance ?? idleEnhance(),
  };
}

export function idleEnhance(): Enhance {
  return {
    enabled: false,
    intensity: 0.6,
    envelope: [],
    hz: 20,
    beats: [],
    accents: [],
    speech: [],
    drama: 0.6,
    focus: null,
    protectCaptions: true,
    shake: true,
    faceZoom: true,
  };
}

export interface EntertainOptions {
  aspect: Aspect;
  duration: number;
  enhance: Enhance;
  /** Where the clip starts inside the source video (multi mode trims a long video). */
  srcIn?: number;
}

/**
 * Entertainment mode: one continuous shot over an already-edited video. No cuts, no overlays,
 * nothing that could cover a face or burned-in captions — only the audio-reactive camera move.
 */
export function buildEntertainProject(asset: MediaAsset, opts: EntertainOptions): Project {
  return {
    aspect: opts.aspect,
    fps: 30,
    mode: 'viral',
    seed: randomSeed(),
    template: 'flow',
    clips: [
      {
        id: uid('c'),
        assetId: asset.id,
        start: 0,
        duration: Math.max(1, opts.duration),
        srcIn: opts.srcIn ?? 0,
        effect: 'none',
        transition: 'cut',
        grade: 'none',
      },
    ],
    texts: [],
    fontId: DEFAULT_FONT,
    styleId: DEFAULT_STYLE,
    enhance: opts.enhance,
  };
}

const MAX_CAPTION_CHARS = 34;

/** Splits a script into readable caption blocks and spreads them over [from, to]. */
export function buildCaptions(
  script: string,
  from: number,
  to: number,
  fontId: string,
  styleId: string,
  anim: TextAnim = 'slide-up',
): TextOverlay[] {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length || to - from < 0.5) return [];

  const blocks: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length > MAX_CAPTION_CHARS && current) {
      blocks.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) blocks.push(current);

  const span = to - from;
  const totalChars = blocks.reduce((a, b) => a + b.length, 0) || 1;
  const out: TextOverlay[] = [];
  let cursor = from;
  blocks.forEach((text, i) => {
    const share = (text.length / totalChars) * span;
    const dur = Math.max(1.1, share);
    const start = cursor;
    const end = i === blocks.length - 1 ? Math.max(start + dur, to) : start + dur;
    out.push({
      id: uid('t'),
      text,
      start,
      end,
      role: 'caption',
      y: 0.74,
      size: 56,
      fontId,
      styleId,
      anim,
    });
    cursor = end;
  });
  return out;
}

/** Adds new media at the end of an existing timeline without discarding manual edits. */
export function appendAssets(project: Project, assets: MediaAsset[]): Project {
  const spec = TEMPLATES[project.template];
  let cursor = project.clips.reduce((a, c) => a + c.duration, 0);
  assets.forEach((asset, i) => {
    const idx = project.clips.length;
    const duration =
      asset.kind === 'video'
        ? clamp(asset.srcDuration || spec.maxClip, spec.minClip, spec.maxVideoClip)
        : spec.maxClip;
    project.clips.push({
      id: uid('c'),
      assetId: asset.id,
      start: cursor,
      duration,
      srcIn: 0,
      effect: asset.kind === 'video' ? 'none' : spec.effects[(idx + i) % spec.effects.length]!,
      transition: idx === 0 ? 'cut' : spec.transitions[(idx + i) % spec.transitions.length]!,
      grade: project.clips[project.clips.length - 1]?.grade ?? 'none',
    });
    cursor += duration;
  });
  return relayout(project);
}

/** Re-flows clip start times after edits (reorder / duration change / delete). */
export function relayout(project: Project): Project {
  let cursor = 0;
  for (const c of project.clips) {
    c.start = cursor;
    cursor += c.duration;
  }
  return project;
}

/** Turns a beat grid into shot lengths: every cut lands on a beat, each shot close to `desired`. */
function beatGrid(beats: number[], target: number, desired: number): number[] {
  const inRange = beats.filter((b) => b >= 0 && b <= target);
  if (inRange.length < 4) return [];
  const diffs: number[] = [];
  for (let i = 1; i < inRange.length; i++) diffs.push(inRange[i]! - inRange[i - 1]!);
  diffs.sort((a, b) => a - b);
  const beatLen = diffs[Math.floor(diffs.length / 2)] ?? 0.5;
  const stride = Math.max(1, Math.round(desired / beatLen));

  const bounds: number[] = [];
  for (let i = 0; i < inRange.length; i += stride) bounds.push(inRange[i]!);
  if (bounds[0]! > 0.05) bounds.unshift(0);
  const last = bounds[bounds.length - 1]!;
  if (target - last > beatLen * stride * 0.5) bounds.push(target);

  const out: number[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const d = Number((bounds[i]! - bounds[i - 1]!).toFixed(3));
    if (d >= 0.3) out.push(d);
  }
  return out;
}
