/**
 * Scenery for the styles that draw the 3D Claude: nine authored scenes.
 *
 * Each scene is composed to one brief: a time of day, one light source, and a
 * palette of a few related colors, with every element there to tell that
 * moment. Depth comes from atmospheric perspective: silhouettes further back
 * are lighter and closer to the sky's color, nearer ones darker and richer.
 * The focal point (the sun, the moon, a lighthouse, a spire) sits off the
 * middle, so the middle of the stage, where Claude and the caption live, stays
 * calm. Framing elements may run off the stage edges, as in a painting; nothing
 * else does, and every layer is clipped to the stage.
 *
 * Silhouettes are drawn from smooth noise rather than repeated tiles, so the
 * scene has no visible seam at any width. Motion is slow and belongs to the
 * story: a beam sweeping, mist drifting, a train going home.
 *
 * Shading uses the named colors `black` and `white`: a look's palette remap
 * only touches hex colors, so the shading survives every look.
 */
import type { FablesScene } from '../types'

export type Stage = {
  sky: string
  ground: string
  /** Where the hero's and props' feet rest. */
  floor: number
  /** Where the ground color begins. */
  groundTop: number
  /** Behind the ground: sky and every layer up to the middle distance. */
  back: string
  /** On the ground, behind everything that stands on it. */
  near: string
  /** Features the caption should not cover: the sun, the moon, a focal point. */
  keep: { x: number; y: number; w: number; h: number }[]
}

type Rand = () => number
type P = [number, number]

const f = (v: number) => (Math.round(v * 10) / 10).toString()
const between = (rand: Rand, a: number, b: number) => a + rand() * (b - a)

/** The stage's height. */
const H = 128

// ---------------------------------------------------------------- color

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
/** A color `t` of the way from a to b: how a silhouette fades into the air behind it. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return `#${x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** A vertical gradient from stops of [offset, color, opacity?]. */
const vgrad = (id: string, stops: readonly (readonly [number, string, number?])[]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`

/** A soft radial glow in one color, fading to nothing. */
const rgrad = (id: string, color: string, strength = 0.55) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${strength}"/><stop offset=".3" stop-color="${color}" stop-opacity="${f(strength * 0.32)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`

// ---------------------------------------------------------------- shapes

/**
 * A smooth silhouette: a sum of a few sine waves with seeded phases, so it
 * never repeats across the stage. Returns the height above the base at x.
 */
function noise(rand: Rand, waves: readonly (readonly [number, number])[]): (x: number) => number {
  const phases = waves.map(() => rand() * Math.PI * 2)
  return x => waves.reduce((t, [amp, len], i) => t + amp * (0.5 + 0.5 * Math.sin((x / len) * Math.PI * 2 + (phases[i] ?? 0))), 0)
}

/** A closed path through points along a ridge (Catmull-Rom as cubic curves), filled down to `floor`. */
function smooth(points: readonly P[], floor: number): string {
  const p = points
  let d = `M${f(p[0]![0])} ${f(floor)}L${f(p[0]![0])} ${f(p[0]![1])}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]!
    const b = p[i]!
    const c = p[i + 1]!
    const e = p[Math.min(p.length - 1, i + 2)]!
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`
  }
  return `${d}L${f(p[p.length - 1]![0])} ${f(floor)}z`
}

/** A rolling silhouette across the whole stage: its top at `base` less the noise. */
function ridge(sw: number, base: number, h: (x: number) => number, step = 16, floor = H + 4): string {
  const pts: P[] = []
  for (let x = -step; x <= sw + step; x += step) pts.push([x, base - h(x)])
  return smooth(pts, floor)
}

/** A line of conifers along a rolling base: one path of narrow spires, heights from noise. */
function conifers(rand: Rand, sw: number, base: (x: number) => number, height: (x: number) => number, spacing: number): string {
  let d = ''
  for (let x = -spacing; x < sw + spacing; x += spacing * between(rand, 0.7, 1.15)) {
    const h = height(x) * between(rand, 0.8, 1.1)
    const w = h * 0.34
    const b = base(x)
    // A spire with two shoulders, so each tree reads as a fir and not a triangle.
    d += `M${f(x - w / 2)} ${f(b)}L${f(x - w * 0.22)} ${f(b - h * 0.45)}L${f(x - w * 0.34)} ${f(b - h * 0.45)}L${f(x)} ${f(b - h)}L${f(x + w * 0.34)} ${f(b - h * 0.45)}L${f(x + w * 0.22)} ${f(b - h * 0.45)}L${f(x + w / 2)} ${f(b)}z`
  }
  return d
}

/**
 * A mountain range, each peak with its lit face toward the light and its
 * shaded face away; `light` is -1 for light from the left, 1 from the right.
 */
function peaks(
  rand: Rand,
  sw: number,
  base: number,
  o: { n: number; lo: number; hi: number; lit: string; shade: string; snow?: string; snowShade?: string; light: -1 | 1 },
): string {
  const step = sw / o.n
  const list = Array.from({ length: o.n + 2 }, (_, i) => {
    const w = step * between(rand, 1.4, 1.9)
    const cx = (i - 0.5) * step + between(rand, -step * 0.15, step * 0.15)
    return { cx, w, h: between(rand, o.lo, o.hi) }
  }).sort((a, b) => b.h - a.h)
  return list
    .map(({ cx, w, h }) => {
      const px = cx + between(rand, -w * 0.06, w * 0.06)
      const py = base - h
      const l = cx - w / 2
      const r = cx + w / 2
      // The ridge line from the summit runs down to a foot a little off center: the face split.
      const foot = px + (o.light < 0 ? w * 0.1 : -w * 0.1)
      const litFace = o.light < 0 ? `M${f(l)} ${base}L${f(px)} ${f(py)}L${f(foot)} ${base}z` : `M${f(foot)} ${base}L${f(px)} ${f(py)}L${f(r)} ${base}z`
      const shadeFace = o.light < 0 ? `M${f(foot)} ${base}L${f(px)} ${f(py)}L${f(r)} ${base}z` : `M${f(l)} ${base}L${f(px)} ${f(py)}L${f(foot)} ${base}z`
      let snow = ''
      if (o.snow && h > (o.lo + o.hi) / 2) {
        // The cap follows both faces down a quarter of the way, with a ragged lower edge.
        const k = 0.28
        const a: P = [px + (l - px) * k, py + h * k]
        const b: P = [px + (r - px) * k, py + h * k]
        const m: P = [px + (foot - px) * k * 1.15, py + h * k * 1.15]
        const ragged = (from: P, to: P) => {
          const s1: P = [from[0] + (to[0] - from[0]) * 0.33, from[1] + (to[1] - from[1]) * 0.33 - h * 0.05]
          const s2: P = [from[0] + (to[0] - from[0]) * 0.66, from[1] + (to[1] - from[1]) * 0.66 + h * 0.03]
          return `L${f(s1[0])} ${f(s1[1])}L${f(s2[0])} ${f(s2[1])}L${f(to[0])} ${f(to[1])}`
        }
        const litSnow = o.light < 0 ? `M${f(px)} ${f(py)}L${f(a[0])} ${f(a[1])}${ragged(a, m)}z` : `M${f(px)} ${f(py)}L${f(b[0])} ${f(b[1])}${ragged(b, m)}z`
        const shadeSnow = o.light < 0 ? `M${f(px)} ${f(py)}L${f(m[0])} ${f(m[1])}${ragged(m, b)}z` : `M${f(px)} ${f(py)}L${f(m[0])} ${f(m[1])}${ragged(m, a)}z`
        snow = `<path fill="${o.snow}" d="${litSnow}"/><path fill="${o.snowShade ?? o.snow}" d="${shadeSnow}"/>`
      }
      return `<path fill="${o.lit}" d="${litFace}"/><path fill="${o.shade}" d="${shadeFace}"/>${snow}`
    })
    .join('')
}

/** A lit sphere: the base color, a terminator on the side away from the light, and a soft rim. */
const orb = (cx: number, cy: number, r: number, color: string, id: string) =>
  `<radialGradient id="${id}" cx=".38" cy=".36" r=".7"><stop offset="0" stop-color="white" stop-opacity=".22"/><stop offset=".6" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".42"/></radialGradient>` +
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${color}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id})"/>`

