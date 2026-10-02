import type { FablesProp, FablesScene } from '../types'

import { type FacePaint, motionSvg } from './hero3d'
import { MONOCRAFT, MONOCRAFT_BOLD } from './monocraft'
import { richBackdrop } from './scenery'
import { type Cell, type Layer, type Look, lightness, lookFor, remapColors } from './looks'
import { HERO_FRAMES, PALETTE, SPRITES, type SpriteName } from './sprites'

/**
 * The logical stage: always H tall, and as wide as the band's shape asks, from
 * MIN_W to MAX_W (W when nothing asks), so a wide window shows more of the
 * scene rather than a bigger one.
 */
export const W = 640
export const H = 128
export const MIN_W = 320
export const MAX_W = 1600
/** One art pixel, in stage units. */
export const U = 4
const GROUND_Y = 104
/** The desktop's Svg element takes at most this many characters. */
export const MAX_SVG = 131072
const BUDGET = 126000

const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
const INK = '#1f1e1d'
const PAPER = '#ece9df'

// ---------------------------------------------------------------- helpers

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** A small deterministic PRNG (mulberry32), so a scene always draws the same. */
export function rng(seedText: string): () => number {
  let seed = 2166136261
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rect = { x: number; y: number; w: number; h: number }

const n = (v: number) => (Math.round(v * 100) / 100).toString()

/** Denser glyphs for darker colors, as a line printer overstrikes. */
const GLYPHS = '@#%+:'

/**
 * Pixel rows to compact SVG, in art-pixel units, drawn as `cell` says. Solid
 * cells are one <path> per color, each horizontal run of a color one
 * `M x y h w v 1 h -w z` segment; the other cells draw each pixel apart.
 */
export function pixelPaths(rows: readonly string[], colorOf: (key: string) => string | undefined, cell: Cell = 'solid'): string {
  if (cell === 'glyph') {
    return rows
      .map((row, y) => {
        const line = [...row].map(k => {
          const color = k === '.' ? undefined : colorOf(k)
          return color ? (GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(lightness(color) * GLYPHS.length))] ?? '#') : ' '
        })
        if (!line.some(c => c !== ' ')) return ''
        return `<text x="0" y="${y + 0.85}" font-family="${FONT}" font-size="1.15" font-weight="700" textLength="${row.length}" lengthAdjust="spacingAndGlyphs" xml:space="preserve" fill="#2a2a2a">${line.join('')}</text>`
      })
      .join('')
  }
  const byColor = new Map<string, string[]>()
  const add = (color: string, d: string) => {
    const list = byColor.get(color) ?? []
    list.push(d)
    byColor.set(color, list)
  }
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const key = row[x] ?? '.'
      const color = key === '.' ? undefined : colorOf(key)
      let end = x + 1
      while (end < row.length && row[end] === key) end++
      if (color) {
        if (cell === 'solid') add(color, `M${x} ${y}h${end - x}v1h-${end - x}z`)
        else {
          for (let px = x; px < end; px++) {
            if (cell === 'tile') add(color, `M${px + 0.12} ${y + 0.12}h.76v.76h-.76z`)
            else if (cell === 'stitch') add(color, `M${px + 0.18} ${y + 0.18}l.64 .64m-.64 0l.64-.64`)
            else add(color, `M${px} ${y}h1v1h-1z`)
          }
        }
      }
      x = end
    }
  })
  const paint = (color: string) =>
    cell === 'stitch'
      ? `fill="none" stroke="${color}" stroke-width=".3" stroke-linecap="round" shape-rendering="geometricPrecision"`
      : cell === 'lead'
        ? `fill="${color}" stroke="#1a1414" stroke-width=".2"`
        : cell === 'draft'
          ? `fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width=".1"`
          : `fill="${color}"`
  return [...byColor].map(([color, d]) => `<path ${paint(color)} d="${d.join('')}"/>`).join('')
}

const widthOf = (rows: readonly string[]) => Math.max(0, ...rows.map(r => r.length))

type Art = { rows: readonly string[]; colorOf: (key: string) => string | undefined }

function artFor(prop: FablesProp): Art {
  if (typeof prop.sprite === 'string') {
    const sprite = SPRITES[prop.sprite as SpriteName] ?? SPRITES.star
    const accent = prop.color ?? sprite.accent
    return { rows: sprite.rows, colorOf: k => (k === 'a' ? accent : PALETTE[k]) }
  }
  const { pixels, colors } = prop.sprite
  return { rows: pixels, colorOf: k => colors[k] }
}

// ---------------------------------------------------------------- backdrops

type Stage = {
  sky: string
  ground: string
  /** Where the hero's and props' feet rest. */
  floor: number
  back: string
  front: string
}

