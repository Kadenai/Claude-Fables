/**
 * Scenery for the styles that draw the 3D Claude.
 *
 * Every backdrop is composed the same way, back to front:
 *
 *   sky       a gradient, then the sun or moon, stars and clouds
 *   far       a continuous band (ridges, a skyline, a tree line) softened by haze
 *   middle    one row of objects standing on their own baseline, MID, a few units
 *             behind the front edge: packed left to right so no two overlap, then
 *             spread so the row ends exactly at the margins
 *   near      the front edge at GROUND, where Claude and the props stand, and the
 *             details on the ground in front of it
 *
 * Every layer is clipped to the stage, details sit on grids that divide their
 * surfaces exactly, and every motion stays inside its own region. Shading is
 * drawn in the named colors `black` and `white`: a look's palette remap only
 * touches hex colors, so the shading survives every look.
 */
import type { FablesScene } from '../types'

export type Stage = {
  sky: string
  ground: string
  /** Where the hero's and props' feet rest. */
  floor: number
  /** Where the ground color begins: the middle row's baseline. */
  groundTop: number
  /** Behind the ground: sky, the far band and the middle row. */
  back: string
  /** On the ground, behind everything that stands on it. */
  near: string
  /** Features the caption should not cover: the sun, the moon, a planet, a crater. */
  keep: { x: number; y: number; w: number; h: number }[]
}

type Rand = () => number

const f = (v: number) => (Math.round(v * 10) / 10).toString()
const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length] as T

/** The stage's height. */
const H = 128

// ---------------------------------------------------------------- shared paint

function defs(sw: number): string {
  return (
    `<defs>` +
    `<clipPath id="sc-stage"><rect width="${sw}" height="${H}"/></clipPath>` +
    `<linearGradient id="sc-air" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity=".42"/><stop offset=".65" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity=".12"/></linearGradient>` +
    `<linearGradient id="sc-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity=".05"/><stop offset="1" stop-color="black" stop-opacity=".45"/></linearGradient>` +
    `<linearGradient id="sc-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="black" stop-opacity=".22"/></linearGradient>` +
    `<radialGradient id="sc-glow"><stop offset="0" stop-color="white" stop-opacity=".5"/><stop offset=".35" stop-color="white" stop-opacity=".14"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sc-orb" cx=".36" cy=".34" r=".72"><stop offset="0" stop-color="white" stop-opacity=".28"/><stop offset=".55" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".5"/></radialGradient>` +
    `<linearGradient id="sc-beam"><stop offset="0" stop-color="white" stop-opacity=".32"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>` +
    `<filter id="sc-deep"><feColorMatrix type="matrix" values=".58 0 0 0 0  0 .58 0 0 0  0 0 .62 0 0  0 0 0 1 0"/></filter>` +
    `</defs>`
  )
}

const clip = (svg: string) => `<g clip-path="url(#sc-stage)">${svg}</g>`

/** A soft halo. */
const glow = (cx: number, cy: number, r: number, opacity = 1) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#sc-glow)" opacity="${opacity}"/>`

/** A lit sphere: the base color under a shading that puts the light upper left. */
const orb = (cx: number, cy: number, r: number, color: string) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#sc-orb)"/>`

/** A moon: a lit sphere with two soft maria. */
const moon = (cx: number, cy: number, r: number) =>
  glow(cx, cy, r * 4.2, 0.75) +
  orb(cx, cy, r, '#e8e3c8') +
  `<circle cx="${f(cx - r * 0.3)}" cy="${f(cy - r * 0.15)}" r="${f(r * 0.28)}" fill="black" opacity=".08"/>` +
  `<circle cx="${f(cx + r * 0.25)}" cy="${f(cy + r * 0.3)}" r="${f(r * 0.18)}" fill="black" opacity=".07"/>`

/** Stars in the sky's upper part, kept clear of a disc (the moon) and of the stage edges. */
function stars(rand: Rand, sw: number, n: number, top: number, bottom: number, avoid?: [number, number, number]): string {
  let dim = ''
  let bright = ''
  let twinkle = ''
  for (let i = 0; i < n; i++) {
    const x = between(rand, 4, sw - 4)
    const y = between(rand, top, bottom)
    if (avoid && Math.hypot(x - avoid[0], y - avoid[1]) < avoid[2]) continue
    const d = `M${f(x)} ${f(y)}h1v1h-1z`
    if (i % 9 === 0) twinkle += `<path d="${d}" fill="white"><animate attributeName="opacity" values=".9;.15;.9" dur="${f(between(rand, 2.5, 5))}s" begin="${f(-rand() * 4)}s" repeatCount="indefinite"/></path>`
    else if (rand() < 0.3) bright += d
    else dim += d
  }
  return `<path d="${dim}" fill="white" opacity=".35"/><path d="${bright}" fill="white" opacity=".75"/>${twinkle}`
}

/** A cloud: three capsules on one flat base, drifting a little either way. */
function cloud(x: number, y: number, w: number, color: string, opacity: number, dur: number): string {
  const h = w * 0.16
  return (
    `<g opacity="${opacity}" fill="${color}">` +
    `<rect x="${f(x)}" y="${f(y + h * 0.6)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}"/>` +
    `<rect x="${f(x + w * 0.16)}" y="${f(y + h * 0.1)}" width="${f(w * 0.42)}" height="${f(h * 1.3)}" rx="${f(h * 0.65)}"/>` +
    `<rect x="${f(x + w * 0.44)}" y="${f(y - h * 0.35)}" width="${f(w * 0.36)}" height="${f(h * 1.6)}" rx="${f(h * 0.8)}"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;${f(w * 0.12)} 0;0 0" dur="${f(dur)}s" repeatCount="indefinite"/></g>`
  )
}

/**
 * A box seen from the front and a little from the upper right: its front face
 * from (x, y) w by h, its top and right faces `d` deep. It takes w + d across.
 */
function box(x: number, y: number, w: number, h: number, d: number, color: string): string {
  const dy = d * 0.55
  return (
    `<path fill="${color}" d="M${f(x)} ${f(y + h)}V${f(y)}l${f(d)} ${f(-dy)}h${f(w)}v${f(h)}l${f(-d)} ${f(dy)}z"/>` +
    `<path fill="white" fill-opacity=".18" d="M${f(x)} ${f(y)}l${f(d)} ${f(-dy)}h${f(w)}l${f(-d)} ${f(dy)}z"/>` +
    `<path fill="black" fill-opacity=".3" d="M${f(x + w)} ${f(y)}l${f(d)} ${f(-dy)}v${f(h)}l${f(-d)} ${f(dy)}z"/>`
  )
}