/** Stars, denser toward the top of the sky, kept clear of a disc and of the edges. */
function stars(rand: Rand, sw: number, n: number, bottom: number, avoid?: [number, number, number]): string {
  let dim = ''
  let bright = ''
  let twinkle = ''
  for (let i = 0; i < n; i++) {
    const x = between(rand, 3, sw - 3)
    const y = 3 + (bottom - 3) * rand() ** 1.8
    if (avoid && Math.hypot(x - avoid[0], y - avoid[1]) < avoid[2]) continue
    const d = `M${f(x)} ${f(y)}h1v1h-1z`
    if (i % 11 === 0) twinkle += `<path d="${d}" fill="white"><animate attributeName="opacity" values=".9;.2;.9" dur="${f(between(rand, 3, 6))}s" begin="${f(-rand() * 5)}s" repeatCount="indefinite"/></path>`
    else if (rand() < 0.25) bright += d
    else dim += d
  }
  return `<path d="${dim}" fill="white" opacity=".3"/><path d="${bright}" fill="white" opacity=".7"/>${twinkle}`
}

/** A long thin streak of cloud, drifting slowly sideways. */
const wisp = (x: number, y: number, w: number, color: string, opacity: number, dur: number, drift: number) =>
  `<g opacity="${opacity}" filter="url(#sc-soft)"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="2.2" rx="1.1" fill="${color}"/><rect x="${f(x + w * 0.18)}" y="${f(y - 1.6)}" width="${f(w * 0.46)}" height="2" rx="1" fill="${color}"/>` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;${f(drift)} 0;0 0" dur="${f(dur)}s" repeatCount="indefinite"/></g>`

const clip = (svg: string) => `<g clip-path="url(#sc-stage)">${svg}</g>`

// ---------------------------------------------------------------- the scenes

type Ctx = { rand: Rand; sw: number; ground: number; detail: number }
type Disc = [number, number, number]
type Scene = { sky: string; soil: string; floor?: number; groundTop?: number; back: string; near: string; keep?: Disc[] }

/**
 * Dawn in an old forest. The sun is low behind two rows of firs, mist lies
 * between them, and light falls through in shafts. Two great trunks frame the
 * scene at its edges; the path Claude walks is lighter where the sun reaches.
 */
