import type { MediaAsset, Project } from './types';
import { DEFAULT_FONT, DEFAULT_STYLE } from './data/typography';
import type { AudioTrack } from './engine/audio';
import { initialLang, type Lang } from './i18n';

export interface AppState {
  assets: MediaAsset[];
  project: Project;
  audio: AudioTrack | null;
  time: number;
  playing: boolean;
  lang: Lang;
  showSafeZones: boolean;
  /** Currently applied quick-style pack. */
  packId: string | null;
}

export const state: AppState = {
  assets: [],
  project: {
    aspect: '9:16',
    fps: 30,
    template: 'punch',
    mode: 'edit',
    clips: [],
    texts: [],
    fontId: DEFAULT_FONT,
    styleId: DEFAULT_STYLE,
    enhance: {
      enabled: false,
      intensity: 0.6,
      envelope: [],
      hz: 20,
      beats: [],
      focus: null,
      protectCaptions: true,
      shake: true,
      faceZoom: true,
    },
  },
  audio: null,
  time: 0,
  playing: false,
  lang: initialLang(),
  showSafeZones: false,
  packId: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(): void {
  for (const fn of listeners) fn();
}

export function assetById(id: string): MediaAsset | undefined {
  return state.assets.find((a) => a.id === id);
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
