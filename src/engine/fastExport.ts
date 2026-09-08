import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { MediaAsset, Project } from '../types';
import { ReelRenderer, totalDuration } from './render';

/**
 * Offline export with WebCodecs: frames are drawn and encoded as fast as the machine can go
 * instead of being recorded in real time, and the audio is mixed down separately, so a 20 s
 * reel no longer takes 20 s of wall clock and never drops a frame under load.
 *
 * MediaRecorder stays as the fallback for browsers without VideoEncoder or AAC encoding.
 */

/**
 * H.264 in order of preference. The level matters: baseline 3.1 (`42001f`) tops out around
 * 1280x720, so a 1080x1920 reel needs level 4.0+ or the encoder reports the config unsupported.
 */
const VIDEO_CODECS = ['avc1.42002a', 'avc1.4d0028', 'avc1.640028', 'avc1.42001f'];
const AUDIO_CODEC = 'mp4a.40.2'; // AAC-LC
const SAMPLE_RATE = 48000;
const CHANNELS = 2;

export interface FastExportOptions {
  project: Project;
  renderer: ReelRenderer;
  resolve: (id: string) => MediaAsset | undefined;
  /** Music element and the fragment offset chosen in the UI. */
  music?: { file: File; offset: number } | null;
  onProgress?: (fraction: number) => void;
  signal?: { cancelled: boolean };
}

export function isFastExportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/** The first H.264 codec this browser can actually encode at this size, if any. */
async function pickVideoCodec(width: number, height: number): Promise<string | null> {
  for (const codec of VIDEO_CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 8_000_000,
        framerate: 30,
      });
      if (support.supported) return codec;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/** Checks the actual encoder support rather than trusting the feature detection above. */
export async function canFastExport(width: number, height: number): Promise<boolean> {
  if (!isFastExportSupported()) return false;
  try {
    const codec = await pickVideoCodec(width, height);
    if (!codec) return false;
    const audio = await AudioEncoder.isConfigSupported({
      codec: AUDIO_CODEC,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: 128_000,
    });
    return Boolean(audio.supported);
  } catch {
    return false;
  }
}

const decoded = new Map<string, AudioBuffer>();

async function decodeAudio(file: File, key: string): Promise<AudioBuffer | null> {
  const hit = decoded.get(key);
  if (hit) return hit;
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    decoded.set(key, buffer);
    return buffer;
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

/**
 * Renders the whole soundtrack offline: every shot contributes the audio of its own slice of
 * the source video, the music sits underneath, and it ducks under the shots cut around speech.
 */
async function mixdown(opts: FastExportOptions, duration: number): Promise<AudioBuffer | null> {
  const { project, resolve } = opts;
  const frames = Math.ceil(duration * SAMPLE_RATE);
  if (frames <= 0) return null;
  const ctx = new OfflineAudioContext(CHANNELS, frames, SAMPLE_RATE);
  let used = false;

  const sourceVolume = project.sourceVolume ?? 1;
  if (sourceVolume > 0.01) {
    for (const clip of project.clips) {
      const asset = resolve(clip.assetId);
      if (!asset || asset.kind !== 'video' || !asset.file) continue;
      const buffer = await decodeAudio(asset.file, asset.id);
      if (!buffer) continue;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = sourceVolume;
      // a short fade at both ends keeps a jump cut from clicking
      const fade = Math.min(0.03, clip.duration / 4);
      gain.gain.setValueAtTime(0, clip.start);
      gain.gain.linearRampToValueAtTime(sourceVolume, clip.start + fade);
      gain.gain.setValueAtTime(sourceVolume, clip.start + clip.duration - fade);
      gain.gain.linearRampToValueAtTime(0, clip.start + clip.duration);
      node.connect(gain).connect(ctx.destination);
      node.start(clip.start, Math.min(clip.srcIn, Math.max(0, buffer.duration - 0.05)), clip.duration);
      used = true;
    }
  }

  if (opts.music) {
    const buffer = await decodeAudio(opts.music.file, `music:${opts.music.file.name}`);
    if (buffer) {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1, 0);
      // the same ducking the preview does, baked in
      for (const clip of project.clips) {
        if (!clip.spoken || sourceVolume < 0.05) continue;
        gain.gain.setTargetAtTime(0.25, clip.start, 0.12);
        gain.gain.setTargetAtTime(1, clip.start + clip.duration, 0.2);
      }
      node.connect(gain).connect(ctx.destination);
      node.start(0, Math.min(opts.music.offset, Math.max(0, buffer.duration - 0.05)), duration);
      used = true;
    }
  }

  if (!used) return null;
  return ctx.startRendering();
}

