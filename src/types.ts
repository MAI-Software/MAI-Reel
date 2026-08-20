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
}

export type Effect = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
export type Transition = 'cut' | 'fade' | 'zoom' | 'slide';
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
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  role: TextRole;
  y: number;
  size: number;
}

export interface Project {
  aspect: Aspect;
  fps: number;
  template: TemplateId;
  clips: Clip[];
  texts: TextOverlay[];
}
