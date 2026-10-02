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
  })

  test('the rich stage draws no props: the caption carries the story, over softened scenery', () => {
    const scene = parseScene({ backdrop: 'city', hero: { action: 'walk', from: 0, to: 20 }, props: [{ sprite: 'trophy', x: 70, label: '17 tests' }], caption: 'Solid gold.' })
    if (!scene) throw new Error('expected a scene')
    const rich = sceneToSvg(scene, { figure: '3d' })
    expect(rich).not.toContain('17 tests')
    expect(rich).not.toContain('href="#fp0"')
    // Back and near scenery both sit under the same slight blur; Claude and the caption do not.
    expect(rich.match(/<g filter="url\(#sc-calm\)">/g)?.length).toBe(2)
    expect(rich.indexOf('visibility')).toBeGreaterThan(rich.lastIndexOf('url(#sc-calm)'))
    expect(sceneToSvg(scene, { figure: 'pixel' })).toContain('17 tests')
  })

  test('a scene too rich for the limit still fits, keeping its caption', () => {
    const sprites = ['server', 'trophy', 'rocket', 'file', 'bug', 'train', 'planet', 'beaker']
    for (const backdrop of ['city', 'forest', 'night', 'lab', 'volcano']) {
      const scene = parseScene({ backdrop, hero: { action: 'walk', from: 0, to: 40 }, props: sprites.map((sprite, i) => ({ sprite, x: 4 + i * 13, label: sprite })), particles: { kind: 'leaves', density: 1 }, caption: 'Crowded.' })
      if (!scene) throw new Error('expected a scene')
      const svg = sceneToSvg(scene, { figure: '3d', width: 2400, height: 192 })
      expect(svg.length).toBeLessThan(MAX_SVG)
      expect(svg).toContain('Crowded.')
    }
  })
})

describe('composition', () => {

  test("the caption's paper says how the work is going", () => {
    const at = (extra: object) => {
      const scene = parseScene({ backdrop: 'lab', hero: { action: 'think', from: 20, to: 20 }, caption: 'Hmm.', ...extra })
      if (!scene) throw new Error('expected a scene')
      return sceneToSvg(scene, { figure: '3d' }).match(/data-tone="(\w+)"/)?.[1]
    }
    expect(at({})).toBe('work')
    expect(at({ tone: 'trouble' })).toBe('trouble')
    expect(at({ tone: 'milestone' })).toBe('milestone')
    // A celebration is a milestone unless the narrator says otherwise.
    expect(at({ hero: { action: 'celebrate', from: 20, to: 20 } })).toBe('milestone')
    expect(at({ tone: 'nonsense' })).toBe('work')
  })

  test('the caption sets kinds of words apart and walks with Claude', () => {
    const scene = parseScene({
      backdrop: 'lab',
      hero: { action: 'walk', from: 10, to: 40 },
      caption: '`npm test` failed: 41 passed in dates.ts, see daysInMonth() o_O',
      tone: 'trouble',
    })
    if (!scene) throw new Error('expected a scene')
    const svg = sceneToSvg(scene, { figure: '3d' })
    const speech = svg.slice(svg.indexOf('data-part="speech"'))
    expect(speech).toContain('<tspan fill="#b3261e" font-weight="700">✗</tspan>')
    expect(speech).toContain('<tspan fill="#186a5a">npm</tspan> <tspan fill="#186a5a">test</tspan>')
    expect(speech).toContain('<tspan fill="#b3261e" font-weight="700">failed</tspan>:')
    expect(speech).toContain('<tspan fill="#2b5f9e">dates.ts</tspan>,')
    expect(speech).toContain('<tspan fill="#7b3fa0">daysInMonth()</tspan>')
    expect(speech).toContain('<tspan fill="#c4613f">o_O</tspan>')
    expect(speech).not.toContain('`')
    // It starts beside where Claude starts, and slides along as Claude walks.
    expect(speech).toMatch(/^data-part="speech" data-tone="trouble" transform="translate\(-[\d.]+ 0\)"><animateTransform attributeName="transform" type="translate"/)
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
