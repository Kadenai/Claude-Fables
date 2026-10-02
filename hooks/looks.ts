/**
 * Graphic styles ("looks") a scene can be drawn in, after the art styles of the
 * Claude Mascot Style Gallery (github.com/henrik-thevibe/Claude-Mascot-Style-Gallery).
 *
 * A look never changes what a scene is, only how it is painted. The authored
 * scenes keep their color in filters (materials, light, the lens), so a look
 * does not rewrite colors: it grades the finished picture, scenery and Claude
 * together, through one filter of its own (grade.ts). On a pixel-art stage the
 * grade comes first and the pixelizer after, so every look works either way.
 * Over the graded stage a look may lay a texture (paper, weave, grout), a
 * frame, and its own chapter tag; the caption keeps its shape and type and
 * takes the look's paper and inks.
 */

import type { Painter } from './art/roles'
import type { HeroPainter } from './hero3d'
import { BAYER4, cells, edges, gray, hueMask, ink, lift, lumMask, posterize, ramp, screen, screened, screenGray, through } from './grade'

/** How one art pixel of a sprite is drawn. */
export type Cell = 'solid'

export type CaptionStyle = { fill: string; stroke: string; ink: string; radius: number }

/** The kinds of words a caption sets apart (svg.ts). */
export type WordKind = 'code' | 'path' | 'fn' | 'num' | 'bad' | 'good' | 'face'

/** The caption's cartoon paper in a look: the card, its ink, and the color of each kind of word. */
export type Paper = { card: string; ink: string; kinds: Record<WordKind, string> }

/** The chapter tag as a look draws it, at the top left, and the room it takes. */
export type Tag = { svg: string; w: number; h: number }

type Pt = [number, number]
/**
 * The caption's bubble as a style draws it: its type, and its frame and tail
 * under the text. `tail` runs from two points on the frame to a tip by Claude.
 */
export type Bubble = {
  font: string
  size: number
  /** The type's average advance, in stage units, to fit the bubble to its lines. */
  charW: number
  line: number
  /** The first line's baseline below the bubble's top. */
  base: number
  /** Set the caption in capitals, as a drafting hand would. */
  upper?: boolean
  draw: (box: { x: number; y: number; w: number; h: number }, tail: { base: [Pt, Pt]; tip: Pt }) => string
}

/**
 * A style drawn as an artwork of its own: every element of the scenery and
 * Claude himself repainted in its medium, rather than the finished picture graded.
 */
export type Art = {
  /** Paints the scenery's elements, for a stage `sw` wide; `pixel` when it will be pixelized. */
  painter: (sw: number, pixel: boolean) => Painter
  /** Paints Claude. */
  hero: (pixel: boolean) => HeroPainter
  /** The sky and ground colors past the stage's edges. */
  sky: string
  ground: string
  /** Definitions the painters refer to (patterns, gradients), laid down once under the stage. */
  defs?: (sw: number, h: number, pixel: boolean) => string
  /** The pixel-art Claude's eye and outline colors, for the pixelizer's sprite pass. */
  sprite?: { eye: string; outline: string }
}