function forest(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const sky = '#1e3b3a'
  const dawn = '#efc98e'
  const air = '#9fb79a'
  const far = mix('#3a6152', air, 0.5)
  const mid = '#2b4c40'
  const deep = '#162a24'
  const sunX = sw * 0.68
  const sunY = 58
  const farBase = (x: number) => 84 - noise(rand, [[4, 260]])(x)
  const midBase = (x: number) => ground - 6 - noise(rand, [[3, 200]])(x)
  const farH = noise(rand, [[10, 140], [6, 60]])
  const midH = noise(rand, [[16, 180], [8, 70]])
  // Shafts of light fan from the sun down through the trees to the ground.
  const shafts = [-0.42, -0.2, 0.06, 0.3]
    .map((k, i) => {
      const x0 = sunX + k * 40
      const x1 = sunX + k * 260
      return `<path d="M${f(x0 - 3)} ${sunY}L${f(x0 + 3)} ${sunY}L${f(x1 + 18)} ${ground}L${f(x1 - 18)} ${ground}z" fill="url(#sc-shaft)" opacity=".5"><animate attributeName="opacity" values=".35;.65;.35" dur="${8 + i * 3}s" begin="${-i * 2}s" repeatCount="indefinite"/></path>`
    })
    .join('')
  const mist = (y: number, o: number, dur: number) =>
    `<rect x="${-sw * 0.1}" y="${y}" width="${sw * 1.2}" height="14" fill="url(#sc-mist)" opacity="${o}"><animateTransform attributeName="transform" type="translate" values="0 0;${f(sw * 0.04)} 0;0 0" dur="${dur}s" repeatCount="indefinite"/></rect>`
  // The framing trunks: wide, dark, a little bark light on the sun side, cropped by the stage edges.
  const trunk = (x: number, w: number, lit: boolean) =>
    `<path fill="${deep}" d="M${f(x)} -4h${f(w)}l${f(w * 0.08)} ${ground + 4}l${f(w * 0.12)} 8H${f(x - w * 0.2)}l${f(w * 0.12)} -8z"/>` +
    (lit ? `<rect x="${f(x + w - 3)}" y="-4" width="2" height="${ground + 2}" fill="${dawn}" opacity=".18"/>` : `<rect x="${f(x + 1)}" y="-4" width="2" height="${ground + 2}" fill="${dawn}" opacity=".08"/>`)
  // Motes drifting in the light.
  const motes = Array.from({ length: Math.round(8 * c.detail) }, () => {
    const x = sunX + between(rand, -120, 160)
    const y = between(rand, 50, ground - 10)
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".8" fill="${dawn}" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="${f(between(rand, 4, 7))}s" begin="${f(-rand() * 6)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -6, 6))} -8" dur="${f(between(rand, 6, 9))}s" repeatCount="indefinite"/></circle>`
  }).join('')
  const back =
    `<defs>${vgrad('sc-sky', [[0, sky], [0.55, mix(sky, dawn, 0.45)], [0.8, dawn]])}${rgrad('sc-sun', '#fff1cf', 0.7)}${vgrad('sc-shaft', [[0, '#fff1cf', 0.22], [1, '#fff1cf', 0]])}${vgrad('sc-mist', [[0, '#e8efe0', 0], [0.5, '#e8efe0', 0.5], [1, '#e8efe0', 0]])}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    `<circle cx="${f(sunX)}" cy="${sunY}" r="70" fill="url(#sc-sun)"/><circle cx="${f(sunX)}" cy="${sunY}" r="8" fill="#fff4dc"/>` +
    `<path fill="${far}" d="${conifers(rand, sw, farBase, x => 14 + farH(x), 8)}"/><path fill="${far}" d="${ridge(sw, 82, x => 2 + farH(x) * 0.15)}"/>` +
    mist(70, 0.55, 30) +
    shafts +
    `<path fill="${mid}" d="${conifers(rand, sw, midBase, x => 24 + midH(x), 11)}"/>` +
    mist(ground - 18, 0.35, 24) +
    motes
  // The forest floor: lit where the shafts land, a worn path, and the two trunks framing it all.
  const near =
    `<defs>${vgrad('sc-floor', [[0, '#3d6b3f'], [1, '#203b26']])}</defs>` +
    `<rect x="0" y="${ground - 6}" width="${sw}" height="${H - ground + 6}" fill="url(#sc-floor)"/>` +
    `<ellipse cx="${f(sunX)}" cy="${ground + 2}" rx="${f(sw * 0.3)}" ry="7" fill="${dawn}" opacity=".16"/>` +
    `<path d="M0 ${ground + 4}C${f(sw * 0.3)} ${ground + 1} ${f(sw * 0.6)} ${ground + 7} ${sw} ${ground + 3}v5C${f(sw * 0.6)} ${ground + 12} ${f(sw * 0.3)} ${ground + 6} 0 ${ground + 9}z" fill="#6b7a4a" opacity=".35"/>` +
    trunk(-6, 22, true) +
    trunk(sw - 18, 26, false) +
    canopy(rand, sw, deep)
  return { sky, soil: '#2c4a30', groundTop: ground - 6, back, near, keep: [[sunX, sunY, 12]] }
}

/** Leaves hanging into the top corners from the framing trunks, a little light on their lower edges. */
function canopy(rand: Rand, sw: number, color: string): string {
  const clump = (cx: number, dir: 1 | -1) => {
    let d = ''
    for (let i = 0; i < 12; i++) {
      // Lobes overlap into one mass that thins and lifts as it reaches in from the trunk.
      const x = cx + dir * i * between(rand, 4.5, 6.5)
      const y = between(rand, -2, 6) + (i % 3) * 3 - i * 0.4
      const r = between(rand, 9, 13) * (1 - i / 18)
      d += `M${f(x - r)} ${f(y)}a${f(r)} ${f(r * 0.7)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r * 0.7)} 0 1 0 ${f(-r * 2)} 0z`
    }
    return d
  }
  return `<path fill="${color}" d="${clump(8, 1)}${clump(sw - 10, -1)}"/>`
}

/**
 * A night crossing. A full moon hangs over a calm sea and lays its path on the
 * water; on a headland to one side a lighthouse turns its beam; far off, a
 * single sail. The swell lines draw closer together toward the horizon.
 */
function sea(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const floor = ground - 2
  const horizon = 70
  const top = '#0c1430'
  const low = '#3b4a7c'
  const water = '#17284c'
  const moonX = sw * 0.72
  const moonY = 30
  // The headland: two tones of cliff, the near one darker, wholly on the far side from the moon.
  const hx = sw * 0.04
  const hw = Math.min(170, sw * 0.32)
  // The headland rises from the left edge to a grassy top and drops to the sea in a sheer face;
  // the face looks toward the moon and catches its light. A lower reef of rock lies in front.
  const edge = hx + hw * 0.72
  const cliff =
    `<path fill="#1a2240" d="M-10 ${horizon + 2}V${horizon - 22}C${f(hx + hw * 0.2)} ${horizon - 27} ${f(hx + hw * 0.5)} ${horizon - 25} ${f(edge)} ${horizon - 22}L${f(edge + 4)} ${horizon - 12}L${f(edge + 8)} ${horizon - 4}L${f(hx + hw)} ${horizon + 2}z"/>` +
    `<path fill="#5a6494" opacity=".55" d="M${f(edge)} ${horizon - 22}L${f(edge + 4)} ${horizon - 12}L${f(edge + 8)} ${horizon - 4}L${f(hx + hw)} ${horizon + 2}H${f(edge + 2)}L${f(edge - 1)} ${horizon - 10}z"/>` +
    `<path fill="none" stroke="#7a84b4" stroke-opacity=".5" stroke-width=".8" d="M-10 ${horizon - 22}C${f(hx + hw * 0.2)} ${horizon - 27} ${f(hx + hw * 0.5)} ${horizon - 25} ${f(edge)} ${horizon - 22}"/>`
  const reef = `<path fill="#111830" d="M-10 ${horizon + 3}V${horizon - 6}q14 -5 26 -1q10 -6 22 0q8 2 14 7z"/>`
  const lx = edge - 16
  const ly = horizon - 23
  const lampY = ly - 22
  // The lighthouse: a tapered white tower with its lit side toward the moon, a gallery and a lantern.
  const tower =
    `<path fill="#d9d6cc" d="M${f(lx - 3.4)} ${ly}L${f(lx - 2.4)} ${f(lampY + 4)}h4.8L${f(lx + 3.4)} ${ly}z"/>` +
    `<path fill="black" opacity=".28" d="M${f(lx - 3.4)} ${ly}L${f(lx - 2.4)} ${f(lampY + 4)}h2L${f(lx - 0.6)} ${ly}z"/>` +
    `<path fill="#a8463c" d="M${f(lx - 3.1)} ${f(ly - 7)}h6.2l-.25 3h-5.7zM${f(lx - 2.8)} ${f(ly - 14)}h5.6l-.25 3h-5.1z"/>` +
    `<rect x="${f(lx - 3.6)}" y="${f(lampY + 3)}" width="7.2" height="1.4" fill="#2a2e3a"/>` +
    `<rect x="${f(lx - 2)}" y="${f(lampY)}" width="4" height="3" fill="#ffe9b0"/>` +
    `<path fill="#2a2e3a" d="M${f(lx - 2.4)} ${f(lampY)}l2.4 -2.4l2.4 2.4z"/>`
  const beam =
    `<path d="M${f(lx)} ${f(lampY + 1.5)}l90 -10v20z" fill="url(#sc-beam)">` +
    `<animateTransform attributeName="transform" type="rotate" values="-12 ${f(lx)} ${f(lampY + 1.5)};10 ${f(lx)} ${f(lampY + 1.5)};-12 ${f(lx)} ${f(lampY + 1.5)}" dur="9s" repeatCount="indefinite"/></path>` +
    `<circle cx="${f(lx)}" cy="${f(lampY + 1.5)}" r="16" fill="url(#sc-lamp)"/>`
  // The moon's path: short bright dashes straight below it, wider and further apart toward us.
  let path = ''
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const y = horizon + 2 + (floor - horizon - 4) * t ** 1.4
    const w = 4 + t * 26
    path += `<rect x="${f(moonX - w / 2 + Math.sin(i * 2.1) * 3)}" y="${f(y)}" width="${f(w)}" height="${f(0.8 + t)}" rx=".5" fill="#f4ecd0" opacity="${f(0.55 - t * 0.25)}"><animate attributeName="opacity" values="${f(0.55 - t * 0.25)};${f(0.18 - t * 0.08)};${f(0.55 - t * 0.25)}" dur="${f(2.4 + (i % 3) * 0.7)}s" begin="${f(-i * 0.4)}s" repeatCount="indefinite"/></rect>`
  }
  // Glints on the swell: short broken strokes in rows that draw apart toward us, each row drifting.
  let swell = ''
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 7
    const y = horizon + (floor - horizon) * t ** 1.6
    let d = ''
    for (let x = between(rand, 0, 30); x < sw; x += between(rand, 30, 90) * (0.6 + t)) d += `M${f(x)} ${f(y)}h${f(between(rand, 6, 18) * (0.5 + t))}`
    swell += `<path d="${d}" stroke="white" stroke-opacity="${f(0.07 + t * 0.12)}" stroke-width="${f(0.5 + t * 0.6)}" stroke-linecap="round"><animateTransform attributeName="transform" type="translate" values="0 0;${f(-6 - i * 2)} 0;0 0" dur="${10 + i * 2}s" repeatCount="indefinite"/></path>`
  }
  const sail =
    `<g><path d="M0 0l5 -9v9zM-1 1h8l-1.5 1.6h-5z" fill="#c9c4b4" opacity=".7"/>` +
    `<animateTransform attributeName="transform" type="translate" values="${f(sw * 0.44)} ${horizon - 1};${f(sw * 0.52)} ${horizon - 1};${f(sw * 0.44)} ${horizon - 1}" dur="120s" repeatCount="indefinite"/></g>`
  const back =
    `<defs>${vgrad('sc-sky', [[0, top], [0.75, low], [1, mix(low, '#8a8fb0', 0.4)]])}${vgrad('sc-water', [[0, mix(water, low, 0.5)], [1, '#0b1630']])}${rgrad('sc-moon', '#f4ecd0', 0.5)}${rgrad('sc-lamp', '#ffe9b0', 0.8)}` +
    `<linearGradient id="sc-beam"><stop offset="0" stop-color="#ffe9b0" stop-opacity=".3"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    stars(rand, sw, Math.round(60 * c.detail), horizon - 14, [moonX, moonY, 30]) +
    `<circle cx="${f(moonX)}" cy="${moonY}" r="58" fill="url(#sc-moon)"/>` +
    orb(moonX, moonY, 11, '#f1ead2', 'sc-moonball') +
    wisp(moonX - 70, moonY + 6, 110, '#6a7099', 0.5, 60, 20) +
    wisp(sw * 0.18, 22, 90, '#4a5280', 0.45, 70, -16) +
    `<rect x="0" y="${horizon}" width="${sw}" height="${H - horizon}" fill="url(#sc-water)"/>` +
    `<rect x="0" y="${horizon}" width="${sw}" height=".8" fill="#9aa2c8" opacity=".5"/>` +
    sail +
    beam +
    cliff +
    tower +
    reef +
    path +
    swell
  const near = `<rect x="0" y="${floor}" width="${sw}" height="1" fill="white" opacity=".18"/>`
  return { sky: top, soil: '#0f1a36', floor, groundTop: floor, back, near, keep: [[moonX, moonY, 14], [lx, lampY, 10]] }
}

/**
 * Earthrise over a lunar outpost. A blue world climbs over the grey horizon,
 * its atmosphere a thin bright rim; the Milky Way crosses the sky; out on the
 * plain a small base keeps one light blinking. Long shadows, no air, no haze.
 */
function space(c: Ctx): Scene {
  const { rand, sw } = c
  const floor = 96
  const horizon = 84
  const earthX = sw * 0.74
  const earthR = 34
  const earthY = horizon + 12
  const surface = (x: number) => horizon - noise(rand, [[3, 300], [1.5, 90]])(x)
  // The Milky Way: a soft diagonal band of light and a dusting of fine stars along it.
  let dust = ''
  for (let i = 0; i < Math.round(120 * c.detail); i++) {
    const t = rand()
    const x = t * sw
    const y = 10 + t * 50 + (rand() - 0.5) * 22
    dust += `M${f(x)} ${f(y)}h.6v.6h-.6z`
  }
  const base = sw * 0.24
  const outpost =
    `<path fill="#9a97a6" d="M${f(base - 9)} ${f(surface(base) + 0.5)}a9 6 0 0 1 18 0z"/><path fill="black" opacity=".3" d="M${f(base + 1)} ${f(surface(base) - 5.4)}a9 6 0 0 1 8 5.9h-8z"/>` +
    `<rect x="${f(base + 11)}" y="${f(surface(base) - 4)}" width="8" height="4.5" fill="#7a7788"/><rect x="${f(base + 12)}" y="${f(surface(base) - 3)}" width="2" height="1.4" fill="#ffd98a"/>` +
    `<rect x="${f(base - 14)}" y="${f(surface(base) - 14)}" width=".8" height="14" fill="#9a97a6"/>` +
    `<circle cx="${f(base - 13.6)}" cy="${f(surface(base) - 14.5)}" r="1.2" fill="#ff6a5a"><animate attributeName="opacity" values="1;.1;1" dur="2.2s" repeatCount="indefinite"/></circle>`
  const shooting =
    `<path d="M${f(sw * 0.36)} 14l-24 9" stroke="white" stroke-width="1" stroke-linecap="round" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;.85;0" keyTimes="0;.93;.96;1" dur="17s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;-36 13" keyTimes="0;.93;1" dur="17s" repeatCount="indefinite"/></path>`
  const back =
    `<defs>${vgrad('sc-sky', [[0, '#04050b'], [1, '#121630']])}${rgrad('sc-band', '#b8a8d8', 0.22)}${rgrad('sc-rim', '#8fd0ff', 0.6)}` +
    `<radialGradient id="sc-earth" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#6fb8e0"/><stop offset=".55" stop-color="#2f6a9a"/><stop offset="1" stop-color="#0f2240"/></radialGradient></defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    `<ellipse cx="${f(sw * 0.45)}" cy="38" rx="${f(sw * 0.55)}" ry="16" fill="url(#sc-band)" transform="rotate(14 ${f(sw * 0.45)} 38)"/>` +
    `<path d="${dust}" fill="white" opacity=".45"/>` +
    stars(rand, sw, Math.round(70 * c.detail), horizon - 6, [earthX, earthY, earthR + 10]) +
    shooting +
    `<circle cx="${f(earthX)}" cy="${earthY}" r="${earthR + 9}" fill="url(#sc-rim)"/>` +
    `<circle cx="${f(earthX)}" cy="${earthY}" r="${earthR}" fill="url(#sc-earth)"/>` +
    // Clouds on the lit limb, and the night side's terminator.
    `<path fill="white" opacity=".3" d="M${f(earthX - 22)} ${earthY - 18}c6 -3 12 -1 16 1c-5 2 -11 2 -16 -1zM${f(earthX - 8)} ${earthY - 28}c7 -2 13 0 16 2c-6 1 -12 1 -16 -2z"/>` +
    `<path fill="black" opacity=".5" d="M${f(earthX + 6)} ${earthY - earthR + 0.5}A${earthR} ${earthR} 0 0 1 ${f(earthX + 6)} ${earthY + earthR - 0.5}A${earthR * 0.7} ${earthR} 0 0 0 ${f(earthX + 6)} ${earthY - earthR + 0.5}z"/>` +
    `<path fill="#3d3b48" d="${ridge(sw, horizon, x => horizon - surface(x), 12)}"/>`
  // The plain: grey regolith darkening toward us, the base far out on it, and craters lying flat in perspective.
  const crater = (x: number, y: number, r: number) =>
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.24)}" fill="black" opacity=".3"/><path d="M${f(x - r)} ${f(y)}a${f(r)} ${f(r * 0.24)} 0 0 0 ${f(r * 2)} 0" fill="none" stroke="white" stroke-opacity=".16" stroke-width=".8"/>`
  const near =
    `<defs>${vgrad('sc-ground', [[0, '#5a5866'], [1, '#2a2832']])}</defs>` +
    `<rect x="0" y="${horizon - 2}" width="${sw}" height="${H - horizon + 2}" fill="url(#sc-ground)"/>` +
    `<path fill="#4a4856" d="${ridge(sw, horizon, x => horizon - surface(x) - 0.5, 12)}"/>` +
    outpost +
    crater(sw * 0.56, horizon + 5, 10) +
    crater(sw * 0.1, floor + 9, 14) +
    crater(sw * 0.86, floor + 15, 20) +
    `<rect x="0" y="${floor}" width="${sw}" height=".8" fill="white" opacity=".12"/>`
  return { sky: '#04050b', soil: '#3a3844', floor, groundTop: horizon, back, near, keep: [[earthX, earthY - 12, earthR + 4]] }
}

