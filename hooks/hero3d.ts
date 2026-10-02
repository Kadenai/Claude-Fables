/**
 * Bakes the 3D Clawd (clawd3d.ts) into SVG: one group of flat polygons per
 * pose, shown in turn by discrete SMIL so the frame needs no script.
 */
import { build, MODEL_H, type Model, type Motion, MOTION_TIMING, poseAt } from './clawd3d'

/** Clawd's colors, from the gallery: the faces shade from `dark` to `light` by how they face the light. */
const SKIN = {
  body: { dark: '#a9583d', light: '#f0ac8e' },
  arm: { dark: '#a9583d', light: '#eba083' },
  leg: { dark: '#8f4a33', light: '#d4785a' },
  eye: '#1f1412',
}
/** Shading steps: few enough that a look's palette remap stays tidy. */
const STEPS = 6

/** How the faces are painted, from the look. */
export type FacePaint = 'solid' | 'lead' | 'draft' | 'enamel'

const n1 = (v: number) => (Math.round(v * 10) / 10).toString()

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2]
    .map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'))
    .join('')}`
}

const shadeOf = (part: keyof typeof SKIN, light: number) => {
  const skin = SKIN[part === 'eye' ? 'body' : part]
  const step = Math.round(Math.pow(light, 0.8) * (STEPS - 1)) / (STEPS - 1)
  return mix(skin.dark, skin.light, step)
}

const poly = (pts: readonly (readonly [number, number])[], dx: number, dy: number) =>
  `M${pts.map(([x, y]) => `${n1(x + dx)} ${n1(y + dy)}`).join('L')}Z`

function paintAttrs(fill: string, paint: FacePaint): string {
  switch (paint) {
    case 'lead':
      return `fill="${fill}" stroke="#1a1414" stroke-width="1.1" stroke-linejoin="round"`
    case 'draft':
      return `fill="${fill}" fill-opacity=".16" stroke="${fill}" stroke-width=".7" stroke-linejoin="round"`
    case 'enamel':
      return `fill="${fill}" stroke="#c9a227" stroke-width=".9" stroke-linejoin="round"`
    default:
      // A hairline in the face's own color closes the seams between faces.
      return `fill="${fill}" stroke="${fill}"`
  }
}

/** One posed model as SVG, its feet on y = `floor`, centred on x = `cx`. */
export function modelSvg(m: Model, cx: number, floor: number, paint: FacePaint): string {
  const shadow = `<path fill="#1f1e1d" opacity=".22" d="${poly(m.shadow, cx, floor)}"/>`
  // Consecutive faces of one color share a path; draw order is kept, so overlaps stay right.
  const runs: { fill: string; d: string[] }[] = []
  for (const f of m.faces) {
    const fill = shadeOf(f.part, f.light)
    const last = runs[runs.length - 1]
    if (last && last.fill === fill) last.d.push(poly(f.pts, cx, floor))
    else runs.push({ fill, d: [poly(f.pts, cx, floor)] })
  }
  const paths = runs.map(r => `<path ${paintAttrs(r.fill, paint)} d="${r.d.join('')}"/>`).join('')
  // Solid faces share their hairline's width and join, set once for the frame.
  const faces = paint !== 'solid' ? paths : `<g stroke-width=".5" stroke-linejoin="round">${paths}</g>`
  const eyes = m.eyes
    .map(e =>
      e.poly
        ? `<path fill="${SKIN.eye}" d="${poly(e.poly, cx, floor)}"/>`
        : `<path fill="none" stroke="${SKIN.eye}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" d="M${(e.line ?? []).map(([x, y]) => `${n1(x + cx)} ${n1(y + floor)}`).join('L')}"/>`,
    )
    .join('')
  return shadow + faces + eyes
}

export type Frames3d = {
  /** The loop's frames, each a group that SMIL shows in its slot. */
  svg: string
  frames: number
}

/**
 * A motion as a loop of baked frames. `active` says when the loop plays: always,
 * only for the first `until` seconds, or only from `from` seconds on.
 */
export function motionSvg(
  motion: Motion,
  o: { height: number; cx: number; floor: number; yaw: number; paint: FacePaint; until?: number; from?: number },
): Frames3d {
  const { frames, dur } = MOTION_TIMING[motion]
  const s = o.height / MODEL_H
  const timing =
    o.until !== undefined
      ? `repeatDur="${n1(o.until)}s"`
      : o.from !== undefined
        ? `begin="${n1(o.from)}s" repeatCount="indefinite"`
        : 'repeatCount="indefinite"'
  // Every frame waits hidden and its animation shows it in its slot, so a loop
  // that has not begun or has ended draws nothing and another can take over.
  const groups = Array.from({ length: frames }, (_, k) => {
    const model = build(poseAt(motion, k / frames, o.yaw), s)
    const at = (v: number) => (Math.round((v / frames) * 10000) / 10000).toString()
    const anim =
      k === 0
        ? `<animate attributeName="visibility" values="visible;hidden" keyTimes="0;${at(1)}" calcMode="discrete" dur="${dur}s" ${timing}/>`
        : `<animate attributeName="visibility" values="hidden;visible;hidden" keyTimes="0;${at(k)};${at(k + 1)}" calcMode="discrete" dur="${dur}s" ${timing}/>`
    return `<g visibility="hidden">${modelSvg(model, o.cx, o.floor, o.paint)}${anim}</g>`
  })
  return { svg: groups.join(''), frames }
}
