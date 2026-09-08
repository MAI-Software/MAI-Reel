/**
 * One audio graph for the whole app: the music track and the audio of every video asset meet
 * here, so the preview and the export hear the same thing.
 *
 * `createMediaElementSource` can only ever run once per element, and closing the context that
 * owns it mutes the element for good, so the graph is a module-level singleton that is never
 * torn down.
 */

interface Attachment {
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let dest: MediaStreamAudioDestinationNode | null = null;
const attached = new WeakMap<HTMLMediaElement, Attachment>();
let musicGain: GainNode | null = null;
let duck = 1;

function ensure(): { ctx: AudioContext; dest: MediaStreamAudioDestinationNode } | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (!dest) dest = ctx.createMediaStreamDestination();
  return { ctx, dest };
}

/** Routes a media element through the mixer. Safe to call repeatedly with the same element. */
function attach(el: HTMLMediaElement, volume: number): GainNode | null {
  const graph = ensure();
  if (!graph) return null;
  const found = attached.get(el);
  if (found) {
    found.gain.gain.value = volume;
    return found.gain;
  }
  try {
    const source = graph.ctx.createMediaElementSource(el);
    const gain = graph.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(graph.dest);
    gain.connect(graph.ctx.destination);
    attached.set(el, { gain });
    return gain;
  } catch {
    // already routed by something else: leave the element alone rather than muting it
    return null;
  }
}

export function attachMusic(el: HTMLAudioElement): void {
  musicGain = attach(el, duck);
}

export function attachVideo(el: HTMLVideoElement, volume = 1): void {
  attach(el, volume);
}

export function setVideoVolume(el: HTMLVideoElement, volume: number): void {
  const found = attached.get(el);
  if (found) found.gain.gain.value = volume;
}

/**
 * Lowers the music under the voice. Ramped rather than stepped, so the change is heard as a
 * mix decision and not as a click.
 */
export function setDuck(level: number): void {
  duck = Math.max(0, Math.min(1, level));
  if (!musicGain || !ctx) return;
  musicGain.gain.setTargetAtTime(duck, ctx.currentTime, 0.12);
}

/** The mixed stream to record. Null when the browser has no Web Audio. */
export function mixedStream(): MediaStream | null {
  return ensure()?.dest.stream ?? null;
}

/** Browsers suspend the context until a gesture; call this from a click handler. */
export function resumeAudio(): void {
  if (ctx?.state === 'suspended') void ctx.resume();
}

export function isMixed(el: HTMLMediaElement): boolean {
  return attached.has(el);
}
