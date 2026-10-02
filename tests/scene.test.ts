import { describe, expect, test } from 'claude-code/testing'

import { buildPrompt, sceneFromReply } from '../hooks/narrator'
import { extractJson, parseHex, parseScene } from '../hooks/scene'
import { H, MAX_SVG, MAX_W, MIN_W, sceneToSvg, stageWidth } from '../hooks/svg'

const GOOD = {
  backdrop: 'rails',
  hero: { action: 'run', from: 70, to: 20 },
  props: [{ sprite: 'train', x: 70, y: 'ground', motion: 'scroll', label: '#zzzzzz', color: '#e05252' }],
  caption: 'Pulled over: a color regex that accepts #zzzzzz.',
}

describe('parseScene', () => {
  test('keeps a good scene', () => {
    const scene = parseScene(GOOD)
    expect(scene?.backdrop).toBe('rails')
    expect(scene?.hero).toEqual({ action: 'run', from: 70, to: 20 })
    expect(scene?.props[0]?.label).toBe('#zzzzzz')
  })

  test('rejects what has no caption or is not an object', () => {
    expect(parseScene(null)).toBe(null)
    expect(parseScene('scene')).toBe(null)
    expect(parseScene([GOOD])).toBe(null)
    expect(parseScene({ ...GOOD, caption: '   ' })).toBe(null)
  })

  test('clamps, defaults and drops what it does not know', () => {
    const scene = parseScene({
      backdrop: 'moon base',
      hero: { action: 'teleport', from: -50, to: 900 },
      props: [
        { sprite: 'dragon', x: 10 },
        { sprite: 'BUG', x: '40', y: 'underground', motion: 'explode', color: '#abcd' },
        ...Array.from({ length: 20 }, () => ({ sprite: 'star', x: 1 })),
      ],
      caption: 'x'.repeat(500),
      evil: '<script>',
    })
    expect(scene?.backdrop).toBe('night')
    expect(scene?.hero).toEqual({ action: 'walk', from: 0, to: 100 })
    expect(scene?.props.length).toBe(8)
    expect(scene?.props[0]).toEqual({ sprite: 'bug', x: 40, y: 'ground', motion: 'none' })
    expect(scene?.caption.length).toBe(90)
    expect('evil' in (scene ?? {})).toBe(false)
  })

  test('accepts only 3 and 6 digit hex colors', () => {
    expect(parseHex('#abc')).toBe('#aabbcc')
    expect(parseHex('#A1B2C3')).toBe('#a1b2c3')
    expect(parseHex('#abcd')).toBe(undefined)
    expect(parseHex('#abcde')).toBe(undefined)
    expect(parseHex('#zzzzzz')).toBe(undefined)
    expect(parseHex('red')).toBe(undefined)
  })

  test('cleans custom pixel art', () => {
    const scene = parseScene({
      ...GOOD,
      props: [{ sprite: { pixels: ['rr?r', 'x'.repeat(40), ...Array(30).fill('r')], colors: { r: '#f00', '<': '#fff', q: 'nope' } } }],
    })
    const art = scene?.props[0]?.sprite
    if (typeof art !== 'object') throw new Error('expected pixel art')
    expect(art.colors).toEqual({ r: '#ff0000' })
    expect(art.pixels.length).toBe(16)
    expect(art.pixels[0]).toBe('rr.r')
    expect(art.pixels[1]).toBe('.'.repeat(16))
  })
})

describe('model replies', () => {
  test('reads JSON inside fences and chatter', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('here {"a":{"b":2}} done')).toEqual({ a: { b: 2 } })
  })

  test('never throws on garbage', () => {
    expect(extractJson('not json at all')).toBe(undefined)
    expect(extractJson('{"a": ')).toBe(undefined)
    expect(sceneFromReply('{{{{')).toBe(null)
    expect(sceneFromReply(JSON.stringify(GOOD))?.caption).toBe(GOOD.caption)
  })

  test('the prompt stays bounded however long the session runs', () => {
    const log = Array.from({ length: 14 }, () => ({ kind: 'tool' as const, text: 'y'.repeat(240) }))
    const story = Array.from({ length: 4 }, () => ({ backdrop: 'sea', caption: 'z'.repeat(90) }))
    expect(buildPrompt({ ask: 'q'.repeat(300), log, story }).length).toBeLessThan(6000)
  })
})

describe('sceneToSvg', () => {
  test('escapes every bit of model text', () => {
    const scene = parseScene({
      ...GOOD,
      title: '<b>&',
      caption: '</text><script>alert(1)</script>',
      props: [{ sprite: 'file', x: 50, label: '"><img onerror=x>' }],
    })
    if (!scene) throw new Error('expected a scene')
    const svg = sceneToSvg(scene)
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('<img')
    expect(svg).not.toContain('<b>')
    expect(svg).toContain('&lt;script&gt;')
  })

  test('the richest possible scene fits the Svg element', () => {
    const big = { pixels: Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => 'abcdefgh'[(x * 7 + y * 3) % 8]).join('')), colors: Object.fromEntries([...'abcdefgh'].map((k, i) => [k, `#${i}${i}${i}`])) }
    for (const backdrop of ['forest', 'sea', 'space', 'city', 'desert', 'volcano', 'rails', 'lab', 'night']) {
      const scene = parseScene({
        ...GOOD,
        backdrop,
        title: 'a'.repeat(24),
        props: Array.from({ length: 8 }, (_, i) => ({ sprite: big, x: i * 12, label: 'l'.repeat(18), motion: 'spin' })),
        particles: { kind: 'sparks', density: 1 },
      })
      if (!scene) throw new Error('expected a scene')
      for (const width of [undefined, 3000]) {
        const svg = sceneToSvg(scene, width ? { width, height: 192 } : {})
        expect(svg.length).toBeLessThan(MAX_SVG)
        expect(svg.startsWith('<svg')).toBe(true)
      }
    }
  })

  test('the same scene always draws the same', () => {
    const scene = parseScene({ ...GOOD, particles: { kind: 'stars', density: 0.5 } })
    if (!scene) throw new Error('expected a scene')
    expect(sceneToSvg(scene)).toBe(sceneToSvg(scene))
  })

  test('the stage takes the shape of the box it is drawn in', () => {
    const scene = parseScene(GOOD)
    if (!scene) throw new Error('expected a scene')
    for (const width of [480, 960, 1800]) {
      const svg = sceneToSvg(scene, { width, height: 192 })
      expect(svg).toContain(`viewBox="0 0 ${(width * H) / 192} ${H}"`)
      expect(svg).toContain(`width="${width}" height="192"`)
    }
    expect(stageWidth(100, 192)).toBe(MIN_W)
    expect(stageWidth(99999, 192)).toBe(MAX_W)
    expect(stageWidth(0, 0)).toBe(640)
  })
})
