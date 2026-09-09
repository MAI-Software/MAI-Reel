import type { Clip, MediaAsset, Project } from '../types';
import { MIN_CLIP, reorder, trimEnd, trimStart } from '../engine/trim';

/**
 * The visible timeline: every shot as a block whose width is its length, with handles to trim
 * it and drag to reorder. It is the only place where the edit can be seen as a whole, so it
 * doubles as the scrubber.
 */

export interface TimelineHooks {
  getProject: () => Project;
  resolve: (id: string) => MediaAsset | undefined;
  getTime: () => number;
  /** Move the playhead (and the preview) to this second. */
  onSeek: (time: number) => void;
  /** A trim or a reorder was committed: relayout, score, save. */
  onChange: () => void;
  onSelect: (clipId: string | null) => void;
}

/** Below this a one second shot would be a sliver nobody can grab, so the track scrolls. */
const MIN_PPS = 42;

type DragKind = 'start' | 'end' | 'move' | 'scrub';

interface Drag {
  kind: DragKind;
  clipId: string;
  startX: number;
  /** Clip values when the drag began. */
  from: { srcIn: number; duration: number; index: number };
  moved: boolean;
}

export class Timeline {
  selected: string | null = null;
  private drag: Drag | null = null;
  private pps = MIN_PPS;

  constructor(private root: HTMLElement, private hooks: TimelineHooks) {
    root.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private get clips(): Clip[] {
    return this.hooks.getProject().clips;
  }

  private get duration(): number {
    const clips = this.clips;
    const last = clips[clips.length - 1];
    return last ? last.start + last.duration : 0;
  }

  /** Rebuilds the track. Cheap enough for a handful of shots; the playhead moves on its own. */
  render(): void {
    const clips = this.clips;
    if (!clips.length) {
      this.root.innerHTML = '';
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;

    const width = this.root.clientWidth || 320;
    this.pps = Math.max(MIN_PPS, width / Math.max(0.5, this.duration));

    const blocks = clips
      .map((clip, i) => {
        const asset = this.hooks.resolve(clip.assetId);
        const w = Math.max(28, clip.duration * this.pps);
        const isSel = clip.id === this.selected;
        const label = asset?.kind === 'video' ? `${clip.srcIn.toFixed(1)}s` : '';
        const style = `width:${w.toFixed(1)}px${asset?.thumb ? `;background-image:url(${asset.thumb})` : ''}`;
        return `<div class="tl__clip${isSel ? ' is-selected' : ''}" data-clip="${clip.id}" style="${style}">
          <span class="tl__num">${i + 1}</span>
          <span class="tl__len">${clip.duration.toFixed(1)}s</span>
          ${label ? `<span class="tl__in">${label}</span>` : ''}
          <span class="tl__handle tl__handle--start" data-handle="start" role="slider" aria-label="in"></span>
          <span class="tl__handle tl__handle--end" data-handle="end" role="slider" aria-label="out"></span>
        </div>`;
      })
      .join('');

    this.root.innerHTML = `<div class="tl__track" style="width:${(this.duration * this.pps).toFixed(1)}px">
      ${blocks}
      <div class="tl__playhead" id="tlPlayhead"></div>
    </div>`;
    this.updatePlayhead();
  }

  /** Only moves the line, so it can run on every animation frame. */
  updatePlayhead(): void {
    const head = this.root.querySelector<HTMLElement>('.tl__playhead');
    if (!head) return;
    head.style.transform = `translateX(${(this.hooks.getTime() * this.pps).toFixed(1)}px)`;
  }

  select(clipId: string | null): void {
    if (this.selected === clipId) return;
    this.selected = clipId;
    this.render();
    this.hooks.onSelect(clipId);
  }

  private onDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    const block = target.closest<HTMLElement>('.tl__clip');
    const track = target.closest<HTMLElement>('.tl__track');
    if (!track) return;

    if (!block) {
      // bare track: scrub
      this.drag = { kind: 'scrub', clipId: '', startX: e.clientX, from: { srcIn: 0, duration: 0, index: -1 }, moved: true };
      this.seekFromEvent(e);
      return;
    }

    const clipId = block.dataset.clip!;
    const index = this.clips.findIndex((c) => c.id === clipId);
    const clip = this.clips[index];
    if (!clip) return;

    const handle = target.dataset.handle as 'start' | 'end' | undefined;
    this.drag = {
      kind: handle ?? 'move',
      clipId,
      startX: e.clientX,
      from: { srcIn: clip.srcIn, duration: clip.duration, index },
      moved: false,
    };
    this.select(clipId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === 'scrub') {
      this.seekFromEvent(e);
      return;
    }

    const delta = (e.clientX - drag.startX) / this.pps;
    if (Math.abs(e.clientX - drag.startX) < 3) return;
    drag.moved = true;

    const clips = this.clips;
    const index = clips.findIndex((c) => c.id === drag.clipId);
    const clip = clips[index];
    if (!clip) return;
    const asset = this.hooks.resolve(clip.assetId);

    if (drag.kind === 'start' || drag.kind === 'end') {
      const base: Clip = { ...clip, srcIn: drag.from.srcIn, duration: drag.from.duration };
      const next = drag.kind === 'start' ? trimStart(base, asset, delta) : trimEnd(base, asset, delta);
      clip.srcIn = next.srcIn;
      clip.duration = Math.max(MIN_CLIP, next.duration);
      this.hooks.onChange();
      this.render();
      return;
    }

    // dragging the body reorders: the shot swaps as soon as it passes its neighbour's middle
    const targetIndex = this.indexAtX(e.clientX);
    if (targetIndex >= 0 && targetIndex !== index) {
      const project = this.hooks.getProject();
      project.clips = reorder(project.clips, index, targetIndex);
      this.hooks.onChange();
      this.render();
    }
  };

  private onUp = (): void => {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.kind === 'scrub') return;
    const clip = this.clips.find((c) => c.id === drag.clipId);
    // a tap without movement means "show me this shot"
    if (!drag.moved && clip) this.hooks.onSeek(clip.start + 0.01);
  };

  private indexAtX(clientX: number): number {
    const track = this.root.querySelector<HTMLElement>('.tl__track');
    if (!track) return -1;
    const x = clientX - track.getBoundingClientRect().left;
    const time = x / this.pps;
    const clips = this.clips;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i]!;
      if (time < c.start + c.duration / 2) return i;
    }
    return clips.length - 1;
  }

  private seekFromEvent(e: PointerEvent): void {
    const track = this.root.querySelector<HTMLElement>('.tl__track');
    if (!track) return;
    const x = e.clientX - track.getBoundingClientRect().left;
    this.hooks.onSeek(Math.max(0, Math.min(this.duration, x / this.pps)));
  }
}
