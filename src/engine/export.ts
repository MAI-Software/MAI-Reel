const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMime(): string {
  for (const m of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function extensionFor(mime: string): string {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  audio?: HTMLAudioElement | null;
  bitrate?: number;
  /** Drives playback; the recorder stops when it resolves. */
  run: () => Promise<void>;
}

/** Records the canvas in real time (canvas.captureStream + MediaRecorder). */
export async function recordCanvas(opts: RecordOptions): Promise<{ blob: Blob; mime: string }> {
  const mime = pickMime();
  if (!mime) throw new Error('MediaRecorder not supported');

  const stream = opts.canvas.captureStream(opts.fps);
  let ctxAudio: AudioContext | null = null;

  if (opts.audio) {
    try {
      ctxAudio = new AudioContext();
      const src = ctxAudio.createMediaElementSource(opts.audio);
      const dest = ctxAudio.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ctxAudio.destination);
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      ctxAudio = null;
    }
  }

  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: opts.bitrate ?? 8_000_000,
  });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  rec.start(250);
  try {
    await opts.run();
  } finally {
    await new Promise((r) => setTimeout(r, 220));
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    for (const t of stream.getTracks()) t.stop();
    void ctxAudio?.close();
  }

  return { blob: new Blob(chunks, { type: mime }), mime };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
