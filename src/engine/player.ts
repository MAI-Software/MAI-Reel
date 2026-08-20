import type { MediaAsset, Project } from '../types';
import { ReelRenderer, totalDuration, clipIndexAt } from './render';

export interface PlayerHooks {
  getProject: () => Project;
  resolve: (id: string) => MediaAsset | undefined;
  getAudio: () => HTMLAudioElement | null;
  onTime: (t: number) => void;
  safeZones: () => boolean;
}

/** Real-time preview driver: advances the clock, keeps video/audio elements in sync, draws frames. */
export class Player {
  private raf = 0;
  private last = 0;
  time = 0;
  playing = false;

  constructor(private renderer: ReelRenderer, private hooks: PlayerHooks) {}

  get duration(): number {
    return totalDuration(this.hooks.getProject());
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.duration - 0.05) this.seek(0);
    this.playing = true;
    this.last = performance.now();
    const audio = this.hooks.getAudio();
    if (audio) {
      audio.currentTime = Math.min(this.time, audio.duration || this.time);
      void audio.play().catch(() => undefined);
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.pauseAllVideos();
    this.hooks.getAudio()?.pause();
  }

  seek(t: number): void {
    this.time = Math.max(0, Math.min(t, this.duration));
    this.renderer.reset();
    this.syncMedia(true);
    this.drawNow();
    this.hooks.onTime(this.time);
  }

  drawNow(): void {
    this.renderer.draw(this.hooks.getProject(), this.hooks.resolve, this.time, {
      safeZones: this.hooks.safeZones(),
    });
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.syncMedia(false);
      this.drawNow();
      this.hooks.onTime(this.time);
      this.pause();
      return;
    }
    this.syncMedia(false);
    this.drawNow();
    this.hooks.onTime(this.time);
    this.raf = requestAnimationFrame(this.tick);
  };

  private pauseAllVideos(): void {
    const project = this.hooks.getProject();
    for (const clip of project.clips) {
      const a = this.hooks.resolve(clip.assetId);
      if (a?.kind === 'video') (a.el as HTMLVideoElement).pause();
    }
  }

  /** Keeps the active video element playing at the right source offset; pauses the rest. */
  private syncMedia(hard: boolean): void {
    const project = this.hooks.getProject();
    const i = clipIndexAt(project, this.time);
    const active = i >= 0 ? project.clips[i] : undefined;
    for (const clip of project.clips) {
      const asset = this.hooks.resolve(clip.assetId);
      if (!asset || asset.kind !== 'video') continue;
      const v = asset.el as HTMLVideoElement;
      if (clip !== active) {
        if (!v.paused) v.pause();
        continue;
      }
      const want = clip.srcIn + (this.time - clip.start);
      if (hard || Math.abs(v.currentTime - want) > 0.3) {
        v.currentTime = Math.max(0, Math.min(want, (v.duration || want) - 0.03));
      }
      if (this.playing && v.paused) void v.play().catch(() => undefined);
      if (!this.playing && !v.paused) v.pause();
    }
  }
}
