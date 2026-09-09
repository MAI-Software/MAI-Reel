export type MediaKind = 'image' | 'video';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  url: string;
  el: HTMLImageElement | HTMLVideoElement;
  width: number;
  height: number;
  srcDuration: number;
  thumb?: string;
  /** Kept so the audio track can be decoded later for the entertainment mode. */
  file?: File;
}

/** Ids from the effect / transition / grade banks in `data/effects.ts`. */
export type Effect = string;
export type Transition = string;
export type Grade = string;

export type TextAnim = 'none' | 'fade' | 'pop' | 'slide-up' | 'typewriter' | 'karaoke' | 'bounce';

export type ReelMode = 'viral' | 'build' | 'multi';
export type TemplateId = 'punch' | 'flow' | 'story';
export type Aspect = '9:16' | '4:5' | '1:1';
export type TextRole = 'hook' | 'caption' | 'cta';
/** Where the reel is going: each app covers a different part of the frame with its own UI. */
export type Platform = 'generic' | 'tiktok' | 'reels' | 'shorts';

export interface Clip {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  srcIn: number;
  effect: Effect;
  transition: Transition;
  grade: Grade;
  /** Cut around speech: the music ducks under it and the framing follows the speaker. */
  spoken?: boolean;
  /** Where the subject sits in the source frame (0..1), used to reframe the crop. */
  focus?: { x: number; y: number };
}

/** One spoken word with the time it is said, used for word-by-word captions. */
export interface WordTiming {
  start: number;
  end: number;
  text: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  role: TextRole;
  y: number;
  size: number;
  fontId: string;
  styleId: string;
  anim: TextAnim;
  /** Timeline-relative word times from the transcription, when there are any. */
  words?: WordTiming[];
}

/** Subtle audio-reactive camera motion used by the entertainment mode. */
export interface Enhance {
  enabled: boolean;
  /** 0..1 overall strength. */
  intensity: number;
  /** RMS envelope of the source audio, sampled at `hz`. */
  envelope: number[];
  hz: number;
  /** Beat times in seconds, used for the punch-ins. */
  beats: number[];
  /** Voice accents: loud attacks that deserve a dramatic push-in. */
  accents: number[];
  /** Stretches where somebody is speaking, for the dramatic face zoom. */
  speech: Array<{ start: number; end: number }>;
  /** Strength of the dramatic zoom on speech, 0..1 */
  drama: number;
  /** Point of interest to push into, 0..1 of the frame. */
  focus: { x: number; y: number } | null;
  /** Keeps burned-in captions inside the frame while zooming. */
  protectCaptions: boolean;
  shake: boolean;
  faceZoom: boolean;
}

export interface Project {
  aspect: Aspect;
  fps: number;
  mode: ReelMode;
  /** Seed of the variation that produced this edit. */
  seed: number;
  template: TemplateId;
  clips: Clip[];
  texts: TextOverlay[];
  fontId: string;
  styleId: string;
  enhance: Enhance;
  /** How loud the source video is heard, 0..1. Zero mutes every clip. */
  sourceVolume?: number;
  /** How loud the music track is heard, 0..1, before any ducking. */
  musicVolume?: number;
  /** Drives the safe area: TikTok, Reels and Shorts each cover different edges. */
  platform?: Platform;
}
