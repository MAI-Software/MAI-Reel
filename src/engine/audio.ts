export interface AudioTrack {
  el: HTMLAudioElement;
  name: string;
  duration: number;
  /** Normalised waveform peaks (0..1) for the mini waveform. */
  peaks: number[];
  /** Detected beat grid, in seconds from the start of the file. */
  beats: number[];
  bpm: number;
  /** Fragment start inside the file, in seconds. */
  in: number;
}

const PEAK_BINS = 720;

function downmix(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] = out[i]! + data[i]! / buffer.numberOfChannels;
  }
  return out;
}

function computePeaks(mono: Float32Array, bins = PEAK_BINS): number[] {
  const step = Math.max(1, Math.floor(mono.length / bins));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    const from = b * step;
    for (let i = from; i < from + step && i < mono.length; i += 4) {
      const v = Math.abs(mono[i]!);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  return peaks.map((p) => p / max);
}

/** Energy-flux onset detection followed by an inter-onset-interval tempo estimate. */
function detectBeats(mono: Float32Array, sampleRate: number): { beats: number[]; bpm: number } {
  const hop = 512;
  const frames = Math.floor(mono.length / hop);
  if (frames < 8) return { beats: [], bpm: 0 };

  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const from = f * hop;
    for (let i = from; i < from + hop && i < mono.length; i++) sum += mono[i]! * mono[i]!;
    energy[f] = Math.sqrt(sum / hop);
  }

  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, energy[f]! - energy[f - 1]!);

  const win = 20;
  const onsets: number[] = [];
  for (let f = 1; f < frames - 1; f++) {
    let mean = 0;
    let n = 0;
    for (let k = Math.max(0, f - win); k < Math.min(frames, f + win); k++) {
      mean += flux[k]!;
      n++;
    }
    mean /= n || 1;
    const v = flux[f]!;
    if (v > mean * 1.4 && v >= flux[f - 1]! && v >= flux[f + 1]! && v > 0.0015) {
      const time = (f * hop) / sampleRate;
      if (!onsets.length || time - onsets[onsets.length - 1]! > 0.09) onsets.push(time);
    }
  }
  if (onsets.length < 4) return { beats: [], bpm: 0 };

  // tempo: histogram of inter-onset intervals in the 0.25-1.6 s range (37-240 bpm)
  const binMs = 10;
  const hist = new Map<number, number>();
  for (let i = 0; i < onsets.length; i++) {
    for (let j = i + 1; j < Math.min(onsets.length, i + 4); j++) {
      const d = onsets[j]! - onsets[i]!;
      if (d < 0.25 || d > 1.6) continue;
      const bin = Math.round((d * 1000) / binMs);
      hist.set(bin, (hist.get(bin) ?? 0) + 1);
    }
  }
  let bestBin = 0;
  let bestCount = 0;
  for (const [bin, count] of hist) {
    if (count > bestCount) {
      bestCount = count;
      bestBin = bin;
    }
  }
  if (!bestBin) return { beats: [], bpm: 0 };

  let period = (bestBin * binMs) / 1000;
  while (period > 0.86) period /= 2; // fold into a musical 70-240 bpm range
  while (period < 0.34) period *= 2;
  const bpm = Math.round(60 / period);

  // phase: the offset that lines the grid up with the most onsets
  let bestPhase = onsets[0]!;
  let bestScore = -1;
  for (const candidate of onsets.slice(0, 24)) {
    let score = 0;
    for (const o of onsets) {
      const k = Math.round((o - candidate) / period);
      if (Math.abs(o - (candidate + k * period)) < 0.06) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = candidate;
    }
  }

  const duration = mono.length / sampleRate;
  const beats: number[] = [];
  let firstBeat = bestPhase;
  while (firstBeat - period >= 0) firstBeat -= period;
  for (let time = firstBeat; time <= duration; time += period) beats.push(Number(time.toFixed(3)));
  return { beats, bpm };
}

export interface SourceAudio {
  /** RMS envelope normalised to 0..1, sampled at `hz`. */
  envelope: number[];
  hz: number;
  beats: number[];
  bpm: number;
  duration: number;
}

