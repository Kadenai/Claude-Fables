/**
 * Handheld, after the gallery's "Handheld: four shades of green, 1989"
 * (henrik-styles.js, style 45, `shandheld`).
 *
 * The art bible, translated from the gallery's screen to the Fables' worlds:
 *
 * - A reflective LCD of chunky square pixels in exactly four shades of green,
 *   lightest to darkest; nothing between them. Every element is drawn in the
 *   shade its lightness falls into, a family at a time, so the sky is the
 *   lightest shade and the ground darker, as a game would draw its levels.
 * - Middle tones a single shade can't hold are dithered: a checker of the two
 *   shades either side, as the gallery's horizon is.
 * - Sprites are outlined: every nearer shape gets a one-pixel line in the
 *   darkest shade.
 * - Light and glow are not drawn: the screen has no light of its own.
 * - Claude is the gallery's sprite: top in the lightest shade, front in the
 *   second, sides and legs in the third, outline and eyes in the darkest.
 * - The screen sits in its bezel, with the pixel grid of the LCD over it; the
 *   chapter is the status bar, and the caption a game's text box, doubled at
 *   its rim, in pixel type.
 */
import type { HeroPainter } from '../hero3d'
import type { Model } from '../clawd3d'
import { lum, meanOf, num as n, poly } from '../art/ink'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import { cells } from '../grade'
import type { Look } from '../looks'

/** The four shades, lightest first, as the gallery numbers them. */
const SH = ['#c5d36b', '#8fa83f', '#4f6b2a', '#1f3415']
const MONOCRAFT = 'Monocraft, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
/** One LCD pixel, in stage units. */
const PX = 2.5

/** How light each family is drawn, before its own lightness: the sky light, the ground darker, the front darkest. */
const BIAS: Partial<Record<Family, number>> = { sky: 0.35, cloud: 0.3, body: 0.5, stars: 0.6, life: 0.6, fire: 0.5, lamp: 0.5, ground: -0.05, grass: -0.08, bark: -0.15 }

/** A lit color as a shade: one of the four, or a dither between two neighbours. */
function shade(color: string, family: Family): string {
  const t = Math.max(0, Math.min(0.999, Math.pow(lum(color), 0.7) * 1.1 + (BIAS[family] ?? 0)))
  // Seven steps: the four shades and the three dithers between them, darkest first.
  const k = Math.floor(t * 7)
  const steps = [SH[3], 'url(#hh-d23)', SH[2], 'url(#hh-d12)', SH[1], 'url(#hh-d01)', SH[0]]
  return steps[k] ?? SH[0]!
}

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? SH[3]! : shade(color, family)),
      url: (_id, family, attr, g) => (attr === 'stroke' ? SH[3]! : g && meanOf(g).opacity < 0.5 ? 'none' : shade(g ? meanOf(g).color : '#808080', family)),
      // Sprite outlines: one pixel of the darkest shade round the nearer shapes.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'cloud' || depth < 0.3
          ? ''
          : `stroke="${SH[3]}" stroke-width="${PX * 0.9}" stroke-linejoin="miter"`,
      opacity: (_f, v) => (v >= 0.4 ? 1 : 0),
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        lens: () => '',
        glow: () => '',
        beam: () => '',
        // Mist as a dithered band.
        air: (svg, c) => {
          const y = c.meta.y ?? 80
          const h = c.meta.h ?? 12
          return `<g><rect x="-20" y="${n(y + h * 0.3)}" width="${(c.meta.sw ?? 640) + 40}" height="${n(PX * 2)}" fill="url(#hh-d01)"/>${c.motion(svg)}</g>`
        },
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
        'forest.sun': (_s, c) => (c.meta.part === 'halo' ? '' : `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 7) * 1.4)}" fill="${SH[0]}" stroke="${SH[3]}" stroke-width="${PX}"/>`),
        'desert.sun': (_s, c) => (c.meta.part === 'halo' ? '' : `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 11) * 1.2)}" fill="${SH[0]}" stroke="${SH[3]}" stroke-width="${PX}"/>`),
        'night.moon': (_s, c) => `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 9) * 1.3)}" fill="${SH[0]}" stroke="${SH[3]}" stroke-width="${PX}"/>`,
      },
    },
    'hh',
  )

