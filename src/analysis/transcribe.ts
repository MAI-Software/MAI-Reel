export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeProgress {
  /** 'download' while the model is being fetched, 'run' while audio is being decoded. */
  stage: 'download' | 'run';
  /** 0..1 when known. */
  progress: number;
  file?: string;
}

export interface TranscribeOptions {
  /** ISO code, or 'auto' to let Whisper decide. */
  language?: string;
  onProgress?: (p: TranscribeProgress) => void;
}

/** Whisper needs 16 kHz mono. */
const SAMPLE_RATE = 16000;
const MODEL = 'onnx-community/whisper-base';

type Pipe = (audio: Float32Array, opts: Record<string, unknown>) => Promise<TranscriptionOutput>;

interface TransformersLib {
  pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;
}

/**
 * transformers.js is loaded from a CDN instead of being bundled: the ONNX runtime ships a
 * 23 MB wasm blob that would otherwise land in every deploy, and the model weights come over
 * the network anyway. Nothing is fetched until the user asks for a transcription.
 */
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

interface TranscriptionOutput {
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
}

let pipePromise: Promise<Pipe> | null = null;

/** Whisper emits these when there is nothing to transcribe; they are not captions. */
const NON_SPEECH = /^[\s]*[\[(♪*]?\s*(blank_?audio|silence|music|musique|musik|musica|música|applause|aplausos|laughter|risas|inaudible|sonido|sound|noise|ruido|subtítulos realizados por[^)\]]*)\s*[\])♪*]?[\s.]*$/i;

export function isSpeech(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (NON_SPEECH.test(clean)) return false;
  return /[\p{L}\p{N}]/u.test(clean);
}

export function isTranscriptionSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof AudioContext !== 'undefined';
}

/** Loads transformers.js and the Whisper weights once, then keeps them in memory. */
async function getPipe(onProgress?: TranscribeOptions['onProgress']): Promise<Pipe> {
  if (pipePromise) return pipePromise;

  pipePromise = (async () => {
    const lib = (await import(/* @vite-ignore */ LIB_URL)) as unknown as TransformersLib;
    const webgpu = 'gpu' in navigator && Boolean((navigator as { gpu?: unknown }).gpu);
    const pipe = await lib.pipeline('automatic-speech-recognition', MODEL, {
      dtype: webgpu ? 'fp32' : 'q8',
      device: webgpu ? 'webgpu' : 'wasm',
      progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
        if (info.status === 'progress') {
          onProgress?.({ stage: 'download', progress: (info.progress ?? 0) / 100, file: info.file });
        }
      },
    });
    return pipe as unknown as Pipe;
  })();

  try {
    return await pipePromise;
  } catch (err) {
    pipePromise = null;
    throw err;
  }
}

/** Decodes any media file (audio or video) down to the mono 16 kHz buffer Whisper expects. */
export async function decodeForAsr(file: Blob): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }

  const frames = Math.ceil((decoded.duration * SAMPLE_RATE) / 1) || 1;
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * Transcribes a media file entirely in the browser. The model (~85 MB, cached by the browser
 * after the first run) is fetched on demand, so nothing is downloaded until this is called.
 */
export async function transcribeFile(file: Blob, opts: TranscribeOptions = {}): Promise<Cue[]> {
  const pipe = await getPipe(opts.onProgress);
  opts.onProgress?.({ stage: 'run', progress: 0 });
  const audio = await decodeForAsr(file);
  opts.onProgress?.({ stage: 'run', progress: 0.15 });

  const language = opts.language && opts.language !== 'auto' ? opts.language : undefined;
  const output = await pipe(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    task: 'transcribe',
    ...(language ? { language } : {}),
  });

  opts.onProgress?.({ stage: 'run', progress: 1 });
  const total = audio.length / SAMPLE_RATE;
  const chunks = output.chunks ?? [];
  const cues: Cue[] = [];

  for (const chunk of chunks) {
    const text = (chunk.text ?? '').trim();
    if (!isSpeech(text)) continue;
    const start = chunk.timestamp?.[0] ?? cues[cues.length - 1]?.end ?? 0;
    const end = chunk.timestamp?.[1] ?? Math.min(total, start + 2);
    cues.push({ start, end: Math.max(start + 0.4, end), text });
  }

  if (!cues.length && output.text && isSpeech(output.text)) {
    cues.push({ start: 0, end: total, text: output.text.trim() });
  }
  return cues;
}

/** Splits long cues so no caption block is too wide to read on a phone. */
export function splitCues(cues: Cue[], maxChars = 34): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const blocks: string[] = [];
    for (const word of words) {
      const last = blocks[blocks.length - 1];
      if (last && `${last} ${word}`.length <= maxChars) blocks[blocks.length - 1] = `${last} ${word}`;
      else blocks.push(word);
    }
    const span = Math.max(0.4, cue.end - cue.start);
    const chars = blocks.map((b) => b.length);
    const totalChars = chars.reduce((a, b) => a + b, 0) || 1;
    let cursor = cue.start;
    blocks.forEach((text, i) => {
      const share = (chars[i]! / totalChars) * span;
      const end = i === blocks.length - 1 ? cue.end : cursor + share;
      out.push({ start: cursor, end: Math.max(cursor + 0.35, end), text });
      cursor = end;
    });
  }
  return out;
}
