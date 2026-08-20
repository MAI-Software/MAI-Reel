import type { Aspect, Clip, Effect, MediaAsset, Project, TemplateId, TextOverlay, Transition } from '../types';
import { uid } from '../state';
import { DEFAULT_FONT, DEFAULT_STYLE } from '../data/typography';

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
    transitions: ['cut', 'cut', 'zoom'],
    effects: ['zoom-in', 'zoom-out', 'pan-left', 'zoom-in', 'pan-right'],
  },
  flow: {
    id: 'flow',
    minClip: 1.4,
    maxClip: 2.4,
    maxVideoClip: 6,
    target: 15,
    transitions: ['fade', 'slide', 'fade'],
    effects: ['pan-right', 'zoom-in', 'pan-left', 'zoom-out'],
  },
  story: {
    id: 'story',
    minClip: 2.2,
    maxClip: 3.4,
    maxVideoClip: 8,
    target: 20,
    transitions: ['fade', 'fade', 'cut'],
    effects: ['zoom-in', 'zoom-in', 'zoom-out'],
  },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface BuildOptions {
  template: TemplateId;
  aspect: Aspect;
  hook?: string;
  cta?: string;
  target?: number;
  keepTexts?: TextOverlay[];
  fontId?: string;
  styleId?: string;
  /** Optional script: split into timed caption blocks over the whole reel. */
  script?: string;
}

/** Builds a full timeline from the imported assets: durations, effects, transitions and text. */
export function buildProject(assets: MediaAsset[], opts: BuildOptions): Project {
  const spec = TEMPLATES[opts.template];
  const target = opts.target ?? spec.target;
  // With few stills the timeline would fall short of the target, so `flow`/`story` stretch each
  // shot (up to 2x the template cap) and `punch` keeps its cadence and cycles the assets instead.
  const cycle = opts.template === 'punch';
  const cap = cycle ? spec.maxClip : Math.min(spec.maxClip * 2, Math.max(spec.maxClip, target / Math.max(1, assets.length)));
  const perImage = clamp(target / Math.max(1, assets.length), spec.minClip, cap);

  const clips: Clip[] = [];
  let cursor = 0;
  assets.forEach((asset, i) => {
    const duration =
      asset.kind === 'video'
        ? clamp(asset.srcDuration || spec.maxVideoClip, spec.minClip, assets.length === 1 ? Math.max(target, spec.maxVideoClip) : spec.maxVideoClip)
        : perImage;
    clips.push({
      id: uid('c'),
      assetId: asset.id,
      start: cursor,
      duration,
      srcIn: 0,
      effect: asset.kind === 'video' ? 'none' : spec.effects[i % spec.effects.length]!,
      transition: i === 0 ? 'cut' : spec.transitions[i % spec.transitions.length]!,
    });
    cursor += duration;
  });

  const stills = assets.filter((a) => a.kind === 'image');
  if (cycle && stills.length && cursor < target * 0.85) {
    let i = clips.length;
    while (cursor < target - 0.2 && i < 120) {
      const asset = stills[i % stills.length]!;
      const duration = Math.min(perImage, target - cursor);
      if (duration < spec.minClip * 0.6) break;
      clips.push({
        id: uid('c'),
        assetId: asset.id,
        start: cursor,
        duration,
        srcIn: 0,
        effect: spec.effects[i % spec.effects.length]!,
        transition: spec.transitions[i % spec.transitions.length]!,
      });
      cursor += duration;
      i++;
    }
  }

  const total = cursor;
  const fontId = opts.fontId ?? DEFAULT_FONT;
  const styleId = opts.styleId ?? DEFAULT_STYLE;
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
    });
  }
  if (opts.script && total > 1) {
    const hookEnd = texts.find((t) => t.role === 'hook')?.end ?? 0;
    texts.push(...buildCaptions(opts.script, hookEnd, Math.max(hookEnd, total - 2.4), fontId, styleId));
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
    });
  }

  return { aspect: opts.aspect, fps: 30, template: opts.template, clips, texts, fontId, styleId };
}

const MAX_CAPTION_CHARS = 34;

/** Splits a script into readable caption blocks and spreads them over [from, to]. */
export function buildCaptions(
  script: string,
  from: number,
  to: number,
  fontId: string,
  styleId: string,
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
