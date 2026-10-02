/**
 * Rich scenery for the styles that draw the 3D Claude: the same nine backdrops,
 * built in depth layers (far, middle, near) from shaded boxes lit from the upper
 * left like the model, with gradient skies, haze and glows.
 *
 * Shading is drawn in the named colors `black` and `white` at partial opacity.
 * A look's palette remap only touches hex colors, so the shading survives every
 * look and darkens or lightens whatever color the look paints beneath it.
 */
import type { FablesScene } from '../types'

export type Stage = {
  sky: string
  ground: string
  /** Where the hero's and props' feet rest. */
  floor: number
  /** Behind the ground: sky details and far, middle scenery. */
  back: string
  /** On the ground, behind everything that stands there. */
  near: string
}

const r1 = (v: number) => (Math.round(v * 10) / 10).toString()

/** Shared gradients: shading overlays in black and white, so no look recolors them. */
const DEFS =
  `<defs>` +
  `<linearGradient id="sc-air" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="black" stop-opacity=".38"/><stop offset=".7" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity=".14"/></linearGradient>` +
  `<linearGradient id="sc-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity=".1"/><stop offset=".25" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".42"/></linearGradient>` +
  `<linearGradient id="sc-round" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity=".22"/><stop offset="1" stop-color="black" stop-opacity=".3"/></linearGradient>` +
  `<radialGradient id="sc-glow"><stop offset="0" stop-color="white" stop-opacity=".55"/><stop offset=".4" stop-color="white" stop-opacity=".16"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>` +
  // Darkens a copy of a sprite into the solid depth behind it.
  `<filter id="sc-deep"><feColorMatrix type="matrix" values=".58 0 0 0 0  0 .58 0 0 0  0 0 .62 0 0  0 0 0 1 0"/></filter>` +
  `<radialGradient id="sc-orb" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="white" stop-opacity=".3"/><stop offset=".55" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".55"/></radialGradient>` +
  `</defs>`

/** A box seen from the front and a little from the upper right: front, top and right faces, lit from the upper left. */
function box(x: number, y: number, w: number, h: number, d: number, color: string, extra = ''): string {
  const dx = d
  const dy = -d * 0.55
  const outline = `M${r1(x)} ${r1(y + h)}V${r1(y)}l${r1(dx)} ${r1(dy)}h${r1(w)}v${r1(h)}l${r1(-dx)} ${r1(-dy)}z`
  const top = `M${r1(x)} ${r1(y)}l${r1(dx)} ${r1(dy)}h${r1(w)}l${r1(-dx)} ${r1(-dy)}z`
  const side = `M${r1(x + w)} ${r1(y)}l${r1(dx)} ${r1(dy)}v${r1(h)}l${r1(-dx)} ${r1(-dy)}z`
  return (
    `<path fill="${color}" d="${outline}"/>` +
    `<path fill="white" fill-opacity=".2" d="${top}"/>` +
    `<path fill="black" fill-opacity=".32" d="${side}"/>` +
    extra
  )
}

/** A ridge of peaks across the stage, its left slopes lit and right slopes shaded. */
function ridge(sw: number, base: number, rand: () => number, o: { peaks: number; min: number; max: number; color: string; opacity: number; snow?: string }): string {
  const xs: number[] = []
  const step = sw / o.peaks
  for (let i = -1; i <= o.peaks + 1; i++) xs.push(i * step + (rand() - 0.5) * step * 0.5)
  let shape = `M${r1(xs[0] ?? 0)} ${base}`
  let shade = ''
  let snow = ''
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i] ?? 0
    const b = xs[i + 1] ?? 0
    const peakX = a + (b - a) * (0.35 + rand() * 0.3)
    const peakY = base - (o.min + rand() * (o.max - o.min))
    shape += `L${r1(peakX)} ${r1(peakY)}L${r1(b)} ${base}`
    shade += `M${r1(peakX)} ${r1(peakY)}L${r1(b)} ${base}L${r1(peakX + (b - peakX) * 0.15)} ${base}z`
    if (o.snow) {
      const k = 0.22
      snow += `M${r1(peakX)} ${r1(peakY)}L${r1(peakX + (b - peakX) * k)} ${r1(peakY + (base - peakY) * k)}L${r1(peakX)} ${r1(peakY + (base - peakY) * k * 0.7)}L${r1(peakX - (peakX - a) * k)} ${r1(peakY + (base - peakY) * k)}z`
    }
  }
  return (
    `<g opacity="${o.opacity}"><path fill="${o.color}" d="${shape}z"/><path fill="black" fill-opacity=".28" d="${shade}"/>` +
    (snow ? `<path fill="${o.snow}" d="${snow}"/>` : '') +
    `</g>`
  )
}

