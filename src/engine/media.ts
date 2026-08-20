import type { MediaAsset } from '../types';
import { uid } from '../state';

const IMAGE_RE = /^image\//;
const VIDEO_RE = /^video\//;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    const done = () => {
      if (v.readyState >= 2) resolve(v);
    };
    v.onloadeddata = done;
    v.onloadedmetadata = done;
    v.onerror = () => reject(new Error('video decode failed'));
  });
}

/** Turns picked files into decoded assets. Unsupported files are skipped. */
export async function loadFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  let done = 0;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      if (IMAGE_RE.test(file.type)) {
        const el = await loadImage(url);
        out.push({
          id: uid('a'),
          kind: 'image',
          name: file.name,
          url,
          el,
          width: el.naturalWidth,
          height: el.naturalHeight,
          srcDuration: 0,
        });
      } else if (VIDEO_RE.test(file.type)) {
        const el = await loadVideo(url);
        out.push({
          id: uid('a'),
          kind: 'video',
          name: file.name,
          url,
          el,
          width: el.videoWidth,
          height: el.videoHeight,
          srcDuration: Number.isFinite(el.duration) ? el.duration : 0,
        });
      } else {
        URL.revokeObjectURL(url);
      }
    } catch {
      URL.revokeObjectURL(url);
    }
    onProgress?.(++done, files.length);
  }
  return out;
}

/** Small still used in the media strip. */
export async function thumbnail(asset: MediaAsset, size = 160): Promise<string> {
  const c = document.createElement('canvas');
  const ratio = asset.height ? asset.width / asset.height : 1;
  c.width = size;
  c.height = Math.max(1, Math.round(size / ratio));
  const ctx = c.getContext('2d')!;
  if (asset.kind === 'video') {
    const v = asset.el as HTMLVideoElement;
    if (v.readyState < 2) await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
    if (v.currentTime < 0.05) await seek(v, Math.min(0.1, asset.srcDuration / 2));
  }
  try {
    ctx.drawImage(asset.el as CanvasImageSource, 0, 0, c.width, c.height);
  } catch {
    /* ignore */
  }
  return c.toDataURL('image/jpeg', 0.7);
}

export function seek(v: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(time, (v.duration || 0) - 0.05));
    if (Math.abs(v.currentTime - target) < 0.02) return resolve();
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked);
      resolve();
    };
    v.addEventListener('seeked', onSeeked);
    v.currentTime = target;
    setTimeout(onSeeked, 1500);
  });
}