/** A smooth closed band through points (Catmull-Rom as cubic curves), filled down to `floor`. */
function band(points: readonly (readonly [number, number])[], floor: number, color: string, opacity = 1): string {
  if (points.length < 2) return ''
  const p = points
  let d = `M${f(p[0]![0])} ${f(floor)}L${f(p[0]![0])} ${f(p[0]![1])}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]!
    const b = p[i]!
    const c = p[i + 1]!
    const e = p[Math.min(p.length - 1, i + 2)]!
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`
  }
  d += `L${f(p[p.length - 1]![0])} ${f(floor)}z`
  return `<path fill="${color}" opacity="${opacity}" d="${d}"/>`
}

/** Rolling hills across the stage: evenly spaced crests at heights between lo and hi above `base`. */
function hills(rand: Rand, sw: number, base: number, crests: number, lo: number, hi: number, color: string, opacity: number): string {
  const step = sw / crests
  const pts: [number, number][] = []
  for (let i = -1; i <= crests + 1; i++) {
    pts.push([i * step + between(rand, -step * 0.15, step * 0.15), base - between(rand, lo, hi)])
    pts.push([(i + 0.5) * step, base - lo * 0.4])
  }
  return band(pts, base + 30, color, opacity) + band(pts, base + 30, 'url(#sc-fade)', opacity)
}

/** One mountain: a lit left face, a shaded right face split at the peak, an optional snow cap that follows both faces. */
function mountain(x: number, w: number, h: number, base: number, color: string, snow?: string): string {
  const px = x + w * 0.48
  const py = base - h
  const k = 0.26
  const lx = px - (px - x) * k
  const rx = px + (x + w - px) * k
  const sy = py + h * k
  const cap = snow
    ? `<path fill="${snow}" d="M${f(px)} ${f(py)}L${f(rx)} ${f(sy)}l${f(-(rx - px) * 0.35)} ${f(-h * 0.04)}l${f(-(rx - px) * 0.3)} ${f(h * 0.05)}L${f(px)} ${f(sy - h * 0.06)}l${f(-(px - lx) * 0.35)} ${f(h * 0.07)}L${f(lx)} ${f(sy)}z"/>`
    : ''
  return (
    `<path fill="${color}" d="M${f(x)} ${f(base)}L${f(px)} ${f(py)}L${f(x + w)} ${f(base)}z"/>` +
    cap +
    `<path fill="black" fill-opacity=".26" d="M${f(px)} ${f(py)}L${f(x + w)} ${f(base)}H${f(px + w * 0.06)}z"/>`
  )
}

/** A range of mountains, tallest drawn first so the nearer, lower peaks sit in front. */
function range(rand: Rand, sw: number, base: number, n: number, lo: number, hi: number, color: string, snow?: string): string {
  const step = sw / n
  const peaks = Array.from({ length: n + 2 }, (_, i) => {
    const w = step * between(rand, 1.5, 1.9)
    const cx = (i - 0.5) * step + between(rand, -step * 0.12, step * 0.12)
    return { x: cx - w / 2, w, h: between(rand, lo, hi) }
  })
  return peaks
    .sort((a, b) => b.h - a.h)
    .map(p => mountain(p.x, p.w, p.h, base, color, snow && p.h > (lo + hi) / 2 ? snow : undefined))
    .join('')
}

type Piece = { w: number; draw: (x: number) => string }

/**
 * Lays pieces in a row between the margins: as many as fit with gaps from the
 * given range, then the leftover room spread across the gaps so the row ends
 * exactly at the right margin. No two pieces ever overlap.
 */
function row(rand: Rand, sw: number, margin: number, gap: readonly [number, number], make: (i: number) => Piece, most = 64): string {
  const pieces: Piece[] = []
  const gaps: number[] = []
  let used = 0
  for (let i = 0; i < most; i++) {
    const piece = make(i)
    const g = pieces.length ? between(rand, gap[0], gap[1]) : 0
    if (used + g + piece.w > sw - margin * 2) break
    used += g + piece.w
    if (pieces.length) gaps.push(g)
    pieces.push(piece)
  }
  const left = sw - margin * 2 - used
  const spread = pieces.length > 1 ? left / (pieces.length - 1) : 0
  let x = margin + (pieces.length === 1 ? left / 2 : 0)
  return pieces
    .map((p, i) => {
      if (i > 0) x += (gaps[i - 1] ?? 0) + spread
      const svg = p.draw(x)
      x += p.w
      return svg
    })
    .join('')
}

/** A strip that scrolls left forever without a seam: `tile(x)` draws one period starting at x. */
function scroller(sw: number, period: number, dur: number, tile: (x: number) => string): string {
  let body = ''
  for (let x = -period; x < sw + period; x += period) body += tile(x)
  return `<g>${body}<animateTransform attributeName="transform" type="translate" values="0 0;${-period} 0" dur="${f(dur)}s" repeatCount="indefinite"/></g>`
}

/** Haze: a whole layer pushed back by fading it into the sky behind. */
const haze = (opacity: number, svg: string) => `<g opacity="${opacity}">${svg}</g>`

// ---------------------------------------------------------------- the backdrops

type Ctx = { rand: Rand; sw: number; ground: number; mid: number; w: number }
type Disc = [number, number, number]
type Scene = { sky: string; soil: string; floor?: number; groundTop?: number; back: string; near: string; keep?: Disc[] }

/** How many of a thing a stage this wide holds, given n for the default width. */
const per = (c: Ctx, n: number) => Math.max(1, Math.round((n * c.sw) / c.w))

