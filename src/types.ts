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

export type Effect =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'punch'
  | 'shake'
  | 'rotate'
  | 'blur-in'
  | 'drift';

export type Transition = 'cut' | 'fade' | 'zoom' | 'slide' | 'whip' | 'flash' | 'push-up' | 'wipe';

export type TextAnim = 'none' | 'fade' | 'pop' | 'slide-up' | 'typewriter' | 'karaoke' | 'bounce';

/** Colour look applied to a clip. */
export type Grade = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'film' | 'vhs' | 'dream' | 'night';

export type ReelMode = 'edit' | 'entertain';
export type TemplateId = 'punch' | 'flow' | 'story';
export type Aspect = '9:16' | '4:5' | '1:1';
export type TextRole = 'hook' | 'caption' | 'cta';

export interface Clip {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  srcIn: number;
  effect: Effect;
  transition: Transition;
  grade: Grade;
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
  template: TemplateId;
  clips: Clip[];
  texts: TextOverlay[];
  fontId: string;
  styleId: string;
  enhance: Enhance;
}