function backdrop(scene: FablesScene, rand: () => number, sw: number): Stage {
  const accent = scene.palette.accent
  const parts: string[] = []
  const front: string[] = []
  const at = (v: number) => Math.round(v / U) * U
  let sky = '#262624'
  let ground = '#3a3833'
  let floor = GROUND_Y

  switch (scene.backdrop) {
    case 'forest': {
      sky = '#20261f'
      ground = '#3c6e34'
      for (let i = 0; i < Math.round((9 * sw) / W); i++) {
        const x = at(rand() * sw)
        const h = at(24 + rand() * 30)
        parts.push(
          `<rect x="${x}" y="${GROUND_Y - h}" width="${U * 3}" height="${h}" fill="#2a3a26"/>`,
          `<rect x="${x - U * 2}" y="${GROUND_Y - h - U * 3}" width="${U * 7}" height="${U * 5}" fill="#2f4a2a"/>`,
        )
      }
      for (let x = 0; x < sw; x += U * 5) {
        const h = U * (1 + Math.floor(rand() * 3))
        front.push(`<rect x="${x + at(rand() * 8)}" y="${GROUND_Y - h}" width="${U}" height="${h}" fill="#5e9c4a"/>`)
      }
      break
    }
    case 'space': {
      sky = '#14121c'
      ground = '#14121c'
      floor = 92
      for (let i = 0; i < 3; i++) {
        const r = 4 + rand() * 12
        parts.push(`<circle cx="${n(rand() * sw)}" cy="${n(10 + rand() * 60)}" r="${n(r)}" fill="${['#54408a', '#7b5fb5', '#8a8780'][i]}" opacity=".7"/>`)
      }
      break
    }
    case 'city': {
      sky = '#1e2230'
      ground = '#33353d'
      let x = 0
      while (x < sw) {
        const w = at(24 + rand() * 40)
        const h = at(30 + rand() * 50)
        parts.push(`<rect x="${x}" y="${GROUND_Y - h}" width="${w - U}" height="${h}" fill="#2b2f3d"/>`)
        for (let wy = GROUND_Y - h + U * 2; wy < GROUND_Y - U * 2; wy += U * 3) {
          for (let wx = x + U; wx < x + w - U * 2; wx += U * 3) {
            if (rand() < 0.35) {
              const blink = rand() < 0.2 ? `<animate attributeName="opacity" values="1;.2;1" dur="${n(2 + rand() * 4)}s" repeatCount="indefinite"/>` : ''
              parts.push(`<rect x="${wx}" y="${wy}" width="${U}" height="${U}" fill="#e3b341" opacity=".8">${blink}</rect>`)
            }
          }
        }
        x += w
      }
      break
    }
    case 'desert': {
      sky = '#2e2620'
      ground = '#c9a46a'
      parts.push(`<circle cx="${n(80 + rand() * (sw - 160))}" cy="26" r="14" fill="#f0c060"/>`)
      for (let i = 0; i < Math.round((4 * sw) / W); i++) {
        const cx = rand() * sw
        parts.push(`<ellipse cx="${n(cx)}" cy="${GROUND_Y}" rx="${n(60 + rand() * 60)}" ry="${n(8 + rand() * 10)}" fill="#a8844f"/>`)
      }
      break
    }
    case 'volcano': {
      sky = '#2a1a17'
      ground = '#4a2c20'
      const vx = at(sw * 0.6 + rand() * (sw * 0.4 - 120))
      parts.push(
        `<polygon points="${vx},${GROUND_Y} ${vx + 50},${GROUND_Y - 70} ${vx + 66},${GROUND_Y - 70} ${vx + 116},${GROUND_Y}" fill="#5a3520"/>`,
        `<rect x="${vx + 50}" y="${GROUND_Y - 74}" width="16" height="6" fill="#f06a2b"><animate attributeName="fill" values="#f06a2b;#e3b341;#f06a2b" dur="1.4s" repeatCount="indefinite"/></rect>`,
      )
      for (let i = 0; i < 6; i++) {
        const dx = (rand() - 0.5) * 60
        parts.push(
          `<rect x="${vx + 56}" y="${GROUND_Y - 76}" width="${U}" height="${U}" fill="#f06a2b">` +
            `<animateTransform attributeName="transform" type="translate" values="0 0;${n(dx)} -30;${n(dx * 1.6)} 10" dur="${n(1.6 + rand())}s" begin="${n(rand() * 2)}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="1;1;0" dur="${n(1.6 + rand())}s" repeatCount="indefinite"/></rect>`,
        )
      }
      break
    }
    case 'lab': {
      sky = '#202628'
      ground = '#3b3e47'
      for (let x = 0; x < sw; x += 32) parts.push(`<rect x="${x}" y="0" width="1" height="${GROUND_Y}" fill="#2a3134"/>`)
      for (let y = 0; y < GROUND_Y; y += 32) parts.push(`<rect x="0" y="${y}" width="${sw}" height="1" fill="#2a3134"/>`)
      for (let x = 0; x < sw; x += U * 4) front.push(`<rect x="${x}" y="${GROUND_Y}" width="${U * 2}" height="${U}" fill="#5b5f6b"/>`)
      break
    }
    case 'night':
    default: {
      sky = '#1b1d26'
      ground = '#2c2e36'
      parts.push(`<circle cx="${n(60 + rand() * (sw - 120))}" cy="24" r="10" fill="#e8e3c8"/>`)
      break
    }
  }
  if (accent) front.push(`<rect x="0" y="${GROUND_Y}" width="${sw}" height="2" fill="${accent}" opacity=".7"/>`)
  return {
    sky: scene.palette.sky ?? sky,
    ground: scene.palette.ground ?? ground,
    floor,
    back: parts.join(''),
    front: front.join(''),
  }
}

/** The flat stage in the shape the scene draws: its front details sit on the ground, behind the props. */
const flatStage = (s: Stage) => ({ sky: s.sky, ground: s.ground, floor: s.floor, groundTop: GROUND_Y, back: s.back, near: s.front, keep: [] as Rect[], lens: '' })

// ---------------------------------------------------------------- particles