function forest(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const sunX = between(rand, sw * 0.6, sw * 0.85)
  const back =
    glow(sunX, 30, 70, 0.55) +
    orb(sunX, 30, 9, '#f0deb0') +
    cloud(sw * 0.12, 16, 70, '#c9d4c0', 0.18, 40) +
    cloud(sw * 0.48, 10, 54, '#c9d4c0', 0.14, 50) +
    // Two shafts of light falling from the sun's side, inside the sky.
    [0, 1].map(i => `<path d="M${f(sunX - 30 - i * 70)} 0h14l-44 ${mid}h-18z" fill="white" opacity=".04"/>`).join('') +
    haze(0.45, hills(rand, sw, mid - 8, Math.max(3, per(c, 4)), 22, 34, '#2c4a36', 1)) +
    haze(0.8, pines(rand, sw, mid, '#26402c')) +
    // The middle row: block trees, each a trunk under two stacked crowns.
    row(rand, sw, 18, [34, 80], () => {
      const crown = between(rand, 26, 36)
      const trunkH = between(rand, 18, 26)
      return {
        w: crown + 8,
        draw: x => {
          const tx = x + crown / 2 - 3
          return (
            `<ellipse cx="${f(tx + 5)}" cy="${mid}" rx="${f(crown * 0.5)}" ry="2.2" fill="black" opacity=".22"/>` +
            box(tx, mid - trunkH, 6, trunkH, 3, '#5a3a24') +
            box(x, mid - trunkH - 15, crown, 16, 8, '#3d7a3a') +
            box(x + 5, mid - trunkH - 27, crown - 10, 12, 6, '#4b8c45')
          )
        },
      }
    })
  // The front edge: a lit lip of grass, tufts on a steady rhythm, flowers between.
  let tufts = ''
  for (let x = 6; x < sw - 6; x += between(rand, 11, 17)) tufts += `M${f(x)} ${ground}l1.6-5l1.6 5zM${f(x + 3.6)} ${ground}l1.2-3.4l1.2 3.4z`
  const flowers = row(rand, sw, 24, [60, 140], () => ({
    w: 6,
    draw: x => `<rect x="${f(x + 2.4)}" y="${ground + 4}" width="1.2" height="4" fill="#3c6e34"/><circle cx="${f(x + 3)}" cy="${ground + 3.6}" r="1.8" fill="${pick(rand, ['#e3b341', '#e05252', '#ece9df'])}"/>`,
  }))
  const near = `<rect x="0" y="${ground - 1}" width="${sw}" height="2" fill="#5e9c4a"/><path d="${tufts}" fill="#6bab55"/>` + flowers
  return { sky: '#1f3330', soil: '#3c6e34', back, near, keep: [[sunX, 30, 12]] }
}

/** A continuous tree line of layered pines. */
function pines(rand: Rand, sw: number, base: number, color: string): string {
  let d = ''
  for (let x = -6; x < sw + 6; x += between(rand, 9, 14)) {
    const h = between(rand, 16, 26)
    const w = h * 0.5
    d += `M${f(x - w / 2)} ${base}L${f(x)} ${f(base - h)}L${f(x + w / 2)} ${base}z`
  }
  return `<path fill="${color}" d="${d}"/><rect x="0" y="${base - 3}" width="${sw}" height="3" fill="${color}"/>`
}

function sea(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const floor = ground - 2
  const horizon = 66
  const mx = between(rand, sw * 0.62, sw * 0.86)
  // The island and its lighthouse, wholly inside the stage, never under the moon.
  const iw = 74
  const ix = mx > sw * 0.5 ? between(rand, sw * 0.08, sw * 0.4 - iw) : between(rand, sw * 0.55, sw * 0.9 - iw)
  const lx = ix + iw * 0.55
  const island =
    band([[ix, horizon + 1], [ix + iw * 0.22, horizon - 6], [ix + iw * 0.55, horizon - 10], [ix + iw * 0.82, horizon - 5], [ix + iw, horizon + 1]], horizon + 2, '#2c5a4a') +
    band([[ix + iw * 0.55, horizon - 10], [ix + iw * 0.82, horizon - 5], [ix + iw, horizon + 1]], horizon + 2, 'black', 0.25) +
    box(lx - 3, horizon - 30, 6, 22, 3, '#ece9df') +
    `<rect x="${f(lx - 3)}" y="${horizon - 24}" width="6" height="3" fill="#e05252"/><rect x="${f(lx - 3)}" y="${horizon - 16}" width="6" height="3" fill="#e05252"/>` +
    `<rect x="${f(lx - 4)}" y="${horizon - 34}" width="8" height="4" fill="#3b3e47"/>` +
    // The beam sweeps out and back; it stays inside the sky.
    `<path d="M${f(lx)} ${horizon - 32}l70 -9v16z" fill="url(#sc-beam)"><animateTransform attributeName="transform" type="rotate" values="-8 ${f(lx)} ${horizon - 32};8 ${f(lx)} ${horizon - 32};-8 ${f(lx)} ${horizon - 32}" dur="7s" repeatCount="indefinite"/></path>` +
    glow(lx, horizon - 32, 10) +
    `<rect x="${f(lx - 2)}" y="${horizon - 34}" width="4" height="3" fill="#f3e2b0"><animate attributeName="opacity" values="1;.35;1" dur="3.5s" repeatCount="indefinite"/></rect>`
  // Moonlight on the water: dashes under the moon, narrower toward the horizon, shimmering.
  let path = ''
  for (let i = 0; i < 7; i++) {
    const y = horizon + 3 + i * ((floor - horizon - 6) / 6)
    const w = 6 + i * 4
    path += `<rect x="${f(mx - w / 2 + between(rand, -2, 2))}" y="${f(y)}" width="${f(w)}" height="1.3" fill="white" opacity=".28"><animate attributeName="opacity" values=".3;.1;.3" dur="${f(between(rand, 1.6, 2.6))}s" begin="${f(-rand() * 2)}s" repeatCount="indefinite"/></rect>`
  }
  // Rows of crests, slower toward the horizon, each kept inside its own strip of water.
  const crests = [
    { y: horizon + 7, a: 1.4, op: 0.16, dur: 9 },
    { y: horizon + 17, a: 2, op: 0.22, dur: 6 },
    { y: horizon + 27, a: 2.6, op: 0.3, dur: 4 },
  ]
    .map(r => scroller(sw, 24, r.dur, x => `<path d="M${x} ${r.y}q6 -${r.a} 12 0" fill="none" stroke="white" stroke-opacity="${r.op}" stroke-width="1.1"/>`))
    .join('')
  const back =
    stars(rand, sw, per(c, 40), 4, horizon - 20, [mx, 24, 26]) +
    moon(mx, 24, 10) +
    cloud(sw * 0.2, 20, 60, '#8a93a8', 0.18, 46) +
    `<rect x="0" y="${horizon}" width="${sw}" height="${H - horizon}" fill="#22557d"/>` +
    `<rect x="0" y="${horizon}" width="${sw}" height="${H - horizon}" fill="url(#sc-fade)"/>` +
    `<rect x="0" y="${horizon}" width="${sw}" height="1" fill="white" opacity=".18"/>` +
    island +
    path +
    crests
  const near = scroller(sw, 32, 3, x => `<path d="M${x} ${floor}q8 -2 16 0t16 0" fill="none" stroke="white" stroke-opacity=".45" stroke-width="1.4"/>`)
  return { sky: '#1c2840', soil: '#1f4e73', floor, groundTop: floor, back, near, keep: [[mx, 24, 13], [lx, horizon - 22, 12]] }
}

