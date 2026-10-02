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
    expect(frames).toBe(8)
    expect(svg.match(/<g visibility="hidden">/g)).toHaveLength(8)
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
    for (const figure of ['pixel', '3d'] as const) {
      const svg = sceneToSvg(scene, { figure })
      const grass = svg.indexOf(figure === 'pixel' ? 'fill="#5e9c4a"' : 'fill="#6bab55"')
      const prop = svg.indexOf('scale(4)')
      expect(grass).toBeGreaterThan(-1)
      expect(grass).toBeLessThan(prop)
    }
  })

  test('3D stages give props a depth and a contact shadow', () => {
    const scene = parseScene({ backdrop: 'city', hero: { action: 'walk', from: 0, to: 20 }, props: [{ sprite: 'trophy', x: 70 }], caption: 'Solid gold.' })
    if (!scene) throw new Error('expected a scene')
    expect(sceneToSvg(scene, { figure: '3d' })).toContain('filter="url(#sc-deep)"')
    expect(sceneToSvg(scene, { figure: 'pixel' })).not.toContain('sc-deep')
  })
})
