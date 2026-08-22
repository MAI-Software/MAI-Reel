export interface FontDef {
  id: string;
  label: string;
  /** CSS family name as loaded from Google Fonts */
  family: string;
  weight: number;
  /** Multiplier applied to the overlay size so every family reads at a similar optical size */
  scale: number;
}

export const FONTS: FontDef[] = [
  { id: 'atkinson', label: 'Atkinson', family: '"Atkinson Hyperlegible"', weight: 700, scale: 1 },
  { id: 'anton', label: 'Anton', family: '"Anton"', weight: 400, scale: 1.08 },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue"', weight: 400, scale: 1.24 },
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat"', weight: 800, scale: 1 },
  { id: 'poppins', label: 'Poppins', family: '"Poppins"', weight: 700, scale: 1 },
  { id: 'archivo', label: 'Archivo Black', family: '"Archivo Black"', weight: 400, scale: 0.96 },
];

export const DEFAULT_FONT = 'anton';

export interface TextStyleDef {
  id: string;
  label: string;
  fill: string;
  stroke?: string;
  /** Stroke width as a fraction of the font size */
  strokeWidth?: number;
  bg?: string;
  glow?: { color: string; blur: number };
  /** Hard drop shadow, offsets as a fraction of the font size. */
  shadow?: { color: string; dx: number; dy: number; blur?: number };
  uppercase?: boolean;
  /** Letter spacing as a fraction of the font size */
  tracking?: number;
}

export const TEXT_STYLES: TextStyleDef[] = [
  { id: 'outline', label: 'Outline', fill: '#FFFFFF', stroke: '#04070F', strokeWidth: 0.16, uppercase: true },
  { id: 'box', label: 'Box', fill: '#FFFFFF', bg: 'rgba(4,7,18,0.72)' },
  { id: 'pop', label: 'Pop', fill: '#FFE55C', stroke: '#04070F', strokeWidth: 0.2, uppercase: true, tracking: 0.02 },
  { id: 'neon', label: 'Neon', fill: '#FFFFFF', stroke: '#3B0764', strokeWidth: 0.08, glow: { color: '#EC4899', blur: 0.45 } },
  { id: 'bar', label: 'Bar', fill: '#FFFFFF', bg: '#EC4899' },
  { id: 'clean', label: 'Clean', fill: '#FFFFFF' },
  { id: 'shadow', label: 'Shadow', fill: '#FFFFFF', shadow: { color: 'rgba(4,7,18,0.85)', dx: 0.06, dy: 0.07 }, uppercase: true },
  { id: 'sticker', label: 'Sticker', fill: '#0F172A', bg: '#FFFFFF' },
  { id: 'mint', label: 'Mint', fill: '#04070F', bg: '#3BF0C0' },
  { id: 'cyber', label: 'Cyber', fill: '#00E5FF', stroke: '#04070F', strokeWidth: 0.1, glow: { color: '#00E5FF', blur: 0.4 }, uppercase: true, tracking: 0.04 },
  { id: 'alert', label: 'Alert', fill: '#FFFFFF', bg: '#DC2626', uppercase: true },
  { id: 'gold', label: 'Gold', fill: '#FFD166', stroke: '#2B1B00', strokeWidth: 0.14, uppercase: true, tracking: 0.06 },
  { id: 'ghost', label: 'Ghost', fill: 'rgba(255,255,255,0.94)', bg: 'rgba(4,7,18,0.28)' },
  { id: 'ocean', label: 'Ocean', fill: '#FFFFFF', bg: '#2563EB' },
  { id: 'contrast', label: 'Contrast', fill: '#04070F', bg: '#FFFFFF', uppercase: true },
  { id: 'lemon', label: 'Lemon', fill: '#0F172A', bg: '#FFE55C', uppercase: true },
];

export const DEFAULT_STYLE = 'outline';

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

export function styleById(id: string): TextStyleDef {
  return TEXT_STYLES.find((s) => s.id === id) ?? TEXT_STYLES[0]!;
}

export function fontCss(id: string, sizePx: number): string {
  const f = fontById(id);
  return `${f.weight} ${Math.round(sizePx * f.scale)}px ${f.family}, system-ui, sans-serif`;
}

/** Canvas needs every family actually loaded before the first draw, otherwise it falls back silently. */
export async function ensureFontsLoaded(): Promise<void> {
  await Promise.all(
    FONTS.map((f) => document.fonts.load(`${f.weight} 100px ${f.family}`).catch(() => undefined)),
  );
  await document.fonts.ready;
}
