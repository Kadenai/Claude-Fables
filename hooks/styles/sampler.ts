/**
 * Sampler, after the gallery's "Sampler: cross-stitch, 1840s" (henrik-styles.js,
 * style 37, `ssampler`).
 *
 * The art bible, translated from the gallery's sampler to the Fables' worlds:
 *
 * - Worked in cross-stitch on even-weave linen: the whole scene is a grid of
 *   crosses, each a stitch of one thread with a darker underside showing at
 *   its edge, and the bare linen between them and wherever nothing is stitched.
 * - A Victorian girl's few skeins: madder red, indigo blue, leaf green, walnut
 *   brown and old gold, each in a light and a dark. Every element is worked in
 *   the skein nearest its color; anything pale is left as bare linen, so skies,
 *   mist and light are the cloth itself, with only a stitched horizon of color.
 * - Lines are back-stitched: a single thread round the nearer shapes.
 * - Claude is the gallery's: worked in coral threads by face, a darker thread
 *   round him, his eyes stitched in the darkest brown.
 * - The cloth is hemmed with a running stitch and a border of green and red;
 *   the chapter is stitched in red capitals with a green rule under it, and the
 *   caption is worked on a hemmed band of linen.
 */
import type { HeroPainter } from '../hero3d'
import type { Model } from '../clawd3d'
import { isGreen, isWarm, lum, meanOf, num as n, poly } from '../art/ink'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import { cells } from '../grade'
import type { Look } from '../looks'

const P = {
  linen: '#e7dab9',
  red: '#a8392f',
  blue: '#3b5a8a',
  green: '#5d7a3e',
  brown: '#5a3a28',
  gold: '#c99a3d',
  top: '#eba27c',
  front: '#d0603c',
  side: '#9c4430',
  leg: '#c25537',
  legDark: '#8d3d29',
  rim: '#6b2a1c',
  eye: '#2a1c16',
}
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
/** One stitch, in stage units. */
const STITCH = 3

/** The skeins, dark to light, ending in bare linen. */
const SKEIN = {
  blue: ['#1e2e4a', '#2a3f66', P.blue, '#6a86b0', '#a8b8cc', P.linen],
  red: ['#5a1a16', '#7e2620', P.red, '#c8604a', '#e0a080', P.linen],
  green: ['#22301a', '#3a5228', P.green, '#8aa060', '#bcc690', P.linen],
  brown: ['#2a1a12', P.brown, '#7a5838', '#a8885a', '#cfbb92', P.linen],
  gold: [P.brown, '#8a6a2a', P.gold, '#e0c070', P.linen],
}
const pick = (ramp: readonly string[], t: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)))] ?? ramp[0]!

function thread(color: string, family: Family): string {
  const t = Math.min(1, Math.pow(lum(color), 0.7) * 1.15)
  const warm = isWarm(color)
  switch (family) {
    case 'fire':
    case 'lamp':
    case 'body':
      return pick(SKEIN.gold, Math.min(0.75, t))
    case 'stars':
    case 'life':
      return P.gold
    case 'sky':
      // The sky is left as bare linen, as a sampler's ground always is.
      return P.linen
    case 'cloud':
      return warm ? '#e0a080' : '#a8b8cc'
    case 'water':
      return pick(SKEIN.blue, Math.min(0.8, t))
    case 'foliage':
    case 'grass':
      return pick(SKEIN.green, t)
    case 'bark':
      return pick(SKEIN.brown, t * 0.8)
    case 'rock':
    case 'land':
    case 'ground':
    case 'mark':
      // Earth and stone are worked in walnut, the hills in green.
      return isGreen(color) ? pick(SKEIN.green, t) : warm && t > 0.5 ? pick(SKEIN.red, t) : pick(SKEIN.brown, t)
    default:
      return isGreen(color) ? pick(SKEIN.green, t) : warm ? pick(SKEIN.red, t) : brownish(color) ? pick(SKEIN.brown, t) : pick(SKEIN.blue, t)
  }
}
function brownish(color: string): boolean {
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  return parseInt(c.slice(0, 2), 16) > parseInt(c.slice(4, 6), 16) + 16
}

const scenery = () =>
  painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? P.brown : thread(color, family)),
      url: (_id, family, attr, g) => (attr === 'stroke' ? P.brown : g && meanOf(g).opacity < 0.5 ? 'none' : thread(g ? meanOf(g).color : '#808080', family)),
      // Back-stitch: one thread round the nearer shapes.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'cloud' || depth < 0.35
          ? ''
          : `stroke="${P.brown}" stroke-width="${n(STITCH * 0.6)}" stroke-linejoin="round"`,
      opacity: (_f, v) => (v >= 0.35 ? 1 : 0),
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        lens: () => '',
        glow: () => '',
        beam: () => '',
        air: () => '',
        // The Earth and the moon, worked as round motifs on the bare cloth.
        'space.earth': (_s, c) => `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n(c.meta.r ?? 30)}" fill="${P.blue}"/><path fill="${P.green}" d="M${n((c.meta.cx ?? 0) - 10)} ${n((c.meta.cy ?? 0) - 18)}h14v8h-6v10h-10z"/>`,
        'night.moon': (_s, c) => `<circle cx="${n(c.meta.cx ?? 0)}" cy="${n(c.meta.cy ?? 0)}" r="${n((c.meta.r ?? 9) * 1.3)}" fill="${P.gold}"/>`,
        'space.milkyway': (svg, c) => c.repaint(svg.replace(/<ellipse[^>]*\/>/, '')),
      },
    },
    'sm',
  )

