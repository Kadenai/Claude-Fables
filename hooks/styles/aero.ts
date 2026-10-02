/**
 * Frutiger Aero, after the gallery's "Frutiger Aero: glossy eco-tech,
 * mid-2000s" (henrik-styles.js, style 29, `eaero`).
 *
 * The art bible, translated from the gallery's desktop to the Fables' worlds:
 *
 * - Everything is clean, bright and glossy: azure skies fading to pale aqua at
 *   the horizon, grass-green hills, white clouds as soft puffs, a white sun
 *   with a lens flare. Night scenes go deep blue but stay just as clean.
 * - Every surface is a smooth gradient, lighter at the top, and carries a
 *   glossy rim of white light along its top edge; shapes have no dark outline.
 * - Colors are pushed toward the Aero palette: sky blue, aqua, grass green,
 *   white, with warm things kept as glowing orange.
 * - Claude is the gallery's tangerine jelly: rounded, light at the top left
 *   and deep at the bottom right, a darker inner edge, a glossy window cap
 *   over his top and a white hot spot, dark glassy eyes with a white glint.
 * - The screen is framed in rounded glass; the chapter is a glossy pill, and
 *   the caption a frosted glass panel.
 */
import type { HeroPainter } from '../hero3d'
import type { Model } from '../clawd3d'
import { isGreen, isWarm, lum, mix, num as n, poly, step, t1 } from '../art/ink'
import { painter } from '../art/painter'
import type { Family } from '../art/roles'
import type { Look } from '../looks'

const K = { light: '#ffbd5c', mid: '#ff7f17', deep: '#e0480a', edge: '#b23a06', eye: '#5c1d05' }
const SANS = "'Segoe UI', 'Frutiger', 'Myriad Pro', 'Helvetica Neue', Arial, sans-serif"

/** Aero's ramps, dark to light. */
const R = {
  sky: ['#0a3d73', '#0d6fd6', '#3aa3ef', '#a5e0fb', '#d9f5ff'],
  green: ['#1f6a1f', '#2f8f12', '#58c21f', '#8ee23f', '#c8f09a'],
  aqua: ['#0a4a6a', '#1478a8', '#3ab0d8', '#9fe0f2', '#e8fbff'],
  warm: ['#b23a06', K.deep, K.mid, K.light, '#ffe6b0'],
  glass: ['#3a5a7a', '#6a90b4', '#a9c6dc', '#e8f3fb', '#ffffff'],
}

function tone(color: string, family: Family): string {
  // Aero is bright: everything lifted well into the light.
  const t = Math.min(0.99, 0.25 + Math.pow(lum(color), 0.6) * 0.85)
  if (family === 'fire' || family === 'lamp' || family === 'body') return step(R.warm, t)
  if (family === 'stars' || family === 'life') return '#ffffff'
  if (family === 'sky' || family === 'cloud' || family === 'air') return step(R.sky, t)
  if (family === 'foliage' || family === 'grass' || family === 'land') return isWarm(color) ? step(R.warm, t) : step(R.green, t)
  if (family === 'water' || family === 'glass') return step(R.aqua, t)
  if (isWarm(color)) return step(R.warm, t)
  if (isGreen(color)) return step(R.green, t)
  return step(R.glass, t)
}

/** A surface's gradient: its tone lighter at the top, a little deeper below, as glossy plastic is. */
let made = new Set<string>()
let pending = ''
function glossy(color: string): string {
  const id = `ae-g${color.slice(1)}`
  if (!made.has(id)) {
    made.add(id)
    pending += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.35)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, '#000000', 0.18)}"/></linearGradient>`
  }
  return `url(#${id})`
}

