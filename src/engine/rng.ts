/** Deterministic PRNG (mulberry32): same seed, same edit; new seed, new edit. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length]!;
}

/** Picks `count` distinct items, falling back to repeats when the list is shorter. */
export function pickSome<T>(rng: Rng, list: readonly T[], count: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

/** value ± spread, e.g. jitter(rng, 1.2, 0.25) → 0.9 … 1.5 */
export function jitter(rng: Rng, value: number, spread: number): number {
  return value * (1 + (rng() * 2 - 1) * spread);
}

export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Short human-readable code so a user can tell two versions apart. */
export function seedCode(seed: number): string {
  return seed.toString(36).toUpperCase().slice(0, 5).padStart(5, '0');
}
