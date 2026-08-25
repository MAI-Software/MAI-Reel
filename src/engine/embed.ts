export interface EmbedInfo {
  platform: 'youtube' | 'instagram' | 'tiktok' | 'vimeo' | 'facebook' | 'twitch';
  /** URL for the official embed player. */
  src: string;
  /** Embeds that are always vertical (reels, shorts, tiktoks). */
  vertical: boolean;
  /** True when the player can be driven with postMessage (play, pause, progress). */
  controllable: boolean;
}

const YT_ID = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/live\/)([A-Za-z0-9_-]{6,})/;
const IG_CODE = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const TT_ID = /tiktok\.com\/(?:@[^/]+\/video\/|v\/)(\d+)/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;
const TWITCH_ID = /twitch\.tv\/videos\/(\d+)/;

/**
 * Turns a platform link into its official embed. The embed plays the video, but its audio
 * lives in a cross-origin frame: it cannot be read with Web Audio, which is why transcribing
 * one needs the tab-audio capture instead.
 */
export function embedFor(url: string): EmbedInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const href = parsed.href;

  if (host.endsWith('youtube.com') || host === 'youtu.be' || host.endsWith('youtube-nocookie.com')) {
    const id = YT_ID.exec(href)?.[1];
    if (!id) return null;
    const start = Number(parsed.searchParams.get('t')?.replace(/[^0-9]/g, '') ?? 0);
    // enablejsapi lets the page start the video and follow its progress over postMessage,
    // which is what makes the no-server capture a single button
    const query = `?enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(location.origin)}${
      start ? `&start=${start}` : ''
    }`;
    return {
      platform: 'youtube',
      src: `https://www.youtube-nocookie.com/embed/${id}${query}`,
      vertical: /\/shorts\//.test(href),
      controllable: true,
    };
  }

  if (host.endsWith('instagram.com')) {
    const code = IG_CODE.exec(href)?.[1];
    if (!code) return null;
    return { platform: 'instagram', controllable: false, src: `https://www.instagram.com/p/${code}/embed`, vertical: true };
  }

  if (host.endsWith('tiktok.com')) {
    const id = TT_ID.exec(href)?.[1];
    if (!id) return null;
    return { platform: 'tiktok', controllable: false, src: `https://www.tiktok.com/embed/v2/${id}`, vertical: true };
  }

  if (host.endsWith('vimeo.com')) {
    const id = VIMEO_ID.exec(href)?.[1];
    if (!id) return null;
    return { platform: 'vimeo', controllable: false, src: `https://player.vimeo.com/video/${id}`, vertical: false };
  }

  if (host.endsWith('twitch.tv')) {
    const id = TWITCH_ID.exec(href)?.[1];
    if (!id) return null;
    return {
      platform: 'twitch',
      controllable: false,
      src: `https://player.twitch.tv/?video=${id}&parent=${location.hostname}`,
      vertical: false,
    };
  }

  if (host.endsWith('facebook.com') || host === 'fb.watch') {
    return {
      platform: 'facebook',
      controllable: false,
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`,
      vertical: false,
    };
  }

  return null;
}
