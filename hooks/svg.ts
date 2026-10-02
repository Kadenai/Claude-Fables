import type { FablesProp, FablesScene } from '../types'

import { type FacePaint, motionSvg } from './hero3d'
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
const BUDGET = 120000

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
    case 'sea': {
      sky = '#1d2530'
      ground = '#1f4e73'
      floor = GROUND_Y - 4
      const wave = Array.from({ length: sw / (U * 4) + 2 }, (_, i) => `M${i * U * 4} 0h${U * 2}v${U}h-${U * 2}z`).join('')
      front.push(
        `<g><path fill="#4a90c2" d="${wave}" transform="translate(0 ${GROUND_Y - U})"/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;-${U * 4} 0" dur="1.2s" repeatCount="indefinite"/></g>`,
      )
      parts.push(`<circle cx="${sw - 80}" cy="28" r="12" fill="#e3d9a0" opacity=".85"/>`)
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
    case 'rails': {
      sky = '#23232a'
      ground = '#2c2b2f'
      const ties = Array.from({ length: sw / (U * 4) + 2 }, (_, i) => `M${i * U * 4} 0h${U * 2}v${U}h-${U * 2}z`).join('')
      front.push(
        `<rect x="0" y="${GROUND_Y}" width="${sw}" height="2" fill="#8a8780"/>`,
        `<g><path fill="#5a3520" d="${ties}" transform="translate(0 ${GROUND_Y + 3})"/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;-${U * 4} 0" dur=".5s" repeatCount="indefinite"/></g>`,
      )
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
const flatStage = (s: Stage) => ({ sky: s.sky, ground: s.ground, floor: s.floor, back: s.back, near: s.front })

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

function label(text: string, cx: number, y: number, color: string, sw: number): string {
  const w = text.length * 5 + 8
  const x = Math.min(sw - w - 2, Math.max(2, cx - w / 2))
  const top = Math.max(2, y - 13)
  return (
    `<rect x="${n(x)}" y="${n(top)}" width="${w}" height="11" fill="${INK}" stroke="${color}" stroke-width="1"/>` +
    `<text x="${n(x + 4)}" y="${n(top + 8)}" font-family="${FONT}" font-size="8" fill="${color}">${escapeXml(text)}</text>`
  )
}

/**
 * One prop. `solid` gives it depth to stand beside the 3D Claude: two darkened
 * copies behind it, offset up and right as the scenery's boxes are, and a
 * contact shadow under it when it stands on the ground.
 */
function propSvg(prop: FablesProp, floor: number, index: number, sw: number, cell: Cell, solid: boolean): string {
  const art = artFor(prop)
  const w = widthOf(art.rows) * U
  const h = art.rows.length * U
  const x = Math.round(((sw - w) * prop.x) / 100)
  const y = prop.y === 'ground' ? floor - h : prop.y === 'air' ? 58 - h / 2 : 8
  const cx = x + w / 2
  const cy = y + h / 2
  const id = `fp${index}`
  const sprite = `<g${solid ? ` id="${id}"` : ''} transform="translate(${x} ${n(y)}) scale(${U})">${pixelPaths(art.rows, art.colorOf, cell)}</g>`
  const depth = solid
    ? [2, 1].map(k => `<use href="#${id}" transform="translate(${n(k * 1.6)} ${n(-k * 0.9)})" filter="url(#sc-deep)"/>`).join('')
    : ''
  const shade = solid && prop.y === 'ground' ? `<ellipse cx="${n(cx + 2)}" cy="${n(floor)}" rx="${n(w * 0.55)}" ry="2.6" fill="black" opacity=".28"/>` : ''
  // The sprite is defined first so the copies behind it can refer to it, then drawn again on top.
  const body = solid ? `<defs>${sprite}</defs>${depth}<use href="#${id}"/>` : sprite
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
  const tag = prop.label ? label(prop.label, cx, y, prop.color ?? '#d9d4c7', sw) : ''
  return `${shade}<g>${body}${tag}${motion}</g>`
}

// ---------------------------------------------------------------- hero

const HERO_W = 13 * U
const HERO_H = 9 * U
const heroColor = (k: string) => PALETTE[k]

type HeroPlan = { svg: string; endX: number; endY: number }

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
  if (action === 'think') {
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
  return { svg, endX: toX, endY: baseY }
}

// ---------------------------------------------------------------- caption

/** Greedy word wrap; a word longer than the line is cut. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const piece = word.length > width ? word.slice(0, width) : word
    if (line === '') line = piece
    else if (line.length + 1 + piece.length <= width) line += ` ${piece}`
    else {
      lines.push(line)
      line = piece
    }
  }
  if (line) lines.push(line)
  return lines
}

function caption(text: string, heroX: number, heroY: number, idPrefix: string, sw: number, look: Look): string {
  const { fill, stroke, ink, radius } = look.caption
  const lines = wrap(text, 34).slice(0, 3)
  const w = Math.ceil(Math.max(...lines.map(l => l.length)) * look.charW + 14)
  const h = lines.length * 11 + 8
  const rightX = heroX + HERO_W + 8
  const x = rightX + w <= sw - 2 ? rightX : Math.max(2, heroX - w - 8)
  const y = Math.max(4, Math.min(heroY - 4, GROUND_Y - h - 4) - (heroY > 40 ? 16 : 0))
  let delay = 0.2
  const rows = lines
    .map((line, i) => {
      const dur = Math.max(0.2, line.length * 0.03)
      const id = `${idPrefix}${i}`
      const reveal =
        `<clipPath id="${id}"><rect x="${n(x)}" y="${n(y + 2 + i * 11)}" width="0" height="11">` +
        `<animate attributeName="width" from="0" to="${w}" dur="${n(dur)}s" begin="${n(delay)}s" fill="freeze"/></rect></clipPath>`
      delay += dur
      return (
        reveal +
        `<text clip-path="url(#${id})" x="${n(x + 7)}" y="${n(y + 12 + i * 11)}" font-family="${look.font}" font-size="9.5" fill="${ink}">${escapeXml(line)}</text>`
      )
    })
    .join('')
  return (
    `<g><rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>${rows}` +
    `<animate attributeName="opacity" values="0;1" dur=".2s" fill="freeze"/></g>`
  )
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
  const stage = rich ? richBackdrop(scene, rand, sw, GROUND_Y, W) : flatStage(backdrop(scene, rand, sw))
  const groundTop = rich ? stage.floor : GROUND_Y
  const dust = particles(scene, rand, sw)
  const props = scene.props.map((p, i) => propSvg(p, stage.floor, i, sw, look.cell, rich))
  const plan = hero(scene, stage.floor, sw, figure)
  const accent = scene.palette.accent ?? '#d9d4c7'
  const idPrefix = `fable${Math.floor(rand() * 2 ** 31).toString(36)}-`
  const sky = tint('sky', stage.sky)
  const ground = tint('ground', stage.ground)
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
    `<rect x="${-sw * 4}" y="${groundTop}" width="${sw * 9}" height="${H * 4}" fill="${ground}"/>` +
    // Ground-level scenery goes down before anything that stands on it.
    paint('back', stage.near) +
    (look.foreFilter ? `<g filter="url(#${look.foreFilter})">${fore(withDust, propCount)}</g>` : fore(withDust, propCount)) +
    (look.over?.(sw, H, GROUND_Y) ?? '') +
    (scene.title ? title(scene.title, look.titleColor ?? accent, look) : '') +
    caption(scene.caption, plan.endX, plan.endY, idPrefix, sw, look) +
    `</svg>`

  let svg = build(true, props.length)
  if (svg.length > BUDGET) svg = build(false, props.length)
  for (let count = props.length - 1; svg.length > BUDGET && count >= 0; count--) svg = build(false, count)
  return svg
}