function space(c: Ctx): Scene {
  const { rand, sw } = c
  const floor = 94
  const nebula = (cx: number, cy: number, rx: number, ry: number, color: string, id: string) =>
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity=".5"/><stop offset=".6" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})"/>`
  const px = between(rand, sw * 0.62, sw * 0.82)
  const py = 40
  const pr = 17
  // The ring, tilted: its back half behind the planet, its front half over it.
  const ring = (front: boolean) =>
    `<path d="M${f(px - pr * 2)} ${py}A${f(pr * 2)} ${f(pr * 0.42)} 0 0 ${front ? 0 : 1} ${f(px + pr * 2)} ${py}" fill="none" stroke="#c9a46a" stroke-width="2.6" opacity="${front ? 0.95 : 0.6}" transform="rotate(-12 ${f(px)} ${py})"/>`
  const shooting =
    `<path d="M${f(sw * 0.3)} 12l-26 10" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;.9;0" keyTimes="0;.9;.93;1" dur="9s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;-40 16" keyTimes="0;.9;1" dur="9s" repeatCount="indefinite"/></path>`
  const back =
    nebula(sw * 0.24, 34, sw * 0.22, 30, '#7b5fb5', 'sc-neb1') +
    nebula(sw * 0.58, 52, sw * 0.18, 22, '#2f8a9a', 'sc-neb2') +
    stars(rand, sw, per(c, 70), 3, floor - 6, [px, py, pr * 2.4]) +
    shooting +
    ring(false) +
    orb(px, py, pr, '#7b5fb5') +
    `<path d="M${f(px - pr)} ${py}h${pr * 2}" stroke="white" stroke-opacity=".06" stroke-width="5"/>` +
    ring(true) +
    orb(sw * 0.1, 22, 5, '#8a8780')
  // The surface: a gently curved horizon and craters, smaller toward the horizon, never touching.
  const surface = band(
    Array.from({ length: 9 }, (_, i) => [(i * sw) / 8, floor - Math.sin((i / 8) * Math.PI) * 3] as [number, number]),
    H,
    '#4a4658',
  )
  const craters = [floor + 7, floor + 18]
    .map((y, k) =>
      row(rand, sw, 30, [70, 150], () => {
        const rx = between(rand, 5, 9) * (1 + k * 0.7)
        return {
          w: rx * 2,
          draw: x =>
            `<ellipse cx="${f(x + rx)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.3)}" fill="black" opacity=".28"/>` +
            `<path d="M${f(x)} ${f(y)}a${f(rx)} ${f(rx * 0.3)} 0 0 0 ${f(rx * 2)} 0" fill="none" stroke="white" stroke-opacity=".18" stroke-width="1"/>`,
        }
      }),
    )
    .join('')
  return { sky: '#0f0d19', soil: '#4a4658', floor, groundTop: floor, keep: [[px, py, pr * 2]], back, near: surface + `<rect x="0" y="${floor}" width="${sw}" height="1.2" fill="white" opacity=".22"/>` + craters }
}

function city(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const mx = between(rand, sw * 0.7, sw * 0.9)
  // Far skyline: one flat silhouette, tops on a rhythm, a few lit dots on a grid.
  let sky = ''
  let dots = ''
  for (let x = -4; x < sw + 4; ) {
    const w = 8 * Math.round(between(rand, 2, 5))
    const h = between(rand, 36, 62)
    sky += `M${f(x)} ${mid}V${f(mid - h)}h${w - 2}V${mid}z`
    for (let wy = mid - h + 5; wy < mid - 6; wy += 8) for (let wx = x + 3; wx < x + w - 4; wx += 8) if (rand() < 0.12) dots += `M${f(wx)} ${f(wy)}h2v2h-2z`
    x += w
  }
  // The middle row: buildings packed with gaps, sized to their window grid.
  const PITCH = 8
  const buildings = row(rand, sw, 10, [8, 22], () => {
    const cols = Math.round(between(rand, 3, 6))
    const rows = Math.round(between(rand, 4, 7))
    const w = cols * PITCH + 4
    const h = rows * 9 + 10
    const color = pick(rand, ['#2e3448', '#343a52', '#2a3044'])
    const roof = rand()
    return {
      w: w + 6,
      draw: x => {
        const top = mid - h
        let lit = ''
        let dark = ''
        let blink = ''
        for (let r = 0; r < rows; r++) {
          for (let k = 0; k < cols; k++) {
            const d = `M${f(x + 4 + k * PITCH)} ${f(top + 7 + r * 9)}h4v5h-4z`
            if (rand() < 0.45) {
              if (!blink && rand() < 0.08) blink = `<path d="${d}" fill="#f0c860"><animate attributeName="opacity" values="1;.1;1" dur="${f(between(rand, 4, 8))}s" repeatCount="indefinite"/></path>`
              else lit += d
            } else dark += d
          }
        }
        // A parapet on every roof; on some, one fixture centered on it.
        const cap = `<rect x="${f(x - 1)}" y="${f(top - 2)}" width="${w + 2}" height="2" fill="${color}"/><rect x="${f(x - 1)}" y="${f(top - 2)}" width="${w + 2}" height="1" fill="white" opacity=".18"/>`
        const fixture =
          roof < 0.25
            ? box(x + w / 2 - 5, top - 12, 8, 8, 3, '#4a4458') + `<rect x="${f(x + w / 2 - 4)}" y="${f(top - 4)}" width="1.5" height="4" fill="#4a4458"/><rect x="${f(x + w / 2 + 1)}" y="${f(top - 4)}" width="1.5" height="4" fill="#4a4458"/>`
            : roof < 0.45
              ? `<rect x="${f(x + w / 2 - 0.7)}" y="${f(top - 20)}" width="1.4" height="18" fill="#6a6e7a"/><circle cx="${f(x + w / 2)}" cy="${f(top - 20)}" r="1.5" fill="#e05252"><animate attributeName="opacity" values="1;.15;1" dur="2s" repeatCount="indefinite"/></circle>`
              : ''
        return (
          box(x, top, w, h, 6, color) +
          `<path d="${lit}" fill="#f0c860" opacity=".9"/><path d="${dark}" fill="black" opacity=".28"/>${blink}` +
          cap +
          fixture
        )
      },
    }
  })
  const back =
    stars(rand, sw, per(c, 24), 3, 30, [mx, 20, 22]) +
    moon(mx, 20, 7) +
    haze(0.42, `<path d="${sky}" fill="#2a3150"/><path d="${dots}" fill="#f0c860" opacity=".7"/>`) +
    buildings
  // The street: a curb with a lit edge, pavement joints, and lamps on a steady spacing.
  let joints = ''
  for (let x = 0; x < sw; x += 24) joints += `M${x} ${ground + 1}v6`
  const lamps = row(rand, sw, 40, [130, 170], () => ({
    w: 10,
    draw: x =>
      glow(x + 5, ground - 30, 22, 0.75) +
      `<rect x="${f(x + 4)}" y="${ground - 30}" width="2" height="30" fill="#5b5f6b"/>` +
      `<path d="M${f(x + 1)} ${ground - 31}h8l-1.5 3h-5z" fill="#5b5f6b"/>` +
      `<rect x="${f(x + 2.5)}" y="${ground - 28}" width="5" height="1.6" fill="#f3e2b0"/>` +
      `<ellipse cx="${f(x + 5)}" cy="${ground + 4}" rx="16" ry="2.5" fill="#f3e2b0" opacity=".12"/>`,
  }))
  const near =
    `<rect x="0" y="${mid}" width="${sw}" height="${ground - mid}" fill="#4a4e5a"/><rect x="0" y="${mid}" width="${sw}" height="1" fill="white" opacity=".16"/>` +
    `<rect x="0" y="${ground}" width="${sw}" height="2" fill="#6a6e7a"/><path d="${joints}" stroke="black" stroke-opacity=".25"/>` +
    lamps
  return { sky: '#1b2135', soil: '#383b45', back, near, keep: [[mx, 20, 10]] }
}