const scenery = () => {
  made = new Set()
  pending = ''
  const p = painter(
    {
      ink: (color, family, _depth, attr) => (attr === 'stroke' ? '#ffffff' : attr === 'stop-color' ? tone(color, family) : family === 'sky' || family === 'stars' || family === 'life' ? tone(color, family) : glossy(tone(color, family))),
      // Gradients stay gradients here: Aero is made of them, carried into its own colors.
      line: (family, depth) =>
        family === 'sky' || family === 'stars' || family === 'life' || family === 'lens' || family === 'air' || family === 'beam' || family === 'glow' || family === 'fire' || family === 'lamp'
          ? ''
          : `stroke="#ffffff" stroke-opacity="${n(0.25 + depth * 0.3)}" stroke-width="${n(0.4 + depth * 0.4)}" stroke-linejoin="round"`,
      lineless: 0.6,
      faint: 'hide',
      redraw: {
        lens: () => '',
        glow: () => '',
        // A white sun with its flare: a few rings along the line toward the middle of the stage.
        body: (_svg, c) => {
          const cx = c.meta.cx ?? 0
          const cy = c.meta.cy ?? 0
          const r = c.meta.r ?? 8
          if (c.meta.part === 'halo') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 7)}" fill="url(#ae-flare)"/>`
          if (c.role === 'space.earth') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#ae-earth)"/><ellipse cx="${n(cx - r * 0.3)}" cy="${n(cy - r * 0.55)}" rx="${n(r * 0.5)}" ry="${n(r * 0.25)}" fill="#fff" opacity=".5"/>`
          const rings = [0.35, 0.6, 0.85].map((k, i) => `<circle cx="${n(cx + (320 - cx) * k)}" cy="${n(cy + (70 - cy) * k)}" r="${[5, 9, 3.5][i]}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>`).join('')
          return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 4)}" fill="url(#ae-flare)"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.1)}" fill="#ffffff"/>` + rings
        },
        // Clouds as soft white puffs.
        cloud: (svg, c) => `<g opacity=".85">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="#ffffff"')}</g>`,
        air: (svg, c) => `<g opacity=".55">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="#ffffff"')}</g>`,
        beam: (svg, c) => `<g opacity=".35">${c.repaint(svg).replace(/\sfill="[^"]*"/g, ' fill="#ffffff"')}</g>`,
      },
    },
    'ae',
  )
  // Hand the glossy gradients along with the element that first needs them.
  return {
    el: (role: Parameters<typeof p.el>[0], svg: string, meta?: Parameters<typeof p.el>[2]) => {
      const out = p.el(role, svg, meta)
      const defs = pending
      pending = ''
      return (defs ? `<defs>${defs}</defs>` : '') + out
    },
    defs: p.defs,
  }
}

// ---------------------------------------------------------------- Claude

