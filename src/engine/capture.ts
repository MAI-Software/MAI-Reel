export type CaptureFailure = 'unsupported' | 'denied' | 'noaudio' | 'norecorder';

export class CaptureError extends Error {
  constructor(readonly reason: CaptureFailure) {
    super(reason);
    this.name = 'CaptureError';
  }
}

export interface Capture {
  /** Stops the recording and resolves with the captured audio. */
  stop: () => Promise<Blob>;
  /** Seconds recorded so far. */
  elapsed: () => number;
}

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function isCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Records the audio the browser tab is playing. This is how a YouTube or Instagram embed can
 * be transcribed at all: their media lives in a cross-origin frame that Web Audio cannot read,
 * but the user can share this tab's sound, which the browser hands over as a normal stream.
 */
export async function captureTabAudio(): Promise<Capture> {
  if (!isCaptureSupported()) throw new CaptureError('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Chrome refuses audio-only capture, the video track is dropped right after
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      // @ts-expect-error - Chromium-only hint that preselects this tab in the picker
      preferCurrentTab: true,
    });
  } catch {
    throw new CaptureError('denied');
  }

  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  if (!stream.getAudioTracks().length) {
    for (const track of stream.getTracks()) track.stop();
    throw new CaptureError('noaudio');
  }

  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) {
    for (const track of stream.getTracks()) track.stop();
    throw new CaptureError('norecorder');
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(500);
  const started = performance.now();

  return {
    elapsed: () => (performance.now() - started) / 1000,
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      for (const track of stream.getTracks()) track.stop();
      return new Blob(chunks, { type: mime });
    },
  };
}