function desert(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const sunX = between(rand, sw * 0.15, sw * 0.4)
  // Mesas: flat tops, stratified faces, a lit front and a shaded side, packed apart.
  const mesas = row(rand, sw, 16, [40, 120], () => {
    const w = between(rand, 60, 110)
    const h = between(rand, 18, 30)
    return {
      w: w + 10,
      draw: x => {
        const top = mid - 8 - h
        let strata = ''
        for (let y = top + 5; y < mid - 8; y += 5) strata += `M${f(x)} ${f(y)}h${f(w)}`
        return box(x, top, w, h, 10, '#a26a44') + `<path d="${strata}" stroke="black" stroke-opacity=".1" stroke-width="1.4"/>`
      },
    }
  })
  const dunes = band(
    Array.from({ length: per(c, 5) * 2 + 3 }, (_, i) => [((i - 1) * sw) / (per(c, 5) * 2), mid - (i % 2 ? between(rand, 8, 13) : between(rand, 2, 4))] as [number, number]),
    ground + 10,
    '#c49a60',
  )
  const back =
    glow(sunX, 34, 80, 0.85) +
    orb(sunX, 34, 13, '#f3c463') +
    cloud(sw * 0.55, 18, 80, '#d8b890', 0.16, 60) +
    haze(0.55, mesas) +
    dunes +
    band(
      Array.from({ length: per(c, 5) * 2 + 3 }, (_, i) => [((i - 1) * sw) / (per(c, 5) * 2), mid - 2] as [number, number]),
      ground + 10,
      'url(#sc-fade)',
    ) +
    `<rect x="0" y="${mid - 14}" width="${sw}" height="14" fill="white" opacity=".05"><animate attributeName="opacity" values=".02;.08;.02" dur="3.4s" repeatCount="indefinite"/></rect>`
  // Stones on the front edge, and a tumbleweed rolling past now and then.
  const stones = row(rand, sw, 20, [50, 130], () => {
    const w = between(rand, 6, 12)
    return { w: w + 3, draw: x => box(x, ground - 4, w, 4, 3, '#8a6a4a') }
  })
  const weed =
    `<g opacity="0"><circle cx="0" cy="${ground - 5}" r="5" fill="none" stroke="#8a6a3a" stroke-width="1.2" stroke-dasharray="3 2">` +
    `<animateTransform attributeName="transform" type="rotate" values="0 0 ${ground - 5};720 0 ${ground - 5}" dur="16s" repeatCount="indefinite"/></circle>` +
    `<animateTransform attributeName="transform" type="translate" values="-10 0;${sw + 10} 0" dur="16s" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.48;.5;1" dur="16s" repeatCount="indefinite"/></g>`
  const near = `<rect x="0" y="${ground - 1}" width="${sw}" height="1.5" fill="white" opacity=".18"/>` + stones + weed
  return { sky: '#3c2c24', soil: '#c9a46a', back, near, keep: [[sunX, 34, 16]] }
}

