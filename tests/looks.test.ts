import { describe, expect, test } from 'claude-code/testing'

import { buildPrompt } from '../hooks/narrator'
import { LOOK_NAMES, LOOKS, lookFor, nearest, remapColors } from '../hooks/looks'
import { parseScene } from '../hooks/scene'
import { MAX_SVG, sceneToSvg } from '../hooks/svg'

const SCENE = {
  backdrop: 'forest',
  hero: { action: 'walk', from: 5, to: 35 },
  props: [{ sprite: 'bug', x: 60, y: 'ground', motion: 'shake', label: 'issue #123' }],
  particles: { kind: 'leaves', density: 0.5 },
  caption: 'Chasing #abc through the undergrowth.',
  title: 'field notes',
}

describe('looks', () => {
  test('remapping recolors paint, never text', () => {
    const svg = '<rect fill="#abc" stroke="#112233"/><animate values="#fff;#000"/><text fill="#abc">see #abc</text>'
    const out = remapColors(svg, () => '#ff0000')
    expect(out).toBe('<rect fill="#ff0000" stroke="#ff0000"/><animate values="#ff0000;#ff0000"/><text fill="#ff0000">see #abc</text>')
  })

  test('nearest picks the closest palette color', () => {
    expect(nearest('#fe0102', ['#000000', '#ff0000', '#00ff00'])).toBe('#ff0000')
    expect(nearest('#0a0a0a', ['#000000', '#ffffff'])).toBe('#000000')
  })

  test('an unknown look draws the default', () => {
    expect(lookFor('no-such-look').name).toBe('pixel')
    expect(lookFor(undefined).name).toBe('pixel')
  })

  test('every look draws every backdrop within the Svg limit, keeping the text', () => {
    for (const name of LOOK_NAMES) {
      for (const backdrop of ['forest', 'space', 'city', 'desert', 'volcano', 'rails', 'lab', 'night']) {
        const scene = parseScene({ ...SCENE, backdrop, props: Array.from({ length: 8 }, (_, i) => ({ ...SCENE.props[0], x: i * 12 })) })
        if (!scene) throw new Error('expected a scene')
        const svg = sceneToSvg(scene, { width: 2400, height: 192, look: name })
        expect(svg.length).toBeLessThan(MAX_SVG)
        expect(svg).toContain('Chasing #abc')
        expect(svg.endsWith('</svg>')).toBe(true)
      }
    }
  })

  test('a look changes the drawing, and the default changes nothing', () => {
    const scene = parseScene(SCENE)
    if (!scene) throw new Error('expected a scene')
    expect(sceneToSvg(scene, { look: 'pixel' })).toBe(sceneToSvg(scene))
    const drawn = new Set(LOOK_NAMES.map(look => sceneToSvg(scene, { look })))
    expect(drawn.size).toBe(LOOK_NAMES.length)
  })

  test('the narrator hears which style it writes for', () => {
    const look = LOOKS.sampler
    if (!look) throw new Error('expected the sampler look')
    expect(buildPrompt({ ask: 'x', log: [], story: [], look })).toContain('Victorian')
    expect(buildPrompt({ ask: 'x', log: [], story: [], look: lookFor('pixel') })).not.toContain('style of')
  })
})
