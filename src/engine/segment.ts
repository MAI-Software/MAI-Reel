import type { SourceAudio } from './audio';
import type { VoiceMap } from '../analysis/voice';

/** One piece of a source video that deserves to be its own shot. */
export interface SourceSegment {
  srcIn: number;
  duration: number;
  /** 0..1, comparable between segments of the same video. */
  score: number;
  /** True when the piece was cut around detected speech rather than by the clock. */
  spoken: boolean;
}

export interface SegmentOptions {
  /** Length of the source video. */
  duration: number;
  /** How many shots the edit would like out of this video. */
  want: number;
  minLen: number;
  maxLen: number;
  voice?: VoiceMap | null;
  audio?: SourceAudio | null;
}

/** Pauses at least this long are dropped: that is the jump cut. */
const CUT_PAUSE = 0.42;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function energyAt(audio: SourceAudio | null | undefined, from: number, to: number): number {
  if (!audio?.envelope.length) return 0.5;
  const hz = audio.hz || 20;
  const a = Math.max(0, Math.round(from * hz));
  const b = Math.min(audio.envelope.length, Math.round(to * hz));
  if (b <= a) return 0.5;
  let sum = 0;
  for (let i = a; i < b; i++) sum += audio.envelope[i]!;
  return sum / (b - a);
}

/**
 * Cuts a talking video into shots: consecutive speech is glued together until the shot is long
 * enough, and every pause longer than `CUT_PAUSE` becomes a cut, so dead air never reaches the
 * timeline. Returns them in the order they were said.
 */
function speechSegments(opts: SegmentOptions): SourceSegment[] {
  const speech = opts.voice?.speech ?? [];
  if (speech.length < 2) return [];

  const out: SourceSegment[] = [];
  let start = speech[0]!.start;
  let end = speech[0]!.end;

  const close = (): void => {
    const length = end - start;
    if (length < opts.minLen * 0.6) return;
    const srcIn = Math.max(0, start - 0.12);
    // the envelope can run a little past the real end of the file, and the padding adds more:
    // a shot that outlives its footage freezes on its last frame
    const room = Math.max(0, opts.duration - srcIn);
    const duration = Math.min(length + 0.2, opts.maxLen, room);
    if (duration < opts.minLen * 0.5) return;
    out.push({
      srcIn: Number(srcIn.toFixed(2)),
      duration: Number(duration.toFixed(2)),
      score: 0,
      spoken: true,
    });
  };

  for (let i = 1; i < speech.length; i++) {
    const seg = speech[i]!;
    const gap = seg.start - end;
    const length = end - start;
    if (gap >= CUT_PAUSE || length >= opts.maxLen) {
      close();
      start = seg.start;
      end = seg.end;
    } else {
      end = seg.end;
    }
  }
  close();

  const accents = opts.voice?.accents ?? [];
  for (const seg of out) {
    const to = seg.srcIn + seg.duration;
    const loud = energyAt(opts.audio, seg.srcIn, to);
    const punch = accents.filter((a) => a >= seg.srcIn && a < to).length;
    seg.score = clamp(loud * 0.7 + Math.min(1, punch / 2) * 0.3, 0, 1);
  }
  return out;
}

/** No usable voice track: spread the shots over the video and prefer the louder stretches. */
function evenSegments(opts: SegmentOptions): SourceSegment[] {
  const shotLen = clamp(opts.duration / Math.max(1, opts.want), opts.minLen, opts.maxLen);
  const head = opts.duration > shotLen * 3 ? opts.duration * 0.04 : 0;
  const usable = Math.max(shotLen, opts.duration - head * 2);
  const count = Math.max(1, Math.min(opts.want, Math.floor(usable / shotLen)));
  const stride = count > 1 ? (usable - shotLen) / (count - 1) : 0;

  const out: SourceSegment[] = [];
  for (let i = 0; i < count; i++) {
    const srcIn = Number((head + stride * i).toFixed(2));
    out.push({
      srcIn,
      duration: Number(Math.min(shotLen, opts.duration - srcIn).toFixed(2)),
      score: energyAt(opts.audio, srcIn, srcIn + shotLen),
      spoken: false,
    });
  }
  return out;
}

/**
 * Turns one source video into the shots an edit should use. A single long take was the main
 * reason generated reels felt flat: everything below exists so one import becomes several cuts.
 */
export function planSegments(opts: SegmentOptions): SourceSegment[] {
  if (opts.duration <= opts.minLen * 1.6 || opts.want <= 1) {
    return [
      {
        srcIn: 0,
        duration: Number(Math.min(opts.duration, opts.maxLen).toFixed(2)),
        score: 0.5,
        spoken: false,
      },
    ];
  }

  const spoken = speechSegments(opts);
  const pool = spoken.length >= 2 ? spoken : evenSegments(opts);
  if (pool.length <= opts.want) return pool;

  // keep the best ones, then put them back in chronological order so the story still reads
  const best = [...pool].sort((a, b) => b.score - a.score).slice(0, opts.want);
  return best.sort((a, b) => a.srcIn - b.srcIn);
}

/** How many shots a video of this length is worth, given the pacing the template wants. */
export function shotsFor(duration: number, shotLen: number, cap = 8): number {
  if (duration < shotLen * 1.6) return 1;
  return Math.max(2, Math.min(cap, Math.round(duration / Math.max(1.2, shotLen * 1.4))));
}
