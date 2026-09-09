import type { Clip, MediaAsset, Overlay, Project } from '../types';
import { overlayBox } from '../engine/render';

/**
 * Direct manipulation on the preview: drag to move, wheel or pinch to zoom. It works on the
 * layer under the finger — a picture-in-picture if there is one there, otherwise the shot
 * itself — so the framing is adjusted where it is seen instead of through sliders.
 */

export interface FramingHooks {
  getProject: () => Project;
  resolve: (id: string) => MediaAsset | undefined;
  getTime: () => number;
  /** The shot currently selected on the timeline, if any. */
  selectedClip: () => string | null;
  onChange: () => void;
  onSelectOverlay: (id: string | null) => void;
  /** True while the reel is playing: dragging then would fight the playhead. */
  isPlaying: () => boolean;
}

type Handle = { kind: 'clip'; clip: Clip } | { kind: 'overlay'; overlay: Overlay };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const MIN_SCALE = 0.12;
const MAX_SCALE = 1.6;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Which layer is under this point of the canvas, in canvas fractions. */
export function pick(project: Project, ratioOf: (id: string) => number, t: number, fx: number, fy: number): Overlay | null {
  const overlays = (project.overlays ?? []).filter((o) => t >= o.start && t < o.start + o.duration);
  // the last one drawn is the one on top, so the search runs backwards
  for (let i = overlays.length - 1; i >= 0; i--) {
    const overlay = overlays[i]!;
    const box = overlayBox(overlay, 1, 1, ratioOf(overlay.assetId));
    if (fx >= box.x && fx <= box.x + box.w && fy >= box.y && fy <= box.y + box.h) return overlay;
  }
  return null;
}

export class Framing {
  selectedOverlay: string | null = null;
  private dragging: Handle | null = null;
  private last = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchZoom = 1;

  constructor(private view: HTMLElement, private hooks: FramingHooks) {
    view.addEventListener('pointerdown', this.onDown);
    view.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    view.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private ratioOf = (assetId: string): number => {
    const asset = this.hooks.resolve(assetId);
    return asset && asset.height ? asset.width / asset.height : 1;
  };

  private activeClip(): Clip | null {
    const project = this.hooks.getProject();
    const selected = this.hooks.selectedClip();
    const t = this.hooks.getTime();
    return (
      project.clips.find((c) => c.id === selected) ??
      project.clips.find((c) => t >= c.start && t < c.start + c.duration) ??
      null
    );
  }

  private handleAt(fx: number, fy: number): Handle | null {
    const project = this.hooks.getProject();
    const overlay = pick(project, this.ratioOf, this.hooks.getTime(), fx, fy);
    if (overlay) return { kind: 'overlay', overlay };
    const clip = this.activeClip();
    return clip ? { kind: 'clip', clip } : null;
  }

  private fractions(e: PointerEvent): { x: number; y: number } {
    const rect = this.view.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.hooks.isPlaying()) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = Array.from(this.pointers.values());
      this.pinchStart = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const handle = this.dragging;
      this.pinchZoom = handle?.kind === 'overlay' ? handle.overlay.scale : handle?.clip.frame?.zoom ?? 1;
      return;
    }

    const point = this.fractions(e);
    const handle = this.handleAt(point.x, point.y);
    if (!handle) return;
    this.dragging = handle;
    this.last = { x: e.clientX, y: e.clientY };
    this.selectedOverlay = handle.kind === 'overlay' ? handle.overlay.id : null;
    this.hooks.onSelectOverlay(this.selectedOverlay);
    this.view.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2 && this.pinchStart > 0) {
      const [a, b] = Array.from(this.pointers.values());
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.zoomTo(this.pinchZoom * (distance / this.pinchStart));
      return;
    }

    const rect = this.view.getBoundingClientRect();
    const dx = (e.clientX - this.last.x) / rect.width;
    const dy = (e.clientY - this.last.y) / rect.height;
    this.last = { x: e.clientX, y: e.clientY };

    if (this.dragging.kind === 'overlay') {
      const overlay = this.dragging.overlay;
      overlay.x = clamp(overlay.x + dx, -0.2, 1.2);
      overlay.y = clamp(overlay.y + dy, -0.2, 1.2);
    } else {
      const clip = this.dragging.clip;
      const frame = (clip.frame ??= { zoom: 1, x: 0, y: 0 });
      frame.x = clamp(frame.x + dx, -1, 1);
      frame.y = clamp(frame.y + dy, -1, 1);
    }
    this.hooks.onChange();
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (!this.pointers.size) this.dragging = null;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.hooks.isPlaying()) return;
    const rect = this.view.getBoundingClientRect();
    const point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const handle = this.handleAt(point.x, point.y);
    if (!handle) return;
    e.preventDefault();
    this.dragging = handle;
    const step = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const current = handle.kind === 'overlay' ? handle.overlay.scale : handle.clip.frame?.zoom ?? 1;
    this.zoomTo(current * step);
    this.dragging = null;
  };

  /** Applies a zoom to whatever is being manipulated, within sane bounds. */
  private zoomTo(value: number): void {
    const handle = this.dragging;
    if (!handle) return;
    if (handle.kind === 'overlay') {
      handle.overlay.scale = clamp(value, MIN_SCALE, MAX_SCALE);
    } else {
      const frame = (handle.clip.frame ??= { zoom: 1, x: 0, y: 0 });
      frame.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    }
    this.hooks.onChange();
  }

  /** Sets the zoom of the selected shot from a control rather than from a gesture. */
  zoomClip(clip: Clip, value: number): void {
    const frame = (clip.frame ??= { zoom: 1, x: 0, y: 0 });
    frame.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.hooks.onChange();
  }
}

export { MIN_ZOOM, MAX_ZOOM, MIN_SCALE, MAX_SCALE };
