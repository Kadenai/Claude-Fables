/**
 * Building blocks for a look's grade: one SVG filter laid over the finished
 * stage (scenery, Claude and the lens together), so a look restyles the whole
 * picture without redrawing any of it. Every block takes the image so far and
 * leaves its result under the name it is given.
 *
 * Masks are carried in the alpha channel, as black with an opacity: filter
 * arithmetic then works on plain numbers, never on premultiplied colors.
 */

const f = (v: number) => (Math.round(v * 1000) / 1000).toString()

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)

/** Luminance as an opaque gray. */
export const gray = (from: string, result: string) =>
  `<feColorMatrix in="${from}" type="matrix" values=".299 .587 .114 0 0  .299 .587 .114 0 0  .299 .587 .114 0 0  0 0 0 0 1" result="${result}"/>`

/** Luminance as a mask: black, as opaque as the image is light. */
export const lumMask = (from: string, result: string) =>
  `<feColorMatrix in="${from}" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .299 .587 .114 0 0" result="${result}"/>`

/**
 * A gray image painted through a ramp of colors, darkest first: smoothly, or
 * in flat bands (`discrete`), as a print or a screen with few inks would.
 */
export function ramp(from: string, stops: readonly string[], result: string, discrete = false): string {
  const type = discrete ? 'discrete' : 'table'
  const ch = (i: number) => stops.map(c => f(channels(c)[i] ?? 0)).join(' ')
  return (
    `<feComponentTransfer in="${from}" result="${result}">` +
    `<feFuncR type="${type}" tableValues="${ch(0)}"/><feFuncG type="${type}" tableValues="${ch(1)}"/><feFuncB type="${type}" tableValues="${ch(2)}"/>` +
    `</feComponentTransfer>`
  )
}

/** Each channel cut into `levels` flat steps. */
export function posterize(from: string, levels: number, result: string): string {
  const steps = Array.from({ length: levels }, (_, i) => f(i / (levels - 1))).join(' ')
  return (
    `<feComponentTransfer in="${from}" result="${result}">` +
    `<feFuncR type="discrete" tableValues="${steps}"/><feFuncG type="discrete" tableValues="${steps}"/><feFuncB type="discrete" tableValues="${steps}"/>` +
    `</feComponentTransfer>`
  )
}

/**
 * A hue mask: opaque where the color leans the given way. `warm` finds the
 * oranges and reds (Claude, lava, lamplight), `green` foliage and grass,
 * `blue` sky and water. `hard` cuts it to all or nothing.
 */
export function hueMask(from: string, hue: 'warm' | 'green' | 'blue', result: string, hard = true): string {
  const row = hue === 'warm' ? '4 0 -4 0 -.55' : hue === 'green' ? '-3 4.5 -3 0 -.12' : '-3.5 -1 4.5 0 -.2'
  return (
    `<feColorMatrix in="${from}" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${row}" result="${result}${hard ? '-soft' : ''}"/>` +
    (hard ? `<feComponentTransfer in="${result}-soft" result="${result}"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>` : '')
  )
}

/** `top` laid over `under` only where `mask` is opaque. */
export const through = (top: string, mask: string, under: string, result: string) =>
  `<feComposite in="${top}" in2="${mask}" operator="in" result="${result}-cut"/>` +
  `<feMerge result="${result}"><feMergeNode in="${under}"/><feMergeNode in="${result}-cut"/></feMerge>`

/** A flat ink laid over `under` where `mask` is opaque. */
export const ink = (color: string, mask: string, under: string, result: string, opacity = 1) =>
  `<feFlood flood-color="${color}"${opacity < 1 ? ` flood-opacity="${f(opacity)}"` : ''}/><feComposite in2="${mask}" operator="in" result="${result}-ink"/>` +
  `<feMerge result="${result}"><feMergeNode in="${under}"/><feMergeNode in="${result}-ink"/></feMerge>`

/**
 * Outlines: where the image's lightness changes by more than `threshold`
 * across `reach` stage units, as a mask. The image is compared with a copy of
 * itself shifted diagonally, which finds edges running either way in one
 * comparison; built from a shift rather than a convolution, the lines keep
 * their width at any zoom. Few passes, as this runs on every frame.
 */
