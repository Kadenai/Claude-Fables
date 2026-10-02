/**
 * Clawd in 3D: the box model, its rig and its projection, ported from the
 * Claude Mascot Style Gallery (github.com/henrik-thevibe/Claude-Mascot-Style-Gallery).
 *
 * The gallery draws live on a canvas; the band's frame runs no script, so here
 * the model is posed a few times per motion and each pose is baked into flat
 * SVG polygons, which the scene then flips through with SMIL.
 *
 * Model and projection: MIT License, Copyright (c) 2026 ChetasLua.
 */

type V3 = [number, number, number]
type M3 = [number, number, number, number, number, number, number, number, number]
export type P2 = [number, number]

/** Model space: y up, z toward the viewer, ground at y = 0, units about one sprite pixel. */
const DIM = {
  LH: 2.8, BW: 12, BH: 9, BD: 6,
  AW: 2.4, AH: 2.6, AD: 2.4, AY: 4.1,
  LW: 1.2, LD: 1.3,
  LEGS: [[-4.85, 1.45], [-2.55, -1.45], [2.55, -1.45], [4.85, 1.45]] as const,
  EX: 3.6, EY: 6.4, EW: 1.2, EH: 2.0,
}
const CY = DIM.LH + DIM.BH / 2
const PY = DIM.LH + DIM.BH * 0.4
/** The model's height and half width, arms out, in model units. */
export const MODEL_H = DIM.LH + DIM.BH
export const MODEL_HALF_W = DIM.BW / 2 + DIM.AW

export type Pose = {
  yaw: number
  pitch: number
  roll: number
  hop: number
  /** Squash and stretch: above 1 taller and thinner. */
  sq: number
  armL: number
  armR: number
  walk: number
  stride: number
  eyeX: number
  eyeY: number
  eyes: 'open' | 'happy' | 'closed'
}

export const POSE0: Pose = { yaw: 0, pitch: 0, roll: 0, hop: 0, sq: 1, armL: 0.06, armR: 0.06, walk: 0, stride: 0, eyeX: 0, eyeY: 0, eyes: 'open' }

const LIGHT = norm([-0.42, 0.62, 0.66])
const CAMERA_PITCH = 0.2
const PERSP = 0.016

function mul(a: M3, b: M3): M3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}
const rX = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)]
const rY = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)]
const rZ = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1]
const mv = (m: M3, x: number, y: number, z: number): V3 => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]
function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): V3[] => [
  [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1],
]
/** Corner order per face: counter-clockwise seen from outside. */
const FACES = { front: [4, 5, 7, 6], back: [1, 0, 2, 3], right: [5, 1, 3, 7], left: [0, 4, 6, 2], top: [6, 7, 3, 2], bottom: [0, 1, 5, 4] } as const
type FaceName = keyof typeof FACES