/**
 * Blue hour in the city. The last light is warm along the horizon and the sky
 * deepens to blue above; three ranks of buildings step toward us, hazier the
 * further they are; one spire carries a slow red light; windows come on here
 * and there; an elevated train carries its lit carriages home.
 */
function city(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const top = '#1a2550'
  const dusk = '#e59a78'
  const air = '#7a7fa8'
  const rank = (base: number, color: string, lo: number, hi: number, minW: number, maxW: number, windows: number) => {
    let d = ''
    let lit = ''
    let blink = ''
    for (let x = -10; x < sw + 10; ) {
      const w = 8 * Math.max(1, Math.round(between(rand, minW, maxW) / 8))
      const h = between(rand, lo, hi)
      const t = base - h
      d += `M${f(x)} ${base}V${f(t)}h${w}V${base}z`
      if (rand() < 0.2) d += `M${f(x + w * 0.3)} ${f(t)}v-4h${f(w * 0.4)}v4z`
      if (windows > 0) {
        for (let wy = t + 5; wy < base - 4; wy += 6) {
          for (let wx = x + 3; wx < x + w - 4; wx += 5) {
            if (rand() < windows) {
              if (!blink && rand() < 0.03) blink = `<rect x="${f(wx)}" y="${f(wy)}" width="2" height="2.6" fill="#f6c97a"><animate attributeName="opacity" values="1;0;0;1" keyTimes="0;.4;.8;1" dur="9s" repeatCount="indefinite"/></rect>`
              else lit += `M${f(wx)} ${f(wy)}h2v2.6h-2z`
            }
          }
        }
      }
      x += w + (rand() < 0.3 ? 4 : 0)
    }
    return `<path fill="${color}" d="${d}"/><path fill="#f6c97a" d="${lit}" opacity=".85"/>${blink}`
  }
  const spireX = sw * 0.62
  const spireBase = ground - 26
  const spire =
    `<path fill="${mix('#232a4a', air, 0.25)}" d="M${f(spireX - 9)} ${spireBase}V${spireBase - 48}l3 -6h12l3 6V${spireBase}z"/>` +
    `<path fill="${mix('#232a4a', air, 0.25)}" d="M${f(spireX - 3)} ${spireBase - 54}l3 -22l3 22z"/>` +
    `<path fill="white" opacity=".08" d="M${f(spireX - 9)} ${spireBase}V${spireBase - 48}l3 -6h2V${spireBase}z"/>` +
    `<circle cx="${f(spireX)}" cy="${spireBase - 76}" r="1.4" fill="#ff5a4a"><animate attributeName="opacity" values="1;.15;1" dur="3s" repeatCount="indefinite"/></circle>`
  // The elevated line: piers on one spacing, a deck, and a train of lit carriages crossing in its own time.
  const deckY = ground - 30
  let piers = ''
  for (let x = 20; x < sw; x += 80) piers += `M${x} ${deckY + 3}h4V${ground - 6}h-4z`
  const carriages = Array.from({ length: 5 }, (_, i) => `<rect x="${i * 26}" y="-8" width="24" height="8" rx="1.5" fill="#3a405e"/><path fill="#ffe1a0" d="${[4, 9, 14, 19].map(k => `M${i * 26 + k} -6h3v3h-3z`).join('')}"/>`).join('')
  const train = `<g>${carriages}<animateTransform attributeName="transform" type="translate" values="${sw + 10} ${deckY};-150 ${deckY};-150 ${deckY}" keyTimes="0;.55;1" dur="${f(Math.max(14, sw / 30))}s" repeatCount="indefinite"/></g>`
  const back =
    `<defs>${vgrad('sc-sky', [[0, top], [0.55, '#465488'], [0.85, mix('#465488', dusk, 0.6)], [1, dusk]])}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    stars(rand, sw, Math.round(16 * c.detail), 26) +
    wisp(sw * 0.1, 30, 120, '#c98a8a', 0.25, 80, 20) +
    rank(ground - 22, mix('#2a3258', air, 0.55), 30, 54, 16, 40, 0.06) +
    spire +
    rank(ground - 14, mix('#222846', air, 0.2), 18, 40, 24, 56, 0.22) +
    `<path fill="#1c2036" d="M0 ${deckY}h${sw}v3H0z${piers}"/>` +
    train +
    rank(ground - 6, '#171a2c', 8, 22, 32, 72, 0.12)
  // The sidewalk: a curb catching the dusk, two lamps standing at the thirds, their light pooled on the paving.
  const lamp = (x: number) =>
    `<circle cx="${f(x)}" cy="${ground - 40}" r="26" fill="url(#sc-lamp)"/>` +
    `<rect x="${f(x - 0.9)}" y="${ground - 40}" width="1.8" height="40" fill="#2a2e44"/>` +
    `<path fill="#2a2e44" d="M${f(x - 4)} ${ground - 41}h8l-1.5 2.4h-5z"/><rect x="${f(x - 2.5)}" y="${ground - 38.6}" width="5" height="1.2" fill="#ffe1a0"/>` +
    `<ellipse cx="${f(x)}" cy="${ground + 4}" rx="22" ry="3" fill="#ffe1a0" opacity=".14"/>`
  const near =
    `<defs>${vgrad('sc-walk', [[0, '#3a3e54'], [1, '#22253a']])}${rgrad('sc-lamp', '#ffe1a0', 0.45)}</defs>` +
    `<rect x="0" y="${ground - 6}" width="${sw}" height="${H - ground + 6}" fill="url(#sc-walk)"/>` +
    `<rect x="0" y="${ground - 6}" width="${sw}" height="1" fill="${dusk}" opacity=".35"/>` +
    lamp(sw * 0.16) +
    lamp(sw * 0.86)
  return { sky: top, soil: '#2a2d42', groundTop: ground - 6, back, near, keep: [[spireX, spireBase - 60, 14]] }
}

/**
 * Sunset in canyon country. The sun sits low between mesas that fade from
 * deep red near us to violet far off, each with a rim of warm light on its
 * edge; heat shimmers over the flats, and a saguaro frames the scene's edge.
 */
function desert(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const top = '#3a2a52'
  const glowC = '#f3a86a'
  const horizonC = '#f8cf88'
  const sunX = sw * 0.3
  const sunY = 62
  // Formations in two ranks, each one of three kinds: a broad mesa, a two-tiered butte, or a
  // slender spire. Each has a sunlit face on the side toward the sun, a shaded face away
  // from it, faint strata, and a rim of light along its top. Sky shows between them.
  const formations = (base: number, color: string, rim: string, every: number, lo: number, hi: number) => {
    let body = ''
    let shade = ''
    let light = ''
    let strata = ''
    for (let x = between(rand, -20, 20); x < sw + 20; ) {
      const kind = rand()
      const h = between(rand, lo, hi) * (kind > 0.8 ? 1.25 : 1)
      const w = kind > 0.8 ? between(rand, 10, 18) : kind > 0.45 ? between(rand, 34, 60) : between(rand, 60, 110)
      const talus = h * 0.42
      const t = base - h
      const l = x + talus
      const r = x + talus + w
      // The talus slopes out at the foot; a butte steps in to a narrower cap.
      const cap = kind > 0.45 && kind <= 0.8 ? `L${f(l + w * 0.18)} ${f(t + h * 0.36)}L${f(l + w * 0.24)} ${f(t)}H${f(r - w * 0.24)}L${f(r - w * 0.18)} ${f(t + h * 0.36)}` : `L${f(l)} ${f(t)}H${f(r)}`
      const top = kind > 0.45 && kind <= 0.8 ? [l + w * 0.24, r - w * 0.24] : [l, r]
      body += `M${f(x)} ${base}L${f(l)} ${f(t + h * 0.36)}${cap}L${f(r)} ${f(t + h * 0.36)}L${f(r + talus)} ${base}z`
      const sunward = x + w / 2 > sunX
      // The face turned from the sun is in shade from the top down to the foot of its talus.
      shade += sunward ? `M${f(r - w * 0.28)} ${f(t)}H${f(top[1]!)}L${f(r)} ${f(t + h * 0.36)}L${f(r + talus)} ${base}H${f(r - w * 0.2)}z` : `M${f(top[0]!)} ${f(t)}H${f(l + w * 0.28)}L${f(l + w * 0.2)} ${base}H${f(x)}L${f(l)} ${f(t + h * 0.36)}z`
      light += `M${f(top[0]!)} ${f(t)}H${f(top[1]!)}v1H${f(top[0]!)}z`
      for (let y = t + 4; y < base - 3; y += 4.5) strata += `M${f(l + 2)} ${f(y)}H${f(r - 2)}`
      x += w + talus * 2 + between(rand, every * 0.3, every)
    }
    return `<path fill="${color}" d="${body}"/><path fill="black" opacity=".22" d="${shade}"/><path stroke="black" stroke-opacity=".07" d="${strata}"/><path fill="${rim}" opacity=".7" d="${light}"/>`
  }
  const saguaro = (x: number) =>
    `<path fill="#2a1c22" d="M${f(x)} ${ground + 2}V${ground - 58}a3.5 3.5 0 0 1 7 0V${ground + 2}z` +
    `M${f(x)} ${ground - 30}h-6a3 3 0 0 1 -3 -3V${ground - 44}a3 3 0 0 1 6 0V${ground - 36}h3z` +
    `M${f(x + 7)} ${ground - 22}h6V${ground - 38}a3 3 0 0 1 6 0V${ground - 22}a3 3 0 0 1 -3 3h-9z"/>` +
    `<path fill="${glowC}" opacity=".35" d="M${f(x)} ${ground - 58}a3.5 3.5 0 0 1 2 -3.2V${ground}h-2z"/>`
  const hawk =
    `<g transform="translate(${f(sw * 0.62)} 30)"><path d="M-6 0q3 -2.6 6 0q3 -2.6 6 0" fill="none" stroke="#3a2430" stroke-width="1" stroke-linecap="round" transform="translate(16 0)"/>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;360" dur="26s" additive="sum" repeatCount="indefinite"/></g>`
  const back =
    `<defs>${vgrad('sc-sky', [[0, top], [0.45, '#8a4a6a'], [0.75, glowC], [1, horizonC]])}${rgrad('sc-sun', '#ffe8b0', 0.8)}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    wisp(sw * 0.5, 30, 130, '#d98a7a', 0.45, 90, 18) +
    wisp(sw * 0.08, 20, 90, '#b07080', 0.35, 70, -14) +
    `<circle cx="${f(sunX)}" cy="${sunY}" r="90" fill="url(#sc-sun)"/><circle cx="${f(sunX)}" cy="${sunY}" r="13" fill="#fff0c8"/>` +
    hawk +
    formations(ground - 20, mix('#9a5a7a', horizonC, 0.4), horizonC, 60, 12, 22) +
    formations(ground - 10, '#7a3f52', glowC, 140, 22, 44) +
    `<rect x="0" y="${ground - 26}" width="${sw}" height="18" fill="${horizonC}" opacity=".07"><animate attributeName="opacity" values=".04;.1;.04" dur="5s" repeatCount="indefinite"/></rect>`
  const near =
    `<defs>${vgrad('sc-flat', [[0, '#c98a5a'], [1, '#7a4a3a']])}</defs>` +
    `<rect x="0" y="${ground - 8}" width="${sw}" height="${H - ground + 8}" fill="url(#sc-flat)"/>` +
    `<path fill="#a86a4a" opacity=".5" d="${ridge(sw, ground - 6, noise(rand, [[3, 160]]), 20, ground + 2)}"/>` +
    saguaro(sw - 26) +
    // Boulders in the near left corner, their tops catching the light.
    `<path fill="#3a2428" d="M-6 ${H}V${ground + 8}c4 -8 14 -10 22 -6c4 -5 12 -4 15 2c3 1 5 4 5 ${H - ground - 4}z"/>` +
    `<path fill="${glowC}" opacity=".25" d="M-6 ${ground + 8}c4 -8 14 -10 22 -6c-8 -2 -16 0 -22 6z"/>`
  return { sky: top, soil: '#a86a4a', groundTop: ground - 8, back, near, keep: [[sunX, sunY, 16]] }
}

/**
 * A night eruption. The cone stands black against an ash plume lit orange from
 * beneath; lava runs down its face; embers rise and drift; the cooled field in
 * front still glows along its cracks.
 */
function volcano(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const cx = sw * 0.7
  const apexY = 30
  const vw = Math.min(240, sw * 0.45)
  const base = ground - 8
  const cone = `M${f(cx - vw / 2)} ${base}C${f(cx - vw * 0.25)} ${base - 10} ${f(cx - 22)} ${apexY + 22} ${f(cx - 11)} ${apexY}h22C${f(cx + 22)} ${apexY + 22} ${f(cx + vw * 0.25)} ${base - 10} ${f(cx + vw / 2)} ${base}z`
  // The plume: puffs that rise from the crater, swell, and fade before the top of the stage.
  const plume = Array.from({ length: 6 }, (_, i) => {
    const d = 10
    const b = -i * (d / 6)
    return (
      `<circle cx="${f(cx)}" cy="${apexY - 2}" r="6" fill="url(#sc-ash)" opacity="0">` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;${f(-10 - i * 3)} ${-apexY + 6}" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="r" values="6;24" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;.9;.5;0" keyTimes="0;.15;.7;1" dur="${d}s" begin="${f(b)}s" repeatCount="indefinite"/></circle>`
    )
  }).join('')
  const embers = Array.from({ length: Math.round(10 * c.detail) }, () => {
    const x = cx + between(rand, -20, 20)
    const d = between(rand, 3, 6)
    const b = -rand() * d
    return `<circle cx="${f(x)}" cy="${apexY}" r=".8" fill="#ffc06a" opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -30, 20))} ${f(-between(rand, 18, 28))}" dur="${f(d)}s" begin="${f(b)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${f(d)}s" begin="${f(b)}s" repeatCount="indefinite"/></circle>`
  }).join('')
  const lava = (pts: string, w: number, dur: number) =>
    `<path d="${pts}" fill="none" stroke="url(#sc-lava)" stroke-width="${w}" stroke-linecap="round"><animate attributeName="opacity" values="1;.7;1" dur="${dur}s" repeatCount="indefinite"/></path>`
  const back =
    `<defs>${vgrad('sc-sky', [[0, '#0d0709'], [0.6, '#2a0f0c'], [1, '#5a1e10']])}${rgrad('sc-glow', '#ff7a3a', 0.6)}` +
    `<radialGradient id="sc-ash" cx=".5" cy=".75" r=".6"><stop offset="0" stop-color="#c85a2a"/><stop offset="1" stop-color="#3a2420"/></radialGradient>` +
    `${vgrad('sc-lava', [[0, '#ffe08a'], [1, '#e0401a']])}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    stars(rand, sw, Math.round(18 * c.detail), 30, [cx, 20, 60]) +
    `<circle cx="${f(cx)}" cy="${apexY}" r="90" fill="url(#sc-glow)"/>` +
    plume +
    `<path fill="#1e1414" d="${ridge(sw, ground - 18, noise(rand, [[16, 220], [6, 70]]), 14)}"/>` +
    `<path fill="#140d0d" d="${cone}"/>` +
    // The lit rim, and lava down the face.
    `<path d="M${f(cx - 11)} ${apexY}h22" stroke="#ffb060" stroke-width="2" stroke-linecap="round"/>` +
    lava(`M${f(cx - 4)} ${apexY + 1}C${f(cx - 8)} ${apexY + 24} ${f(cx - 2)} ${apexY + 40} ${f(cx - 18)} ${base}`, 2.4, 3) +
    lava(`M${f(cx + 5)} ${apexY + 1}C${f(cx + 10)} ${apexY + 20} ${f(cx + 4)} ${apexY + 44} ${f(cx + 24)} ${base}`, 1.6, 4) +
    embers
  // The cooled field: dark rock, a few cracks still glowing, picked up by the light of the flow.
  const cracks = [0.12, 0.34, 0.52, 0.9]
    .map((k, i) => {
      const x = sw * k
      return `<path d="M${f(x)} ${ground + 6 + i * 2}l9 -2l7 3l11 -1.5" fill="none" stroke="#ff7a3a" stroke-width="1" stroke-linecap="round"><animate attributeName="opacity" values=".9;.35;.9" dur="${4 + i}s" repeatCount="indefinite"/></path>`
    })
    .join('')
  const near =
    `<defs>${vgrad('sc-rock', [[0, '#2a1a16'], [1, '#120a0a']])}<radialGradient id="sc-spill" cy="0" r=".7"><stop offset="0" stop-color="#ff7a3a" stop-opacity=".22"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient></defs>` +
    `<rect x="0" y="${base}" width="${sw}" height="${H - base}" fill="url(#sc-rock)"/>` +
    `<rect x="${f(cx - vw)}" y="${base}" width="${f(vw * 2)}" height="10" fill="url(#sc-spill)"/>` +
    cracks
  return { sky: '#0d0709', soil: '#1e1210', groundTop: base, back, near, keep: [[cx, apexY, 16]] }
}

/**
 * Golden hour on a mountain line. The peaks catch the last sun on one face and
 * fall into blue shadow on the other; mist fills the valley; a ridge of firs
 * stands below; the track runs past in the foreground, its poles going by.
 */
function rails(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const top = '#5f6fa4'
  const warm = '#f6b98a'
  const back =
    `<defs>${vgrad('sc-sky', [[0, top], [0.6, mix(top, warm, 0.6)], [1, warm]])}${vgrad('sc-mist', [[0, '#f2dcc8', 0], [0.6, '#f2dcc8', 0.55], [1, '#f2dcc8', 0]])}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    wisp(sw * 0.15, 18, 110, '#ffd6b8', 0.5, 90, 20) +
    wisp(sw * 0.6, 28, 80, '#e8b8b0', 0.4, 70, -14) +
    peaks(rand, sw, ground - 22, { n: Math.max(3, Math.round(sw / 200)), lo: 34, hi: 60, lit: '#c98a7a', shade: '#6a6a9a', snow: '#fbe6d4', snowShade: '#b4b4d4', light: 1 }) +
    `<rect x="${-sw * 0.1}" y="${ground - 40}" width="${sw * 1.2}" height="22" fill="url(#sc-mist)"><animateTransform attributeName="transform" type="translate" values="0 0;${f(sw * 0.05)} 0;0 0" dur="40s" repeatCount="indefinite"/></rect>` +
    `<path fill="#3e4a62" d="${conifers(rand, sw, x => ground - 10 - noise(rand, [[6, 180]])(x), noise(rand, [[8, 120]]), 9)}"/><path fill="#3e4a62" d="${ridge(sw, ground - 12, noise(rand, [[4, 160]]))}"/>`
  // The track: poles with sagging wires going by, the ballast, sleepers and a rail polished by the sun.
  const P = 150
  let tile = ''
  for (let x = -P; x < sw + P; x += P) {
    tile += `<rect x="${x}" y="${ground - 50}" width="2.2" height="50" fill="#2a2a3a"/><rect x="${x - 7}" y="${ground - 47}" width="16" height="1.8" fill="#2a2a3a"/>`
    tile += `<path d="M${x - 6} ${ground - 47}q${P / 2} 8 ${P} 0M${x + 8} ${ground - 47}q${P / 2} 8 ${P} 0" fill="none" stroke="#2a2a3a" stroke-width=".6"/>`
  }
  let ties = ''
  for (let x = -14; x < sw + 14; x += 14) ties += `M${x} ${ground + 1}h9v2.6h-9z`
  const near =
    `<defs>${vgrad('sc-bed', [[0, '#5a5048'], [1, '#2a2622']])}</defs>` +
    `<rect x="0" y="${ground - 4}" width="${sw}" height="${H - ground + 4}" fill="url(#sc-bed)"/>` +
    `<g>${tile}<animateTransform attributeName="transform" type="translate" values="0 0;${-P} 0" dur="3.2s" repeatCount="indefinite"/></g>` +
    `<g><path d="${ties}" fill="#3a2a22"/><animateTransform attributeName="transform" type="translate" values="0 0;-14 0" dur=".3s" repeatCount="indefinite"/></g>` +
    `<rect x="0" y="${ground - 1}" width="${sw}" height="1.6" fill="#8a8078"/><rect x="0" y="${ground - 1}" width="${sw}" height=".5" fill="${warm}" opacity=".9"/>`
  return { sky: top, soil: '#3a342e', groundTop: ground - 4, back, near }
}

