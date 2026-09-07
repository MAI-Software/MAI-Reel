/**
 * The bank of camera moves, transitions and looks.
 *
 * Everything is declarative: the renderer interpolates whatever a definition asks for, so a
 * new move is a few numbers here rather than another branch in the draw loop. The metadata
 * (energy, what footage it suits, whether it is safe over text) is what lets the director
 * pick something that fits the shot instead of rotating through a list.
 */

export type Ease = 'linear' | 'smooth' | 'out' | 'in' | 'spring' | 'punch' | 'steps';

/** 0 = calm, 1 = medium, 2 = punchy. */
export type Energy = 0 | 1 | 2;

export interface MotionSpec {
  zoom?: [number, number];
  /** Pan is expressed as a fraction of the overflow, -1 … 1. */
  pan?: [[number, number], [number, number]];
  rot?: [number, number];
  blur?: [number, number];
  ease?: Ease;
  /** Fraction of the shot held still before the move starts. */
  hold?: number;
  /** Handheld / vibration on top of the base move. */
  shake?: { amp: number; freq: number; decay?: boolean };
  /** Slow sine on the zoom, for a breathing frame. */
  breathe?: { amp: number; freq: number };
  /** Counter-rotation while zooming: the vertigo look. */
  counterRot?: number;
}

export interface EffectDef {
  id: string;
  label: string;
  energy: Energy;
  /** 'still' reads better on photos, 'video' on footage that already moves. */
  suits?: 'still' | 'video' | 'any';
  /** False when the move crops or blurs enough to hurt burned-in text. */
  safeForText?: boolean;
  motion: MotionSpec;
}