export type Look = {
  name: string
  /** What the look is called, after the gallery's style it comes from. */
  label: string
  /** A few words for the narrator, so the caption's voice can suit the look. */
  voice: string
  cell: Cell
  /** How the hero is drawn here unless the person says otherwise: the pixel sprite or the 3D model. */
  figure: 'pixel' | '3d'
  font: string
  /** The font's average advance at the caption's size, in stage units, to fit the bubble. */
  charW: number
  /** The caption on the flat stage. */
  caption: CaptionStyle
  /** The caption's cartoon paper on the rich stage; absent, the default paper. */
  paper?: Paper
  /** How far a frame the look draws reaches in, so the chapter tag clears it. */
  inset?: number
  /** The chapter tag's color; absent, the scene's accent. */
  titleColor?: string
  /**
   * The grade: filter primitives from SourceGraphic to the styled picture, for
   * a stage `sw` wide; `pixel` when the stage will be pixelized after it.
   */
  grade?: (sw: number, h: number, pixel: boolean) => string
  /** The color past the stage's edges, where a box wider than the stage shows. */
  edge?: string
  /** Over the graded stage: paper, weave, grout. Static, so it costs nothing per frame. */
  texture?: (sw: number, h: number, ground: number, pixel: boolean) => string
  /** A frame round the stage, over the texture. */
  frame?: (sw: number, h: number, ground: number) => string
  /** The chapter tag, drawn in the look; absent, the plain tag. */
  tag?: (text: string, inset: number) => Tag
  /** Set when the look is an artwork in its own right (see Art). */
  art?: Art
  /** The caption's bubble, when the style draws its own. */
  bubble?: Bubble
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
/** Monocraft is embedded with the caption, so a tag can be set in it too. */
const PIXEL_FONT = 'Monocraft, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

/** The default caption paper (svg.ts draws it unchanged when a look names none). */
export const PAPER: Paper = {
  card: '#f6f1e7',
  ink: '#2b2420',
  kinds: { code: '#186a5a', path: '#2b5f9e', fn: '#7b3fa0', num: '#b5541a', bad: '#b3261e', good: '#2e7d32', face: '#c4613f' },
}

// ---------------------------------------------------------------- helpers

const n = (v: number) => (Math.round(v * 100) / 100).toString()

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** A rectangle round the stage, `inset` in from its edge. */
const frame = (sw: number, h: number, color: string, width: number, inset = width / 2, extra = '') =>
  `<rect x="${n(inset)}" y="${n(inset)}" width="${n(sw - inset * 2)}" height="${n(h - inset * 2)}" fill="none" stroke="${color}" stroke-width="${n(width)}"${extra}/>`

/** A rect that covers the stage, filled with a pattern or gradient. */
const cover = (sw: number, h: number, fill: string, extra = '') => `<rect width="${sw}" height="${h}" fill="${fill}"${extra}/>`

/** Text in a tag, `size` units, at the tag's left edge. */
const tagText = (text: string, x: number, y: number, o: { font: string; size: number; fill: string; weight?: string; spacing?: number; extra?: string }) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${o.font}" font-size="${o.size}" fill="${o.fill}"` +
  (o.weight ? ` font-weight="${o.weight}"` : '') +
  (o.spacing ? ` letter-spacing="${o.spacing}"` : '') +
  `${o.extra ?? ''}>${escape(text)}</text>`

/** A boxed tag: a plaque at the top left with the chapter's name in it. */
function plaque(
  text: string,
  inset: number,
  o: { fill: string; stroke: string; ink: string; font?: string; size?: number; charW?: number; weight?: string; radius?: number; strokeW?: number; pad?: number; before?: string; spacing?: number },
): Tag {
  const size = o.size ?? 8
  const charW = (o.charW ?? 6.3) * (size / 9) + (o.spacing ?? 0)
  const pad = o.pad ?? 5
  const w = text.length * charW + pad * 2
  const h = size + 7
  const x = inset + 5
  const y = inset + 4
  return {
    svg:
      `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${o.radius ?? 0}" fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.strokeW ?? 1}"/>` +
      (o.before ?? '') +
      tagText(text, x + pad, y + h - 4.5, { font: o.font ?? PIXEL_FONT, size, fill: o.ink, weight: o.weight, spacing: o.spacing }) +
      `</g>`,
    w: x + w + 4,
    h: y + h + 4,
  }
}

/** A paper of one ink for every kind of word: monochrome looks set words apart by weight alone. */
const oneInk = (card: string, ink: string, accent = ink): Paper => ({
  card,
  ink,
  kinds: { code: ink, path: ink, fn: ink, num: accent, bad: accent, good: accent, face: accent },
})

/** A soft grain over the stage, multiplied in: paper, rock, lacquer. */
const grain = (id: string, sw: number, h: number, freq: string, opacity: number, tint = '0 0 0') =>
  `<defs><filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="7"/>` +
  `<feColorMatrix type="matrix" values="0 0 0 0 ${tint.split(' ')[0]}  0 0 0 0 ${tint.split(' ')[1]}  0 0 0 0 ${tint.split(' ')[2]}  -1.4 0 0 0 1"/></filter></defs>` +
  `<rect width="${sw}" height="${h}" filter="url(#${id})" opacity="${opacity}"/>`

// ---------------------------------------------------------------- the looks

const DEFAULT: Look = {
  name: 'default',
  label: 'Default',
  voice: 'a cheerful 16-bit game',
  cell: 'solid',
  figure: 'pixel',
  font: MONO,
  charW: 5.7,
  caption: { fill: '#2b1c1a', stroke: '#cfc8b8', ink: '#ece9df', radius: 2 },
}

/** A look in the gallery's manner: always the 3D Claude, captions on the look's paper. */
const style = (o: Omit<Look, 'cell' | 'figure' | 'font' | 'charW' | 'caption'> & { paper: Paper }): Look => ({
  cell: 'solid',
  figure: '3d',
  font: MONO,
  charW: 5.7,
  caption: { fill: o.paper.card, stroke: o.paper.ink, ink: o.paper.ink, radius: 2 },
  ...o,
})

const LCD = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']

export const LOOKS: Record<string, Look> = {
  default: DEFAULT,

  cave: style({
    name: 'cave',
    label: 'Cave Painting',
    voice: 'a storyteller by the fire, in short plain words',
    paper: { card: '#e6d8b8', ink: '#2e2119', kinds: { code: '#6a3a1e', path: '#4a3a5a', fn: '#6a3a1e', num: '#8a3220', bad: '#8a3220', good: '#4a5a2a', face: '#8a3220' } },
    edge: '#cdb892',
    titleColor: '#2e2119',
    // Pigment on limestone: the picture's edges roughened as if daubed, its tones cut to
    // charcoal, umber, ochre and the bare wall, and the reds kept as red earth.
    grade: (sw, h, pixel) =>
      `<feTurbulence type="fractalNoise" baseFrequency=".18" numOctaves="2" seed="3" result="wob"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="wob" scale="${pixel ? 3 : 2.4}" xChannelSelector="R" yChannelSelector="G" result="daub"/>` +
      gray('daub', 'g') +
      lift('g', 0.5, 'gl') +
      ramp('gl', ['#2e2119', '#5a3c26', '#9a6a3e', '#c9a77a', '#dcc9a2', '#e6d8b8'], 'base', true) +
      hueMask('daub', 'warm', 'warm') +
      ramp('gl', ['#4a1a10', '#7a2a18', '#a8452a', '#c4683e'], 'red', true) +
      through('red', 'warm', 'base', 'paint'),
    // The rock's own relief, lit from the upper left and multiplied over the paint. Static, so drawn once.
    texture: (sw, h) =>
      `<defs><filter id="lk-rock" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="4" seed="9"/>` +
      `<feDiffuseLighting surfaceScale="5" diffuseConstant="1.15" lighting-color="#f4ead6"><feDistantLight azimuth="235" elevation="38"/></feDiffuseLighting></filter></defs>` +
      `<rect width="${sw}" height="${h}" filter="url(#lk-rock)" style="mix-blend-mode:multiply" opacity=".65"/>`,
    tag: (text, inset) => {
      // Tally marks, scratched in charcoal, then the name.
      const x = inset + 6
      const y = inset + 5
      const marks = [0, 1, 2, 3].map(i => `M${n(x + i * 2.4)} ${y}l.4 9`).join('') + `M${x - 1} ${y + 7}l10 -5`
      return {
        svg:
          // A wash of bare wall behind it, so the charcoal reads on dark rock.
          `<rect x="${x - 4}" y="${y - 3}" width="${n(text.length * 6.2 + 26)}" height="15" rx="6" fill="#e2d2b0" opacity=".8"/>` +
          `<path d="${marks}" stroke="#2e2119" stroke-width="1.1" stroke-linecap="round" fill="none"/>` +
          tagText(text.toUpperCase(), x + 14, y + 8, { font: PIXEL_FONT, size: 8, fill: '#2e2119', spacing: 0.6 }),
        w: x + 14 + text.length * 6.2 + 6,
        h: y + 14,
      }
    },
  }),

  blueprint: style({
    name: 'blueprint',
    label: 'Blueprint',
    voice: 'an engineer annotating a technical drawing',
    paper: oneInk('#e8f0ff', '#163d85', '#b0442c'),
    edge: '#1a4590',
    inset: 4,
    titleColor: '#e8f0ff',
    // Everything in cyanotype blues by its lightness, every contour drawn over it in white line.
    grade: (sw, h, pixel) =>
      gray('SourceGraphic', 'g') +
      lift('g', 0.75, 'gl') +
      ramp('gl', ['#123778', '#1a4590', '#2453a6', '#3466b8', '#5583c9'], 'blue') +
      edges('SourceGraphic', 'line', { reach: pixel ? 1.2 : 0.8, threshold: 0.07 }) +
      ink('#e8f0ff', 'line', 'blue', 'drawn', 0.9),
    texture: (sw, h, _ground, pixel) =>
      `<defs><pattern id="lk-grid" width="16" height="16" patternUnits="userSpaceOnUse">` +
      `<path d="M0 0h16v${pixel ? 1 : 0.6}h-16zM0 0h${pixel ? 1 : 0.6}v16h-${pixel ? 1 : 0.6}z" fill="#e8f0ff" opacity=".16"/>` +
      (pixel ? '' : `<path d="M8 0h.4v16h-.4zM0 8h16v.4h-16z" fill="#e8f0ff" opacity=".06"/>`) +
      `</pattern></defs>` +
      cover(sw, h, 'url(#lk-grid)'),
    frame: (sw, h) => frame(sw, h, '#e8f0ff', 1, 4) + frame(sw, h, '#e8f0ff', 0.4, 6),
    tag: (text, inset) =>
      plaque(`FIG. 1 — ${text.toUpperCase()}`, inset, { fill: '#1a4590', stroke: '#e8f0ff', ink: '#e8f0ff', size: 7, strokeW: 0.8, spacing: 0.4 }),
  }),

  mosaic: style({
    name: 'mosaic',
    label: 'Mosaic',
    voice: 'a Roman floor inscription',
    paper: { card: '#f1ead8', ink: '#2a2420', kinds: { code: '#3e5a66', path: '#3e5a66', fn: '#6a4a8a', num: '#b0442c', bad: '#b0442c', good: '#4a6a3a', face: '#b0442c' } },
    edge: '#7a5a3a',
    inset: 8,
    titleColor: '#b0442c',
    // Set in tesserae: one stone per square, cut to a stone palette (marble, terracotta,
    // slate blue), the grout laid over after.
    grade: () =>
      cells('SourceGraphic', 4, 'tess') +
      gray('tess', 'g') +
      lift('g', 0.75, 'gl') +
      ramp('gl', ['#2a2420', '#5d4a3a', '#8a6a4a', '#b39a72', '#d4c6a6', '#ece3cc'], 'stone', true) +
      hueMask('tess', 'warm', 'warm') +
      ramp('gl', ['#6a2a1c', '#9a3a24', '#b0442c', '#c9784a', '#d99a6a'], 'terra', true) +
      through('terra', 'warm', 'stone', 'a') +
      hueMask('tess', 'blue', 'cool') +
      ramp('gl', ['#22343e', '#3e5a66', '#5d7a8a', '#8aa0aa'], 'slate', true) +
      through('slate', 'cool', 'a', 'b') +
      hueMask('tess', 'green', 'leaf') +
      ramp('gl', ['#2e3a24', '#4e5e36', '#76845a', '#a4aa80'], 'olive', true) +
      through('olive', 'leaf', 'b', 'set'),
    texture: (sw, h) =>
      `<defs><pattern id="lk-grout" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0h4v.45h-4zM0 0h.45v4h-.45z" fill="#d8ccb0" opacity=".7"/></pattern></defs>` +
      cover(sw, h, 'url(#lk-grout)'),
    frame: (sw, h) => {
      // A meander along the top and bottom edges.
      const key = (x: number, y: number, flip: boolean) => `M${x} ${y}h8v${flip ? -6 : 6}h-6v${flip ? 3 : -3}h3`
      const row = (y: number, flip: boolean) => Array.from({ length: Math.ceil(sw / 10) }, (_, i) => key(i * 10 + 1, y, flip)).join('')
      return (
        `<rect width="${sw}" height="8" fill="#f1ead8"/><rect y="${h - 8}" width="${sw}" height="8" fill="#f1ead8"/>` +
        `<path d="${row(1, false)}${row(h - 1, true)}" fill="none" stroke="#2a2420" stroke-width="1.4"/>`
      )
    },
    // A lettered tablet, in Roman capitals: no U, only V.
    tag: (text, inset) =>
      plaque(text.toUpperCase().replace(/U/g, 'V'), inset, { fill: '#f1ead8', stroke: '#2a2420', ink: '#2a2420', font: SERIF, size: 8, charW: 7, strokeW: 1.4, spacing: 1 }),
  }),

  sampler: style({
    name: 'sampler',
    label: 'Sampler',
    voice: 'a sweet Victorian embroidered motto',
    paper: { card: '#efe5cc', ink: '#3a2a20', kinds: { code: '#3a5a8a', path: '#3a5a8a', fn: '#6a3a7a', num: '#a8322e', bad: '#a8322e', good: '#4f7a3a', face: '#c4553a' } },
    edge: '#d9caa6',
    inset: 6,
    titleColor: '#a8322e',
    // Cross-stitched: one stitch per square in a few skeins of thread, the lightest
    // left as bare linen; the linen between the stitches is laid over after.
    grade: () =>
      cells('SourceGraphic', 4, 'st') +
      gray('st', 'g') +
      lift('g', 0.7, 'gl') +
      ramp('gl', ['#2a1e18', '#4a3a2e', '#7a6a52', '#a8987a', '#e8dcc0', '#e8dcc0'], 'brown', true) +
      hueMask('st', 'warm', 'warm') +
      ramp('gl', ['#5a1a18', '#8a2826', '#a8322e', '#c4553a', '#d98a6a'], 'red', true) +
      through('red', 'warm', 'brown', 'a') +
      hueMask('st', 'green', 'leaf') +
      ramp('gl', ['#1f3a1c', '#2f5a2a', '#4f7a3a', '#7a9a5a'], 'green', true) +
      through('green', 'leaf', 'a', 'b') +
      hueMask('st', 'blue', 'cool') +
      ramp('gl', ['#1a2448', '#2a3a6a', '#3a5a8a', '#7a9ac0'], 'blue', true) +
      through('blue', 'cool', 'b', 'sewn'),
    texture: (sw, h) => {
      // The linen round each cross: the cell less an X, so the stitch shows through.
      const L = 1.75
      const w = 0.5
      const plus: [number, number][] = [[-w, -L], [w, -L], [w, -w], [L, -w], [L, w], [w, w], [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w]]
      const c = Math.SQRT1_2
      const x = plus.map(([px, py]) => `${n(2 + (px - py) * c)} ${n(2 + (px + py) * c)}`).join('L')
      return (
        `<defs><pattern id="lk-linen" width="4" height="4" patternUnits="userSpaceOnUse">` +
        `<path fill-rule="evenodd" fill="#e8dcc0" d="M0 0h4v4h-4zM${x}z"/>` +
        `<path d="M0 0h4v.3h-4zM0 0h.3v4h-.3z" fill="#b8a888" opacity=".5"/></pattern></defs>` +
        cover(sw, h, 'url(#lk-linen)', ' opacity=".9"')
      )
    },
    frame: (sw, h) => frame(sw, h, '#e8dcc0', 4, 2) + frame(sw, h, '#a8322e', 1.2, 5, ' stroke-dasharray="3 2"'),
    tag: (text, inset) => {
      const t = plaque(text.toUpperCase(), inset, { fill: '#e8dcc0', stroke: 'none', ink: '#a8322e', size: 8, weight: '700', spacing: 0.6 })
      const y = inset + 4 + 15
      return { ...t, svg: t.svg + `<path d="M${inset + 9} ${y}H${n(t.w - 6)}" stroke="#4f7a3a" stroke-width="1" stroke-dasharray="2 1.5"/>` }
    },
  }),

  aero: style({
    name: 'aero',
    label: 'Frutiger Aero',
    voice: 'an upbeat mid-2000s eco-tech ad',
    paper: { card: '#f4fbff', ink: '#14385a', kinds: { code: '#0a7a8a', path: '#1d6fc4', fn: '#6a4ac4', num: '#e0702a', bad: '#d0303a', good: '#2e9a2e', face: '#e0702a' } },
    edge: '#4fb0e8',
    inset: 3,
    titleColor: '#ffffff',
    // Bright, clean and glassy: the light lifted, the colors pushed toward sky blue and
    // grass green, warm things (Claude) kept warm and saturated; the gloss is laid over after.
    grade: () =>
      lift('SourceGraphic', 0.55, 'up') +
      `<feColorMatrix in="up" type="saturate" values="1.5" result="sat"/>` +
      gray('up', 'g') +
      ramp('g', ['#0a3d73', '#1478c8', '#3fb0ec', '#9fe0f7', '#f4fcff'], 'sky') +
      `<feComposite in="sat" in2="sky" operator="arithmetic" k2=".45" k3=".55" result="cool"/>` +
      hueMask('sat', 'green', 'leaf', false) +
      ramp('g', ['#1f6a1f', '#3fa83a', '#7ccf4a', '#c8f09a'], 'grass') +
      through('grass', 'leaf', 'cool', 'a') +
      hueMask('sat', 'warm', 'warm', false) +
      lift('SourceGraphic', 0.8, 'w') +
      `<feColorMatrix in="w" type="saturate" values="1.3" result="wsat"/>` +
      through('wsat', 'warm', 'a', 'b'),
    texture: (sw, h) =>
      `<defs><linearGradient id="lk-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".42"/><stop offset=".42" stop-color="#ffffff" stop-opacity=".1"/><stop offset=".43" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
      cover(sw, h, 'url(#lk-gloss)'),
    frame: (sw, h) => frame(sw, h, '#ffffff', 1.4, 2, ' rx="8" opacity=".85"') + frame(sw, h, '#2a8ad8', 0.8, 3.4, ' rx="7" opacity=".7"'),
    tag: (text, inset) => {
      const t = plaque(text, inset, { fill: 'url(#lk-pill)', stroke: '#ffffff', ink: '#ffffff', radius: 7, weight: '700', strokeW: 0.8 })
      return {
        ...t,
        svg:
          `<defs><linearGradient id="lk-pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ad0f7"/><stop offset=".5" stop-color="#2a8ad8"/><stop offset="1" stop-color="#1a6ab8"/></linearGradient></defs>` + t.svg,
      }
    },
  }),

  handheld: style({
    name: 'handheld',
    label: 'Handheld',
    voice: 'a four-shade handheld console game',
    paper: oneInk('#9bbc0f', '#0f380f'),
    edge: '#8bac0f',
    inset: 4,
    titleColor: '#0f380f',
    // Four shades of green and nothing else, as the LCD can show.
    grade: () => gray('SourceGraphic', 'g') + lift('g', 0.6, 'gl') + ramp('gl', [LCD[0]!, LCD[1]!, LCD[2]!, LCD[3]!], 'lcd', true),
    texture: (sw, h, _ground, pixel) =>
      `<defs><pattern id="lk-lcd" width="${pixel ? 2 : 1.5}" height="${pixel ? 2 : 1.5}" patternUnits="userSpaceOnUse"><path d="M0 0h${pixel ? 2 : 1.5}v.3h-${pixel ? 2 : 1.5}zM0 0h.3v${pixel ? 2 : 1.5}h-.3z" fill="#0f380f" opacity=".14"/></pattern></defs>` +
      cover(sw, h, 'url(#lk-lcd)'),
    frame: (sw, h) => frame(sw, h, '#306230', 4, 2) + frame(sw, h, '#0f380f', 1, 4.5),
    tag: (text, inset) => plaque(`▶ ${text.toUpperCase()}`, inset, { fill: '#9bbc0f', stroke: '#0f380f', ink: '#0f380f', size: 8 }),
  }),

  engraving: style({
    name: 'engraving',
    label: 'Copperplate Engraving',
    voice: 'a learned 18th-century natural-history plate',
    paper: oneInk('#f3ead4', '#2a2018', '#6a2a1a'),
    edge: '#efe6cf',
    inset: 6,
    titleColor: '#2a2018',
    // Cut into copper and printed in sepia on cream: tone is carried by lines alone,
    // swelling where it is darker, crossed by a second set in the shadows, contours cut over.
    grade: (sw, h, pixel) =>
      lift('SourceGraphic', 0.55, 'up') +
      lumMask('up', 'lum') +
      (pixel
        ? screen([[0.18], [0.62]], 2, 'hatch') + screen([[0.08, 0.3]], 2, 'cross')
        : screen([[0.1], [0.4], [0.72], [0.4]], 0.8, 'hatch') + screen([[0.04, 0.16, 0.3, 0.16]], 0.8, 'cross')) +
      screened('lum', 'hatch', 'h1') +
      screened('lum', 'cross', 'h2') +
      edges('SourceGraphic', 'line', { reach: pixel ? 1.2 : 0.7, threshold: 0.09 }) +
      `<feFlood flood-color="#f3ead4" result="paper"/>` +
      `<feMerge result="cuts"><feMergeNode in="h1"/><feMergeNode in="h2"/><feMergeNode in="line"/></feMerge>` +
      ink('#2a2018', 'cuts', 'paper', 'print'),
    texture: (sw, h) => grain('lk-plate', sw, h, '.7', 0.1, '.35 .25 .12'),
    frame: (sw, h) => frame(sw, h, '#2a2018', 1.2, 4) + frame(sw, h, '#2a2018', 0.4, 6.5),
    tag: (text, inset) =>
      plaque(`PL. I — ${text.toUpperCase()}`, inset, { fill: '#f3ead4', stroke: 'none', ink: '#2a2018', font: SERIF, size: 8, charW: 6.8, spacing: 0.8 }),
  }),

  tapestry: style({
    name: 'tapestry',
    label: 'Millefleur Tapestry',
    voice: 'a gentle medieval tapestry legend',
    paper: { card: '#efe2c0', ink: '#2a2418', kinds: { code: '#2f4a6a', path: '#2f4a6a', fn: '#5a3a6a', num: '#9a2f24', bad: '#9a2f24', good: '#3a5a2a', face: '#c4552e' } },
    edge: '#1f3a2a',
    inset: 6,
    titleColor: '#efe2c0',
    // Woven in a few dyes of wool: weld, woad and madder on a deep green, the lightest as undyed wool.
    grade: () =>
      cells('SourceGraphic', 2, 'wool') +
      gray('wool', 'g') +
      lift('g', 0.75, 'gl') +
      ramp('gl', ['#14261c', '#1f3a2a', '#355a3a', '#6a7a4a', '#b8a878', '#e8dab4'], 'green', true) +
      hueMask('wool', 'warm', 'warm') +
      ramp('gl', ['#4a1612', '#7a2418', '#9a2f24', '#c4552e', '#e09a5a'], 'madder', true) +
      through('madder', 'warm', 'green', 'a') +
      hueMask('wool', 'blue', 'cool') +
      ramp('gl', ['#141e38', '#1c2a4a', '#2f4a6a', '#5a7a9a'], 'woad', true) +
      through('woad', 'cool', 'a', 'woven'),
    texture: (sw, h) =>
      `<defs><pattern id="lk-weave" width="2" height="2" patternUnits="userSpaceOnUse">` +
      `<path d="M0 1.5h1v.5h-1zM1 .5h1v.5h-1z" fill="#000" opacity=".22"/><path d="M0 0h1v.4h-1zM1 1h1v.4h-1z" fill="#fff" opacity=".08"/></pattern></defs>` +
      cover(sw, h, 'url(#lk-weave)'),
    frame: (sw, h) => {
      // A woven border: a band of small lozenges in the tapestry's dyes.
      const colors = ['#9a2f24', '#e0b050', '#2f4a6a', '#e0b050']
      const band = (y: number) =>
        Array.from({ length: Math.ceil(sw / 6) }, (_, i) => `<path d="M${i * 6} ${y + 2.5}l3 -2.5l3 2.5l-3 2.5z" fill="${colors[i % 4]}"/>`).join('')
      return `<rect width="${sw}" height="5" fill="#1f3a2a"/><rect y="${h - 5}" width="${sw}" height="5" fill="#1f3a2a"/>` + band(0) + band(h - 5) + frame(sw, h, '#14261c', 1, 5.5)
    },
    tag: (text, inset) => {
      const t = plaque(text, inset, { fill: '#efe2c0', stroke: '#9a2f24', ink: '#7a2418', font: SERIF, size: 8, charW: 6.6, strokeW: 1 })
      // The banner's notched ends.
      const y = inset + 4
      const x0 = inset + 5
      const x1 = t.w - 4
      const ends = `<path d="M${x0} ${y}l-4 0l3 7.5l-3 7.5l4 0zM${n(x1)} ${y}l4 0l-3 7.5l3 7.5l-4 0z" fill="#c9b88a" stroke="#9a2f24" stroke-width="1"/>`
      return { ...t, svg: ends + t.svg, w: t.w + 4 }
    },
  }),

  golden: style({
    name: 'golden',
    label: 'Golden Age Comic',
    voice: 'a punchy 1938 comic book',
    paper: { card: '#fff6d8', ink: '#141010', kinds: { code: '#1a4a9a', path: '#1a4a9a', fn: '#7a2a8a', num: '#d0201a', bad: '#d0201a', good: '#1a7a2a', face: '#d0201a' } },
    edge: '#f3e6c0',
    inset: 4,
    titleColor: '#141010',
    // Four-color newsprint: the colors pushed bold, every ink printed through a Ben-Day
    // screen (so the tones are dots), the paper yellowed, and heavy black keylines over it.
    grade: (sw, h, pixel) =>
      lift('SourceGraphic', 0.75, 'up') +
      `<feColorMatrix in="up" type="saturate" values="2.2" result="bold"/>` +
      (pixel
        ? screen([[0.125, 0.625], [0.875, 0.375]], 2, 'dots')
        : screen([[0.85, 0.6, 0.55, 0.8], [0.5, 0.15, 0.1, 0.45], [0.55, 0.2, 0.05, 0.4], [0.8, 0.4, 0.35, 0.75]], 0.8, 'dots')) +
      screenGray('dots', 'dg') +
      `<feComposite in="bold" in2="dg" operator="arithmetic" k2="1" k3="${pixel ? -0.35 : -0.6}" k4="${pixel ? 0.175 : 0.3}" result="dotted"/>` +
      posterize('dotted', 2, 'cmy') +
      `<feComponentTransfer in="cmy" result="news"><feFuncR type="table" tableValues=".1 .96"/><feFuncG type="table" tableValues=".08 .91"/><feFuncB type="table" tableValues=".07 .76"/></feComponentTransfer>` +
      edges('SourceGraphic', 'line', { reach: pixel ? 1.4 : 1.1, threshold: 0.1 }) +
      ink('#141010', 'line', 'news', 'inked'),
    texture: (sw, h) => grain('lk-pulp', sw, h, '.5', 0.12, '.4 .3 .1'),
    frame: (sw, h) => frame(sw, h, '#141010', 4, 2) + frame(sw, h, '#fff6d8', 1, 4.5),
    tag: (text, inset) =>
      plaque(`${text.toUpperCase()}!`, inset, { fill: '#f3c623', stroke: '#d0201a', ink: '#141010', size: 8, weight: '700', strokeW: 1.6 }),
  }),

  ukiyoe: style({
    name: 'ukiyoe',
    label: 'Ukiyo-e',
    voice: 'a calm Edo-period woodblock print',
    paper: { card: '#efe3c8', ink: '#1b2a4a', kinds: { code: '#2f4d7a', path: '#2f4d7a', fn: '#5a3a6a', num: '#b03a2e', bad: '#b03a2e', good: '#3a5a3a', face: '#b03a2e' } },
    edge: '#efe3c8',
    inset: 4,
    titleColor: '#1b2a4a',
    // Printed from blocks in flat inks: Prussian blue and indigo by lightness on cream
    // paper, warm things in vermilion, leaves in a muted green, and the key block's dark
    // lines over all of it.
    grade: (sw, h, pixel) =>
      gray('SourceGraphic', 'g') +
      lift('g', 0.65, 'gl') +
      ramp('gl', ['#14203a', '#1b2a4a', '#2f4d7a', '#6e8fb5', '#b9c8d6', '#efe3c8'], 'blue', true) +
      hueMask('SourceGraphic', 'warm', 'warm') +
      ramp('gl', ['#6a2418', '#9c3b26', '#b03a2e', '#d9663f', '#e8a07a'], 'red', true) +
      through('red', 'warm', 'blue', 'a') +
      hueMask('SourceGraphic', 'green', 'leaf') +
      ramp('gl', ['#22301e', '#3a4a2e', '#5a6a46', '#9aa070'], 'green', true) +
      through('green', 'leaf', 'a', 'b') +
      edges('SourceGraphic', 'line', { reach: pixel ? 1.2 : 0.9, threshold: 0.1 }) +
      ink('#14203a', 'line', 'b', 'keyed'),
    texture: (sw, h, ground) =>
      // Bokashi: the sky's blue graded down from the top, and the grain of the paper.
      `<defs><linearGradient id="lk-bokashi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a4a" stop-opacity=".55"/><stop offset="1" stop-color="#1b2a4a" stop-opacity="0"/></linearGradient></defs>` +
      `<rect width="${sw}" height="${n(ground * 0.32)}" fill="url(#lk-bokashi)"/>` +
      grain('lk-washi', sw, h, '.9 .25', 0.16, '.45 .35 .2'),
    frame: (sw, h) => frame(sw, h, '#1b2a4a', 1.5, 3),
    tag: (text, inset) => {
      // A cartouche with the artist's red seal beside it.
      const t = plaque(text, inset, { fill: '#efe3c8', stroke: '#1b2a4a', ink: '#1b2a4a', font: SERIF, size: 8, charW: 6.6 })
      const x = t.w - 1
      const y = inset + 4
      return { svg: t.svg + `<rect x="${n(x)}" y="${y}" width="9" height="9" fill="#b03a2e"/><path d="M${n(x + 2.5)} ${y + 2.5}h4v4h-4z" fill="none" stroke="#efe3c8" stroke-width=".8"/>`, w: x + 13, h: t.h }
    },
  }),

  kamon: style({
    name: 'kamon',
    label: 'Kamon',
    voice: 'a terse family crest motto',
    paper: oneInk('#efe6d2', '#161412', '#a8322a'),
    edge: '#161412',
    inset: 5,
    titleColor: '#efe6d2',
    // A crest in two tones: cream on black lacquer, nothing between. Claude, and every warm
    // light, is cut in cream and ringed in black.
    grade: () =>
      gray('SourceGraphic', 'g') +
      lift('g', 0.75, 'gl') +
      ramp('gl', ['#161412', '#161412', '#161412', '#efe6d2', '#efe6d2'], 'two', true) +
      hueMask('SourceGraphic', 'warm', 'warm') +
      `<feFlood flood-color="#efe6d2" result="cream"/>` +
      through('cream', 'warm', 'two', 'cut') +
      edges('SourceGraphic', 'line', { reach: 1, threshold: 0.1 }) +
      `<feComposite in="line" in2="warm" operator="out" result="rim"/>` +
      ink('#efe6d2', 'rim', 'cut', 'lined') +
      // Round the cream cut-outs a lacquer line, so Claude still reads against a pale sky.
      `<feOffset in="warm" dx="1" dy="1" result="wo"/>` +
      `<feComposite in="wo" in2="warm" operator="xor" result="ring"/>` +
      `<feMorphology in="ring" operator="dilate" radius=".4" result="ring2"/>` +
      ink('#161412', 'ring2', 'lined', 'crest'),
    texture: (sw, h) =>
      `<defs><linearGradient id="lk-lacquer" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".07"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity=".04"/></linearGradient></defs>` +
      cover(sw, h, 'url(#lk-lacquer)'),
    frame: (sw, h) => frame(sw, h, '#efe6d2', 1.2, 3) + frame(sw, h, '#efe6d2', 0.5, 5.5),
    tag: (text, inset) => {
      // The name beside a small vermilion seal.
      const x = inset + 6
      const y = inset + 5
      return {
        svg: `<rect x="${x}" y="${y}" width="9" height="9" fill="#a8322a"/><circle cx="${x + 4.5}" cy="${y + 4.5}" r="2.6" fill="none" stroke="#efe6d2" stroke-width=".8"/>` + tagText(text, x + 13, y + 7.5, { font: PIXEL_FONT, size: 8, fill: '#efe6d2', spacing: 0.4 }),
        w: x + 13 + text.length * 6 + 6,
        h: y + 13,
      }
    },
  }),
}

export const LOOK_NAMES = Object.keys(LOOKS)
export const DEFAULT_LOOK = 'default'
/** The looks a person can choose, all but the default. */
export const STYLE_NAMES = LOOK_NAMES.filter(name => name !== DEFAULT_LOOK)

/** The look by name; an unknown name draws the default. */
export const lookFor = (name: string | undefined): Look => LOOKS[name ?? DEFAULT_LOOK] ?? DEFAULT

const squash = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '')

/** The look a person means, leniently: "Ukiyo-e", "golden age", "frutiger aero" and "Copperplate" all find theirs. */
export function findLook(text: string): Look | undefined {
  const want = squash(text)
  if (!want) return undefined
  return Object.values(LOOKS).find(look => squash(look.name) === want || squash(look.label) === want || squash(look.label).includes(want) || squash(look.name).startsWith(want))
}