/**
 * Working late in the lab. Rain runs down a tall window onto a night city; a
 * desk lamp pools warm light on the bench; two monitors glow cyan with
 * scrolling work; a server rack blinks at the edge of the room.
 */
function lab(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const wall = '#1a2028'
  const cyan = '#5fd3c8'
  const warm = '#f3c47a'
  // The window: right of the middle, a night skyline behind wet glass.
  const wx = sw * 0.56
  const ww = Math.min(150, sw * 0.3)
  const wy = 14
  const wh = 56
  let skyline = ''
  for (let x = wx; x < wx + ww; ) {
    const w = between(rand, 8, 18)
    const h = between(rand, 12, 34)
    skyline += `M${f(x)} ${wy + wh}V${f(wy + wh - h)}h${f(w)}V${wy + wh}z`
    x += w + 1
  }
  let lights = ''
  for (let i = 0; i < 30; i++) lights += `M${f(wx + rand() * ww)} ${f(wy + wh - rand() * 30)}h1.2v1.2h-1.2z`
  const rain = Array.from({ length: Math.round(16 * c.detail) }, () => {
    const x = wx + rand() * ww
    const d = between(rand, 0.7, 1.3)
    return `<rect x="${f(x)}" y="${wy}" width=".5" height="5" fill="#a8c8e0" opacity=".5"><animateTransform attributeName="transform" type="translate" values="0 -6;-2 ${wh}" dur="${f(d)}s" begin="${f(-rand() * d)}s" repeatCount="indefinite"/></rect>`
  }).join('')
  const windowSvg =
    `<clipPath id="sc-glass"><rect x="${f(wx)}" y="${wy}" width="${f(ww)}" height="${wh}"/></clipPath>` +
    `<g clip-path="url(#sc-glass)"><rect x="${f(wx)}" y="${wy}" width="${f(ww)}" height="${wh}" fill="url(#sc-night)"/><path fill="#141a2c" d="${skyline}"/><path fill="#f6c97a" d="${lights}" opacity=".7"/>${rain}</g>` +
    `<path fill="none" stroke="#2c343e" stroke-width="3" d="M${f(wx)} ${wy}h${f(ww)}v${wh}h${f(-ww)}zM${f(wx + ww / 2)} ${wy}v${wh}"/>` +
    `<rect x="${f(wx - 4)}" y="${wy + wh}" width="${f(ww + 8)}" height="2.4" fill="#343c48"/>`
  // The bench along the back wall, the lamp, the monitors.
  const bench = ground - 22
  const lampX = sw * 0.26
  const monitor = (x: number, w: number) => {
    let lines = ''
    for (let k = 0; k < 4; k++) lines += `<rect x="${f(x + 3)}" y="${f(bench - 20 + k * 3.4)}" width="${f(between(rand, w * 0.3, w * 0.7))}" height="1.2" fill="${cyan}" opacity=".85"><animate attributeName="opacity" values=".85;.3;.85" dur="${f(between(rand, 2, 4))}s" begin="${f(-rand() * 3)}s" repeatCount="indefinite"/></rect>`
    return (
      `<ellipse cx="${f(x + w / 2)}" cy="${bench - 12}" rx="${f(w)}" ry="16" fill="url(#sc-screen)"/>` +
      `<rect x="${f(x)}" y="${bench - 24}" width="${f(w)}" height="17" rx="1" fill="#0e1418"/><rect x="${f(x + 1.5)}" y="${bench - 22.5}" width="${f(w - 3)}" height="14" fill="#0f2c2c"/>` +
      lines +
      `<rect x="${f(x + w / 2 - 1.5)}" y="${bench - 7}" width="3" height="7" fill="#0e1418"/>`
    )
  }
  // An architect's lamp: a weighted base, two arm segments, a shade tipped toward the bench,
  // and the cone of light it throws, pooled where it lands.
  const sx = lampX - 12
  const sy = bench - 22
  const lamp =
    `<path d="M${f(sx - 4)} ${f(sy + 3)}L${f(sx - 18)} ${bench}H${f(sx + 16)}L${f(sx + 5)} ${f(sy + 3)}z" fill="url(#sc-cone)"/>` +
    `<path fill="#2a2e36" d="M${f(lampX - 5)} ${bench}h10v-1.6a5 1.6 0 0 0 -10 0z"/>` +
    `<path d="M${f(lampX)} ${bench - 1.5}L${f(lampX + 4)} ${bench - 16}L${f(sx + 2)} ${f(sy)}" fill="none" stroke="#3a3e46" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<circle cx="${f(lampX + 4)}" cy="${bench - 16}" r="1.2" fill="#4a4e58"/>` +
    `<path fill="#3a3e46" d="M${f(sx - 5)} ${f(sy + 3)}L${f(sx - 1)} ${f(sy - 3)}L${f(sx + 6)} ${f(sy - 1)}L${f(sx + 6)} ${f(sy + 3)}z"/>` +
    `<path fill="${warm}" d="M${f(sx - 5)} ${f(sy + 3)}H${f(sx + 6)}v.8H${f(sx - 5)}z"/>`
  // A whiteboard on the left wall: the night's reasoning in faded marker, two notes stuck to it.
  const bx = Math.max(16, sw * 0.06)
  const bw = Math.min(90, sw * 0.18)
  let marks = ''
  for (let k = 0; k < 5; k++) marks += `M${f(bx + 6)} ${f(28 + k * 6)}h${f(between(rand, bw * 0.3, bw * 0.7))}`
  const board =
    `<rect x="${f(bx)}" y="20" width="${f(bw)}" height="38" fill="#d8dde2" opacity=".14"/><rect x="${f(bx)}" y="20" width="${f(bw)}" height="38" fill="none" stroke="#3a424e" stroke-width="1.6"/>` +
    `<path d="${marks}" stroke="#7aa8d8" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round"/>` +
    `<path d="M${f(bx + bw * 0.62)} 34l8 -5l8 7" fill="none" stroke="#d87a7a" stroke-opacity=".5" stroke-width=".9"/>` +
    `<rect x="${f(bx + bw - 14)}" y="24" width="8" height="8" fill="#e3c86a" opacity=".55" transform="rotate(4 ${f(bx + bw - 10)} 28)"/>` +
    `<rect x="${f(bx + bw - 24)}" y="44" width="8" height="8" fill="#8ad0a8" opacity=".45" transform="rotate(-5 ${f(bx + bw - 20)} 48)"/>` +
    `<rect x="${f(bx + 4)}" y="58" width="${f(bw - 8)}" height="1.6" fill="#3a424e"/>`
  // The rack: blinking lights in a column, at the right edge of the room.
  const rx = sw - 30
  let leds = ''
  for (let k = 0; k < 7; k++) leds += `<rect x="${f(rx + 5)}" y="${f(26 + k * 9)}" width="2" height="1.4" fill="${k % 3 ? cyan : '#7aff9a'}"><animate attributeName="opacity" values="1;.2;1" dur="${f(between(rand, 0.8, 2.4))}s" begin="${f(-rand() * 2)}s" repeatCount="indefinite"/></rect>`
  const back =
    `<defs>${vgrad('sc-wall', [[0, '#141920'], [1, wall]])}${vgrad('sc-night', [[0, '#0a1020'], [1, '#283050']])}${rgrad('sc-screen', cyan, 0.22)}${vgrad('sc-cone', [[0, warm, 0.35], [1, warm, 0]])}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-wall)"/>` +
    windowSvg +
    board +
    `<rect x="0" y="${bench}" width="${sw}" height="3" fill="#2c323c"/><rect x="0" y="${bench}" width="${sw}" height=".8" fill="white" opacity=".12"/>` +
    `<rect x="0" y="${bench + 3}" width="${sw}" height="${ground - bench - 3}" fill="#151a20"/>` +
    lamp +
    monitor(sw * 0.36, 28) +
    monitor(sw * 0.36 + 32, 24) +
    `<ellipse cx="${f(sx)}" cy="${bench + 0.5}" rx="20" ry="2.4" fill="${warm}" opacity=".3"/>` +
    `<rect x="${f(rx)}" y="18" width="34" height="${ground - 18}" fill="#10141a"/><rect x="${f(rx)}" y="18" width="1" height="${ground - 18}" fill="white" opacity=".08"/>` +
    leds
  // The floor: dark, a faint reflection of the window and the lamp.
  const near =
    `<defs>${vgrad('sc-floor', [[0, '#20262e'], [1, '#0e1216']])}</defs>` +
    `<rect x="0" y="${ground - 4}" width="${sw}" height="${H - ground + 4}" fill="url(#sc-floor)"/>` +
    `<rect x="${f(wx)}" y="${ground}" width="${f(ww)}" height="10" fill="#4a5a7a" opacity=".12"/>` +
    `<ellipse cx="${f(lampX)}" cy="${ground + 4}" rx="30" ry="4" fill="${warm}" opacity=".08"/>`
  return { sky: wall, soil: '#1a1e24', groundTop: ground - 4, back, near, keep: [[wx + ww / 2, wy + wh / 2, 22], [bx + bw / 2, 39, bw / 2]] }
}