export const EFFECTS: EffectDef[] = [
  { id: 'none', label: 'Sin efecto', energy: 0, suits: 'any', safeForText: true, motion: {} },

  // --- zooms -------------------------------------------------------------
  { id: 'zoom-in', label: 'Zoom in', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1, 1.14], ease: 'smooth' } },
  { id: 'zoom-out', label: 'Zoom out', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.16, 1], ease: 'smooth' } },
  { id: 'creep', label: 'Zoom lento', energy: 0, suits: 'any', safeForText: true, motion: { zoom: [1.02, 1.09], ease: 'linear' } },
  { id: 'punch', label: 'Punch in', energy: 2, suits: 'still', motion: { zoom: [1.24, 1.02], ease: 'punch' } },
  { id: 'punch-out', label: 'Punch out', energy: 2, suits: 'still', motion: { zoom: [1, 1.2], ease: 'punch' } },
  { id: 'snap-zoom', label: 'Zoom por pasos', energy: 2, suits: 'still', motion: { zoom: [1, 1.22], ease: 'steps' } },
  { id: 'hold-punch', label: 'Espera y golpe', energy: 2, suits: 'still', motion: { zoom: [1.01, 1.18], ease: 'punch', hold: 0.55 } },
  { id: 'bounce-in', label: 'Zoom con rebote', energy: 2, suits: 'still', motion: { zoom: [1.18, 1.02], ease: 'spring' } },
  { id: 'breathe', label: 'Respiración', energy: 0, suits: 'any', safeForText: true, motion: { zoom: [1.04, 1.06], breathe: { amp: 0.02, freq: 0.55 } } },
  { id: 'vertigo', label: 'Vértigo', energy: 2, suits: 'still', motion: { zoom: [1.02, 1.2], rot: [0, 0.03], counterRot: 1, ease: 'smooth' } },

  // --- pans and travelling ----------------------------------------------
  { id: 'pan-left', label: 'Paneo izquierda', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.12, 1.12], pan: [[0.75, 0], [-0.75, 0]], ease: 'smooth' } },
  { id: 'pan-right', label: 'Paneo derecha', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.12, 1.12], pan: [[-0.75, 0], [0.75, 0]], ease: 'smooth' } },
  { id: 'pan-up', label: 'Paneo arriba', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.14, 1.14], pan: [[0, 0.8], [0, -0.8]], ease: 'smooth' } },
  { id: 'pan-down', label: 'Paneo abajo', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.14, 1.14], pan: [[0, -0.8], [0, 0.8]], ease: 'smooth' } },
  { id: 'drift-ne', label: 'Deriva ↗', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.1, 1.16], pan: [[-0.5, 0.5], [0.5, -0.5]], ease: 'smooth' } },
  { id: 'drift-nw', label: 'Deriva ↖', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.1, 1.16], pan: [[0.5, 0.5], [-0.5, -0.5]], ease: 'smooth' } },
  { id: 'drift-se', label: 'Deriva ↘', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.16, 1.1], pan: [[-0.5, -0.5], [0.5, 0.5]], ease: 'smooth' } },
  { id: 'dolly-in', label: 'Dolly con paneo', energy: 1, suits: 'still', motion: { zoom: [1.03, 1.2], pan: [[0.25, 0], [-0.2, 0]], ease: 'out' } },
  { id: 'rise', label: 'Ascenso', energy: 1, suits: 'still', safeForText: true, motion: { zoom: [1.18, 1.06], pan: [[0, -0.45], [0, 0.25]], ease: 'out' } },
  { id: 'fall', label: 'Caída', energy: 1, suits: 'still', motion: { zoom: [1.06, 1.18], pan: [[0, 0.35], [0, -0.35]], ease: 'in' } },
  { id: 'orbit', label: 'Órbita', energy: 2, suits: 'still', motion: { zoom: [1.18, 1.18], pan: [[-0.4, -0.35], [0.4, 0.35]], rot: [-0.02, 0.02], ease: 'smooth' } },
  { id: 'sway', label: 'Vaivén', energy: 1, suits: 'any', safeForText: true, motion: { zoom: [1.1, 1.1], rot: [-0.012, 0.012], breathe: { amp: 0.012, freq: 0.5 }, ease: 'smooth' } },

  // --- rotation and handheld --------------------------------------------
  { id: 'rotate', label: 'Giro suave', energy: 1, suits: 'still', motion: { zoom: [1.16, 1.16], rot: [-0.035, 0.035], ease: 'smooth' } },
  { id: 'tilt-in', label: 'Inclinación', energy: 2, suits: 'still', motion: { zoom: [1.2, 1.05], rot: [0.05, 0], ease: 'out' } },
  { id: 'swing', label: 'Balanceo', energy: 2, suits: 'still', motion: { zoom: [1.14, 1.14], rot: [-0.05, 0.05], ease: 'spring' } },
  { id: 'handheld', label: 'Cámara en mano', energy: 1, suits: 'any', safeForText: true, motion: { zoom: [1.08, 1.1], shake: { amp: 0.012, freq: 5.5 } } },
  { id: 'shake', label: 'Vibración', energy: 2, suits: 'any', motion: { zoom: [1.1, 1.1], shake: { amp: 0.03, freq: 15 } } },
  { id: 'impact', label: 'Impacto', energy: 2, suits: 'any', motion: { zoom: [1.16, 1.04], shake: { amp: 0.05, freq: 18, decay: true }, ease: 'punch' } },

  // --- focus -------------------------------------------------------------
  { id: 'blur-in', label: 'Enfoque', energy: 1, suits: 'still', motion: { zoom: [1.12, 1.04], blur: [16, 0], ease: 'out' } },
  { id: 'blur-out', label: 'Desenfoque final', energy: 1, suits: 'still', motion: { zoom: [1.04, 1.12], blur: [0, 12], ease: 'in' } },
  { id: 'focus-pull', label: 'Cambio de foco', energy: 1, suits: 'any', motion: { zoom: [1.08, 1.12], blur: [10, 0], ease: 'smooth', hold: 0.25 } },
];

