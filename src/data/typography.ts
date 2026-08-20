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