/**
 * A village asleep. Hills roll away under a high moon; on the far slope a
 * handful of cottages, one window still lit and a thread of smoke; a great oak
 * frames the near edge; fireflies hang over the grass.
 */
function night(c: Ctx): Scene {
  const { rand, sw, ground } = c
  const top = '#0d1230'
  const low = '#2c3a6c'
  const moonX = sw * 0.78
  const moonY = 24
  const far = (x: number) => 72 - noise(rand, [[10, 300], [4, 110]])(x)
  const midH = noise(rand, [[8, 240], [3, 90]])
  const vx = sw * 0.42
  // Cottages along the middle hill's crest, small with distance, one window lit.
  const hill = (x: number) => ground - 18 - midH(x)
  const cottages = [-34, -12, 10, 34]
    .map((dx, i) => {
      const x = vx + dx
      const y = hill(x) + 2
      const w = 12 - (i % 2) * 2
      const lit = i === 1
      return (
        `<path fill="#232a46" d="M${f(x)} ${f(y)}v-7l${f(w / 2)} -5l${f(w / 2)} 5v7z"/>` +
        `<path fill="black" opacity=".25" d="M${f(x + w / 2)} ${f(y - 12)}l${f(w / 2)} 5v7h${f(-w / 2)}z"/>` +
        `<rect x="${f(x + 2)}" y="${f(y - 5)}" width="2" height="2" fill="${lit ? '#f6c97a' : '#141a30'}"/>` +
        (lit
          ? `<circle cx="${f(x + 3)}" cy="${f(y - 4)}" r="7" fill="url(#sc-window)"/>` +
            `<rect x="${f(x + w - 4)}" y="${f(y - 13)}" width="2" height="4" fill="#232a46"/>` +
            [0, 1, 2]
              .map(k => `<circle cx="${f(x + w - 3)}" cy="${f(y - 14)}" r="1.4" fill="#8a90b0" opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;${-4 - k} -14" dur="7s" begin="${k * 2.3}s" repeatCount="indefinite"/><animate attributeName="r" values="1.2;3" dur="7s" begin="${k * 2.3}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.35;0" dur="7s" begin="${k * 2.3}s" repeatCount="indefinite"/></circle>`)
              .join('')
          : '')
      )
    })
    .join('')
  // The oak: a heavy trunk rising at the left edge, two limbs, and a crown of overlapping
  // lobes reaching in over the scene; the moon, to the right, silvers the crown's edge.
  const oak = () => {
    const lobes: [number, number, number][] = [[6, 14, 18], [24, 4, 16], [44, 10, 15], [62, 20, 12], [30, 24, 14], [10, 32, 13], [50, 30, 10]]
    let crown = ''
    let rim = ''
    for (const [lx, ly, r] of lobes) {
      crown += `M${f(lx - r)} ${f(ly)}a${r} ${f(r * 0.82)} 0 1 0 ${r * 2} 0a${r} ${f(r * 0.82)} 0 1 0 ${-r * 2} 0z`
      rim += `M${f(lx + r * 0.2)} ${f(ly - r * 0.8)}a${r} ${f(r * 0.82)} 0 0 1 ${f(r * 0.78)} ${f(r * 0.5)}`
    }
    const trunk = `M-4 ${ground + 4}C2 ${ground - 10} 4 ${ground - 30} 2 ${ground - 52}L12 ${ground - 54}C12 ${ground - 32} 14 ${ground - 14} 22 ${ground + 4}z`
    const limbs = `M4 ${ground - 50}C10 ${ground - 64} 22 ${ground - 70} 36 ${ground - 74}l1 3C24 ${ground - 66} 14 ${ground - 58} 10 ${ground - 46}zM8 ${ground - 52}C4 ${ground - 64} 0 ${ground - 72} -6 ${ground - 78}l2 -2C4 ${ground - 72} 10 ${ground - 64} 12 ${ground - 54}z`
    return `<path fill="#0a0e1e" d="${trunk}${limbs}${crown}"/><path fill="none" stroke="${low}" stroke-opacity=".55" stroke-width="1" stroke-linecap="round" d="${rim}"/><path fill="${low}" opacity=".25" d="M14 ${ground - 50}C14 ${ground - 30} 16 ${ground - 14} 22 ${ground + 4}h-3C14 ${ground - 14} 12 ${ground - 30} 12 ${ground - 50}z"/>`
  }
  const flies = Array.from({ length: Math.round(9 * c.detail) }, () => {
    const x = between(rand, sw * 0.12, sw * 0.95)
    const y = between(rand, ground - 26, ground - 6)
    return `<circle cx="${f(x)}" cy="${f(y)}" r="1" fill="#f0e28a"><animate attributeName="opacity" values="0;1;0" dur="${f(between(rand, 2.5, 4))}s" begin="${f(-rand() * 4)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(between(rand, -6, 6))} -4;0 0" dur="${f(between(rand, 5, 8))}s" repeatCount="indefinite"/></circle>`
  }).join('')
  const back =
    `<defs>${vgrad('sc-sky', [[0, top], [0.8, low], [1, mix(low, '#7a80b0', 0.4)]])}${rgrad('sc-moon', '#f4ecd0', 0.45)}${rgrad('sc-window', '#f6c97a', 0.5)}</defs>` +
    `<rect width="${sw}" height="${H}" fill="url(#sc-sky)"/>` +
    stars(rand, sw, Math.round(70 * c.detail), 60, [moonX, moonY, 26]) +
    `<circle cx="${f(moonX)}" cy="${moonY}" r="54" fill="url(#sc-moon)"/>` +
    orb(moonX, moonY, 9, '#f1ead2', 'sc-moonball') +
    wisp(moonX - 60, moonY + 8, 90, '#5a6290', 0.45, 70, 16) +
    `<path fill="${mix('#1c2648', low, 0.45)}" d="${ridge(sw, 0, x => -far(x))}"/>` +
    `<path fill="#18203e" d="${ridge(sw, 0, x => -hill(x))}"/>` +
    cottages
  const near =
    `<defs>${vgrad('sc-meadow', [[0, '#1a2440'], [1, '#0c1222']])}</defs>` +
    `<path fill="url(#sc-meadow)" d="${ridge(sw, ground - 4, noise(rand, [[3, 200]]), 20)}"/>` +
    `<path d="M${f(sw * 0.3)} ${H}C${f(sw * 0.38)} ${ground + 10} ${f(sw * 0.4)} ${ground + 2} ${f(vx)} ${ground - 6}l4 0C${f(sw * 0.5)} ${ground + 2} ${f(sw * 0.5)} ${ground + 10} ${f(sw * 0.44)} ${H}z" fill="#2a3458" opacity=".5"/>` +
    oak() +
    flies
  return { sky: top, soil: '#141c34', groundTop: ground - 4, back, near, keep: [[moonX, moonY, 12]] }
}

