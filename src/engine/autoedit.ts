import type { Aspect, Clip, Effect, MediaAsset, Project, TemplateId, TextOverlay, Transition } from '../types';
import { uid } from '../state';

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
    });
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
    });
  }

  return { aspect: opts.aspect, fps: 30, template: opts.template, clips, texts };
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