const ENVELOPE_HZ = 20;

function computeEnvelope(mono: Float32Array, sampleRate: number): number[] {
  const frame = Math.max(1, Math.round(sampleRate / ENVELOPE_HZ));
  const out: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < mono.length; i += frame) {
    let sum = 0;
    let n = 0;
    for (let k = i; k < i + frame && k < mono.length; k += 2) {
      sum += mono[k]! * mono[k]!;
      n++;
    }
    const rms = Math.sqrt(sum / (n || 1));
    out.push(rms);
    if (rms > max) max = rms;
  }
  return out.map((v) => Math.min(1, v / max));
}

/** Decodes the audio of any media file (audio or video) for beat and loudness analysis. */
export async function analyzeFileAudio(file: File): Promise<SourceAudio | null> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const mono = downmix(buffer);
    const { beats, bpm } = detectBeats(mono, buffer.sampleRate);
    return {
      envelope: computeEnvelope(mono, buffer.sampleRate),
      hz: ENVELOPE_HZ,
      beats,
      bpm,
      duration: buffer.duration,
    };
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

export async function loadAudioFile(file: File): Promise<AudioTrack> {
  const url = URL.createObjectURL(file);
  const el = new Audio(url);
  el.preload = 'auto';

  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let peaks: number[] = [];
  let beats: number[] = [];
  let bpm = 0;
  let duration = 0;
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    const mono = downmix(buffer);
    duration = buffer.duration;
    peaks = computePeaks(mono);
    const detected = detectBeats(mono, buffer.sampleRate);
    beats = detected.beats;
    bpm = detected.bpm;
  } catch {
    /* undecodable file: it still plays, just without waveform or beats */
  } finally {
    void ctx.close();
  }

  if (!duration) {
    duration = await new Promise<number>((resolve) => {
      if (Number.isFinite(el.duration) && el.duration > 0) return resolve(el.duration);
      el.addEventListener('loadedmetadata', () => resolve(Number.isFinite(el.duration) ? el.duration : 0), {
        once: true,
      });
      setTimeout(() => resolve(0), 2500);
    });
  }

  return { el, name: file.name, duration, peaks, beats, bpm, in: 0 };
}

/** Beats inside [from, from + length], expressed as seconds from the fragment start. */
export function beatsInFragment(track: AudioTrack, length: number): number[] {
  return track.beats
    .filter((b) => b >= track.in - 0.02 && b <= track.in + length + 0.02)
    .map((b) => Number((b - track.in).toFixed(3)))
    .filter((b) => b >= 0);
}

/** Paints the waveform with the selected fragment highlighted and its beat marks. */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  track: AudioTrack,
  fragment: number,
  playhead: number | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  if (!track.duration) return;

  const x = (time: number) => (time / track.duration) * w;
  const fragStart = x(track.in);
  const fragEnd = x(Math.min(track.duration, track.in + fragment));

  ctx.fillStyle = 'rgba(236,72,153,0.16)';
  ctx.fillRect(fragStart, 0, Math.max(2, fragEnd - fragStart), h);

  const bars = track.peaks.length || 1;
  const barW = w / bars;
  for (let i = 0; i < bars; i++) {
    const bx = i * barW;
    const inFragment = bx >= fragStart && bx <= fragEnd;
    const peak = track.peaks[i] ?? 0;
    const bh = Math.max(1, peak * h * 0.86);
    ctx.fillStyle = inFragment ? '#EC4899' : 'rgba(184,192,217,0.35)';
    ctx.fillRect(bx, (h - bh) / 2, Math.max(1, barW * 0.72), bh);
  }

  ctx.fillStyle = 'rgba(37,99,235,0.85)';
  for (const beat of track.beats) {
    if (beat < track.in || beat > track.in + fragment) continue;
    ctx.fillRect(x(beat), 0, Math.max(1, dpr), h * 0.18);
  }

  if (playhead !== null) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x(track.in + playhead), 0, Math.max(1.5, dpr), h);
  }
}
