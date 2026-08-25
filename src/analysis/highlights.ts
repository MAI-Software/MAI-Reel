import type { SourceAudio } from '../engine/audio';
import type { VoiceMap } from './voice';

export interface Highlight {
  start: number;
  end: number;
  /** 0..100, comparable between candidates of the same video. */
  score: number;
  /** Individual measurements, shown so the pick is auditable. */
  parts: { speech: number; energy: number; dynamics: number; accents: number };
}

const HOP = 1;

/**
 * Ranks windows of a long video by how "clippable" they sound: dense speech, loud delivery,
 * changes in intensity and punchy accents. Boundaries snap to nearby silences so a cut never
 * lands in the middle of a word.
 */
export function findHighlights(
  audio: SourceAudio,
  voice: VoiceMap,
  opts: { duration: number; count?: number },
): Highlight[] {
  const total = audio.duration || audio.envelope.length / (audio.hz || 20);
  const win = Math.min(opts.duration, Math.max(4, total));
  if (total < win + 1) {
    return [{ start: 0, end: total, score: 50, parts: { speech: voice.coverage, energy: 0, dynamics: 0, accents: 0 } }];
  }

  const hz = audio.hz || 20;
  const env = audio.envelope;
  const at = (time: number) => env[Math.min(env.length - 1, Math.max(0, Math.round(time * hz)))] ?? 0;

  const candidates: Highlight[] = [];
  for (let start = 0; start + win <= total; start += HOP) {
    const end = start + win;

    let speech = 0;
    for (const s of voice.speech) {
      const overlap = Math.min(s.end, end) - Math.max(s.start, start);
      if (overlap > 0) speech += overlap;
    }
    speech /= win;

    let sum = 0;
    let n = 0;
    let min = 1;
    let max = 0;
    for (let time = start; time < end; time += 0.25) {
      const v = at(time);
      sum += v;
      n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const energy = sum / Math.max(1, n);
    const dynamics = Math.max(0, max - min);
    const accents = voice.accents.filter((a) => a >= start && a < end).length / (win / 6);

    const score =
      speech * 45 + Math.min(1, energy / 0.6) * 22 + Math.min(1, dynamics / 0.7) * 18 + Math.min(1, accents) * 15;

    candidates.push({
      start,
      end,
      score,
      parts: { speech, energy, dynamics, accents: Math.min(1, accents) },
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // non-maximum suppression; on a short video there is no room for disjoint windows, so the
  // overlap allowance is relaxed until there are a few options to choose from
  const want = opts.count ?? 4;
  let picked: Highlight[] = [];
  for (const allowed of [0.35, 0.6, 0.8]) {
    picked = [];
    for (const c of candidates) {
      if (picked.some((p) => Math.min(p.end, c.end) - Math.max(p.start, c.start) > win * allowed)) continue;
      picked.push(snapToSilence(c, voice, total, win));
      if (picked.length >= want) break;
    }
    if (picked.length >= Math.min(3, want)) break;
  }

  const top = picked[0]?.score ?? 1;
  return picked
    .map((p) => ({ ...p, score: Math.round(Math.min(100, (p.score / Math.max(1, top)) * 100)) }))
    .sort((a, b) => b.score - a.score);
}

/** Moves the in/out points to the closest silence within 1.5 s so the clip starts clean. */
function snapToSilence(h: Highlight, voice: VoiceMap, total: number, win: number): Highlight {
  const near = (time: number) => {
    let best = time;
    let bestDist = 1.5;
    for (const p of voice.pauses) {
      for (const edge of [p.end, p.start]) {
        const d = Math.abs(edge - time);
        if (d < bestDist) {
          bestDist = d;
          best = edge;
        }
      }
    }
    return best;
  };
  let start = Math.max(0, near(h.start));
  let end = Math.min(total, near(h.end));
  if (end - start < win * 0.6) {
    start = h.start;
    end = h.end;
  }
  return { ...h, start: Number(start.toFixed(2)), end: Number(end.toFixed(2)) };
}
