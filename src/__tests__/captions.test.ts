import { describe, expect, it } from 'vitest';
import { cuesFromWords, splitCues, isSpeech } from '../analysis/transcribe';

const w = (text: string, start: number, end: number) => ({ text, timestamp: [start, end] as [number, number] });

describe('cuesFromWords', () => {
  it('groups words into blocks and keeps every word time', () => {
    const cues = cuesFromWords(
      [w('hola', 0, 0.4), w('que', 0.4, 0.6), w('tal', 0.6, 0.9), w('estas', 0.9, 1.3)],
      2,
    );

    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('hola que tal estas');
    expect(cues[0]!.words).toHaveLength(4);
    expect(cues[0]!.start).toBe(0);
    expect(cues[0]!.end).toBeCloseTo(1.3, 2);
  });

  it('breaks a block on a real pause', () => {
    const cues = cuesFromWords([w('uno', 0, 0.4), w('dos', 0.5, 0.8), w('tres', 3, 3.4)], 4);

    expect(cues).toHaveLength(2);
    expect(cues[1]!.text).toBe('tres');
    expect(cues[1]!.start).toBe(3);
  });

  it('breaks a block after a full stop', () => {
    const cues = cuesFromWords([w('vale.', 0, 0.4), w('sigo', 0.5, 0.9)], 2);
    expect(cues.map((c) => c.text)).toEqual(['vale.', 'sigo']);
  });

  it('never lets a block outgrow a phone screen', () => {
    const words = Array.from({ length: 20 }, (_, i) => w('palabra', i * 0.3, i * 0.3 + 0.25));
    for (const cue of cuesFromWords(words, 8)) expect(cue.text.length).toBeLessThanOrEqual(34);
  });
});

describe('splitCues', () => {
  it('carries the word times into each piece', () => {
    const [cue] = cuesFromWords(
      [w('una', 0, 0.3), w('frase', 0.3, 0.7), w('bastante', 0.7, 1.2), w('larga', 1.2, 1.6)],
      2,
    );
    const pieces = splitCues([cue!], 12);

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => (p.words?.length ?? 0) > 0)).toBe(true);
  });
});

describe('isSpeech', () => {
  it('rejects what Whisper emits for silence', () => {
    expect(isSpeech('[BLANK_AUDIO]')).toBe(false);
    expect(isSpeech('(música)')).toBe(false);
    expect(isSpeech('   ')).toBe(false);
    expect(isSpeech('hola')).toBe(true);
  });
});