function area(p: readonly P2[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as P2
    const b = p[(i + 1) % p.length] as P2
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

export type PartName = 'body' | 'arm' | 'leg'
export type Face = { part: PartName; name: FaceName; pts: P2[]; light: number }
export type Eye = { poly?: P2[]; line?: P2[] }
export type Model = { faces: Face[]; eyes: Eye[]; shadow: P2[] }

/**
 * Poses the model and projects it: screen space has y down, the feet's ground
 * at y = 0 and the model centred on x = 0, `s` screen units per model unit.
 */
export function build(pose: Partial<Pose>, s: number): Model {
  const p = { ...POSE0, ...pose }
  const D = DIM
  const sxz = 1 / Math.sqrt(Math.max(0.3, p.sq))
  const py = PY * p.sq
  const R = mul(rY(p.yaw), mul(rX(p.pitch), rZ(p.roll)))
  const Cm = rX(CAMERA_PITCH)
  const W = (x: number, y: number, z: number): V3 => {
    const r = mv(R, x * sxz, y * p.sq - py, z * sxz)
    return mv(Cm, r[0], r[1] + py + p.hop - CY, r[2])
  }
  // The camera tilts the ground too: anchor the screen so ground level under the centre is y = 0.
  const groundY = mv(Cm, 0, -CY, 0)[1]
  const proj = (q: V3): P2 => {
    const f = 1 / (1 - q[2] * PERSP)
    return [q[0] * s * f, -(q[1] - groundY) * s * f]
  }

  type Part = { name: PartName; faces: Record<FaceName, Face & { vis: boolean; depth: number }>; depth: number }
  const part = (name: PartName, corners: V3[], local?: (c: V3) => V3, skip?: FaceName): Part => {
    const q = corners.map(c => W(...(local ? local(c) : c)))
    const sp = q.map(proj)
    const faces = {} as Part['faces']
    for (const fn of Object.keys(FACES) as FaceName[]) {
      const ix = FACES[fn]
      const Q = ix.map(i => q[i] as V3)
      const S = ix.map(i => sp[i] as P2)
      const [a, b, , d] = Q as [V3, V3, V3, V3]
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
      const n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]])
      const light = Math.min(1, Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]))
      // Screen y points down, which flips the winding: a face toward the viewer has negative area.
      faces[fn] = { part: name, name: fn, pts: S, light, vis: area(S) < -0.02 && fn !== skip, depth: Q.reduce((t, c) => t + c[2], 0) / 4 }
    }
    return { name, faces, depth: q.reduce((t, c) => t + c[2], 0) / 8 }
  }

  const body = part('body', box(-D.BW / 2, D.LH, -D.BD / 2, D.BW / 2, D.LH + D.BH, D.BD / 2))
  const arms = ([-1, 1] as const).map(side => {
    const ang = side < 0 ? -p.armL : p.armR
    const c = Math.cos(ang)
    const sn = Math.sin(ang)
    const px = (side * D.BW) / 2
    const ay = D.LH + D.AY
    const x0 = side < 0 ? -D.BW / 2 - D.AW : D.BW / 2 - 0.3
    const x1 = side < 0 ? -D.BW / 2 + 0.3 : D.BW / 2 + D.AW
    return part('arm', box(x0, ay - D.AH / 2, -D.AD / 2, x1, ay + D.AH / 2, D.AD / 2), cc => {
      const dx = cc[0] - px
      const dy = cc[1] - ay
      return [px + dx * c - dy * sn, ay + dx * sn + dy * c, cc[2]]
    }, side < 0 ? 'right' : 'left')
  })
  const OFF = [0, Math.PI, 0, Math.PI]
  const legs = D.LEGS.map(([lx, lz], i) => {
    const ph = p.walk + (OFF[i] ?? 0)
    const sw = p.stride * 0.5 * Math.sin(ph)
    const lift = p.stride * 0.75 * Math.max(0, Math.cos(ph))
    const c = Math.cos(sw)
    const sn = Math.sin(sw)
    const hy = D.LH
    return part('leg', box(lx - D.LW / 2, 0, lz - D.LD / 2, lx + D.LW / 2, D.LH + 0.45, lz + D.LD / 2), cc => {
      const dy = cc[1] - hy
      const dz = cc[2] - lz
      return [cc[0], hy + dy * c - dz * sn + lift, lz + dy * sn + dz * c]
    }, 'top')
  }).sort((a, b) => a.depth - b.depth)

  // Back arms, legs under a hidden underside, the body, legs under a shown underside, front arms.
  const bf = body.faces
  const [armL, armR] = arms as [Part, Part]
  const order: Part[] = []
  if (!bf.left.vis) order.push(armL)
  if (!bf.right.vis) order.push(armR)
  if (!bf.bottom.vis) order.push(...legs)
  order.push(body)
  if (bf.bottom.vis) order.push(...legs)
  if (bf.left.vis) order.push(armL)
  if (bf.right.vis) order.push(armR)
  const faces = order.flatMap(pt => Object.values(pt.faces).filter(f => f.vis).sort((a, b) => a.depth - b.depth)).map(({ part, name, pts, light }) => ({ part, name, pts, light }))

  const eyes: Eye[] = []
  if (bf.front.vis) {
    const ew = D.EW / 2
    const eh = D.EH / 2
    const zf = D.BD / 2 + 0.03
    for (const side of [-1, 1]) {
      const ex = side * D.EX + Math.max(-1, Math.min(1, p.eyeX)) * 0.55
      const ey = D.LH + D.EY + Math.max(-1, Math.min(1, p.eyeY)) * 0.42
      const E = (dx: number, dy: number) => proj(W(ex + dx, ey + dy, zf))
      if (p.eyes === 'happy') eyes.push({ line: [E(-ew * 1.15, -eh * 0.2), E(-ew * 0.6, eh * 0.3), E(0, eh * 0.5), E(ew * 0.6, eh * 0.3), E(ew * 1.15, -eh * 0.2)] })
      else if (p.eyes === 'closed') eyes.push({ line: [E(-ew * 1.2, eh * 0.05), E(-ew * 0.5, -eh * 0.22), E(0, -eh * 0.28), E(ew * 0.5, -eh * 0.22), E(ew * 1.2, eh * 0.05)] })
      else {
        // A pill: two half circles joined by straight sides.
        const pts: P2[] = []
        const cyo = eh - ew
        for (let i = 0; i <= 6; i++) pts.push(E(Math.cos((Math.PI * i) / 6) * ew, cyo + Math.sin((Math.PI * i) / 6) * ew))
        for (let i = 0; i <= 6; i++) pts.push(E(Math.cos(Math.PI + (Math.PI * i) / 6) * ew, -cyo + Math.sin(Math.PI + (Math.PI * i) / 6) * ew))
        eyes.push({ poly: pts })
      }
    }
  }

  const shadow: P2[] = []
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14
    shadow.push(proj(mv(Cm, Math.cos(a) * 8.6, -CY, Math.sin(a) * 4.6)))
  }
  return { faces, eyes, shadow }
}