function volcano(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const vw = 150
  const vx = between(rand, sw * 0.52, sw - vw - 20)
  const apexY = mid - 66
  const cx = vx + vw / 2
  const rim = 10
  // The cone, a lit left face and a shaded right face, a glowing crater and two lava rivers.
  const cone =
    glow(cx, apexY, 60, 0.6) +
    `<path d="M${f(vx)} ${mid}L${f(cx - rim)} ${f(apexY)}H${f(cx + rim)}L${f(vx + vw)} ${mid}z" fill="#5a3520"/>` +
    `<path d="M${f(cx + 2)} ${f(apexY)}H${f(cx + rim)}L${f(vx + vw)} ${mid}H${f(cx + 14)}z" fill="black" opacity=".3"/>` +
    `<path d="M${f(vx)} ${mid}L${f(cx - rim)} ${f(apexY)}h4L${f(vx + 22)} ${mid}z" fill="white" opacity=".07"/>` +
    `<ellipse cx="${f(cx)}" cy="${f(apexY)}" rx="${rim}" ry="2.6" fill="#f06a2b"><animate attributeName="fill" values="#f06a2b;#f3c463;#f06a2b" dur="2.2s" repeatCount="indefinite"/></ellipse>` +
    `<path d="M${f(cx - 4)} ${f(apexY + 2)}C${f(cx - 8)} ${f(apexY + 22)} ${f(cx - 2)} ${f(apexY + 38)} ${f(cx - 14)} ${mid}" fill="none" stroke="#f06a2b" stroke-width="2.6" stroke-linecap="round"><animate attributeName="stroke" values="#f06a2b;#f3c463;#f06a2b" dur="3s" repeatCount="indefinite"/></path>` +
    `<path d="M${f(cx + 4)} ${f(apexY + 2)}C${f(cx + 10)} ${f(apexY + 20)} ${f(cx + 6)} ${f(apexY + 40)} ${f(cx + 20)} ${mid}" fill="none" stroke="#e0502a" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>`
  // Smoke: puffs rise from the crater, swell and fade well before the top of the stage.
  const smoke = [0, 1, 2, 3]
    .map(
      i =>
        `<circle cx="${f(cx)}" cy="${f(apexY - 4)}" r="5" fill="#6a5a55" opacity="0">` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${f(-14 - i * 4)} ${f(-Math.min(30, apexY - 10))}" dur="6s" begin="${i * 1.5}s" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="4;11" dur="6s" begin="${i * 1.5}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;.45;0" dur="6s" begin="${i * 1.5}s" repeatCount="indefinite"/></circle>`,
    )
    .join('')
  const back = haze(0.5, range(rand, sw, mid, Math.max(3, per(c, 4)), 20, 40, '#3a2420')) + cone + smoke
  // Cracks of lava in the ground in front, glowing in turn.
  const cracks = row(rand, sw, 30, [80, 160], () => {
    const w = between(rand, 16, 28)
    return {
      w,
      draw: x =>
        `<path d="M${f(x)} ${ground + 5}l${f(w * 0.3)} -2l${f(w * 0.25)} 3l${f(w * 0.45)} -1.5" fill="none" stroke="#f06a2b" stroke-width="1.2" stroke-linecap="round"><animate attributeName="opacity" values=".9;.35;.9" dur="${f(between(rand, 2, 4))}s" repeatCount="indefinite"/></path>`,
    }
  })
  const near = `<rect x="0" y="${ground - 1}" width="${sw}" height="1.5" fill="#f06a2b" opacity=".3"/>` + cracks
  return { sky: '#2a1714', soil: '#4a2c20', back, near, keep: [[cx, apexY, 14]] }
}

function rails(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const back =
    cloud(sw * 0.1, 14, 70, '#9aa0b8', 0.16, 50) +
    cloud(sw * 0.62, 22, 56, '#9aa0b8', 0.13, 44) +
    haze(0.6, range(rand, sw, mid - 6, Math.max(3, per(c, 4)), 34, 56, '#3e4860', '#d9d4c7')) +
    haze(0.95, hills(rand, sw, mid, Math.max(4, per(c, 6)), 8, 16, '#2f4a3a', 1))
  // Telegraph poles on one spacing, wires sagging between them, all scrolling past as one strip.
  const P = 160
  const poles = scroller(sw, P, 3.2, x =>
    `<rect x="${x + 20}" y="${ground - 46}" width="2.4" height="46" fill="#5a3a24"/>` +
    `<rect x="${x + 13}" y="${ground - 43}" width="16" height="2" fill="#5a3a24"/>` +
    `<rect x="${x + 14}" y="${ground - 45}" width="2" height="2" fill="#a8b4c0"/><rect x="${x + 26}" y="${ground - 45}" width="2" height="2" fill="#a8b4c0"/>` +
    `<path d="M${x + 15} ${ground - 44}q${P / 2} 9 ${P} 0M${x + 27} ${ground - 44}q${P / 2} 9 ${P} 0" fill="none" stroke="#1f1e1d" stroke-width=".7"/>`,
  )
  // The track: a ballast bed, sleepers with lit tops on one pitch, and a polished rail.
  const T = 14
  const ties = scroller(sw, T, 0.5, x => `<path d="M${x} ${ground + 1}h9l2 -1.6h-9z" fill="#8a6a4a"/><rect x="${x}" y="${ground + 1}" width="9" height="2.6" fill="#5a3a24"/>`)
  const near =
    poles +
    `<path d="M0 ${ground - 1}h${sw}v11h-${sw}z" fill="#57524c"/><path d="M0 ${ground + 6}h${sw}v4h-${sw}z" fill="black" opacity=".2"/>` +
    ties +
    `<rect x="0" y="${ground - 1}" width="${sw}" height="1.8" fill="#9a9690"/><rect x="0" y="${ground - 1}" width="${sw}" height=".6" fill="white" opacity=".55"/>`
  return { sky: '#252838', soil: '#3a3836', back, near }
}