/**
 * Hands control back to the page between frames. `setTimeout` is clamped to a second in a
 * background tab, which would make an export in another tab take minutes; a MessageChannel
 * hop is not throttled.
 */
const pump = new MessageChannel();
function yieldToPage(): Promise<void> {
  return new Promise((done) => {
    pump.port1.onmessage = () => done();
    pump.port2.postMessage(0);
  });
}

/** Seeks a video element and waits until the frame is actually there. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const want = Math.max(0, Math.min(time, (video.duration || time) - 0.02));
  if (Math.abs(video.currentTime - want) < 0.005) return Promise.resolve();
  return new Promise((done) => {
    const finish = (): void => {
      video.removeEventListener('seeked', finish);
      done();
    };
    video.addEventListener('seeked', finish, { once: true });
    video.currentTime = want;
    // a stalled seek must not hang the export
    setTimeout(finish, 400);
  });
}

export async function fastExport(opts: FastExportOptions): Promise<Blob> {
  const { project, renderer, resolve } = opts;
  const duration = totalDuration(project);
  const fps = project.fps || 30;
  const width = renderer.canvas.width;
  const height = renderer.canvas.height;

  const codec = (await pickVideoCodec(width, height)) ?? VIDEO_CODECS[0]!;
  const audio = await mixdown(opts, duration);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(audio ? { audio: { codec: 'aac', sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS } } : {}),
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: () => undefined,
  });
  videoEncoder.configure({
    codec,
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps,
  });

  const totalFrames = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < totalFrames; i++) {
    if (opts.signal?.cancelled) break;
    const t = i / fps;

    // put every video that is on screen at this instant on the right frame first
    const clip = project.clips.find((c) => t >= c.start && t < c.start + c.duration);
    if (clip) {
      const asset = resolve(clip.assetId);
      if (asset?.kind === 'video') await seekTo(asset.el as HTMLVideoElement, clip.srcIn + (t - clip.start));
    }

    renderer.draw(project, resolve, t);
    const frame = new VideoFrame(renderer.canvas, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // waiting for the queue to drain beats flushing it: a flush ends the pipeline every time
    while (videoEncoder.encodeQueueSize > 12) {
      await new Promise<void>((done) => videoEncoder.addEventListener('dequeue', () => done(), { once: true }));
    }
    if (i % 5 === 0) {
      opts.onProgress?.(i / totalFrames);
      // let the page breathe so the progress label keeps up
      await yieldToPage();
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();

  if (audio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: () => undefined,
    });
    audioEncoder.configure({
      codec: AUDIO_CODEC,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      bitrate: 128_000,
    });

    const chunk = 1024;
    const planar = new Float32Array(chunk * CHANNELS);
    for (let offset = 0; offset < audio.length; offset += chunk) {
      const size = Math.min(chunk, audio.length - offset);
      for (let ch = 0; ch < CHANNELS; ch++) {
        const data = audio.getChannelData(Math.min(ch, audio.numberOfChannels - 1));
        planar.set(data.subarray(offset, offset + size), ch * size);
      }
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: size,
        numberOfChannels: CHANNELS,
        timestamp: Math.round((offset / SAMPLE_RATE) * 1_000_000),
        data: planar.slice(0, size * CHANNELS),
      });
      audioEncoder.encode(data);
      data.close();
      while (audioEncoder.encodeQueueSize > 30) {
        await new Promise<void>((done) => audioEncoder.addEventListener('dequeue', () => done(), { once: true }));
      }
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  opts.onProgress?.(1);
  return new Blob([buffer], { type: 'video/mp4' });
}