function particles(scene: FablesScene, rand: () => number, sw: number): string {
  if (!scene.particles) return ''
  const { kind, density } = scene.particles
  const count = Math.round((density * 36 * sw) / W)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const x = n(rand() * sw)
    const y = n(rand() * GROUND_Y)
    const dur = n(1.5 + rand() * 3)
    const begin = n(-rand() * 4)
    switch (kind) {
      case 'stars':
        out.push(
          `<rect x="${x}" y="${n(rand() * 80)}" width="2" height="2" fill="#e3d9a0"><animate attributeName="opacity" values="1;.15;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        break
      case 'rain':
        out.push(
          `<rect x="${x}" y="-8" width="1" height="6" fill="#6fa8d0"><animateTransform attributeName="transform" type="translate" values="0 0;-8 ${GROUND_Y + 8}" dur="${n(0.6 + rand() * 0.5)}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        break
      case 'snow':
        out.push(
          `<rect x="${x}" y="-4" width="2" height="2" fill="${PAPER}"><animateTransform attributeName="transform" type="translate" values="0 0;6 ${GROUND_Y / 2};-4 ${GROUND_Y + 4}" dur="${n(4 + rand() * 4)}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        break
      case 'bubbles':
        out.push(
          `<circle cx="${x}" cy="${GROUND_Y}" r="${n(1 + rand() * 2)}" fill="none" stroke="#9fd3e0"><animateTransform attributeName="transform" type="translate" values="0 0;4 -${GROUND_Y / 2};-2 -${GROUND_Y}" dur="${n(3 + rand() * 3)}s" begin="${begin}s" repeatCount="indefinite"/></circle>`,
        )
        break
      case 'sparks':
        out.push(
          `<rect x="${x}" y="${y}" width="2" height="2" fill="#e3b341"><animateTransform attributeName="transform" type="translate" values="0 0;${n((rand() - 0.5) * 20)} -20" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        break
      case 'leaves':
        out.push(
          `<rect x="${x}" y="-4" width="3" height="2" fill="${rand() < 0.5 ? '#c98a3a' : '#5e9c4a'}"><animateTransform attributeName="transform" type="translate" values="0 0;30 ${GROUND_Y / 2};10 ${GROUND_Y + 4}" dur="${n(4 + rand() * 3)}s" begin="${begin}s" repeatCount="indefinite"/></rect>`,
        )
        break
    }
  }
  return out.join('')
}

// ---------------------------------------------------------------- props

/**
 * A hex color as rgb(): the palette remap only rewrites hex colors, so a label
 * written this way keeps the colors it was given inside a remapped layer.
 */
function fixed(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return hex
  const v = parseInt(m[1], 16)
  return `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`
}

/** Label colors: the prop's own tint in the plain look, the look's caption colors in every other. */
export type TagStyle = { fill: string; ink: string; stroke: string }

function label(text: string, cx: number, y: number, tag: TagStyle, sw: number): string {
  const w = text.length * 5 + 8
  const x = Math.min(sw - w - 2, Math.max(2, cx - w / 2))
  const top = Math.max(2, y - 13)
  return (
    `<rect x="${n(x)}" y="${n(top)}" width="${w}" height="11" fill="${fixed(tag.fill)}" stroke="${fixed(tag.stroke)}" stroke-width="1"/>` +
    `<text x="${n(x + 4)}" y="${n(top + 8)}" font-family="${FONT}" font-size="8" fill="${fixed(tag.ink)}">${escapeXml(text)}</text>`
  )
}

/** One prop, drawn flat on the pixel stage, with its label tag above it. */
function propSvg(prop: FablesProp, floor: number, index: number, sw: number, cell: Cell, look: Look): string {
  const art = artFor(prop)
  const w = widthOf(art.rows) * U
  const h = art.rows.length * U
  const x = Math.round(((sw - w) * prop.x) / 100)
  const y = prop.y === 'ground' ? floor - h : prop.y === 'air' ? 58 - h / 2 : 8
  const cx = x + w / 2
  const cy = y + h / 2
  const body = `<g transform="translate(${x} ${n(y)}) scale(${U})">${pixelPaths(art.rows, art.colorOf, cell)}</g>`
  const slow = n(2 + (index % 3) * 0.7)
  let motion = ''
  switch (prop.motion) {
    case 'bob':
      motion = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${U};0 0" dur="${slow}s" repeatCount="indefinite"/>`
      break
    case 'drift':
      motion = `<animateTransform attributeName="transform" type="translate" values="0 0;24 -2;0 0" dur="${n(6 + index)}s" repeatCount="indefinite"/>`
      break
    case 'shake':
      motion = `<animateTransform attributeName="transform" type="translate" values="0 0;-2 0;2 0;0 0" dur=".25s" repeatCount="indefinite"/>`
      break
    case 'fall':
      motion = `<animateTransform attributeName="transform" type="translate" values="0 -${n(y + h)};0 0;0 0" keyTimes="0;.4;1" dur="3s" repeatCount="indefinite"/>`
      break
    case 'spin':
      motion = `<animateTransform attributeName="transform" type="rotate" values="0 ${n(cx)} ${n(cy)};360 ${n(cx)} ${n(cy)}" dur="${slow}s" repeatCount="indefinite"/>`
      break
    case 'blink':
      motion = `<animate attributeName="opacity" values="1;.25;1" dur="1s" repeatCount="indefinite"/>`
      break
    case 'scroll':
      motion = `<animateTransform attributeName="transform" type="translate" values="${sw - x} 0;${-x - w} 0" dur="${n(7 + index)}s" repeatCount="indefinite"/>`
      break
  }
  const tint = prop.color ?? '#d9d4c7'
  const style: TagStyle = look.color ? { fill: look.caption.fill, ink: look.caption.ink, stroke: look.caption.stroke } : { fill: INK, ink: tint, stroke: tint }
  const tag = prop.label ? label(prop.label, cx, y, style, sw) : ''
  return `<g>${body}${tag}${motion}</g>`
}

// ---------------------------------------------------------------- hero

const HERO_W = 13 * U
const HERO_H = 9 * U
const heroColor = (k: string) => PALETTE[k]

/** The hero's drawing, where it ends up, and when it gets there (seconds). */
type HeroPlan = { svg: string; startX: number; endX: number; endY: number; arrive: number }

/** How the hero is drawn: the pixel sprite in a cell style, or the 3D model painted one way. */
export type Figure = { kind: 'pixel'; cell: Cell } | { kind: '3d'; paint: FacePaint }

/** The 3D model stands a little taller than the sprite, arms reaching past its box. */
const MODEL_STAGE_H = 40

function hero(scene: FablesScene, floor: number, sw: number, figure: Figure): HeroPlan {
  const cell = figure.kind === 'pixel' ? figure.cell : 'solid'
  const { action } = scene.hero
  const isMoving = action === 'walk' || action === 'run' || action === 'swim' || action === 'fly'
  const span = sw - HERO_W
  const fromX = Math.round((span * scene.hero.from) / 100)
  const toX = Math.round((span * scene.hero.to) / 100)
  const baseY = action === 'fly' ? 34 : action === 'swim' ? floor - HERO_H + 12 : floor - HERO_H
  const speed = action === 'run' ? 110 : action === 'fly' ? 80 : 45
  const moveDur = isMoving ? Math.max(0.6, Math.abs(toX - fromX) / speed) : 0
  const step = action === 'run' ? 0.18 : 0.32
  const steps = isMoving ? Math.max(2, Math.round(moveDur / step)) : 0
  const flip = toX < fromX ? ` translate(${HERO_W} 0) scale(-1 1)` : ''

  const legs = (frame: number, values: string) =>
    `<g opacity="${frame === 0 ? 1 : 0}" transform="scale(${U})">${pixelPaths(HERO_FRAMES[frame] ?? [], heroColor, cell)}` +
    (steps
      ? `<animate attributeName="opacity" values="${values}" dur="${step * 2}s" calcMode="discrete" repeatCount="${steps / 2}"/>`
      : '') +
    `</g>`
  const model = (motion: Parameters<typeof motionSvg>[0], when: { until?: number; from?: number } = {}) =>
    figure.kind === '3d'
      ? motionSvg(motion, { height: MODEL_STAGE_H, cx: HERO_W / 2, floor: HERO_H, yaw: 0.55, paint: figure.paint, ...when }).svg
      : ''
  // Walking and running stop on arrival and stand idle; swimming and flying keep going.
  const frames =
    figure.kind === 'pixel'
      ? legs(0, '1;0') + legs(1, '0;1')
      : action === 'walk' || action === 'run'
        ? model(action, { until: moveDur }) + model('idle', { from: moveDur })
        : model(action)

  let inner = ''
  // The 3D model bakes its own hops, digging and steps into its frames.
  const baked = figure.kind === '3d'
  switch (baked && (action === 'dig' || action === 'celebrate' || action === 'walk' || action === 'run') ? 'baked' : action) {
    case 'swim':
    case 'fly':
      inner = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${U};0 0" dur="1.2s" repeatCount="indefinite" additive="sum"/>`
      break
    case 'dig':
      inner = `<animateTransform attributeName="transform" type="rotate" values="-6 ${HERO_W / 2} ${HERO_H};6 ${HERO_W / 2} ${HERO_H};-6 ${HERO_W / 2} ${HERO_H}" dur=".4s" repeatCount="indefinite" additive="sum"/>`
      break
    case 'inspect':
      inner = `<animateTransform attributeName="transform" type="translate" values="0 0;-${U * 2} 0;0 0;${U * 2} 0;0 0" dur="3s" repeatCount="indefinite" additive="sum"/>`
      break
    case 'celebrate':
      inner = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -16;0 0" keyTimes="0;.4;1" dur=".7s" repeatCount="indefinite" additive="sum"/>`
      break
    case 'walk':
    case 'run':
      inner = steps
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${U / 2}" dur="${step}s" calcMode="discrete" repeatCount="${steps}" additive="sum"/>`
        : ''
      break
  }

  let extras = ''
  // The pixel sprite thinks in dots; the 3D Claude's caption already sits where they would.
  if (action === 'think' && figure.kind === 'pixel') {
    extras = [0, 1, 2]
      .map(
        i =>
          `<rect x="${HERO_W + 2 + i * 6}" y="-6" width="${U}" height="${U}" fill="${PAPER}"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.3;.8;1" dur="1.5s" begin="${i * 0.3}s" repeatCount="indefinite"/></rect>`,
      )
      .join('')
  } else if (action === 'dig') {
    extras = [0, 1, 2, 3]
      .map(
        i =>
          `<rect x="${HERO_W / 2}" y="${HERO_H - 2}" width="${U}" height="${U}" fill="#7a4a2b"><animateTransform attributeName="transform" type="translate" values="0 0;${(i - 1.5) * 14} -18;${(i - 1.5) * 22} 4" dur=".9s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
      )
      .join('')
  } else if (action === 'celebrate') {
    extras = [0, 1, 2, 3, 4]
      .map(
        i =>
          `<rect x="${i * 12}" y="-4" width="3" height="3" fill="${['#e3b341', '#e05252', '#6fc2c9', '#5e9c4a', '#7b5fb5'][i]}"><animateTransform attributeName="transform" type="translate" values="0 0;${(i - 2) * 6} -20" dur="1s" begin="${i * 0.15}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1s" begin="${i * 0.15}s" repeatCount="indefinite"/></rect>`,
      )
      .join('')
  }

  const travel = isMoving
    ? `<animateTransform attributeName="transform" type="translate" values="${fromX} ${baseY};${toX} ${baseY}" dur="${n(moveDur)}s" fill="freeze"/>`
    : ''
  const at = isMoving ? fromX : toX
  const svg =
    `<g transform="translate(${at} ${baseY})">${travel}` +
    `<g>${inner}<g transform="${flip.trim() || 'translate(0 0)'}">${frames}</g>${extras}</g></g>`
  return { svg, startX: isMoving ? fromX : toX, endX: toX, endY: baseY, arrive: isMoving ? moveDur : 0 }
}

// ---------------------------------------------------------------- caption

type P = [number, number]

/** The cartoon paper the caption is cut from: a soft drop shadow, an ink outline, then the paper. */
export type Tone = 'work' | 'trouble' | 'milestone'
const MONO_FONT = "Monocraft, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
const MONO_FACE =
  `<defs><style>@font-face{font-family:Monocraft;font-weight:400;src:url(data:font/woff2;base64,${MONOCRAFT}) format("woff2")}` +
  `@font-face{font-family:Monocraft;font-weight:700;src:url(data:font/woff2;base64,${MONOCRAFT_BOLD}) format("woff2")}</style></defs>`
const CARD = '#f6f1e7'
const CARD_INK = '#2b2420'
const paper = (shape: string) =>
  `<g transform="translate(1.2 1.8)" fill="black" opacity=".22">${shape}</g>` +
  `<g fill="${CARD_INK}" stroke="${CARD_INK}" stroke-width="2.2" stroke-linejoin="round">${shape}</g><g fill="${CARD}">${shape}</g>`

/** What a word of the caption is, so it can be set apart: the bubble stays the same, the words change. */
type Kind = 'plain' | 'code' | 'path' | 'fn' | 'num' | 'bad' | 'good' | 'face'
const KIND: Record<Exclude<Kind, 'plain'>, string> = {
  code: 'fill="#186a5a"',
  path: 'fill="#2b5f9e"',
  fn: 'fill="#7b3fa0"',
  num: 'fill="#b5541a" font-weight="700"',
  bad: 'fill="#b3261e" font-weight="700"',
  good: 'fill="#2e7d32" font-weight="700"',
  face: 'fill="#c4613f"',
}
const FACE = /^(\^_\^|\^\^;?|>_<|>\.<|o_O|O_o|o\.O|:-?[)(DPpO3|/]|;-?\)|[xX]D|T_T|-_-|\._\.|\\o\/|<3|¯\\_\(ツ\)_\/¯|\(•_•\)|\(⌐■_■\)|->|=>|<-|~>|>>>|\.\.\.|\[(OK|ok|WIP|TODO|DONE)\]|\/\/|#!|\$|&&|\|\|)$/
const BAD = /^(✗|FAIL(ED)?|failed|failing|fails|broke|broken|crash(ed|es)?|red|\w*Error|\w*Exception|N\+1|panic|segfault|404|500)$/
const GOOD = /^(✓|PASS(ED)?|passed|passes|passing|green|clean|fixed|ships?|shipped|done|OK|merged|liftoff|LGTM)$/i
const NUM = /^[~+\-]?\d[\d.,]*(%|x|×|s|ms|kb|mb|gb|k)?$|^\d+\/\d+$/i
const FN = /^[\w.$#]+\(\)$/
const PATH = /^[\w@~./-]*\w\.(tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|json|ya?ml|toml|css|scss|html|md|sql|sh|lock|env|test\.ts)$|^~?\.?\/?[\w@.-]+\/[\w@./-]*$/
const CMD = /^(npm|npx|pnpm|yarn|bun|git|pytest|tsc|eslint|cargo|go|make|pip|docker|curl|gh)$|^--?\w/

type Word = { lead: string; core: string; tail: string; kind: Kind }

/** The caption as words with their kinds. `backticks` mark code, and are not shown. */
function words(text: string, tone: Tone | undefined): Word[] {
  const out: Word[] = []
  // The tone leads the caption as a mark, unless the narrator already wrote one.
  const mark = tone === 'trouble' ? '✗' : tone === 'milestone' ? '✓' : ''
  if (mark && !text.trimStart().startsWith(mark)) out.push({ lead: '', core: mark, tail: '', kind: tone === 'trouble' ? 'bad' : 'good' })
  let inCode = false
  for (const raw of text.split(' ').filter(Boolean)) {
    const opens = raw.startsWith('`')
    const ticks = (raw.match(/`/g) ?? []).length
    const code = inCode || opens
    if (ticks % 2 === 1) inCode = !inCode
    const bare = raw.replace(/`/g, '')
    if (!bare) continue
    if (FACE.test(bare)) {
      out.push({ lead: '', core: bare, tail: '', kind: code ? 'code' : 'face' })
      continue
    }
    // A call keeps its own brackets; only what follows them is punctuation.
    const call = /^(.*\(\))([.,;:!?]*)$/.exec(bare)
    const m = call && FN.test(call[1] ?? '') ? ['', '', call[1], call[2]] : /^([("'[]*)(.*?)([.,;:!?)"'\]]*)$/.exec(bare)
    const [lead, core, tail] = m ? [m[1] ?? '', m[2] ?? '', m[3] ?? ''] : ['', bare, '']
    const kind: Kind = !core
      ? 'plain'
      : code || CMD.test(core)
        ? 'code'
        : BAD.test(core)
          ? 'bad'
          : GOOD.test(core)
            ? 'good'
            : FN.test(core)
              ? 'fn'
              : PATH.test(core)
                ? 'path'
                : NUM.test(core)
                  ? 'num'
                  : 'plain'
    out.push({ lead, core, tail, kind })
  }
  return out
}
/** Columns a string takes in a monospace font: East Asian wide characters take two. */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/g
const cols = (t: string) => t.length + (t.match(WIDE)?.length ?? 0)
const wordLen = (w: Word) => cols(w.lead) + cols(w.core) + cols(w.tail)

/** Greedy wrap of words into lines of at most `width` characters; a word longer than the line is cut. */
function wrapWords(list: readonly Word[], width: number): Word[][] {
  const lines: Word[][] = []
  let line: Word[] = []
  let len = 0
  for (const w0 of list) {
    const w = wordLen(w0) > width ? { ...w0, core: w0.core.slice(0, Math.max(1, width - w0.lead.length - w0.tail.length)) } : w0
    if (line.length && len + 1 + wordLen(w) > width) {
      lines.push(line)
      line = []
      len = 0
    }
    len += (line.length ? 1 : 0) + wordLen(w)
    line.push(w)
  }
  if (line.length) lines.push(line)
  return lines
}
const lineLen = (line: readonly Word[]) => line.reduce((t, w) => t + wordLen(w), 0) + line.length - 1
const lineSvg = (line: readonly Word[]) =>
  line.map(w => escapeXml(w.lead) + (w.kind === 'plain' ? escapeXml(w.core) : `<tspan ${KIND[w.kind]}>${escapeXml(w.core)}</tspan>`) + escapeXml(w.tail)).join(' ')

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** Where a prop and its label sit while it stays put; a scrolling prop crosses the whole stage and blocks nothing. */
function propRects(prop: FablesProp, floor: number, sw: number, unit: number): Rect[] {
  if (prop.motion === 'scroll') return []
  const art = artFor(prop)
  const w = widthOf(art.rows) * unit
  const h = art.rows.length * unit
  const x = Math.round(((sw - w) * prop.x) / 100)
  const y = prop.y === 'ground' ? floor - h : prop.y === 'air' ? 58 - h / 2 : 8
  const reach = prop.motion === 'drift' ? 24 : prop.motion === 'bob' ? 0 : 2
  const rects: Rect[] = [{ x: x - 2, y: y - 4, w: w + reach + 4, h: h + 6 }]
  if (prop.label) {
    const lw = prop.label.length * 5 + 8
    rects.push({ x: Math.min(sw - lw - 2, Math.max(2, x + w / 2 - lw / 2)), y: Math.max(2, y - 13), w: lw, h: 11 })
  }
  return rects
}

/**
 * The speech bubble. It stays with Claude: of the places just beside and just
 * above Claude it takes the one that covers the least of Claude, the props,
 * the chapter tag and the scene's focal points, and while Claude walks it
 * travels along. On the rich stage it is cut from cartoon paper with a tail
 * pointing back at Claude, and kinds of words (files, functions, commands,
 * numbers, failures, successes, ASCII faces) are set apart in the text.
 */
function caption(
  text: string,
  hero: { startX: number; x: number; y: number; arrive: number; jump: number; sway: number },
  idPrefix: string,
  sw: number,
  look: Look,
  avoid: readonly Rect[],
  tone?: Tone,
): string {
  const { fill, stroke, radius } = look.caption
  const onPaper = tone !== undefined
  const ink = onPaper ? CARD_INK : look.caption.ink
  const heroX = hero.x
  const heroY = hero.y
  // Claude's box, reaching as high as Claude jumps.
  const heroBox: Rect = { x: heroX - 4 - hero.sway, y: heroY - 8 - hero.jump, w: HERO_W + 8 + hero.sway * 2, h: HERO_H + 12 + hero.jump }
  const top = heroY + HERO_H - MODEL_STAGE_H - hero.jump
  const list = onPaper ? words(text, tone) : text.split(' ').filter(Boolean).map((core): Word => ({ lead: '', core, tail: '', kind: 'plain' }))
  // On paper the caption is set in Monocraft, whose pixel is a ninth of its size: at 9 units
  // its pixels land on whole device pixels in the band. Elsewhere the look's own type.
  const type = onPaper ? { font: MONO_FONT, size: 9, charW: 6, line: 12, base: 13 } : { font: look.font, size: 9.5, charW: look.charW, line: 11, base: 12 }
  // Claude's path while it walks: the bubble must stay clear of Claude at every point of it.
  const KEYS = [0, 0.2, 0.4, 0.6, 0.8, 1]
  const heroAt = (k: number) => hero.startX + (heroX - hero.startX) * k
  const boxAt = (k: number): Rect => ({ ...heroBox, x: heroAt(k) - 4 - hero.sway })
  const clampX = (v: number, w: number) => Math.min(sw - w - 2, Math.max(2, v))
  // A narrower wrap, taller, is tried when the wide one finds no clear place.
  let best = { x: 2, y: 4, ox: 0, score: Infinity, lines: [] as Word[][], w: 0, h: 0 }
  for (const [wi, width] of [32, 25, 19].entries()) {
    const lines = wrapWords(list, width).slice(0, wi === 0 ? 3 : 4)
    const w = Math.ceil(Math.max(...lines.map(lineLen)) * type.charW + 14)
    const h = lines.length * type.line + 7
    const beside = Math.min(GROUND_Y - h - 4, Math.max(4, top - 4))
    const above = top - h - 8
    const below = heroY + HERO_H + 9
    // Where the bubble sits relative to Claude: beside it at head height, or above it.
    const spots: P[] = [
      [HERO_W + 8, beside],
      [-w - 8, beside],
      [HERO_W / 2 - w / 2, above],
      [HERO_W - 10, above],
      [-w + 10, above],
      // Under Claude, for when it flies and there is no room above it.
      [HERO_W / 2 - w / 2, below],
    ]
    for (const [si, [ox, y0]] of spots.entries()) {
      const y = y0 === below ? Math.min(H - h - 3, y0) : Math.min(GROUND_Y - h - 4, Math.max(4, y0))
      const x = clampX(heroX + ox, w)
      // Covering Claude at any moment is ruled out in all but name; the rest is preference.
      const covers = KEYS.reduce((t, k) => t + overlap({ x: clampX(heroAt(k) + ox, w), y, w, h }, boxAt(k)), 0)
      const score = covers * 50 + avoid.reduce((t, a) => t + overlap({ x, y, w, h }, a) * 3, 0) + si * 6 + wi * 40
      if (score < best.score) best = { x, y, ox, score, lines, w, h }
    }
  }
  const { lines, w, h, x, y, ox } = best
  let delay = 0.2
  const rows = lines
    .map((line, i) => {
      const dur = Math.max(0.2, lineLen(line) * 0.03)
      const id = `${idPrefix}${i}`
      const reveal =
        `<clipPath id="${id}"><rect x="${n(x)}" y="${n(y + 2 + i * type.line)}" width="0" height="${type.line + 2}">` +
        `<animate attributeName="width" from="0" to="${w}" dur="${n(dur)}s" begin="${n(delay)}s" fill="freeze"/></rect></clipPath>`
      delay += dur
      return reveal + `<text clip-path="url(#${id})" x="${n(x + 7)}" y="${n(y + type.base + i * type.line)}" font-family="${type.font}" font-size="${type.size}" fill="${ink}">${lineSvg(line)}</text>`
    })
    .join('')
  // While Claude walks, the bubble walks with it along the same path, held inside the stage.
  const follow =
    hero.arrive && hero.startX !== heroX
      ? ` transform="translate(${n(clampX(heroAt(0) + ox, w) - x)} 0)"><animateTransform attributeName="transform" type="translate" values="${KEYS.map(k => `${n(clampX(heroAt(k) + ox, w) - x)} 0`).join(';')}" keyTimes="${KEYS.join(';')}" dur="${n(hero.arrive)}s" fill="freeze"/`
      : ''
  const fade = `<animate attributeName="opacity" values="0;1" dur=".2s" fill="freeze"/>`
  if (onPaper) {
    const hx = heroX + HERO_W / 2
    const hy = top + 10
    let base: [P, P]
    if (x >= hx) base = [[x + 2, y + h - 13], [x + 2, y + h - 5]]
    else if (x + w <= hx) base = [[x + w - 2, y + h - 13], [x + w - 2, y + h - 5]]
    else {
      const cx = Math.min(x + w - 12, Math.max(x + 12, hx))
      base = y + h < hy ? [[cx - 4, y + h - 2], [cx + 4, y + h - 2]] : [[cx - 4, y + 2], [cx + 4, y + 2]]
    }
    const mx = (base[0][0] + base[1][0]) / 2
    const my = (base[0][1] + base[1][1]) / 2
    const len = Math.hypot(hx - mx, hy - my) || 1
    const reach = Math.min(10, len * 0.6)
    const tip: P = [mx + ((hx - mx) / len) * reach, my + ((hy - my) / len) * reach]
    const shape =
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="6"/>` +
      `<path d="M${n(base[0][0])} ${n(base[0][1])}L${n(tip[0])} ${n(tip[1])}L${n(base[1][0])} ${n(base[1][1])}z"/>`
    return `<g data-part="speech" data-tone="${tone}"${follow || ''}>${MONO_FACE}${paper(shape)}${rows}${fade}</g>`
  }
  return `<g data-part="speech"${follow || ''}><rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>${rows}${fade}</g>`
}

function title(text: string, color: string, look: Look): string {
  const w = text.length * (look.charW - 0.3) + 16
  const inset = look.inset ?? 0
  return (
    `<g font-family="${look.font}" font-size="9" fill="${color}" transform="translate(${inset} ${inset})">` +
    `<path d="M6 12V6h6M${n(6 + w)} 12V6h-6" fill="none" stroke="${color}" stroke-width="1"/>` +
    `<text x="14" y="10">${escapeXml(text)}</text></g>`
  )
}

// ---------------------------------------------------------------- the scene

/** The stage width for a box of the given shape, so the scene fills it exactly. */
export function stageWidth(width: number, height: number): number {
  const fit = Number.isFinite(width / height) && width > 0 && height > 0 ? (width * H) / height : W
  return Math.round(Math.min(MAX_W, Math.max(MIN_W, fit)))
}

/**
 * Compiles a validated scene into one self-animating SVG document (SMIL), so
 * the desktop plays it with no redraws. The stage takes the box's shape
 * (`width` by `height` CSS pixels; absent, the default stage at its own size).
 * `look` names the graphic style (looks.ts); absent, plain pixel art.
 * Stays under the Svg element's limit by shedding particles, then props, if a
 * scene is too rich.
 */
export function sceneToSvg(
  scene: FablesScene,
  options: { width?: number; height?: number; look?: string; figure?: 'auto' | 'pixel' | '3d' } = {},
): string {
  const sw = options.width && options.height ? stageWidth(options.width, options.height) : W
  const width = options.width ?? sw
  const height = options.height ?? Math.round((width * H) / sw)
  const look = lookFor(options.look)
  const paint = (layer: Layer, svg: string) => (look.color ? remapColors(svg, hex => look.color?.(hex, layer) ?? hex) : svg)
  const tint = (layer: Layer, hex: string) => look.color?.(hex, layer) ?? hex
  const rand = rng(`${scene.backdrop}|${scene.caption}`)
  const wants = options.figure && options.figure !== 'auto' ? options.figure : look.figure
  const figure: Figure = wants === '3d' ? { kind: '3d', paint: look.facePaint ?? 'solid' } : { kind: 'pixel', cell: look.cell }
  // The 3D Claude gets scenery and props with depth to match; the pixel sprite keeps the flat pixel stage.
  const rich = figure.kind === '3d'
  const stageAt = (lean: boolean) => (rich ? richBackdrop(scene, rng(`${scene.backdrop}|${scene.caption}|stage`), sw, GROUND_Y, W, lean) : flatStage(backdrop(scene, rand, sw)))
  let stage = stageAt(false)
  const dust = particles(scene, rand, sw)
  // The rich stage tells the story in words alone: no props stand about the scene.
  const props = rich ? [] : scene.props.map((p, i) => propSvg(p, stage.floor, i, sw, look.cell, look))
  const plan = hero(scene, stage.floor, sw, figure)
  const accent = scene.palette.accent ?? '#d9d4c7'
  const idPrefix = `fable${Math.floor(rand() * 2 ** 31).toString(36)}-`
  const sky = tint('sky', stage.sky)
  const ground = tint('ground', stage.ground)
  // What the speech bubble keeps clear of: the props still drawn, their labels, the chapter tag.
  const avoid = (propCount: number): Rect[] => [
    ...scene.props.slice(0, propCount).flatMap(p => propRects(p, stage.floor, sw, U)),
    ...(scene.title ? [{ x: 0, y: 0, w: scene.title.length * look.charW + 34 + (look.inset ?? 0), h: 16 + (look.inset ?? 0) }] : []),
    ...stage.keep,
  ]
  const fore = (withDust: boolean, propCount: number) =>
    paint('fore', (withDust ? dust : '') + props.slice(0, propCount).join('') + plan.svg)

  // Sky and ground run far past the stage, so a box the stage could not match
  // (past MIN_W or MAX_W) shows more sky and ground instead of the frame's page.
  const build = (withDust: boolean, propCount: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${H}" width="${width}" height="${height}" ` +
    `shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" style="display:block;background:${ground}">` +
    (look.defs ? `<defs>${look.defs}</defs>` : '') +
    `<rect x="${-sw * 4}" y="${-H * 4}" width="${sw * 9}" height="${H * 4 + GROUND_Y}" fill="${sky}"/>` +
    (look.under?.(sw, H, GROUND_Y) ?? '') +
    paint('back', stage.back) +
    `<rect x="${-sw * 4}" y="${stage.groundTop}" width="${sw * 9}" height="${H * 4}" fill="${ground}"/>` +
    // Ground-level scenery goes down before anything that stands on it.
    paint('back', stage.near) +
    (look.foreFilter ? `<g filter="url(#${look.foreFilter})">${fore(withDust, propCount)}</g>` : fore(withDust, propCount)) +
    stage.lens +
    (look.over?.(sw, H, GROUND_Y) ?? '') +
    (scene.title ? title(scene.title, look.titleColor ?? (rich ? '#efe6d2' : accent), rich ? { ...look, font: MONO_FONT, charW: 6.3 } : look) : '') +
    caption(scene.caption, { startX: plan.startX, x: plan.endX, y: plan.endY, arrive: plan.arrive, jump: scene.hero.action === 'celebrate' ? 16 : scene.hero.action === 'fly' ? 2 : 0, sway: scene.hero.action === 'inspect' ? 2 * U : 0 }, idPrefix, sw, look, avoid(propCount), rich ? (scene.tone ?? (scene.hero.action === 'celebrate' ? 'milestone' : 'work')) : undefined) +
    `</svg>`

  const propsShown = props.length
  let svg = build(true, propsShown)
  // Over the limit, the scenery thins out first, then the particles, and only then the props.
  if (svg.length > BUDGET && rich) {
    stage = stageAt(true)
    svg = build(true, propsShown)
  }
  if (svg.length > BUDGET) svg = build(false, propsShown)
  // Still over (a look whose colors spell long), the rich stage gives way to the flat one
  // before any prop goes; the flat stage always fits.
  if (svg.length > BUDGET && rich) {
    stage = flatStage(backdrop(scene, rand, sw))
    svg = build(false, propsShown)
  }
  for (let count = propsShown - 1; svg.length > BUDGET && count >= 0; count--) svg = build(false, count)
  return svg
}