function lab(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const TOP = 12
  const WAIN = ground - 16
  // Wall panels on an exact grid: whole columns across the stage, two rows to the wainscot.
  const cols = Math.max(4, Math.round(sw / 52))
  const pw = sw / cols
  const ph = (WAIN - TOP) / 2
  let seams = ''
  let lights = ''
  let shades = ''
  for (let i = 0; i < cols; i++) {
    for (let r = 0; r < 2; r++) {
      const x = i * pw + 1.5
      const y = TOP + r * ph + 1.5
      const w = pw - 3
      const h = ph - 3
      lights += `M${f(x)} ${f(y + h)}V${f(y)}h${f(w)}`
      shades += `M${f(x + w)} ${f(y)}v${f(h)}H${f(x)}`
    }
    seams += `M${f(i * pw)} ${TOP}V${WAIN}`
  }
  const wall =
    `<rect x="0" y="${TOP}" width="${sw}" height="${WAIN - TOP}" fill="#2b3742"/>` +
    `<path d="${lights}" fill="none" stroke="white" stroke-opacity=".07"/><path d="${shades}" fill="none" stroke="black" stroke-opacity=".28"/>` +
    `<path d="${seams}" stroke="black" stroke-opacity=".35"/>`
  // The ceiling: a pipe with a flange at every column seam.
  let flanges = ''
  for (let i = 0; i <= cols; i++) flanges += `M${f(i * pw - 2)} 3h4v8h-4z`
  const ceiling =
    `<rect x="0" y="0" width="${sw}" height="${TOP}" fill="#1f262e"/>` +
    `<rect x="0" y="4" width="${sw}" height="6" fill="#6a707c"/><rect x="0" y="4" width="${sw}" height="6" fill="url(#sc-fade)"/>` +
    `<path d="${flanges}" fill="#4a505c"/>`
  // Fixtures hang inside chosen panels, each centered in its panel, never across a seam.
  const cell = (i: number, r: number) => ({ x: i * pw, y: TOP + r * ph, w: pw, h: ph })
  const used = new Set<number>()
  const free = () => {
    for (let tries = 0; tries < 20; tries++) {
      const i = Math.floor(rand() * cols)
      if (!used.has(i) && !used.has(i - 1) && !used.has(i + 1)) {
        used.add(i)
        return i
      }
    }
    return -1
  }
  const fixtures: string[] = []
  // A monitor of scrolling logs.
  const mi = free()
  if (mi >= 0) {
    const { x, y, w, h } = cell(mi, 0)
    const mw = Math.min(w - 12, 44)
    const mh = h - 10
    const mx0 = x + (w - mw) / 2 - 2
    const my = y + 5
    let lines = ''
    for (let k = 0; k < 5; k++) lines += `<rect x="${f(mx0 + 5)}" y="${f(my + 5 + k * 4)}" width="${f(between(rand, mw * 0.3, mw * 0.75))}" height="1.6" fill="#5fd35f"><animate attributeName="opacity" values=".9;.3;.9" dur="${f(between(rand, 1.4, 3))}s" begin="${f(-rand() * 2)}s" repeatCount="indefinite"/></rect>`
    fixtures.push(box(mx0, my, mw, mh, 4, '#1c2026') + `<rect x="${f(mx0 + 3)}" y="${f(my + 3)}" width="${f(mw - 6)}" height="${f(mh - 6)}" fill="#0e2622"/>` + lines + glow(mx0 + mw / 2, my + mh / 2, mw * 0.7, 0.25))
  }
  // A clock whose hands turn.
  const ci = free()
  if (ci >= 0) {
    const { x, y, w, h } = cell(ci, 0)
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.min(w, h) * 0.3
    fixtures.push(
      `<circle cx="${f(cx + 1)}" cy="${f(cy + 1)}" r="${f(r)}" fill="black" opacity=".3"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#ece9df"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="#5b5f6b" stroke-width="1.6"/>` +
        `<path d="M${f(cx)} ${f(cy)}v${f(-r * 0.55)}" stroke="#1f1e1d" stroke-width="1.4" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 ${f(cx)} ${f(cy)};360 ${f(cx)} ${f(cy)}" dur="60s" repeatCount="indefinite"/></path>` +
        `<path d="M${f(cx)} ${f(cy)}v${f(-r * 0.8)}" stroke="#e05252" stroke-width=".8" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 ${f(cx)} ${f(cy)};360 ${f(cx)} ${f(cy)}" dur="6s" repeatCount="indefinite"/></path>`,
    )
  }
  // Shelves of flasks along the lower panels, bubbling.
  for (let s = 0; s < Math.max(2, per({ ...c }, 2)); s++) {
    const si = free()
    if (si < 0) break
    const { x, y, w, h } = cell(si, 1)
    const shelfY = y + h - 9
    const n = Math.max(2, Math.floor((w - 14) / 11))
    let flasks = ''
    for (let k = 0; k < n; k++) {
      const fx = x + 8 + k * ((w - 16) / n) + 1
      const color = pick(rand, ['#6fc2c9', '#5e9c4a', '#e05252', '#7b5fb5', '#e3b341'])
      flasks +=
        `<rect x="${f(fx)}" y="${f(shelfY - 13)}" width="7" height="13" fill="white" opacity=".22"/><rect x="${f(fx + 2)}" y="${f(shelfY - 16)}" width="3" height="3" fill="white" opacity=".22"/>` +
        `<rect x="${f(fx)}" y="${f(shelfY - 7)}" width="7" height="7" fill="${color}"/>` +
        `<circle cx="${f(fx + 3.5)}" cy="${f(shelfY - 3)}" r=".9" fill="white" opacity="0"><animate attributeName="cy" values="${f(shelfY - 2)};${f(shelfY - 8)}" dur="${f(between(rand, 1.4, 2.4))}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.8;0" dur="${f(between(rand, 1.4, 2.4))}s" repeatCount="indefinite"/></circle>`
    }
    fixtures.push(flasks + box(x + 5, shelfY, w - 14, 2.5, 4, '#6a707c'))
  }
  // A hazard sign in one more panel.
  const hi = free()
  if (hi >= 0) {
    const { x, y, w, h } = cell(hi, 0)
    const cx = x + w / 2
    const cy = y + h / 2 + 2
    fixtures.push(`<path d="M${f(cx)} ${f(cy - 9)}l9 16h-18z" fill="#e3b341"/><path d="M${f(cx)} ${f(cy - 9)}l9 16h-18z" fill="none" stroke="#1f1e1d" stroke-width="1.2" stroke-linejoin="round"/><rect x="${f(cx - 0.8)}" y="${f(cy - 4)}" width="1.6" height="6" fill="#1f1e1d"/><rect x="${f(cx - 0.8)}" y="${f(cy + 3.4)}" width="1.6" height="1.6" fill="#1f1e1d"/>`)
  }
  const wainscot =
    `<rect x="0" y="${WAIN}" width="${sw}" height="${ground - WAIN}" fill="#3b4652"/>` +
    `<rect x="0" y="${WAIN}" width="${sw}" height="2" fill="#56626e"/><rect x="0" y="${WAIN}" width="${sw}" height=".8" fill="white" opacity=".2"/>`
  const back = ceiling + wall + fixtures.join('') + wainscot
  // The floor: tiles in perspective toward the stage's middle, inside the floor.
  const vx = sw / 2
  let grid = ''
  for (let x = -sw; x <= sw * 2; x += 24) grid += `M${f(vx + (x - vx) * 0.55)} ${ground}L${f(x)} ${H}`
  for (const y of [ground + 6, ground + 14]) grid += `M0 ${y}H${sw}`
  const near = `<rect x="0" y="${ground}" width="${sw}" height="1.5" fill="#6a707c"/><path d="${grid}" stroke="black" stroke-opacity=".22" stroke-width=".8"/>`
  return { sky: '#1f262e', soil: '#454a55', groundTop: ground, back, near }
}