/** Claude worked in coral threads by face, a dark thread round him, his eyes in the darkest brown. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  let faces = ''
  for (const f of m.faces) {
    const tone = f.part === 'leg' ? (f.name === 'front' ? P.leg : P.legDark) : f.name === 'top' ? P.top : f.name === 'front' ? P.front : P.side
    faces += `<path fill="${tone}" d="${poly(f.pts, cx, floor)}"/>`
  }
  const eyes = m.eyes
    .map(e => (e.poly ? `<path fill="${P.eye}" stroke="${P.eye}" stroke-width="1.4" d="${poly(e.poly, cx, floor)}"/>` : `<path fill="none" stroke="${P.eye}" stroke-width="2.2" d="${poly(e.line ?? [], cx, floor, false)}"/>`))
    .join('')
  return `<path fill="${P.rim}" stroke="${P.rim}" stroke-width="${STITCH}" stroke-linejoin="round" d="${hulls}"/>` + faces + eyes
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The linen round each cross: the cell less an X, so the stitch shows through; its thread's darker underside at the edge. */
function cloth(): string {
  const L = STITCH / 2 - 0.15
  const w = STITCH * 0.15
  const c = Math.SQRT1_2
  const o = STITCH / 2
  const plus: [number, number][] = [[-w, -L], [w, -L], [w, -w], [L, -w], [L, w], [w, w], [w, L], [-w, L], [-w, w], [-L, w], [-L, -w], [-w, -w]]
  const x = plus.map(([px, py]) => `${n(o + (px - py) * c)} ${n(o + (px + py) * c)}`).join('L')
  return (
    `<pattern id="sm-cross" width="${STITCH}" height="${STITCH}" patternUnits="userSpaceOnUse">` +
    `<path fill-rule="evenodd" fill="${P.linen}" d="M0 0h${STITCH}v${STITCH}h-${STITCH}zM${x}z"/>` +
    `<path d="M${n(o)} .4L${n(STITCH - 0.4)} ${n(STITCH - 0.4)}" stroke="#000" stroke-opacity=".18" stroke-width=".35"/>` +
    `<path d="M0 0h${STITCH}v.25h-${STITCH}zM0 0h.25v${STITCH}h-.25z" fill="#b8a888" opacity=".6"/></pattern>`
  )
}

export const SAMPLER: Look = {
  name: 'sampler',
  label: 'Sampler',
  voice: 'a sweet Victorian embroidered motto',
  cell: 'solid',
  figure: '3d',
  font: SERIF,
  charW: 5.1,
  caption: { fill: '#efe5cc', stroke: P.red, ink: '#3a2a20', radius: 0 },
  paper: { card: '#efe5cc', ink: '#3a2a20', kinds: { code: P.blue, path: P.blue, fn: '#6a3a7a', num: P.red, bad: P.red, good: P.green, face: '#c4553a' } },
  inset: 7,
  titleColor: P.red,
  // The medium: every element, worked, sits on the cloth's grid, one stitch per square.
  grade: () => cells('SourceGraphic', STITCH, 'sewn'),
  art: {
    painter: scenery,
    hero,
    sky: P.linen,
    ground: P.linen,
    defs: () => cloth(),
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" fill="url(#sm-cross)"/>`,
  frame: (sw, h) => {
    // A border of green stitches with red at every fourth, inside a running-stitch hem.
    let d = ''
    let r = ''
    for (let x = 0; x < sw; x += STITCH) {
      for (const y of [1, h - 1 - STITCH]) ((x / STITCH) % 4 === 0 ? (r += `M${x} ${y}l${STITCH} ${STITCH}m-${STITCH} 0l${STITCH}-${STITCH}`) : (d += `M${x} ${y}l${STITCH} ${STITCH}m-${STITCH} 0l${STITCH}-${STITCH}`))
    }
    return (
      `<rect y="0" width="${sw}" height="${STITCH + 2}" fill="${P.linen}"/><rect y="${h - STITCH - 2}" width="${sw}" height="${STITCH + 2}" fill="${P.linen}"/>` +
      `<path d="${d}" stroke="${P.green}" stroke-width=".9" stroke-linecap="round"/><path d="${r}" stroke="${P.red}" stroke-width=".9" stroke-linecap="round"/>` +
      `<rect x="1" y="1" width="${sw - 2}" height="${h - 2}" fill="none" stroke="${P.linen}" stroke-width="2"/>` +
      `<rect x="${STITCH + 3}" y="${STITCH + 3}" width="${sw - STITCH * 2 - 6}" height="${h - STITCH * 2 - 6}" fill="none" stroke="${P.red}" stroke-width="1" stroke-dasharray="3 2"/>`
    )
  },
  tag: (text, inset) => {
    const t = text.toUpperCase()
    const x = inset + 5
    const y = inset + 4
    const w = t.length * 6.6 + 12
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="15" fill="${P.linen}"/>` +
        `<text x="${x + 6}" y="${y + 9.6}" font-family="${SERIF}" font-size="8" font-weight="700" letter-spacing="1" fill="${P.red}">${escape(t)}</text>` +
        `<path d="M${x + 5} ${y + 13}H${n(x + w - 5)}" stroke="${P.green}" stroke-width="1" stroke-dasharray="2 1.5"/>`,
      w: x + w + 4,
      h: y + 19,
    }
  },
  bubble: {
    font: SERIF,
    size: 9,
    charW: 5.1,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      `<path fill="${P.red}" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" fill="#efe5cc" stroke="${P.linen}" stroke-width="1"/>` +
      `<rect x="${n(x + 2)}" y="${n(y + 2)}" width="${w - 4}" height="${h - 4}" fill="none" stroke="${P.red}" stroke-width=".9" stroke-dasharray="3 2"/>`,
  },
}