/** Claude as the gallery's sprite: top lightest, front second, sides and legs third, outline and eyes darkest. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  let faces = ''
  for (const f of m.faces) {
    const s = f.name === 'top' ? SH[0] : f.name === 'front' && f.part === 'body' ? SH[1] : SH[2]
    faces += `<path fill="${s}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e => (e.poly ? `<path fill="${SH[3]}" stroke="${SH[3]}" stroke-width="1" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" stroke="${SH[3]}" stroke-width="${PX}" d="${poly(e.line ?? [], cx, floor, false)}"/>`))
    .join('')
  return `<path fill="${SH[3]}" stroke="${SH[3]}" stroke-width="${PX * 2.6}" stroke-linejoin="round" d="${hulls}"/>` + faces + eyes
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A checker of two shades, one LCD pixel per square. */
const dither = (id: string, a: string, b: string) =>
  `<pattern id="${id}" width="${PX * 2}" height="${PX * 2}" patternUnits="userSpaceOnUse"><rect width="${PX * 2}" height="${PX * 2}" fill="${a}"/><path d="M0 0h${PX}v${PX}h-${PX}zM${PX} ${PX}h${PX}v${PX}h-${PX}z" fill="${b}"/></pattern>`

export const HANDHELD: Look = {
  name: 'handheld',
  label: 'Handheld',
  voice: 'a four-shade handheld console game',
  cell: 'solid',
  figure: '3d',
  font: MONOCRAFT,
  charW: 6,
  caption: { fill: SH[0]!, stroke: SH[3]!, ink: SH[3]!, radius: 0 },
  paper: { card: SH[0]!, ink: SH[3]!, kinds: { code: SH[3]!, path: SH[3]!, fn: SH[3]!, num: SH[2]!, bad: SH[3]!, good: SH[3]!, face: SH[2]! } },
  inset: 5,
  titleColor: SH[3],
  // The medium: the LCD's pixels, every element drawn on them.
  grade: () => cells('SourceGraphic', PX, 'lcd'),
  art: {
    painter: scenery,
    hero,
    sky: SH[0]!,
    ground: SH[2]!,
    defs: () => dither('hh-d01', SH[0]!, SH[1]!) + dither('hh-d12', SH[1]!, SH[2]!) + dither('hh-d23', SH[2]!, SH[3]!),
  },
  texture: (sw, h) =>
    `<pattern id="hh-grid" width="${PX}" height="${PX}" patternUnits="userSpaceOnUse"><path d="M0 0h${PX}v.3h-${PX}zM0 0h.3v${PX}h-.3z" fill="${SH[3]}" opacity=".12"/></pattern>` +
    `<rect width="${sw}" height="${h}" fill="url(#hh-grid)"/>`,
  frame: (sw, h) => `<rect x="2" y="2" width="${sw - 4}" height="${h - 4}" fill="none" stroke="#3a4a3a" stroke-width="4"/><rect x="4.5" y="4.5" width="${sw - 9}" height="${h - 9}" fill="none" stroke="${SH[3]}" stroke-width="1"/>`,
  tag: (text, inset) => {
    const t = `▶ ${text.toUpperCase()}`
    const x = inset + 3
    const y = inset + 3
    const w = t.length * 5.4 + 8
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="12" fill="${SH[0]}"/><rect x="${x}" y="${y + 12}" width="${n(w)}" height="1.5" fill="${SH[3]}"/>` +
        `<text x="${x + 4}" y="${y + 9}" font-family="${MONOCRAFT}" font-size="8" fill="${SH[3]}">${escape(t)}</text>`,
      w: x + w + 4,
      h: y + 17,
    }
  },
  bubble: {
    font: MONOCRAFT,
    size: 9,
    charW: 6,
    line: 12,
    base: 13,
    upper: true,
    draw: ({ x, y, w, h }) =>
      // A game's text box: dark, light, dark again at the rim, and a little arrow waiting at its corner.
      `<rect x="${n(x - 1)}" y="${n(y - 1)}" width="${w + 2}" height="${h + 2}" fill="${SH[3]}"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="${SH[0]}"/>` +
      `<rect x="${n(x + 1.5)}" y="${n(y + 1.5)}" width="${w - 3}" height="${h - 3}" fill="none" stroke="${SH[3]}" stroke-width="1"/>` +
      `<path d="M${n(x + w - 9)} ${n(y + h - 6)}h5l-2.5 3z" fill="${SH[3]}"><animate attributeName="opacity" values="1;0;1" dur="1s" calcMode="discrete" repeatCount="indefinite"/></path>`,
  },
}
