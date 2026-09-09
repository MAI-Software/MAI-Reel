import { describe, expect, it } from 'vitest';
import { planSegments, shotsFor } from '../engine/segment';
import type { VoiceMap } from '../analysis/voice';

const voice = (spans: Array<[number, number]>): VoiceMap => ({
  speech: spans.map(([start, end]) => ({ start, end, energy: 0.5 })),
  pauses: [],
  accents: [],
  coverage: 0.6,
});

describe('planSegments', () => {
  it('cuts a talking video on its pauses and drops the dead air', () => {
    const segments = planSegments({
      duration: 16,
      want: 8,
      minLen: 0.9,
      maxLen: 5,
      // speaks 2.6 s out of every 4 s
      voice: voice([
        [0, 2.6],
        [4, 6.6],
        [8, 10.6],
        [12, 14.6],
      ]),
    });

    expect(segments).toHaveLength(4);
    expect(segments.map((s) => Math.round(s.srcIn))).toEqual([0, 4, 8, 12]);
    for (const s of segments) expect(s.duration).toBeLessThan(3.2);
    expect(segments.every((s) => s.spoken)).toBe(true);
  });

  it('keeps the best pieces in the order they were said', () => {
    const segments = planSegments({
      duration: 30,
      want: 2,
      minLen: 1,
      maxLen: 4,
      voice: voice([
        [0, 2],
        [5, 7],
        [10, 12],
        [20, 22],
      ]),
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]!.srcIn).toBeLessThan(segments[1]!.srcIn);
  });

  it('spreads shots over a video with no usable voice track', () => {
    const segments = planSegments({ duration: 24, want: 4, minLen: 1, maxLen: 3 });

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => !s.spoken)).toBe(true);
    // no two shots start at the same place, and none runs past the end
    const starts = new Set(segments.map((s) => s.srcIn));
    expect(starts.size).toBe(segments.length);
    for (const s of segments) expect(s.srcIn + s.duration).toBeLessThanOrEqual(24.01);
  });

  it('leaves a short clip whole', () => {
    const segments = planSegments({ duration: 1.2, want: 4, minLen: 1, maxLen: 3 });
    expect(segments).toEqual([{ srcIn: 0, duration: 1.2, score: 0.5, spoken: false }]);
  });
});

describe('shotsFor', () => {
  it('asks for one shot from a short take and several from a long one', () => {
    expect(shotsFor(2, 2)).toBe(1);
    expect(shotsFor(40, 2)).toBeGreaterThan(4);
    expect(shotsFor(600, 2, 8)).toBe(8);
  });
});

describe('planSegments bounds', () => {
  it('never proposes a shot that outlives its footage', () => {
    // the envelope can report speech slightly past the real end of the file
    const segments = planSegments({
      duration: 5,
      want: 6,
      minLen: 0.9,
      maxLen: 5,
      voice: voice([
        [0, 2],
        [3, 5.2],
      ]),
    });

    for (const s of segments) expect(s.srcIn + s.duration).toBeLessThanOrEqual(5.01);
  });
});