const glow = (cx: number, cy: number, r: number, opacity = 1) =>
  `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="url(#sc-glow)" opacity="${opacity}"/>`

/** A lit sphere: base color, then a shading overlay that puts the light upper left. */
const orb = (cx: number, cy: number, r: number, color: string) =>
  `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${color}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="url(#sc-orb)"/>`

const count = (n: number, sw: number, w: number) => Math.max(1, Math.round((n * sw) / w))

export function richBackdrop(scene: FablesScene, rand: () => number, sw: number, ground: number, w: number): Stage {
  const back: string[] = [DEFS]
  const near: string[] = []
  let sky = '#262624'
  let soil = '#3a3833'
  let floor = ground

  switch (scene.backdrop) {
    case 'forest': {
      sky = '#20302a'
      soil = '#3c6e34'
      for (let i = 0; i < 4; i++) back.push(`<rect x="${r1(-sw)}" y="${18 + i * 9}" width="${sw * 3}" height="2" fill="white" opacity=".025"/>`)
      back.push(ridge(sw, ground, rand, { peaks: 5, min: 26, max: 44, color: '#2a4a36', opacity: 0.6 }))
      // A far tree line: rounded crowns, hazy.
      const crowns: string[] = []
      for (let x = -10; x < sw + 10; x += 9 + rand() * 6) crowns.push(`<ellipse cx="${r1(x)}" cy="${r1(ground - 14 - rand() * 6)}" rx="${r1(7 + rand() * 4)}" ry="${r1(9 + rand() * 5)}"/>`)
      back.push(`<g fill="#2b4a2c" opacity=".8">${crowns.join('')}</g>`)
      // Light shafts through the canopy.
      for (let i = 0; i < 3; i++) {
        const x = rand() * sw
        back.push(`<path d="M${r1(x)} 0h18l-46 ${ground}h-12z" fill="white" opacity=".045"/>`)
      }
      // Voxel trees: a trunk and two stacked canopy blocks.
      for (let i = 0; i < count(6, sw, w); i++) {
        const x = (sw * (i + 0.2 + rand() * 0.6)) / count(6, sw, w)
        const h = 26 + rand() * 18
        const cw = 26 + rand() * 12
        back.push(
          `<ellipse cx="${r1(x + 6)}" cy="${ground}" rx="${r1(cw * 0.55)}" ry="3" fill="black" opacity=".25"/>` +
            box(x, ground - h, 7, h, 4, '#5a3a24') +
            box(x - cw / 2 + 3.5, ground - h - 16, cw, 18, 8, '#3f7a3a') +
            box(x - cw / 2 + 8.5, ground - h - 28, cw - 10, 13, 6, '#4c8c44'),
        )
      }
      // Bushes, grass and mushrooms on the ground.
      for (let i = 0; i < count(8, sw, w); i++) {
        const x = rand() * sw
        near.push(box(x, ground - 7, 12 + rand() * 8, 7, 4, '#4f8f40'))
      }
      for (let x = 0; x < sw; x += 14 + rand() * 10) near.push(`<path d="M${r1(x)} ${ground}l2-6l2 6zM${r1(x + 4)} ${ground}l1.5-4l1.5 4z" fill="#6bab55"/>`)
      for (let i = 0; i < count(3, sw, w); i++) {
        const x = rand() * sw
        near.push(`<rect x="${r1(x + 2)}" y="${ground - 5}" width="2" height="5" fill="#ece9df"/><path d="M${r1(x)} ${ground - 4}a4 3.5 0 0 1 8 0z" fill="#e05252"/><circle cx="${r1(x + 3)}" cy="${ground - 6}" r=".9" fill="#ece9df"/>`)
      }
      break
    }
    case 'sea': {
      sky = '#1d2a3c'
      soil = '#1f4e73'
      floor = ground - 4
      const horizon = ground - 26
      back.push(glow(sw - 80, 26, 48, 0.8), orb(sw - 80, 26, 12, '#e3d9a0'))
      back.push(`<rect x="${-sw}" y="${horizon}" width="${sw * 3}" height="${ground - horizon}" fill="#245a82"/>`)
      back.push(`<rect x="${-sw}" y="${horizon}" width="${sw * 3}" height="${ground - horizon}" fill="url(#sc-soil)"/>`)
      // A far island with a lighthouse, and the moon's path on the water.
      const ix = sw * (0.15 + rand() * 0.25)
      back.push(
        `<path d="M${r1(ix - 40)} ${horizon}q40-16 80 0z" fill="#1a3a4a"/>` +
          box(ix + 8, horizon - 22, 6, 18, 3, '#ece9df', `<rect x="${r1(ix + 8)}" y="${horizon - 16}" width="6" height="3" fill="#e05252"/>`) +
          glow(ix + 11, horizon - 24, 14) +
          `<rect x="${r1(ix + 9)}" y="${horizon - 26}" width="4" height="4" fill="#e3d9a0"><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite"/></rect>`,
      )
      for (let i = 0; i < 6; i++) back.push(`<rect x="${r1(sw - 96 + rand() * 30)}" y="${r1(horizon + 3 + i * 4)}" width="${r1(10 + rand() * 18)}" height="1.4" fill="white" opacity=".22"/>`)
      // Rows of crests, nearer rows faster: a little parallax.
      for (const [k, y, dur] of [[0, horizon + 6, 6], [1, horizon + 14, 4], [2, ground - 4, 2.4]] as const) {
        const crest = Array.from({ length: Math.ceil(sw / 24) + 3 }, (_, i) => `M${i * 24} 0q6-${2 + k} 12 0`).join('')
        back.push(
          `<g><path d="${crest}" transform="translate(-24 ${y})" fill="none" stroke="white" stroke-opacity="${0.18 + k * 0.1}" stroke-width="${1 + k * 0.5}"/>` +
            `<animateTransform attributeName="transform" type="translate" values="0 0;-24 0" dur="${dur}s" repeatCount="indefinite"/></g>`,
        )
      }
      near.push(`<rect x="${-sw}" y="${ground - 1}" width="${sw * 3}" height="2" fill="white" opacity=".35"/>`)
      break
    }
    case 'space': {
      sky = '#100e1a'
      soil = '#4a4658'
      floor = 92
      // Nebulae, colored so a look recolors them, with a soft glow.
      for (const [cx, cy, rx, ry, color] of [[sw * 0.25, 30, 120, 40, '#54408a'], [sw * 0.7, 50, 150, 36, '#2a6a7a']] as const) {
        back.push(`<ellipse cx="${r1(cx)}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" opacity=".35"/><ellipse cx="${r1(cx)}" cy="${cy}" rx="${rx * 0.6}" ry="${ry * 0.55}" fill="${color}" opacity=".35"/>`)
      }
      for (let i = 0; i < count(50, sw, w); i++) back.push(`<rect x="${r1(rand() * sw)}" y="${r1(rand() * 88)}" width="${rand() < 0.15 ? 2 : 1}" height="${rand() < 0.15 ? 2 : 1}" fill="white" opacity="${r1(0.35 + rand() * 0.6)}"/>`)
      const px = sw * (0.55 + rand() * 0.3)
      back.push(
        `<ellipse cx="${r1(px)}" cy="40" rx="38" ry="7" fill="none" stroke="#c9a46a" stroke-width="3" opacity=".7"/>` +
          orb(px, 40, 22, '#7b5fb5') +
          `<path d="M${r1(px - 38)} 40a38 7 0 0 0 76 0" fill="none" stroke="#c9a46a" stroke-width="3" opacity=".9"/>`,
      )
      back.push(orb(sw * 0.12, 22, 7, '#8a8780'))
      // A cratered moon surface.
      near.push(`<rect x="${-sw}" y="${floor}" width="${sw * 3}" height="2" fill="white" opacity=".2"/>`)
      for (let i = 0; i < count(7, sw, w); i++) {
        const cx = rand() * sw
        const rx = 6 + rand() * 12
        near.push(`<ellipse cx="${r1(cx)}" cy="${r1(floor + 6 + rand() * 18)}" rx="${r1(rx)}" ry="${r1(rx * 0.3)}" fill="black" opacity=".3"/>`)
      }
      break
    }
    case 'city': {
      sky = '#1c2234'
      soil = '#3a3c45'
      back.push(glow(sw * 0.8, 20, 30, 0.5), orb(sw * 0.8, 20, 7, '#e8e3c8'))
      // Far skyline, hazy, with a few dim windows.
      let x = -10
      while (x < sw + 10) {
        const bw = 18 + rand() * 30
        const bh = 34 + rand() * 40
        back.push(`<rect x="${r1(x)}" y="${r1(ground - 8 - bh)}" width="${r1(bw - 2)}" height="${r1(bh)}" fill="#283048" opacity=".85"/>`)
        x += bw
      }
      // Middle buildings in depth, windows lit at random, a rooftop tank or antenna.
      x = -6
      while (x < sw + 6) {
        const bw = 30 + rand() * 34
        const bh = 30 + rand() * 46
        const top = ground - bh
        // Windows as two paths per building, lit and dark; one lit window blinks.
        let lit = ''
        let dark = ''
        let blink = ''
        for (let wy = top + 6; wy < ground - 8; wy += 9) {
          for (let wx = x + 5; wx < x + bw - 8; wx += 9) {
            const d = `M${r1(wx)} ${r1(wy)}h4v5h-4z`
            if (rand() < 0.42) {
              if (!blink && rand() < 0.2) blink = `<path d="${d}" fill="#e3b341"><animate attributeName="opacity" values=".9;.15;.9" dur="${r1(3 + rand() * 4)}s" repeatCount="indefinite"/></path>`
              else lit += d
            } else dark += d
          }
        }
        const wins = [`<path d="${lit}" fill="#e3b341" opacity=".9"/>`, `<path d="${dark}" fill="black" opacity=".25"/>`, blink]
        let roof = ''
        if (rand() < 0.35) roof = box(x + bw * 0.5, top - 10, 9, 10, 4, '#3a4058')
        else if (rand() < 0.4) roof = `<rect x="${r1(x + bw * 0.3)}" y="${r1(top - 18)}" width="1.5" height="18" fill="#5b5f6b"/><circle cx="${r1(x + bw * 0.3 + 0.75)}" cy="${r1(top - 18)}" r="1.6" fill="#e05252"><animate attributeName="opacity" values="1;.1;1" dur="1.6s" repeatCount="indefinite"/></circle>`
        back.push(box(x, top, bw - 8, bh, 8, '#2e3448', wins.join('') + roof))
        x += bw
      }
      // The street: a curb and street lamps, glowing.
      near.push(`<rect x="${-sw}" y="${ground}" width="${sw * 3}" height="3" fill="#5b5f6b"/><rect x="${-sw}" y="${ground}" width="${sw * 3}" height="1" fill="white" opacity=".25"/>`)
      for (let lx = 40 + rand() * 60; lx < sw; lx += 150 + rand() * 60) {
        near.push(`<rect x="${r1(lx)}" y="${ground - 30}" width="2" height="30" fill="#5b5f6b"/><rect x="${r1(lx - 3)}" y="${ground - 32}" width="8" height="3" fill="#5b5f6b"/>` + glow(lx + 1, ground - 29, 18, 0.7) + `<rect x="${r1(lx - 1)}" y="${ground - 29}" width="4" height="2" fill="#f3e2b0"/>`)
      }
      break
    }
    case 'desert': {
      sky = '#3a2c22'
      soil = '#c9a46a'
      const sx = 80 + rand() * (sw - 160)
      back.push(glow(sx, 30, 60, 0.9), orb(sx, 30, 14, '#f0c060'))
      // Mesas in the haze: flat tops, lit fronts, shaded right sides.
      for (let i = 0; i < count(3, sw, w); i++) {
        const mx = rand() * sw
        const mw = 50 + rand() * 60
        const mh = 22 + rand() * 18
        back.push(`<g opacity=".75">${box(mx, ground - mh, mw, mh, 10, '#9a6a44')}<path d="M${r1(mx)} ${r1(ground - mh + 5)}h${r1(mw)}" stroke="black" stroke-opacity=".15" stroke-width="2"/></g>`)
      }
      for (let i = 0; i < count(4, sw, w); i++) {
        const cx = rand() * sw
        const rx = 60 + rand() * 70
        const ry = 7 + rand() * 9
        back.push(`<ellipse cx="${r1(cx)}" cy="${ground}" rx="${r1(rx)}" ry="${r1(ry)}" fill="#b98f58"/><ellipse cx="${r1(cx)}" cy="${ground}" rx="${r1(rx)}" ry="${r1(ry)}" fill="url(#sc-round)"/>`)
      }
      for (let i = 0; i < count(5, sw, w); i++) near.push(box(rand() * sw, ground - 5, 8 + rand() * 8, 5, 4, '#8a6a4a'))
      for (let i = 0; i < count(4, sw, w); i++) {
        const x = rand() * sw
        near.push(`<path d="M${r1(x)} ${ground}l-3-6M${r1(x)} ${ground}l1-8M${r1(x)} ${ground}l4-5" stroke="#7a5a3a" stroke-width="1.2" fill="none"/>`)
      }
      // Heat shimmer.
      back.push(`<rect x="${-sw}" y="${ground - 10}" width="${sw * 3}" height="10" fill="white" opacity=".06"><animate attributeName="opacity" values=".03;.09;.03" dur="3s" repeatCount="indefinite"/></rect>`)
      break
    }
    case 'volcano': {
      sky = '#2a1714'
      soil = '#4a2c20'
      back.push(ridge(sw, ground, rand, { peaks: 4, min: 20, max: 36, color: '#3a2420', opacity: 0.7 }))
      const vx = sw * 0.6 + rand() * (sw * 0.4 - 140)
      const apex = ground - 74
      // The cone: a lit left face, a shaded right face, lava down the front.
      back.push(
        glow(vx + 58, apex, 70, 0.55) +
          `<path d="M${r1(vx - 10)} ${ground}L${r1(vx + 48)} ${apex}h20L${r1(vx + 130)} ${ground}z" fill="#5a3520"/>` +
          `<path d="M${r1(vx + 58)} ${apex}h10L${r1(vx + 130)} ${ground}H${r1(vx + 70)}z" fill="black" opacity=".3"/>` +
          `<path d="M${r1(vx - 10)} ${ground}L${r1(vx + 48)} ${apex}h6L${r1(vx + 14)} ${ground}z" fill="white" opacity=".08"/>` +
          `<path d="M${r1(vx + 56)} ${apex + 2}q-6 22 -2 34t-10 38" fill="none" stroke="#f06a2b" stroke-width="3"><animate attributeName="stroke" values="#f06a2b;#e3b341;#f06a2b" dur="2s" repeatCount="indefinite"/></path>` +
          `<path d="M${r1(vx + 62)} ${apex + 2}q8 18 4 30t12 42" fill="none" stroke="#f06a2b" stroke-width="2" opacity=".8"/>` +
          `<rect x="${r1(vx + 48)}" y="${apex - 3}" width="20" height="5" fill="#f06a2b"><animate attributeName="fill" values="#f06a2b;#e3b341;#f06a2b" dur="1.4s" repeatCount="indefinite"/></rect>`,
      )
      for (let i = 0; i < 4; i++) {
        const d = 4 + i * 1.3
        back.push(
          `<circle cx="${r1(vx + 58)}" cy="${apex - 6}" r="${r1(7 + i * 2)}" fill="#6a5a55" opacity="0">` +
            `<animateTransform attributeName="transform" type="translate" values="0 0;${r1(-20 - rand() * 30)} -50" dur="${r1(d)}s" begin="${r1(i * 1.1)}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values="0;.5;0" dur="${r1(d)}s" begin="${r1(i * 1.1)}s" repeatCount="indefinite"/></circle>`,
        )
      }
      for (let i = 0; i < count(5, sw, w); i++) near.push(box(rand() * sw, ground - 6, 9 + rand() * 8, 6, 4, '#3a2420'))
      near.push(`<rect x="${-sw}" y="${ground}" width="${sw * 3}" height="2" fill="#f06a2b" opacity=".35"/>`)
      break
    }
    case 'rails': {
      sky = '#262836'
      soil = '#3a3836'
      back.push(ridge(sw, ground - 6, rand, { peaks: 4, min: 34, max: 56, color: '#3a4256', opacity: 0.75, snow: '#d9d4c7' }))
      back.push(ridge(sw, ground, rand, { peaks: 7, min: 10, max: 22, color: '#2f4a3a', opacity: 0.9 }))
      // Telegraph poles and the line, scrolling past.
      const poles = Array.from({ length: Math.ceil(sw / 160) + 2 }, (_, i) => `<rect x="${i * 160}" y="${ground - 46}" width="2.5" height="46" fill="#5a3520"/><rect x="${i * 160 - 6}" y="${ground - 42}" width="14" height="2" fill="#5a3520"/>`).join('')
      const wire = Array.from({ length: Math.ceil(sw / 160) + 2 }, (_, i) => `M${i * 160 + 1} ${ground - 41}q80 10 160 0`).join('')
      near.push(`<g>${poles}<path d="${wire}" fill="none" stroke="#1f1e1d" stroke-width=".8"/><animateTransform attributeName="transform" type="translate" values="0 0;-160 0" dur="3s" repeatCount="indefinite"/></g>`)
      // Ballast, sleepers with a lit top, and two steel rails.
      near.push(`<rect x="${-sw}" y="${ground - 2}" width="${sw * 3}" height="10" fill="#5b5550"/><rect x="${-sw}" y="${ground - 2}" width="${sw * 3}" height="10" fill="url(#sc-soil)"/>`)
      const ties = Array.from({ length: Math.ceil(sw / 16) + 3 }, (_, i) => `M${i * 16} 0h9l2-2h-9z`).join('')
      const tieFronts = Array.from({ length: Math.ceil(sw / 16) + 3 }, (_, i) => `M${i * 16} 0h9v3h-9z`).join('')
      near.push(
        `<g><path d="${ties}" fill="#8a6a4a" transform="translate(0 ${ground + 1})"/><path d="${tieFronts}" fill="#5a3520" transform="translate(0 ${ground + 1})"/>` +
          `<animateTransform attributeName="transform" type="translate" values="0 0;-16 0" dur=".5s" repeatCount="indefinite"/></g>` +
          `<rect x="${-sw}" y="${ground - 1}" width="${sw * 3}" height="2" fill="#8a8780"/><rect x="${-sw}" y="${ground - 1}" width="${sw * 3}" height=".7" fill="white" opacity=".5"/>`,
      )
      break
    }
    case 'lab': {
      sky = '#26303a'
      soil = '#3b3e47'
      // Wall panels with bevels.
      back.push(
        `<pattern id="sc-panel" width="48" height="36" y="6" patternUnits="userSpaceOnUse"><rect x="2" width="44" height="32" fill="#2c3844"/>` +
          `<path d="M2 32V0h44" fill="none" stroke="white" stroke-opacity=".08"/><path d="M46 0v32H2" fill="none" stroke="black" stroke-opacity=".3"/></pattern>` +
          `<rect x="0" y="6" width="${sw}" height="${ground - 16}" fill="url(#sc-panel)"/>`,
      )
      // Pipes along the ceiling.
      back.push(`<rect x="${-sw}" y="4" width="${sw * 3}" height="5" fill="#5b5f6b"/><rect x="${-sw}" y="4" width="${sw * 3}" height="5" fill="url(#sc-round)"/>`)
      for (let px = 30; px < sw; px += 120) back.push(`<rect x="${px}" y="2" width="6" height="9" fill="#3b3e47"/>`)
      // Shelves of glowing flasks, and a monitor.
      for (let i = 0; i < count(3, sw, w); i++) {
        const sx = (sw * (i + 0.15 + rand() * 0.4)) / count(3, sw, w)
        const sy = 40 + rand() * 18
        const flasks: string[] = []
        for (let k = 0; k < 4; k++) {
          const color = ['#6fc2c9', '#5e9c4a', '#e05252', '#7b5fb5'][Math.floor(rand() * 4)] ?? '#6fc2c9'
          const fx = sx + 4 + k * 13
          flasks.push(`<rect x="${r1(fx)}" y="${r1(sy - 12)}" width="7" height="12" fill="white" opacity=".25"/><rect x="${r1(fx)}" y="${r1(sy - 7)}" width="7" height="7" fill="${color}"/>` + glow(fx + 3.5, sy - 4, 9, 0.6))
        }
        back.push(flasks.join('') + box(sx, sy, 56, 3, 5, '#5b5f6b'))
      }
      const mx = sw * (0.4 + rand() * 0.2)
      back.push(
        box(mx, 26, 40, 26, 5, '#1f2328') +
          `<rect x="${r1(mx + 3)}" y="29" width="34" height="20" fill="#0f2a2a"/>` +
          Array.from({ length: 4 }, (_, i) => `<rect x="${r1(mx + 6)}" y="${32 + i * 4}" width="${r1(10 + rand() * 18)}" height="1.6" fill="#5fd35f" opacity=".8"><animate attributeName="opacity" values=".8;.2;.8" dur="${r1(1 + rand() * 2)}s" repeatCount="indefinite"/></rect>`).join(''),
      )
      // Baseboard and tiles.
      near.push(`<rect x="${-sw}" y="${ground - 4}" width="${sw * 3}" height="4" fill="#4a4e58"/>`)
      for (let tx = 0; tx < sw; tx += 20) near.push(`<path d="M${tx} ${ground}l-6 ${128 - ground}" stroke="black" stroke-opacity=".2"/>`)
      break
    }
    case 'night':
    default: {
      sky = '#1a1d2c'
      soil = '#2c3038'
      const mx = 60 + rand() * (sw - 120)
      back.push(glow(mx, 24, 44, 0.7), orb(mx, 24, 10, '#e8e3c8'))
      for (let i = 0; i < count(30, sw, w); i++) back.push(`<rect x="${r1(rand() * sw)}" y="${r1(rand() * 60)}" width="1" height="1" fill="white" opacity="${r1(0.3 + rand() * 0.6)}"/>`)
      back.push(ridge(sw, ground, rand, { peaks: 5, min: 16, max: 30, color: '#252a3c', opacity: 0.85 }))
      back.push(ridge(sw, ground, rand, { peaks: 8, min: 6, max: 14, color: '#22283a', opacity: 1 }))
      // Houses: a box with a gabled roof and lit windows.
      for (let i = 0; i < count(3, sw, w); i++) {
        const hx = (sw * (i + 0.1 + rand() * 0.6)) / count(3, sw, w)
        const hw = 26 + rand() * 14
        const hh = 18 + rand() * 6
        const top = ground - hh
        const roof = `<path d="M${r1(hx - 2)} ${r1(top)}l${r1(hw / 2 + 2)} -12l${r1(hw / 2 + 2)} 12z" fill="#5a3a3a"/><path d="M${r1(hx + hw / 2)} ${r1(top - 12)}l7 -4l${r1(hw / 2 + 2)} 12l-7 4z" fill="#5a3a3a"/><path d="M${r1(hx + hw / 2)} ${r1(top - 12)}l7 -4l${r1(hw / 2 + 2)} 12l-7 4z" fill="black" opacity=".3"/>`
        const lit = `<rect x="${r1(hx + 5)}" y="${r1(top + 5)}" width="6" height="6" fill="#e3b341"/><rect x="${r1(hx + hw - 11)}" y="${r1(top + 5)}" width="6" height="6" fill="#e3b341" opacity="${rand() < 0.5 ? 1 : 0.25}"/>` + glow(hx + 8, top + 8, 12, 0.5)
        back.push(box(hx, top, hw, hh, 7, '#3a3e52', roof + lit))
      }
      for (let fx = 0; fx < sw; fx += 10) near.push(`<rect x="${fx}" y="${ground - 8}" width="2" height="8" fill="#4a4e58"/>`)
      near.push(`<rect x="${-sw}" y="${ground - 6}" width="${sw * 3}" height="1.5" fill="#4a4e58"/>`)
      // Fireflies.
      for (let i = 0; i < count(5, sw, w); i++) {
        const x = rand() * sw
        const y = ground - 10 - rand() * 30
        near.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="1.2" fill="#e3d9a0"><animate attributeName="opacity" values="0;1;0" dur="${r1(2 + rand() * 2)}s" begin="${r1(rand() * 2)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${r1((rand() - 0.5) * 20)} -6;0 0" dur="5s" repeatCount="indefinite"/></circle>`)
      }
      break
    }
  }

  if (scene.palette.accent) near.push(`<rect x="${-sw}" y="${floor}" width="${sw * 3}" height="2" fill="${scene.palette.accent}" opacity=".7"/>`)
  // Atmosphere over the sky and depth over the ground, in neutral shading.
  back.splice(1, 0, `<rect x="${-sw}" y="${-128}" width="${sw * 3}" height="${floor + 128}" fill="url(#sc-air)"/>`)
  near.unshift(`<rect x="${-sw}" y="${floor}" width="${sw * 3}" height="${200}" fill="url(#sc-soil)"/>`)
  return { sky: scene.palette.sky ?? sky, ground: scene.palette.ground ?? soil, floor, back: back.join(''), near: near.join('') }
}
