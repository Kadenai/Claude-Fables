import { describe, expect, test } from 'claude-code/testing'

import { buildPrompt } from '../hooks/narrator'
import { DEFAULT_LOOK, findLook, LOOK_NAMES, LOOKS, lookFor, STYLE_NAMES } from '../hooks/looks'
import { parseScene } from '../hooks/scene'
import { MAX_SVG, sceneToSvg } from '../hooks/svg'

const SCENE = {
  backdrop: 'forest',
  hero: { action: 'walk', from: 5, to: 35 },
  particles: { kind: 'leaves', density: 0.5 },
  caption: 'Chasing #abc through the undergrowth.',
  title: 'field notes',
  tone: 'work',
}
const BACKDROPS = ['forest', 'space', 'city', 'desert', 'volcano', 'lab', 'night']

describe('looks', () => {
  test('an unknown look draws the default', () => {
    expect(lookFor('no-such-look').name).toBe(DEFAULT_LOOK)
    expect(lookFor(undefined).name).toBe(DEFAULT_LOOK)
  })

  test('the eleven styles are there, and found by any fair spelling', () => {
    expect(STYLE_NAMES.length).toBe(11)
    expect(findLook('Ukiyo-e')?.name).toBe('ukiyoe')
    expect(findLook('golden age')?.name).toBe('golden')
    expect(findLook('frutiger aero')?.name).toBe('aero')
    expect(findLook('copperplate')?.name).toBe('engraving')
    expect(findLook('millefleur')?.name).toBe('tapestry')
    expect(findLook('cave painting')?.name).toBe('cave')
    expect(findLook('nonsense')).toBeUndefined()
  })

  test('every style draws every backdrop within the Svg limit, pixelized or smooth, keeping the text', () => {
    for (const look of STYLE_NAMES) {
      for (const backdrop of BACKDROPS) {
        for (const pixelArt of [true, false]) {
          const scene = parseScene({ ...SCENE, backdrop })
          if (!scene) throw new Error('expected a scene')
          const svg = sceneToSvg(scene, { width: 2400, height: 192, look, figure: '3d', pixelArt })
          expect(svg.length).toBeLessThan(MAX_SVG)
          // A drafting hand letters in capitals.
          expect(svg.toLowerCase()).toContain('chasing #abc')
          expect(svg).toContain(`data-look="${look}"`)
          // A graded style runs its own filter when smooth; an artwork has none to run.
          if (LOOKS[look]?.grade) expect(svg.includes('filter="url(#lk-grade)"')).toBe(!pixelArt)
          expect(svg.endsWith('</svg>')).toBe(true)
        }
      }
    }
  })

  test('a style drawn as art repaints every element, leaving none of the lit light or materials', () => {
    const arts = LOOK_NAMES.filter(name => LOOKS[name]?.art)
    expect(arts).toContain('ukiyoe')
    expect(arts).toContain('blueprint')
    for (const look of arts) {
      for (const backdrop of BACKDROPS) {
        for (const pixelArt of [true, false]) {
          const scene = parseScene({ ...SCENE, backdrop })
          if (!scene) throw new Error('expected a scene')
          const svg = sceneToSvg(scene, { look, figure: '3d', pixelArt })
          const lit = [...svg.matchAll(/filter="url\(#(sc-[\w-]+)\)"/g)].map(m => m[1]).filter(id => !id?.startsWith('sc-pixelize'))
          expect(lit).toEqual([])
          expect(svg).not.toContain('mix-blend-mode')
        }
      }
    }
  })

  test('ids are never defined twice in one drawing', () => {
    for (const look of LOOK_NAMES) {
      const scene = parseScene(SCENE)
      if (!scene) throw new Error('expected a scene')
      const svg = sceneToSvg(scene, { look, figure: '3d' })
      const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
      expect(ids.length).toBe(new Set(ids).size)
    }
  })

  test('the default look changes nothing, and every style draws differently', () => {
    const scene = parseScene(SCENE)
    if (!scene) throw new Error('expected a scene')
    expect(sceneToSvg(scene, { look: DEFAULT_LOOK })).toBe(sceneToSvg(scene))
    expect(sceneToSvg(scene, { look: DEFAULT_LOOK, figure: '3d' })).not.toContain('data-look')
    const drawn = new Set(LOOK_NAMES.map(look => sceneToSvg(scene, { look, figure: '3d' })))
    expect(drawn.size).toBe(LOOK_NAMES.length)
  })

  test('the caption takes the style paper and inks', () => {
    const scene = parseScene({ ...SCENE, caption: 'Ran `npm test`: 3 failed' })
    if (!scene) throw new Error('expected a scene')
    const svg = sceneToSvg(scene, { look: 'handheld', figure: '3d' })
    expect(svg).toContain('fill="#9bbc0f"')
    expect(svg).toContain('<tspan fill="#0f380f">npm</tspan>')
  })

  test('the narrator hears which style it writes for', () => {
    const look = LOOKS.sampler
    if (!look) throw new Error('expected the sampler look')
    expect(buildPrompt({ ask: 'x', log: [], story: [], look })).toContain('Victorian')
    expect(buildPrompt({ ask: 'x', log: [], story: [] })).not.toContain('style of')
  })
})