export interface TransitionDef {
  id: string;
  label: string;
  energy: Energy;
  /** How the renderer draws it. */
  kind:
    | 'cut'
    | 'fade'
    | 'dip'
    | 'flash'
    | 'slide'
    | 'push'
    | 'zoom'
    | 'wipe'
    | 'bars'
    | 'blur'
    | 'spin'
    | 'glitch'
    | 'pixel';
  /** Direction for slides, pushes and wipes. */
  dir?: 'left' | 'right' | 'up' | 'down';
  /** Colour for dips and flashes. */
  color?: string;
  /** Seconds; the default is 0.32. */
  duration?: number;
  safeForText?: boolean;
}

export const TRANSITIONS: TransitionDef[] = [
  { id: 'cut', label: 'Corte', energy: 0, kind: 'cut', duration: 0, safeForText: true },
  { id: 'fade', label: 'Fundido', energy: 0, kind: 'fade', safeForText: true },
  { id: 'dip-black', label: 'Fundido a negro', energy: 1, kind: 'dip', color: '#000000', safeForText: true },
  { id: 'dip-white', label: 'Fundido a blanco', energy: 1, kind: 'dip', color: '#FFFFFF', safeForText: true },
  { id: 'flash', label: 'Flash', energy: 2, kind: 'flash', color: '#FFFFFF', duration: 0.26 },
  { id: 'flash-warm', label: 'Destello cálido', energy: 2, kind: 'flash', color: '#FFD9A0', duration: 0.3 },
  { id: 'slide', label: 'Deslizar', energy: 1, kind: 'slide', dir: 'left', safeForText: true },
  { id: 'slide-right', label: 'Deslizar derecha', energy: 1, kind: 'slide', dir: 'right', safeForText: true },
  { id: 'push-up', label: 'Empuje arriba', energy: 1, kind: 'push', dir: 'up', safeForText: true },
  { id: 'push-down', label: 'Empuje abajo', energy: 1, kind: 'push', dir: 'down', safeForText: true },
  { id: 'whip', label: 'Latigazo', energy: 2, kind: 'blur', dir: 'left', duration: 0.28 },
  { id: 'whip-right', label: 'Latigazo derecha', energy: 2, kind: 'blur', dir: 'right', duration: 0.28 },
  { id: 'zoom', label: 'Zoom', energy: 2, kind: 'zoom', duration: 0.3 },
  { id: 'zoom-out', label: 'Zoom hacia atrás', energy: 2, kind: 'zoom', dir: 'down', duration: 0.3 },
  { id: 'wipe', label: 'Círculo', energy: 1, kind: 'wipe' },
  { id: 'bars-h', label: 'Persiana', energy: 1, kind: 'bars', dir: 'right' },
  { id: 'bars-v', label: 'Persiana vertical', energy: 1, kind: 'bars', dir: 'down' },
  { id: 'blur-cross', label: 'Fundido desenfocado', energy: 1, kind: 'blur', duration: 0.4, safeForText: true },
  { id: 'spin', label: 'Giro', energy: 2, kind: 'spin', duration: 0.34 },
  { id: 'glitch', label: 'Glitch', energy: 2, kind: 'glitch', duration: 0.3 },
  { id: 'pixel', label: 'Pixelado', energy: 2, kind: 'pixel', duration: 0.36 },
];

export interface GradeDef {
  id: string;
  label: string;
  /** CSS filter chain applied while the frame is drawn. */
  filter: string;
  vignette?: number;
  /** Colour wash on top, as [css colour, alpha]. */
  wash?: [string, number];
  /** Black bars, as a fraction of the height. */
  letterbox?: number;
  /** Warm/cold bias, used to match a look to the footage. */
  temperature?: 'warm' | 'cold' | 'neutral';
}

