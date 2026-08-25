import type { SourceAudio } from '../engine/audio';

export interface Segment {
  start: number;
  end: number;
  /** Mean loudness inside the segment, 0..1 */
  energy: number;
}

export interface VoiceMap {
  /** Stretches where somebody is talking (or the music is loud). */
  speech: Segment[];
  /** Silences long enough to cut on. */
  pauses: Segment[];
  /** Loud attacks: good moments for a dramatic push-in. */
  accents: number[];
  /** Share of the track covered by speech, 0..1 */
  coverage: number;
}

const MIN_SPEECH = 0.28;
const MERGE_GAP = 0.26;
const MIN_PAUSE = 0.35;

/**
 * Voice activity from the RMS envelope: adaptive threshold over the loudness histogram,
 * then hysteresis so a breath inside a sentence does not split it in two.
 */
export function detectVoice(audio: SourceAudio): VoiceMap {
  const env = audio.envelope;
  const hz = audio.hz || 20;
  if (!env.length) return { speech: [], pauses: [], accents: [], coverage: 0 };

  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const loud = sorted[Math.floor(sorted.length * 0.85)] ?? 1;
  const onLevel = floor + (loud - floor) * 0.35;
  const offLevel = floor + (loud - floor) * 0.2;

  const raw: Segment[] = [];
  let start = -1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < env.length; i++) {
    const v = env[i]!;
    if (start < 0 && v > onLevel) {
      start = i;
      sum = v;
      n = 1;
    } else if (start >= 0) {
      sum += v;
      n++;
      if (v < offLevel) {
        raw.push({ start: start / hz, end: i / hz, energy: sum / n });
        start = -1;
      }
    }
  }
  if (start >= 0) raw.push({ start: start / hz, end: env.length / hz, energy: sum / Math.max(1, n) });

  const speech: Segment[] = [];
  for (const seg of raw) {
    const prev = speech[speech.length - 1];
    if (prev && seg.start - prev.end < MERGE_GAP) {
      prev.end = seg.end;
      prev.energy = (prev.energy + seg.energy) / 2;
    } else {
      speech.push({ ...seg });
    }
  }
  const kept = speech.filter((s) => s.end - s.start >= MIN_SPEECH);

  const pauses: Segment[] = [];
  let cursor = 0;
  for (const s of kept) {
    if (s.start - cursor >= MIN_PAUSE) pauses.push({ start: cursor, end: s.start, energy: 0 });
    cursor = s.end;
  }
  const total = env.length / hz;
  if (total - cursor >= MIN_PAUSE) pauses.push({ start: cursor, end: total, energy: 0 });

  // accents: a frame clearly louder than the second before it, at least 0.6 s apart
  const accents: number[] = [];
  const window = Math.max(2, Math.round(hz * 0.9));
  for (let i = window; i < env.length - 1; i++) {
    let mean = 0;
    for (let k = i - window; k < i; k++) mean += env[k]!;
    mean /= window;
    const v = env[i]!;
    if (v > onLevel && v > mean * 1.45 && v >= env[i - 1]! && v >= env[i + 1]!) {
      const time = i / hz;
      if (!accents.length || time - accents[accents.length - 1]! > 0.6) accents.push(Number(time.toFixed(2)));
    }
  }

  const covered = kept.reduce((a, s) => a + (s.end - s.start), 0);
  return { speech: kept, pauses, accents, coverage: total ? covered / total : 0 };
}

/** Spreads caption blocks over the detected speech instead of over dead air. */
export function timeBlocksToSpeech(blocks: string[], voice: VoiceMap, from: number, to: number): Segment[] {
  const usable = voice.speech.filter((s) => s.end > from && s.start < to);
  if (!blocks.length) return [];
  if (usable.length < 2) {
    const span = Math.max(0.5, to - from);
    return blocks.map((_, i) => ({
      start: from + (span * i) / blocks.length,
      end: from + (span * (i + 1)) / blocks.length,
      energy: 0,
    }));
  }

  // weight each block by its length, then walk the speech timeline consuming that share
  const chars = blocks.map((b) => Math.max(4, b.length));
  const totalChars = chars.reduce((a, b) => a + b, 0);
  const speechTime = usable.reduce((a, s) => a + (Math.min(s.end, to) - Math.max(s.start, from)), 0);

  const out: Segment[] = [];
  let segIndex = 0;
  let cursor = Math.max(from, usable[0]!.start);
  for (let i = 0; i < blocks.length; i++) {
    let need = (chars[i]! / totalChars) * speechTime;
    const start = cursor;
    while (need > 0 && segIndex < usable.length) {
      const seg = usable[segIndex]!;
      const segEnd = Math.min(seg.end, to);
      const available = segEnd - cursor;
      if (available <= 0.01) {
        segIndex++;
        if (segIndex < usable.length) cursor = Math.max(usable[segIndex]!.start, from);
        continue;
      }
      const take = Math.min(available, need);
      cursor += take;
      need -= take;
      if (need > 0.01) {
        segIndex++;
        if (segIndex < usable.length) cursor = Math.max(usable[segIndex]!.start, from);
      }
    }
    out.push({ start, end: Math.max(start + 0.6, cursor), energy: 0 });
  }
  return out;
}
