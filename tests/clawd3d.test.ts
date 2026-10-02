import { describe, expect, test } from 'claude-code/testing'

import { build, MODEL_H, MOTION_TIMING, type Motion, poseAt } from '../hooks/clawd3d'
import { motionSvg } from '../hooks/hero3d'
import { LOOK_NAMES } from '../hooks/looks'
import { parseScene } from '../hooks/scene'
import { MAX_SVG, sceneToSvg } from '../hooks/svg'

describe('the 3D Clawd', () => {
  test('standing, it shows its front with both eyes and its feet on the ground', () => {
    const m = build({}, 1)
    expect(m.faces.some(f => f.part === 'body' && f.name === 'front')).toBe(true)
    expect(m.faces.some(f => f.name === 'back')).toBe(false)
    expect(m.eyes).toHaveLength(2)
    const ys = m.faces.flatMap(f => f.pts.map(p => p[1]))
    expect(Math.abs(Math.max(...ys))).toBeLessThan(0.5)
    expect(-Math.min(...ys)).toBeGreaterThan(MODEL_H * 0.8)
  })

  test('turned away, it hides its eyes', () => {
    expect(build({ yaw: Math.PI }, 1).eyes).toHaveLength(0)
  })

  test('idling and thinking blink once a loop', () => {
    for (const motion of ['idle', 'think'] as const) {
      const { frames } = MOTION_TIMING[motion]
      expect(Array.from({ length: frames }, (_, k) => poseAt(motion, k / frames, 0).eyes).filter(e => e === 'closed')).toHaveLength(1)
    }
  })

  test('every motion poses every frame without a broken number', () => {
    for (const motion of Object.keys(MOTION_TIMING) as Motion[]) {
      for (let k = 0; k < MOTION_TIMING[motion].frames; k++) {
        const m = build(poseAt(motion, k / MOTION_TIMING[motion].frames, 0.55), 3)
        expect(m.faces.length).toBeGreaterThan(5)
        expect(m.faces.every(f => f.pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])))).toBe(true)
      }
    }
  })

  test('a loop bakes one frame per pose, each shown in its own slot', () => {
    const { svg, frames } = motionSvg('walk', { height: 40, cx: 26, floor: 36, yaw: 0.55, paint: 'solid' })
    expect(frames).toBe(MOTION_TIMING.walk.frames)
    expect(svg.match(/<g visibility="hidden">/g)).toHaveLength(frames)
    expect(svg).not.toContain('NaN')
  })
})

describe('figures in scenes', () => {
  const scene = parseScene({ backdrop: 'forest', hero: { action: 'walk', from: 80, to: 10 }, caption: 'Back to the start.' })
  if (!scene) throw new Error('expected a scene')

  test('the figure setting overrides the look', () => {
    const pixel = sceneToSvg(scene, { look: 'bauhaus', figure: 'pixel' })
    const model = sceneToSvg(scene, { look: 'bauhaus', figure: '3d' })
    expect(sceneToSvg(scene, { look: 'bauhaus' })).toBe(model)
    expect(pixel).not.toBe(model)
    expect(sceneToSvg(scene, { look: 'pixel', figure: '3d' })).toContain('visibility')
  })

  test('every look fits the Svg element with either figure, at the widest stage', () => {
    for (const look of LOOK_NAMES) {
      for (const figure of ['pixel', '3d'] as const) {
        for (const action of ['walk', 'celebrate']) {
          const rich = parseScene({
            backdrop: 'city',
            hero: { action, from: 0, to: 60 },
            props: Array.from({ length: 8 }, (_, i) => ({ sprite: 'server', x: i * 12, label: 'l'.repeat(18), motion: 'bob' })),
            particles: { kind: 'sparks', density: 1 },
            caption: 'x',
          })
          if (!rich) throw new Error('expected a scene')
          expect(sceneToSvg(rich, { width: 2400, height: 192, look, figure }).length).toBeLessThan(MAX_SVG)
        }
      }
    }
  })
})

