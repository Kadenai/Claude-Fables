/**
 * Graphic styles ("looks") a scene can be drawn in, after the art styles of the
 * Claude Mascot Style Gallery (github.com/henrik-thevibe/Claude-Mascot-Style-Gallery).
 *
 * A look never changes what a scene is, only how it is painted: it remaps every
 * color the stage draws, chooses how one art pixel is drawn, and adds layers of
 * its own under and over the scene. Its own layers are drawn after the remap, so
 * they keep the colors they name.
 */

import { parseHex } from './scene'

/** How one art pixel of a sprite is drawn. */
export type Cell =
  /** Runs of solid color (the plain pixel look). */
  | 'solid'
  /** A tessera with grout around it. */
  | 'tile'
  /** A pane of glass leaded at its edges. */
  | 'lead'
  /** A cross stitch. */
  | 'stitch'
  /** A printed character, darker colors a denser glyph. */
  | 'glyph'
  /** A drafted square: a faint wash with a line around it. */
  | 'draft'

/** Which part of the drawing a color belongs to, so a look can treat them apart. */
export type Layer = 'sky' | 'ground' | 'back' | 'fore'

export type CaptionStyle = { fill: string; stroke: string; ink: string; radius: number }

export type Look = {
  name: string
  /** What the look is called, after the gallery's style it comes from. */
  label: string
  /** A few words for the narrator, so the caption's voice can suit the look. */
  voice: string
  cell: Cell
  /** Every color the stage draws, by layer; absent, colors stay as they are. */
  color?: (hex: string, layer: Layer) => string
  font: string
  /** The font's average advance at the caption's size, in stage units, to fit the bubble. */
  charW: number
  caption: CaptionStyle
  /** How far a frame the look draws reaches in, so the chapter tag clears it. */
  inset?: number
  /** The chapter tag's color; absent, the scene's accent. */
  titleColor?: string
  /** Filter, pattern and gradient definitions the layers below refer to. */
  defs?: string
  /** A filter id the sprites and the hero are drawn through. */
  foreFilter?: string
  /** Drawn over the sky, under everything else. */
  under?: (sw: number, h: number, ground: number) => string
  /** Drawn over everything but the title and the caption. */
  over?: (sw: number, h: number, ground: number) => string
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

// ---------------------------------------------------------------- colors

type Rgb = [number, number, number]

/** A color's channels, 0 to 255; undefined for anything but #rgb or #rrggbb. */
export function rgbOf(hex: string): Rgb | undefined {
  const full = parseHex(hex)
  return full ? ([1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb) : undefined
}

/** Perceived lightness, 0 to 1. */
export function lightness(hex: string): number {
  const rgb = rgbOf(hex)
  if (!rgb) return 0.5
  const [r, g, b] = rgb
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Hue in degrees and saturation 0 to 1. */
function hueSat(hex: string): { hue: number; sat: number } {
  const [r, g, b] = (rgbOf(hex) ?? [128, 128, 128]).map(v => v / 255) as Rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return { hue: 0, sat: 0 }
  const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { hue: hue * 60, sat: max === 0 ? 0 : d / max }
}

/** The palette color nearest the given one, weighted the way eyes weigh them. */
export function nearest(hex: string, palette: readonly string[]): string {
  const rgb = rgbOf(hex)
  if (!rgb) return hex
  let best = palette[0] ?? hex
  let bestD = Infinity
  for (const p of palette) {
    const q = rgbOf(p)
    if (!q) continue
    const d = 3 * (rgb[0] - q[0]) ** 2 + 4 * (rgb[1] - q[1]) ** 2 + 2 * (rgb[2] - q[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** A color by lightness from a ramp ordered dark to light. */
const ramp = (hex: string, shades: readonly string[]) =>
  shades[Math.min(shades.length - 1, Math.floor(lightness(hex) * shades.length))] ?? hex

const isWarm = (hex: string) => {
  const { hue, sat } = hueSat(hex)
  return sat > 0.35 && (hue < 45 || hue > 340)
}

/**
 * Remaps every color in the attributes of an SVG fragment that paint (fill,
 * stroke, an animation's values), never text, so a "#123" in a label stays.
 */
export function remapColors(svg: string, map: (hex: string) => string): string {
  return svg.replace(/\b(fill|stroke|values)="([^"]*)"/g, (_, attr: string, value: string) => {
    const mapped = value.replace(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g, hex => map(hex.toLowerCase()))
    return `${attr}="${mapped}"`
  })
}

// ---------------------------------------------------------------- layers

/** Horizontal bands `band` tall every `every` units, running past both edges. */
const stripes = (sw: number, h: number, every: number, band: number, fill: string, opacity = 1) =>
  `<path fill="${fill}" opacity="${opacity}" d="${Array.from({ length: Math.ceil(h / every) + 1 }, (_, i) => `M${-sw} ${i * every}h${sw * 3}v${band}h${-sw * 3}z`).join('')}"/>`

const frame = (sw: number, h: number, color: string, width: number, inset = width / 2) =>
  `<rect x="${inset}" y="${inset}" width="${sw - inset * 2}" height="${h - inset * 2}" fill="none" stroke="${color}" stroke-width="${width}"/>`

const patternRect = (id: string, sw: number, h: number, opacity = 1) =>
  `<rect x="${-sw * 4}" y="${-h * 4}" width="${sw * 9}" height="${h * 9}" fill="url(#${id})" opacity="${opacity}"/>`

// ---------------------------------------------------------------- the looks

const LCD = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
const TELETEXT = ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff']
const EARTH = ['#2b2118', '#8a3b24', '#c58a3a', '#3f6b5a', '#2d4f7a', '#e9d9b0']
const JEWELS = ['#1d3f8f', '#2c6fbf', '#b8322a', '#e0a030', '#2f7d4a', '#6b3f8f', '#d9c9a0', '#e26a2c', '#1a1414']
const TESSERAE = ['#f1ead8', '#2a2420', '#b0442c', '#d9a648', '#5d7a8a', '#7a5a3a', '#c9784a', '#8e9a6a']
const THREADS = ['#a8322e', '#3a5a8a', '#4f7a3a', '#c98a3a', '#5a3a2a', '#c4553a', '#e8dcc0']
const COMIC = ['#e8312a', '#f3c623', '#2a7bc0', '#141414', '#fff7e0', '#f08a3a', '#3f9e4a']
const NEON = ['#ff4fa3', '#4ff0ff', '#ff8a3d', '#b6ff4f', '#c77dff', '#ffe14f']
const INDIGO = ['#1b2a4a', '#2f4d7a', '#6e8fb5', '#b9c8d6', '#efe3c8']

export const LOOKS: Record<string, Look> = {
  pixel: {
    name: 'pixel',
    label: 'Pixel Art',
    voice: 'a cheerful 16-bit game',
    cell: 'solid',
    font: MONO,
    charW: 5.7,
    caption: { fill: '#2b1c1a', stroke: '#cfc8b8', ink: '#ece9df', radius: 2 },
  },

  handheld: {
    name: 'handheld',
    label: 'Handheld',
    voice: 'a four-shade handheld console game',
    cell: 'tile',
    color: (hex, layer) =>
      layer === 'sky' ? LCD[3]! : layer === 'ground' ? LCD[2]! : layer === 'back' ? (lightness(hex) > 0.5 ? LCD[1]! : LCD[2]!) : ramp(hex, LCD.slice(0, 3)),
    inset: 3,
    font: MONO,
    charW: 5.7,
    caption: { fill: '#9bbc0f', stroke: '#0f380f', ink: '#0f380f', radius: 0 },
    titleColor: '#0f380f',
    defs: `<pattern id="lk-lcd" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h4v1h-4zM0 0h1v4h-1z" fill="#0f380f" opacity=".08"/></pattern>`,
    over: (sw, h) => patternRect('lk-lcd', sw, h) + frame(sw, h, '#306230', 3),
  },

  teletext: {
    name: 'teletext',
    label: 'Teletext Page',
    voice: 'a terse teletext news page',
    cell: 'tile',
    color: (hex, layer) => (layer === 'sky' ? '#000000' : layer === 'ground' ? '#0000ff' : nearest(hex, lightness(hex) < 0.18 ? TELETEXT : TELETEXT.slice(1))),
    font: MONO,
    charW: 5.7,
    caption: { fill: '#000000', stroke: '#00ffff', ink: '#ffff00', radius: 0 },
    titleColor: '#00ffff',
    over: (sw, h) => stripes(sw, h, 3, 1, '#000000', 0.18),
  },

  blueprint: {
    name: 'blueprint',
    label: 'Blueprint',
    voice: 'an engineer annotating a technical drawing',
    cell: 'draft',
    color: (hex, layer) => (layer === 'sky' ? '#1f4fa0' : layer === 'ground' ? '#1a4590' : layer === 'back' ? '#3b6cbc' : '#e8f0ff'),
    inset: 5,
    font: MONO,
    charW: 5.7,
    caption: { fill: '#1f4fa0', stroke: '#e8f0ff', ink: '#e8f0ff', radius: 0 },
    titleColor: '#e8f0ff',
    defs:
      `<pattern id="lk-grid" width="16" height="16" patternUnits="userSpaceOnUse">` +
      `<path d="M0 0h16v.6h-16zM0 0h.6v16h-.6z" fill="#e8f0ff" opacity=".18"/>` +
      `<path d="M8 0h.4v16h-.4zM0 8h16v.4h-16z" fill="#e8f0ff" opacity=".07"/></pattern>`,
    under: (sw, h) => patternRect('lk-grid', sw, h),
    over: (sw, h, ground) =>
      frame(sw, h, '#e8f0ff', 1, 4) +
      `<path d="M8 ${ground + 10}h60M8 ${ground + 7}v6M68 ${ground + 7}v6" stroke="#e8f0ff" stroke-width=".8" fill="none"/>` +
      `<text x="${sw - 10}" y="${h - 8}" text-anchor="end" font-family="${MONO}" font-size="7" fill="#e8f0ff">FIG. 1 · CLAWD · SHEET 1 OF 1</text>`,
  },

  neon: {
    name: 'neon',
    label: 'Neon',
    voice: 'a buzzing 1950s diner sign',
    cell: 'solid',
    color: (hex, layer) => {
      if (layer === 'sky') return '#2a1512'
      if (layer === 'ground') return '#1c0f0d'
      if (layer === 'back') return '#3a1d18'
      const { sat } = hueSat(hex)
      if (sat < 0.25) return lightness(hex) < 0.3 ? '#1c0f0d' : '#fff1e8'
      return nearest(hex, NEON)
    },
    font: "'Brush Script MT', 'Segoe Script', cursive",
    charW: 4.6,
    caption: { fill: '#1c0f0d', stroke: '#ff4fa3', ink: '#ffd6ec', radius: 6 },
    titleColor: '#4ff0ff',
    defs:
      `<filter id="lk-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/>` +
      `<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `<pattern id="lk-brick" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h24v1h-24zM0 6h24v1h-24zM12 0h1v6h-1zM0 6h1v6h-1z" fill="#160a08" opacity=".7"/></pattern>`,
    foreFilter: 'lk-glow',
    under: (sw, h) => patternRect('lk-brick', sw, h),
    over: (sw, h) =>
      `<rect x="${-sw}" y="${-h}" width="${sw * 3}" height="${h * 3}" fill="#000" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;.35;0;0;.2;0" keyTimes="0;.8;.82;.84;.9;.91;1" dur="5s" repeatCount="indefinite"/></rect>`,
  },

  silhouette: {
    name: 'silhouette',
    label: 'Silhouette',
    voice: 'an elegant 18th-century portrait card',
    cell: 'solid',
    color: (hex, layer) => (layer === 'sky' ? '#efe6d2' : layer === 'ground' ? '#2a2420' : layer === 'back' ? '#d8ccb2' : lightness(hex) > 0.85 ? '#efe6d2' : '#1a1714'),
    inset: 7,
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#efe6d2', stroke: '#b08a3a', ink: '#1a1714', radius: 10 },
    titleColor: '#8a6a2a',
    over: (sw, h) => frame(sw, h, '#c9a24a', 4) + frame(sw, h, '#7a5a1a', 1, 6.5),
  },

  ukiyoe: {
    name: 'ukiyoe',
    label: 'Ukiyo-e',
    voice: 'a calm Edo-period woodblock print',
    cell: 'solid',
    color: (hex, layer) => {
      if (layer === 'sky') return '#efe3c8'
      if (layer === 'ground') return '#1b2a4a'
      if (isWarm(hex)) return lightness(hex) < 0.4 ? '#9c3b26' : '#cf5a3c'
      return ramp(hex, layer === 'back' ? INDIGO.slice(2) : INDIGO)
    },
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#efe3c8', stroke: '#1b2a4a', ink: '#1b2a4a', radius: 0 },
    titleColor: '#b03a2e',
    defs:
      `<filter id="lk-paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/>` +
      `<feColorMatrix values="0 0 0 0 .45  0 0 0 0 .35  0 0 0 0 .2  0 0 0 .35 0"/></filter>`,
    over: (sw, h) =>
      `<rect x="${-sw}" y="${-h}" width="${sw * 3}" height="${h * 3}" filter="url(#lk-paper)" opacity=".5"/>` +
      `<rect x="${sw - 26}" y="10" width="14" height="40" fill="#efe3c8" stroke="#1b2a4a" stroke-width="1"/>` +
      `<rect x="${sw - 22}" y="56" width="8" height="8" fill="#b03a2e"/>`,
  },

  tomb: {
    name: 'tomb',
    label: 'Tomb Painting',
    voice: 'a solemn hieroglyph inscription',
    cell: 'solid',
    color: (hex, layer) => (layer === 'sky' ? '#e3cfa0' : layer === 'ground' ? '#c58a3a' : layer === 'back' ? nearest(hex, ['#d6bd88', '#c9ab72']) : isWarm(hex) ? '#a8462a' : nearest(hex, EARTH)),
    inset: 4,
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#e9d9b0', stroke: '#2b2118', ink: '#2b2118', radius: 0 },
    titleColor: '#8a3b24',
    over: (sw, h) => {
      const band = (y: number) =>
        Array.from({ length: Math.ceil(sw / 8) }, (_, i) => `<rect x="${i * 8}" y="${y}" width="8" height="4" fill="${['#2d4f7a', '#c58a3a', '#8a3b24', '#3f6b5a'][i % 4]}"/>`).join('')
      return band(0) + band(h - 4)
    },
  },

  glass: {
    name: 'glass',
    label: 'Stained Glass',
    voice: 'a solemn cathedral window legend',
    cell: 'lead',
    color: (hex, layer) =>
      layer === 'sky' ? '#1d2c5a' : layer === 'ground' ? '#1a1414' : layer === 'back' ? nearest(hex, ['#24386e', '#2c4a7f', '#3a2a5a']) : nearest(hex, JEWELS),
    inset: 4,
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#1a1414', stroke: '#e0a030', ink: '#f3e2b0', radius: 0 },
    titleColor: '#e0a030',
    defs:
      `<pattern id="lk-panes" width="20" height="14" patternUnits="userSpaceOnUse"><path d="M0 0h20v1.2h-20zM0 0h1.2v14h-1.2zM10 7h10v1.2h-10z" fill="#0d0a0a" opacity=".85"/></pattern>` +
      `<linearGradient id="lk-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>`,
    under: (sw, h) => patternRect('lk-panes', sw, h),
    over: (sw, h) => `<rect x="${-sw}" y="${-h}" width="${sw * 3}" height="${h * 3}" fill="url(#lk-light)"/>` + frame(sw, h, '#0d0a0a', 4),
  },

  mosaic: {
    name: 'mosaic',
    label: 'Mosaic',
    voice: 'a Roman floor inscription',
    cell: 'tile',
    color: (hex, layer) => (layer === 'sky' ? '#e6dcc4' : layer === 'ground' ? '#7a5a3a' : layer === 'back' ? nearest(hex, ['#d4c6a6', '#c8b896', '#b9c0b0']) : nearest(hex, TESSERAE)),
    inset: 8,
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#f1ead8', stroke: '#2a2420', ink: '#2a2420', radius: 0 },
    titleColor: '#b0442c',
    defs: `<pattern id="lk-grout" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h4v.5h-4zM0 0h.5v4h-.5z" fill="#cfc3a8"/></pattern>`,
    under: (sw, h) => patternRect('lk-grout', sw, h, 0.8),
    over: (sw, h) => {
      // A meander along the top and bottom edges.
      const key = (x: number, y: number, flip: boolean) =>
        `<path d="M${x} ${y}h8v${flip ? -6 : 6}h-6v${flip ? 3 : -3}h3" fill="none" stroke="#2a2420" stroke-width="1.4"/>`
      const row = (y: number, flip: boolean) => Array.from({ length: Math.ceil(sw / 10) }, (_, i) => key(i * 10 + 1, y, flip)).join('')
      return `<rect y="0" width="${sw}" height="8" fill="#f1ead8"/><rect y="${h - 8}" width="${sw}" height="8" fill="#f1ead8"/>` + row(1, false) + row(h - 1, true)
    },
  },

  sampler: {
    name: 'sampler',
    label: 'Sampler',
    voice: 'a sweet Victorian embroidered motto',
    cell: 'stitch',
    color: (hex, layer) => (layer === 'sky' ? '#e8dcc0' : layer === 'ground' ? '#d9caa6' : layer === 'back' ? nearest(hex, ['#cfdcc0', '#d6c8a8', '#c9b9a0']) : nearest(hex, THREADS)),
    inset: 6,
    font: SERIF,
    charW: 4.9,
    caption: { fill: '#efe5cc', stroke: '#a8322e', ink: '#3a2a20', radius: 0 },
    titleColor: '#a8322e',
    defs: `<pattern id="lk-linen" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 0h2v.4h-2zM0 0h.4v2h-.4z" fill="#b8a888" opacity=".35"/></pattern>`,
    under: (sw, h) => patternRect('lk-linen', sw, h),
    over: (sw, h) => `<rect x="5" y="5" width="${sw - 10}" height="${h - 10}" fill="none" stroke="#a8322e" stroke-width="1.2" stroke-dasharray="3 2"/>`,
  },

  printer: {
    name: 'printer',
    label: 'Line Printer',
    voice: 'a dry mainframe printout',
    cell: 'glyph',
    color: (hex, layer) => (layer === 'sky' ? '#fbfbf6' : layer === 'ground' ? '#fbfbf6' : layer === 'back' ? '#e0eedd' : '#2a2a2a'),
    inset: 6,
    font: MONO,
    charW: 5.7,
    caption: { fill: '#fbfbf6', stroke: '#2a2a2a', ink: '#2a2a2a', radius: 0 },
    titleColor: '#2a2a2a',
    under: (sw, h) => stripes(sw, h, 24, 12, '#d4ecd4'),
    over: (sw, h, ground) =>
      `<path d="M0 ${ground}h${sw}" stroke="#2a2a2a" stroke-width="1" stroke-dasharray="4 2"/>` +
      [8, sw - 8]
        .map(x => Array.from({ length: Math.ceil(h / 12) }, (_, i) => `<circle cx="${x}" cy="${i * 12 + 6}" r="2.2" fill="#c9c9c0"/>`).join(''))
        .join(''),
  },

  comic: {
    name: 'comic',
    label: 'Golden Age Comic',
    voice: 'a punchy 1938 comic book',
    cell: 'solid',
    color: (hex, layer) => (layer === 'sky' ? '#f3c623' : layer === 'ground' ? '#e8312a' : layer === 'back' ? nearest(hex, ['#f08a3a', '#e8a33a', '#f3d65a']) : nearest(hex, COMIC)),
    inset: 4,
    font: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', sans-serif",
    charW: 5.2,
    caption: { fill: '#fffbe8', stroke: '#141414', ink: '#141414', radius: 8 },
    titleColor: '#141414',
    defs:
      `<pattern id="lk-dots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.1" fill="#141414"/></pattern>` +
      `<filter id="lk-ink" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="o"/>` +
      `<feFlood flood-color="#141414"/><feComposite in2="o" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    foreFilter: 'lk-ink',
    under: (sw, h) => patternRect('lk-dots', sw, h, 0.16),
    over: (sw, h) => frame(sw, h, '#141414', 4),
  },
}

export const LOOK_NAMES = Object.keys(LOOKS)
export const DEFAULT_LOOK = 'pixel'

/** The look by name; an unknown name draws the default. */
export const lookFor = (name: string | undefined): Look => LOOKS[name ?? DEFAULT_LOOK] ?? (LOOKS[DEFAULT_LOOK] as Look)