export const GRADES: GradeDef[] = [
  { id: 'none', label: 'Original', filter: '', temperature: 'neutral' },
  { id: 'vivid', label: 'Vívido', filter: 'saturate(1.38) contrast(1.12)', temperature: 'neutral' },
  { id: 'punchy', label: 'Contraste alto', filter: 'contrast(1.28) saturate(1.15) brightness(0.98)', temperature: 'neutral' },
  { id: 'warm', label: 'Cálido', filter: 'sepia(0.2) saturate(1.22) brightness(1.03)', temperature: 'warm' },
  { id: 'golden', label: 'Hora dorada', filter: 'sepia(0.3) saturate(1.3) brightness(1.06) contrast(1.05)', wash: ['#FF9A3C', 0.1], temperature: 'warm' },
  { id: 'sunset', label: 'Atardecer', filter: 'saturate(1.25) contrast(1.08)', wash: ['#FF5F6D', 0.14], temperature: 'warm' },
  { id: 'cool', label: 'Frío', filter: 'saturate(1.12) hue-rotate(12deg) contrast(1.06)', temperature: 'cold' },
  { id: 'teal-orange', label: 'Teal & orange', filter: 'contrast(1.18) saturate(1.3) hue-rotate(-6deg)', wash: ['#0E6E7A', 0.1], temperature: 'cold' },
  { id: 'night', label: 'Noche', filter: 'brightness(0.86) contrast(1.22) saturate(0.85)', wash: ['#0B1E4B', 0.16], vignette: 0.4, temperature: 'cold' },
  { id: 'cyber', label: 'Cyber', filter: 'saturate(1.5) contrast(1.2) hue-rotate(-18deg)', wash: ['#7A00FF', 0.14], vignette: 0.3, temperature: 'cold' },
  { id: 'film', label: 'Cine', filter: 'sepia(0.26) saturate(0.88) contrast(1.12) brightness(0.98)', vignette: 0.38, letterbox: 0.06, temperature: 'warm' },
  { id: 'bleach', label: 'Blanqueado', filter: 'saturate(0.55) contrast(1.35) brightness(1.05)', vignette: 0.3, temperature: 'neutral' },
  { id: 'faded', label: 'Desvaído', filter: 'saturate(0.8) contrast(0.88) brightness(1.08)', wash: ['#B0A99F', 0.12], temperature: 'warm' },
  { id: 'pastel', label: 'Pastel', filter: 'saturate(0.9) brightness(1.1) contrast(0.92)', wash: ['#FFC9E0', 0.12], temperature: 'warm' },
  { id: 'dream', label: 'Ensueño', filter: 'brightness(1.08) saturate(1.2) contrast(0.9)', wash: ['#C9A7FF', 0.12], temperature: 'neutral' },
  { id: 'vhs', label: 'VHS', filter: 'saturate(1.45) contrast(0.94) hue-rotate(-6deg) brightness(1.05)', vignette: 0.35, temperature: 'warm' },
  { id: 'mono', label: 'Blanco y negro', filter: 'grayscale(1) contrast(1.2)', temperature: 'neutral' },
  { id: 'silver', label: 'Plata', filter: 'grayscale(0.85) contrast(1.3) brightness(1.05)', vignette: 0.25, temperature: 'cold' },
  { id: 'noir', label: 'Noir', filter: 'grayscale(1) contrast(1.45) brightness(0.92)', vignette: 0.5, letterbox: 0.06, temperature: 'neutral' },
  { id: 'matrix', label: 'Verde digital', filter: 'saturate(1.1) contrast(1.15) hue-rotate(70deg)', wash: ['#00FF88', 0.08], temperature: 'cold' },
  { id: 'highkey', label: 'Luz alta', filter: 'brightness(1.16) contrast(0.92) saturate(1.05)', temperature: 'neutral' },
  { id: 'lowkey', label: 'Luz baja', filter: 'brightness(0.84) contrast(1.3) saturate(0.95)', vignette: 0.45, temperature: 'neutral' },
];

export function effectById(id: string): EffectDef {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0]!;
}

export function transitionById(id: string): TransitionDef {
  return TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[0]!;
}

export function gradeById(id: string): GradeDef {
  return GRADES.find((g) => g.id === id) ?? GRADES[0]!;
}

export const EFFECT_IDS = EFFECTS.map((e) => e.id);
export const TRANSITION_IDS = TRANSITIONS.map((t) => t.id);
export const GRADE_IDS = GRADES.map((g) => g.id);