/** Claude as tangerine jelly: rounded, lit from the top left, a glossy cap and a hot spot. */
const hero = (): HeroPainter => (m: Model, cx: number, floor: number) => {
  const hulls = m.parts.map(pt => poly(pt.hull, cx, floor)).join('')
  const body = m.parts.find(p => p.name === 'body')
  let cap = ''
  if (body) {
    const xs = body.hull.map(p => p[0] + cx)
    const ys = body.hull.map(p => p[1] + floor)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const w = x1 - x0
    const h = y1 - y0
    cap =
      `<rect x="${t1(x0 + w * 0.1)}" y="${t1(y0 + h * 0.06)}" width="${t1(w * 0.8)}" height="${t1(h * 0.4)}" rx="${t1(h * 0.18)}" fill="url(#ae-cap)"/>` +
      `<ellipse cx="${t1(x0 + w * 0.25)}" cy="${t1(y0 + h * 0.18)}" rx="${t1(w * 0.07)}" ry="${t1(h * 0.05)}" fill="#fff" opacity=".95"/>`
  }
  // The faces turn the jelly faintly, so its shape still reads.
  const faces = m.faces
    .filter(f => f.part === 'body' && f.name !== 'front')
    .map(f => `<path fill="${f.name === 'top' ? '#ffeec8' : '#aa3205'}" opacity="${f.name === 'top' ? 0.3 : n(0.22 * (1 - f.light))}" d="${poly(f.pts, cx, floor)}"/>`)
    .join('')
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="url(#ae-eye)" stroke="#ffe6c8" stroke-opacity=".55" stroke-width=".5" d="${poly(e.poly, cx, floor)}"/><circle cx="${t1((e.poly[3]?.[0] ?? 0) + cx - 0.2)}" cy="${t1((e.poly[3]?.[1] ?? 0) + floor - 0.2)}" r=".6" fill="#fff"/>`
        : `<path fill="none" stroke="#7a2809" stroke-width="1" stroke-linecap="round" d="${poly(e.line ?? [], cx, floor, false)}"/>`,
    )
    .join('')
  return (
    `<path fill="url(#ae-shadow)" d="${poly(m.shadow, cx, floor)}"/>` +
    // The jelly: its edge deep and rounded, then its body, light top left to deep bottom right.
    `<path fill="${K.edge}" stroke="${K.edge}" stroke-width="2.4" stroke-linejoin="round" d="${hulls}"/>` +
    `<path fill="url(#ae-jelly)" stroke="url(#ae-jelly)" stroke-width="1.2" stroke-linejoin="round" d="${hulls}"/>` +
    faces +
    cap +
    eyes
  )
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const AERO: Look = {
  name: 'aero',
  label: 'Frutiger Aero',
  voice: 'an upbeat mid-2000s eco-tech ad',
  cell: 'solid',
  figure: '3d',
  font: SANS,
  charW: 5.2,
  caption: { fill: '#f4fbff', stroke: '#2a8ad8', ink: '#14385a', radius: 8 },
  paper: { card: '#f4fbff', ink: '#14385a', kinds: { code: '#0a7a8a', path: '#1d6fc4', fn: '#6a4ac4', num: '#e0702a', bad: '#d0303a', good: '#2e9a2e', face: '#e0702a' } },
  inset: 4,
  titleColor: '#ffffff',
  art: {
    painter: scenery,
    hero,
    sky: '#3aa3ef',
    ground: '#58c21f',
    defs: () =>
      `<radialGradient id="ae-flare"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".15" stop-color="#fffff0" stop-opacity=".6"/><stop offset=".45" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="ae-earth" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#9fe0f2"/><stop offset=".6" stop-color="#1478a8"/><stop offset="1" stop-color="#0a3d73"/></radialGradient>` +
      `<linearGradient id="ae-jelly" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="${K.light}"/><stop offset=".4" stop-color="${K.mid}"/><stop offset="1" stop-color="${K.deep}"/></linearGradient>` +
      `<linearGradient id="ae-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".6" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c0c02"/><stop offset=".6" stop-color="${K.eye}"/><stop offset="1" stop-color="#b8460f"/></linearGradient>` +
      `<radialGradient id="ae-shadow"><stop offset="0" stop-color="#ff9628" stop-opacity=".5"/><stop offset=".6" stop-color="#1e5a0a" stop-opacity=".25"/><stop offset="1" stop-color="#1e5a0a" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="ae-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".4" stop-color="#fff" stop-opacity=".08"/><stop offset=".41" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="ae-pill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ad0f7"/><stop offset=".5" stop-color="#2a8ad8"/><stop offset="1" stop-color="#1a6ab8"/></linearGradient>`,
  },
  texture: (sw, h) => `<rect width="${sw}" height="${h}" fill="url(#ae-gloss)"/>`,
  frame: (sw, h) => `<rect x="2" y="2" width="${sw - 4}" height="${h - 4}" rx="8" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.4"/><rect x="3.4" y="3.4" width="${sw - 6.8}" height="${h - 6.8}" rx="7" fill="none" stroke="#2a8ad8" stroke-opacity=".7" stroke-width=".8"/>`,
  tag: (text, inset) => {
    const x = inset + 5
    const y = inset + 4
    const w = text.length * 5.6 + 14
    return {
      svg:
        `<rect x="${x}" y="${y}" width="${n(w)}" height="13" rx="6.5" fill="url(#ae-pill)" stroke="#fff" stroke-width=".8"/>` +
        `<rect x="${x + 2}" y="${y + 1}" width="${n(w - 4)}" height="5" rx="2.5" fill="#fff" opacity=".4"/>` +
        `<text x="${x + 7}" y="${y + 9.4}" font-family="${SANS}" font-size="8" font-weight="700" fill="#fff">${escape(text)}</text>`,
      w: x + w + 4,
      h: y + 17,
    }
  },
  bubble: {
    font: SANS,
    size: 9,
    charW: 5.2,
    line: 12,
    base: 13,
    draw: ({ x, y, w, h }, { base, tip }) =>
      // Frosted glass: a pale panel, a gloss along its top half, a blue rim and a white one.
      `<path fill="#f4fbff" fill-opacity=".9" d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="7" fill="#f4fbff" fill-opacity=".9" stroke="#2a8ad8" stroke-width="1"/>` +
      `<rect x="${n(x + 1.5)}" y="${n(y + 1.2)}" width="${w - 3}" height="${n(h * 0.42)}" rx="5.5" fill="#fff" opacity=".7"/>`,
  },
}