// ---------------------------------------------------------------- motions

export type Motion = 'walk' | 'run' | 'swim' | 'fly' | 'dig' | 'inspect' | 'celebrate' | 'think' | 'idle'

/** Frames per loop and the loop's length in seconds, per motion. */
export const MOTION_TIMING: Record<Motion, { frames: number; dur: number }> = {
  walk: { frames: 8, dur: 0.64 },
  run: { frames: 8, dur: 0.4 },
  swim: { frames: 8, dur: 1.2 },
  fly: { frames: 6, dur: 0.6 },
  dig: { frames: 6, dur: 0.45 },
  inspect: { frames: 12, dur: 3 },
  celebrate: { frames: 8, dur: 0.7 },
  think: { frames: 8, dur: 2.4 },
  idle: { frames: 8, dur: 2.4 },
}

/** The pose `t` of the way (0 to 1) through one loop of a motion; `yaw` turns it toward where it goes. */
export function poseAt(motion: Motion, t: number, yaw: number): Partial<Pose> {
  const a = Math.PI * 2 * t
  const sin = Math.sin(a)
  switch (motion) {
    case 'walk':
      return { yaw, walk: a, stride: 0.9, hop: Math.abs(Math.sin(a)) * 0.25, roll: sin * 0.03, armL: 0.06 + 0.12 * sin, armR: 0.06 - 0.12 * sin }
    case 'run':
      return { yaw, pitch: 0.12, walk: a, stride: 1.3, hop: Math.abs(Math.sin(a)) * 0.6, armL: 0.3 + 0.35 * sin, armR: 0.3 - 0.35 * sin, sq: 1 + 0.04 * Math.cos(2 * a) }
    case 'swim':
      return { yaw, pitch: 0.25, roll: sin * 0.12, armL: 0.4 + 0.6 * sin, armR: 0.4 - 0.6 * sin, walk: a, stride: 0.4 }
    case 'fly': {
      const flap = 0.5 - 0.5 * Math.cos(a)
      return { yaw, pitch: 0.1, armL: -0.3 + 1.7 * flap, armR: -0.3 + 1.7 * flap, hop: 0.6 * flap, walk: a, stride: 0.25 }
    }
    case 'dig':
      return { yaw: yaw * 0.6, pitch: 0.4 + 0.12 * sin, armL: -0.3 + 0.9 * Math.max(0, sin), armR: -0.3 + 0.9 * Math.max(0, -sin), sq: 0.95 }
    case 'inspect':
      return { yaw: 0.7 * sin, eyeX: sin, eyeY: -0.3, pitch: 0.08, armR: 0.06 + 0.5 * Math.max(0, Math.cos(a)) }
    case 'celebrate': {
      const up = Math.sin(Math.PI * t)
      return { hop: up * 3.2, armL: 0.1 + 1.3 * up, armR: 0.1 + 1.3 * up, pitch: -up * 0.25, sq: 1 + 0.08 * up, eyes: 'happy' }
    }
    case 'think':
      return { yaw: yaw * 0.4 + 0.15 * sin, eyeX: 0.5, eyeY: 1, roll: 0.06 * sin, sq: 1 + 0.015 * sin, armR: 0.5, eyes: t > 0.86 && t < 0.96 ? 'closed' : 'open' }
    case 'idle':
      return { yaw: yaw * 0.5, sq: 1 + 0.015 * sin, eyes: t > 0.86 && t < 0.96 ? 'closed' : 'open' }
  }
}
