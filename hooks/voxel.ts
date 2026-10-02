/**
 * Sprite stacking: pseudo-3D voxel objects for SVG.
 *
 * A model is a grid of voxels. Each horizontal layer becomes one flat slice,
 * defined once; the slice is rotated by the model's yaw (fixed, or turned by
 * SMIL), squashed into the ground plane, and drawn three times per layer: two
 * darkened copies for the layer's walls, then its top surface one layer higher. Stacked
 * bottom to top, the slices read as a solid object, and a spin is one rotation
 * shared by every slice.
 *
 * The whole stack is a single group, so a model placed many times costs one
 * <use> per placement.
 */

const f = (v: number) => (Math.round(v * 100) / 100).toString()

/** A grid of voxels, w across (x), d deep (y, 0 at the back) and h tall (z, 0 at the bottom). */
export class Vox {
  readonly cells: (string | undefined)[]
  constructor(
    readonly w: number,
    readonly d: number,
    readonly h: number,
  ) {
    this.cells = new Array(w * d * h)
  }
  get(x: number, y: number, z: number): string | undefined {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return undefined
    return this.cells[(z * this.d + y) * this.w + x]
  }
  set(x: number, y: number, z: number, c: string | undefined): this {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return this
    this.cells[(z * this.d + y) * this.w + x] = c
    return this
  }
  /** Sets every cell for which `fn` names a color. */
  fill(fn: (x: number, y: number, z: number) => string | undefined): this {
    for (let z = 0; z < this.h; z++) for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
      const c = fn(x, y, z)
      if (c !== undefined) this.set(x, y, z, c)
    }
    return this
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: string): this {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c)
    return this
  }
  /** An upright cylinder (or a cone, when r1 differs from r0) centered on (cx, cy). */
  cyl(cx: number, cy: number, z0: number, z1: number, r0: number, c: string | ((z: number) => string), r1 = r0): this {
    for (let z = z0; z <= z1; z++) {
      const r = z1 === z0 ? r0 : r0 + ((r1 - r0) * (z - z0)) / (z1 - z0)
      for (let y = 0; y < this.d; y++) for (let x = 0; x < this.w; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, z, typeof c === 'string' ? c : c(z))
      }
    }
    return this
  }
  /** An ellipsoid centered on (cx, cy, cz); `c` may vary by position. */
  ball(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: string | ((x: number, y: number, z: number) => string | undefined)): this {
    return this.fill((x, y, z) => {
      const k = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2
      return k <= 1 ? (typeof c === 'string' ? c : c(x, y, z)) : undefined
    })
  }
}

export type StackOptions = {
  /** Stage units per voxel across. */
  s: number
  /** Stage units per voxel layer upward. */
  lift: number
  /** How flat the ground plane looks: 1 seen from straight above, 0 edge on. */
  q?: number
  /** Degrees the model is turned. */
  yaw?: number
  /** Seconds per full turn; absent, it holds its yaw. */
  spin?: number
  /** Swing the yaw back and forth by this many degrees over `swayDur` seconds. */
  sway?: number
  swayDur?: number
}

export type Stacked = {
  /** Definitions to place once in the document. */
  defs: string
  /** Half the model's width on screen, from its center. */
  halfW: number
  /** How far the model reaches above its base point, and below it. */
  up: number
  down: number
}

/**
 * Builds a model's slices and stack under `id`. Its base point, the center of
 * its bottom layer, is (0, 0); place it with `place(id, x, y)`.
 */
export function stack(id: string, v: Vox, o: StackOptions): Stacked {
  const q = o.q ?? 0.5
  const yaw = o.yaw ?? 0
  const turn =
    o.spin !== undefined
      ? `<animateTransform attributeName="transform" type="rotate" values="${f(yaw)};${f(yaw + 360)}" dur="${f(o.spin)}s" repeatCount="indefinite"/>`
      : o.sway
        ? `<animateTransform attributeName="transform" type="rotate" values="${f(yaw - o.sway)};${f(yaw + o.sway)};${f(yaw - o.sway)}" dur="${f(o.swayDur ?? 6)}s" repeatCount="indefinite"/>`
        : ''
  const slices: string[] = []
  const layers: number[] = []
  for (let z = 0; z < v.h; z++) {
    // Runs of one color along each row, and a run that repeats on the next rows grows into one rectangle.
    const byColor = new Map<string, string>()
    let open = new Map<string, { y: number; h: number; c: string; x: number; end: number }>()
    const flush = (r: { y: number; h: number; c: string; x: number; end: number }) =>
      byColor.set(r.c, (byColor.get(r.c) ?? '') + `M${f(r.x - v.w / 2)} ${f(r.y - v.d / 2)}h${r.end - r.x}v${r.h}h${r.x - r.end}z`)
    for (let y = 0; y <= v.d; y++) {
      const next = new Map<string, { y: number; h: number; c: string; x: number; end: number }>()
      let x = 0
      while (y < v.d && x < v.w) {
        const c = v.get(x, y, z)
        let end = x + 1
        while (end < v.w && v.get(end, y, z) === c) end++
        if (c) {
          const key = `${c}|${x}|${end}`
          const run = open.get(key)
          if (run) {
            run.h++
            open.delete(key)
            next.set(key, run)
          } else next.set(key, { y, h: 1, c, x, end })
        }
        x = end
      }
      for (const r of open.values()) flush(r)
      open = next
    }
    if (byColor.size === 0) continue
    layers.push(z)
    const paths = [...byColor].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('')
    slices.push(`<g id="${id}-${z}" transform="rotate(${f(yaw)})">${turn}${paths}</g>`)
  }
  // In the stack's own units one step up is lift / (s * q).
  const step = o.lift / (o.s * q)
  const uses = layers
    .map(
      z =>
        `<use href="#${id}-${z}" y="${f(-z * step)}" filter="url(#sc-deep)"/><use href="#${id}-${z}" y="${f(-(z + 0.5) * step)}" filter="url(#sc-deep)"/>` +
        `<use href="#${id}-${z}" y="${f(-(z + 1) * step + 0.01)}"/>`,
    )
    .join('')
  const rad = (yaw * Math.PI) / 180
  const turning = o.spin !== undefined || !!o.sway
  const across = turning ? Math.hypot(v.w, v.d) : Math.abs(v.w * Math.cos(rad)) + Math.abs(v.d * Math.sin(rad))
  const deep = turning ? Math.hypot(v.w, v.d) : Math.abs(v.w * Math.sin(rad)) + Math.abs(v.d * Math.cos(rad))
  return {
    defs: `<defs>${slices.join('')}<g id="${id}" transform="scale(${f(o.s)} ${f(o.s * q)})">${uses}</g></defs>`,
    halfW: (across * o.s) / 2,
    up: v.h * o.lift + (deep * o.s * q) / 2,
    down: (deep * o.s * q) / 2,
  }
}

/** One placement of a stacked model, its base point at (x, y), optionally mirrored. */
export const place = (id: string, x: number, y: number, mirror = false) =>
  mirror ? `<use href="#${id}" transform="translate(${f(x)} ${f(y)}) scale(-1 1)"/>` : `<use href="#${id}" x="${f(x)}" y="${f(y)}"/>`