describe('layering', () => {
  test('ground-level scenery is drawn before the props and Claude, in both kinds of stage', () => {
    const scene = parseScene({ backdrop: 'forest', hero: { action: 'think', from: 30, to: 30 }, props: [{ sprite: 'bug', x: 60 }], caption: 'Grass stays behind me.' })
    if (!scene) throw new Error('expected a scene')
    const flat = sceneToSvg(scene, { figure: 'pixel' })
    expect(flat.indexOf('fill="#5e9c4a"')).toBeGreaterThan(-1)
    expect(flat.indexOf('fill="#5e9c4a"')).toBeLessThan(flat.indexOf('scale(4)'))
    const rich = sceneToSvg(scene, { figure: '3d' })
    const path = rich.indexOf('url(#sc-pathlight)')
    const claude = rich.indexOf('visibility')
    expect(path).toBeGreaterThan(-1)
    expect(path).toBeLessThan(claude)
    // The thought bubble comes last of all, over Claude and the lens.
    expect(rich.indexOf('<g fill="#f6f1e7">')).toBeGreaterThan(claude)
  })

  test('3D stages put the props in a thought bubble instead of on the ground', () => {
    const scene = parseScene({ backdrop: 'city', hero: { action: 'walk', from: 0, to: 20 }, props: [{ sprite: 'trophy', x: 70, label: '17 tests' }], caption: 'Solid gold.' })
    if (!scene) throw new Error('expected a scene')
    const rich = sceneToSvg(scene, { figure: '3d' })
    expect(rich).toContain('<g fill="#f6f1e7">')
    expect(rich).toContain('>17 tests</text>')
    expect(rich).not.toContain('href="#fp0"')
    const flat = sceneToSvg(scene, { figure: 'pixel' })
    expect(flat).not.toContain('<g fill="#f6f1e7">')
    expect(flat).toContain('17 tests')
  })

  test('a scene too rich for the limit thins its scenery before it drops a thought', () => {
    const sprites = ['server', 'trophy', 'rocket', 'file', 'bug', 'train', 'planet', 'beaker']
    for (const backdrop of ['city', 'forest', 'night', 'lab', 'volcano']) {
      const scene = parseScene({ backdrop, hero: { action: 'walk', from: 0, to: 40 }, props: sprites.map((sprite, i) => ({ sprite, x: 4 + i * 13, label: sprite })), caption: 'Crowded.' })
      if (!scene) throw new Error('expected a scene')
      const svg = sceneToSvg(scene, { figure: '3d', width: 2400, height: 192 })
      expect(svg.length).toBeLessThan(MAX_SVG)
      // The bubble holds the first three, all kept.
      for (const label of sprites.slice(0, 3)) expect(svg).toContain(`>${label}</text>`)
      expect(svg).not.toContain('>file</text>')
    }
  })
})

describe('composition', () => {
  const rectOf = (m: RegExpMatchArray | null) => (m ? { x: +m[1]!, y: +m[2]!, w: +m[3]!, h: +m[4]! } : undefined)
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  test('the speech bubble keeps clear of the thought bubble', () => {
    const scene = parseScene({
      backdrop: 'forest',
      hero: { action: 'walk', from: 5, to: 30 },
      props: [{ sprite: 'bug', x: 60, y: 'ground', label: 'parseHex' }, { sprite: 'file', x: 80, label: 'README.md' }],
      caption: 'A long enough caption to need a wide bubble here.',
    })
    if (!scene) throw new Error('expected a scene')
    for (const width of [480, 960, 2400]) {
      const svg = sceneToSvg(scene, { width, height: 192, figure: '3d' })
      const bubble = rectOf(svg.match(/<g><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx=/))
      const thought = rectOf(svg.match(/<g fill="#f6f1e7"><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/))
      if (!bubble || !thought) throw new Error('expected a speech bubble and a thought')
      expect(hit(bubble, thought)).toBe(false)
    }
  })

  test('labels stay readable in a look that paints the foreground one color', () => {
    const scene = parseScene({ backdrop: 'lab', hero: { action: 'think', from: 20, to: 20 }, props: [{ sprite: 'server', x: 80, label: 'db.ts' }], caption: 'Hmm.' })
    if (!scene) throw new Error('expected a scene')
    // The thought bubble is drawn past the look's remap: its paper and ink stay its own.
    const svg = sceneToSvg(scene, { look: 'blueprint', figure: '3d' })
    expect(svg).toContain('<g fill="#f6f1e7">')
    expect(svg).toMatch(/fill="#4a3a30">db\.ts<\/text>/)
  })

  test('every rich backdrop clips its scenery to the stage', () => {
    for (const backdrop of ['forest', 'space', 'city', 'desert', 'volcano', 'lab', 'night']) {
      const scene = parseScene({ backdrop, hero: { action: 'walk', from: 0, to: 40 }, caption: 'x' })
      if (!scene) throw new Error('expected a scene')
      const svg = sceneToSvg(scene, { figure: '3d', width: 1800, height: 192 })
      expect(svg).toContain('<clipPath id="sc-stage">')
      // Back, near and lens layers are each held to the stage.
      expect(svg.match(/clip-path="url\(#sc-stage\)"/g)?.length).toBe(3)
    }
  })
})