const SCENES: Record<string, (c: Ctx) => Scene> = { forest, sea, space, city, desert, volcano, rails, lab, night }

/**
 * The scenery for a scene on a stage `sw` wide whose front edge is at `ground`.
 * `lean` thins the scene's fine detail (stars, motes, rain) for a scene that
 * would not otherwise fit the Svg element.
 */
export function richBackdrop(scene: FablesScene, rand: Rand, sw: number, ground: number, _w: number, lean = false): Stage {
  const make = SCENES[scene.backdrop] ?? night
  const s = make({ rand, sw, ground, detail: lean ? 0.4 : 1 })
  const floor = s.floor ?? ground
  const groundTop = s.groundTop ?? ground - 6
  const accent = scene.palette.accent ? `<rect x="0" y="${floor}" width="${sw}" height="1.2" fill="${scene.palette.accent}" opacity=".6"/>` : ''
  return {
    sky: scene.palette.sky ?? s.sky,
    ground: scene.palette.ground ?? s.soil,
    floor,
    groundTop,
    back:
      `<defs><clipPath id="sc-stage"><rect width="${sw}" height="${H}"/></clipPath>` +
      `<filter id="sc-soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="1.4"/></filter>` +
      `<filter id="sc-deep"><feColorMatrix type="matrix" values=".58 0 0 0 0  0 .58 0 0 0  0 0 .62 0 0  0 0 0 1 0"/></filter></defs>` +
      clip(s.back),
    near: clip(s.near + accent),
    keep: (s.keep ?? []).map(([x, y, r]) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 })),
  }
}
