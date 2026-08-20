import type { MediaAsset, Project } from './types';

export interface AppState {
  assets: MediaAsset[];
  project: Project;
  audio: { el: HTMLAudioElement; name: string } | null;
  time: number;
  playing: boolean;
  lang: 'es' | 'en';
  showSafeZones: boolean;
}

export const state: AppState = {
  assets: [],
  project: {
    aspect: '9:16',
    fps: 30,
    template: 'punch',
    clips: [],
    texts: [],
  },
  audio: null,
  time: 0,
  playing: false,
  lang: (localStorage.getItem('mai-reel-lang') as 'es' | 'en') ?? 'es',
  showSafeZones: false,
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