function night(c: Ctx): Scene {
  const { rand, sw, ground, mid } = c
  const mx = between(rand, sw * 0.12, sw * 0.88)
  // Houses: a body, a gable that matches the box's depth, a chimney, a door and lit windows.
  const houses = row(rand, sw, 24, [50, 120], () => {
    const w = 8 * Math.round(between(rand, 3.5, 5))
    const h = between(rand, 16, 22)
    const d = 8
    const color = pick(rand, ['#3a3e52', '#40445a', '#363a4e'])
    const roofH = w * 0.38
    const lit = [rand() < 0.75, rand() < 0.5]
    return {
      w: w + d,
      draw: x => {
        const top = mid - h
        const dy = d * 0.55
        const gable = `<path d="M${f(x - 1)} ${f(top)}L${f(x + w / 2)} ${f(top - roofH)}L${f(x + w + 1)} ${f(top)}z" fill="${color}"/>`
        const roof =
          `<path d="M${f(x + w / 2)} ${f(top - roofH)}l${d} ${f(-dy)}L${f(x + w + 1 + d)} ${f(top - dy)}L${f(x + w + 1)} ${f(top)}z" fill="#5a3a3a"/>` +
          `<path d="M${f(x + w / 2)} ${f(top - roofH)}l${d} ${f(-dy)}L${f(x + w + 1 + d)} ${f(top - dy)}L${f(x + w + 1)} ${f(top)}z" fill="black" opacity=".2"/>` +
          `<path d="M${f(x - 1)} ${f(top)}L${f(x + w / 2)} ${f(top - roofH)}l${d} ${f(-dy)}" fill="none" stroke="#7a4a4a" stroke-width="1.2"/>`
        const chimX = x + w * 0.68
        const chimney = box(chimX, top - roofH * 0.7 - 6, 4, 8, 2, '#5a3a3a')
        const puff =
          `<circle cx="${f(chimX + 3)}" cy="${f(top - roofH * 0.7 - 8)}" r="2" fill="#8a8a9a" opacity="0">` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;-8 -14" dur="5s" repeatCount="indefinite"/>` +
          `<animate attributeName="r" values="1.5;4" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.35;0" dur="5s" repeatCount="indefinite"/></circle>`
        const winY = top + 5
        const windows = [x + 5, x + w - 11]
          .map((wx, k) => (lit[k] ? glow(wx + 3, winY + 3, 9, 0.5) + `<rect x="${f(wx)}" y="${f(winY)}" width="6" height="6" fill="#f0c860"/>` : `<rect x="${f(wx)}" y="${f(winY)}" width="6" height="6" fill="black" opacity=".35"/>`) + `<path d="M${f(wx + 3)} ${f(winY)}v6M${f(wx)} ${f(winY + 3)}h6" stroke="${color}" stroke-width=".8"/>`)
          .join('')
        const door = `<rect x="${f(x + w / 2 - 3)}" y="${f(mid - 9)}" width="6" height="9" fill="#5a3a3a"/>`
        return chimney + puff + box(x, top, w, h, d, color) + roof + gable + windows + door
      },
    }
  })
  // Fireflies drift in a band above the grass and blink.
  const flies = Array.from({ length: per(c, 6) }, () => {
    const x = between(rand, 10, sw - 10)
    const y = between(rand, ground - 34, ground - 10)
    return `<circle cx="${f(x)}" cy="${f(y)}" r="1.1" fill="#f0e28a"><animate attributeName="opacity" values="0;1;0" dur="${f(between(rand, 2, 3.5))}s" begin="${f(-rand() * 3)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -8, 8))} -4;0 0" dur="${f(between(rand, 4, 7))}s" repeatCount="indefinite"/></circle>`
  }).join('')
  const back =
    stars(rand, sw, per(c, 46), 3, 50, [mx, 22, 26]) +
    moon(mx, 22, 9) +
    haze(0.5, hills(rand, sw, mid - 10, Math.max(3, per(c, 4)), 14, 24, '#262c42', 1)) +
    haze(0.85, hills(rand, sw, mid - 2, Math.max(4, per(c, 6)), 4, 10, '#232a3a', 1)) +
    houses
  // A picket fence along the front edge, posts on one pitch.
  let pickets = ''
  for (let x = 4; x < sw - 4; x += 9) pickets += `M${x} ${ground}V${ground - 9}l1.5 -1.5l1.5 1.5V${ground}z`
  const near = `<path d="${pickets}" fill="#5a5e6e"/><rect x="0" y="${ground - 7}" width="${sw}" height="1.4" fill="#5a5e6e"/><rect x="0" y="${ground - 3.5}" width="${sw}" height="1.4" fill="#5a5e6e"/>` + flies
  return { sky: '#181b2a', soil: '#2a3036', back, near, keep: [[mx, 22, 12]] }
}

const BACKDROPS: Record<string, (c: Ctx) => Scene> = { forest, sea, space, city, desert, volcano, rails, lab, night }

/** The scenery for a scene on a stage `sw` wide whose front edge is at `ground`; `w` is the default stage width. */
export function richBackdrop(scene: FablesScene, rand: Rand, sw: number, ground: number, w: number): Stage {
  const mid = ground - 6
  const make = BACKDROPS[scene.backdrop] ?? night
  const s = make({ rand, sw, ground, mid, w })
  const floor = s.floor ?? ground
  const groundTop = s.groundTop ?? mid
  const accent = scene.palette.accent ? `<rect x="0" y="${floor}" width="${sw}" height="1.5" fill="${scene.palette.accent}" opacity=".7"/>` : ''
  return {
    sky: scene.palette.sky ?? s.sky,
    ground: scene.palette.ground ?? s.soil,
    floor,
    groundTop,
    // The atmosphere and the soil's depth run past the stage, like the sky and ground they shade.
    back: defs(sw) + `<rect x="${-sw * 4}" y="${-H * 4}" width="${sw * 9}" height="${H * 4 + groundTop}" fill="url(#sc-air)"/>` + clip(s.back),
    near: `<rect x="${-sw * 4}" y="${groundTop}" width="${sw * 9}" height="${H * 4}" fill="url(#sc-soil)"/>` + clip(s.near + accent),
    keep: (s.keep ?? []).map(([x, y, r]) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 })),
  }
}