export function edges(from: string, result: string, o: { reach?: number; threshold?: number } = {}): string {
  const reach = f(o.reach ?? 0.8)
  const slope = f(1 / (o.threshold ?? 0.12))
  return (
    lumMask(from, `${result}-l`) +
    `<feOffset in="${result}-l" dx="${reach}" dy="${reach}" result="${result}-o"/>` +
    // Both signs, as alpha: the shifted copy less the original, and the original less the copy.
    `<feComposite in="${result}-o" in2="${result}-l" operator="arithmetic" k2="1" k3="-1" result="${result}-a"/>` +
    `<feComposite in="${result}-l" in2="${result}-o" operator="arithmetic" k2="1" k3="-1"/>` +
    `<feComposite in2="${result}-a" operator="arithmetic" k2="${slope}" k3="${slope}" k4="-1" result="${result}"/>`
  )
}

/**
 * A threshold screen: a tile of thresholds (as alpha) repeated over the stage
 * from its corner, so a pixelized stage and the screen share one grid. `cells`
 * is a grid of thresholds, row by row, each cell `size` units square. Keep
 * cells to .8 units or more: the band draws 1.5 pixels to the unit, and the
 * renderer drops a filter region under a pixel.
 */
export function screen(cells: readonly (readonly number[])[], size: number, result: string): string {
  const rows = cells.length
  const cols = Math.max(...cells.map(r => r.length))
  const floods = cells.flatMap((row, y) =>
    row.map((v, x) => `<feFlood x="${f(x * size)}" y="${f(y * size)}" width="${f(size)}" height="${f(size)}" flood-color="black" flood-opacity="${f(v)}" result="${result}-${x}-${y}"/>`),
  )
  const names = cells.flatMap((row, y) => row.map((_, x) => `<feMergeNode in="${result}-${x}-${y}"/>`))
  return (
    floods.join('') +
    `<feMerge x="0" y="0" width="${f(cols * size)}" height="${f(rows * size)}" result="${result}-tile">${names.join('')}</feMerge>` +
    `<feTile in="${result}-tile" result="${result}"/>`
  )
}

/**
 * Where the image is darker than the screen, as a mask: ink lands in more of
 * each cell the darker the image is there. `bias` darkens (+) or lightens (-) the reading.
 */
export const screened = (lum: string, scr: string, result: string, bias = 0) =>
  `<feComposite in="${scr}" in2="${lum}" operator="arithmetic" k2="1" k3="-1" k4="${f(bias)}" result="${result}-d"/>` +
  `<feComponentTransfer in="${result}-d" result="${result}"><feFuncA type="linear" slope="40"/></feComponentTransfer>`

/** Ordered-dither thresholds (Bayer 4×4), for a screen on the pixel grid. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(r => r.map(v => (v + 0.5) / 16))

/** The filter itself, over the whole stage and graded in sRGB, so ramps land on the colors they name. */
export const gradeFilter = (id: string, sw: number, h: number, body: string) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="${sw}" height="${h}" color-interpolation-filters="sRGB">${body}</filter>`

/**
 * The image sampled at the middle of every `size` square and spread over the
 * square, from the stage's corner: tesserae, stitches, coarse pixels.
 */
export function cells(from: string, size: number, result: string): string {
  const dot = Math.min(0.4, size / 4)
  return (
    `<feFlood x="${f((size - dot) / 2)}" y="${f((size - dot) / 2)}" width="${f(dot)}" height="${f(dot)}" flood-color="black"/>` +
    `<feComposite x="0" y="0" width="${f(size)}" height="${f(size)}"/><feTile result="${result}-grid"/>` +
    `<feComposite in="${from}" in2="${result}-grid" operator="in"/><feMorphology operator="dilate" radius="${f((size - dot) / 2)}" result="${result}"/>`
  )
}

/** Lightness bent by a curve: under 1 lifts the shadows, over 1 sinks them. */
export const lift = (from: string, exponent: number, result: string) =>
  `<feComponentTransfer in="${from}" result="${result}"><feFuncR type="gamma" exponent="${f(exponent)}"/><feFuncG type="gamma" exponent="${f(exponent)}"/><feFuncB type="gamma" exponent="${f(exponent)}"/></feComponentTransfer>`

/** A screen's thresholds as an opaque gray image, to add to a picture. */
export const screenGray = (scr: string, result: string) =>
  `<feColorMatrix in="${scr}" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" result="${result}"/>`
