import type { Cue } from '../analysis/transcribe';

const KEY = 'mai-reel-extractor';

export interface ExtractorTranscript {
  source: 'captions';
  title?: string;
  duration?: number;
  lang?: string;
  cues: Cue[];
}

export type ExtractorFailure = 'noserver' | 'nocaptions' | 'toolong' | 'badurl' | 'ratelimited' | 'extractor' | 'network';

export class ExtractorError extends Error {
  constructor(readonly reason: ExtractorFailure, readonly detail?: string) {
    super(reason);
    this.name = 'ExtractorError';
  }
}

export function extractorUrl(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function setExtractorUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}

export function hasExtractor(): boolean {
  return extractorUrl().length > 0;
}

async function call(path: string, params: Record<string, string>): Promise<Response> {
  const base = extractorUrl();
  if (!base) throw new ExtractorError('noserver');
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    return await fetch(url.toString());
  } catch {
    throw new ExtractorError('network');
  }
}

export async function checkExtractor(base: string): Promise<{ ok: boolean; ytdlp?: string }> {
  const url = base.trim().replace(/\/+$/, '');
  if (!url) return { ok: false };
  try {
    const r = await fetch(`${url}/health`);
    if (!r.ok) return { ok: false };
    return (await r.json()) as { ok: boolean; ytdlp?: string };
  } catch {
    return { ok: false };
  }
}

/** Subtitles the platform already has: instant, and with the real timings of the video. */
export async function fetchLinkTranscript(link: string, lang: string): Promise<ExtractorTranscript> {
  const response = await call('/transcript', { url: link, lang });
  const data = (await response.json().catch(() => ({}))) as Partial<ExtractorTranscript> & { error?: string; detail?: string };
  if (response.ok && data.cues?.length) return data as ExtractorTranscript;
  throw new ExtractorError((data.error as ExtractorFailure) ?? 'extractor', data.detail);
}

/** Fallback when the video carries no subtitles: bring the audio over and let Whisper work. */
export async function fetchLinkAudio(link: string): Promise<File> {
  const response = await call('/audio', { url: link });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new ExtractorError((data.error as ExtractorFailure) ?? 'extractor', data.detail);
  }
  const blob = await response.blob();
  const ext = (blob.type.split('/')[1] ?? 'm4a').replace('mpeg', 'mp3').replace('mp4', 'm4a');
  return new File([blob], `enlace.${ext}`, { type: blob.type || 'audio/mp4' });
}
