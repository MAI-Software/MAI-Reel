export type LinkFailure = 'invalid' | 'platform' | 'cors' | 'network' | 'type' | 'empty';

export class LinkError extends Error {
  constructor(readonly reason: LinkFailure, readonly host?: string) {
    super(reason);
    this.name = 'LinkError';
  }
}

/** Sites whose pages are not the media file and cannot be fetched from a browser. */
const PLATFORMS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'twitter.com',
  'x.com',
  'vimeo.com',
  'twitch.tv',
  'drive.google.com',
  'dailymotion.com',
];

export function platformOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PLATFORMS.find((p) => host === p || host.endsWith(`.${p}`)) ?? null;
  } catch {
    return null;
  }
}

const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|mp3|m4a|wav|ogg|aac|flac)(\?|#|$)/i;

/**
 * Downloads a media file from a direct link. Everything stays client-side, so the server has
 * to allow cross-origin reads: platform page links (YouTube and friends) can never work here.
 */
export async function fetchMediaFromUrl(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<File> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new LinkError('invalid');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new LinkError('invalid');

  const platform = platformOf(parsed.href);
  if (platform) throw new LinkError('platform', platform);

  let response: Response;
  try {
    response = await fetch(parsed.href, { mode: 'cors', credentials: 'omit' });
  } catch {
    // a blocked pre-flight and a dead host are indistinguishable from here
    throw new LinkError('cors');
  }
  if (!response.ok || !response.body) throw new LinkError('network');

  const type = response.headers.get('content-type') ?? '';
  const looksLikeMedia = /^(video|audio)\//.test(type) || MEDIA_EXT.test(parsed.pathname);
  if (!looksLikeMedia) throw new LinkError('type');

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  }
  if (!loaded) throw new LinkError('empty');

  const name = decodeURIComponent(parsed.pathname.split('/').pop() || 'video.mp4');
  const guessed = type || (MEDIA_EXT.test(name) ? `video/${name.split('.').pop()}` : 'video/mp4');
  return new File(parts as BlobPart[], name, { type: guessed });
}
