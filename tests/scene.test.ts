import { describe, expect, test } from 'claude-code/testing'

import { summarizeTool } from '../hooks/activity'
import { buildPrompt, GLANCE_MS, readMs, sceneFromReply, typeMs } from '../hooks/narrator'
import { cleanCaption, extractJson, MAX_CAPTION, parseHex, parseScene } from '../hooks/scene'
import { H, MAX_SVG, MAX_W, MIN_W, sceneToSvg, stageWidth } from '../hooks/svg'
import { NARRATOR_MODELS } from '../hooks/director'
import { rehearse } from '../scripts/rehearse'
import { SCENARIOS } from '../scripts/scenarios'

const GOOD = {
  backdrop: 'lab',
  hero: { action: 'run', from: 70, to: 20 },
  props: [{ sprite: 'train', x: 70, y: 'ground', motion: 'scroll', label: '#zzzzzz', color: '#e05252' }],
  caption: 'Pulled over: a color regex that accepts #zzzzzz.',
}

describe('parseScene', () => {
  test('keeps a good scene', () => {
    const scene = parseScene(GOOD)
    expect(scene?.backdrop).toBe('lab')
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
    expect(scene?.caption.length).toBe(80)
    expect('evil' in (scene ?? {})).toBe(false)
  })

  test('a long caption is cut to fit the bubble at a sentence or a word, never mid-word', () => {
    const long = 'Leaderboard delivered: Deutsche Bahn $47.72B, Indian Railways close behind. All aboard for the next stop!'
    const cut = cleanCaption(long) ?? ''
    expect(cut).toBe('Leaderboard delivered: Deutsche Bahn $47.72B, Indian Railways close behind.')
    const words = cleanCaption('Tracking the parser through the undergrowth while the tests rerun quietly in the background somewhere') ?? ''
    expect(words.length).toBeLessThanOrEqual(MAX_CAPTION)
    expect(words).toBe('Tracking the parser through the undergrowth while the tests rerun quietly in…')
    expect(cleanCaption('short and sweet')).toBe('short and sweet')
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
    const story = Array.from({ length: 4 }, () => ({ backdrop: 'space', caption: 'z'.repeat(90) }))
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
    for (const backdrop of ['forest', 'space', 'city', 'desert', 'volcano', 'lab', 'night']) {
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

describe('viewer scenarios', () => {
  test('every session is scripted in time order, with readable tool lines', () => {
    for (const s of SCENARIOS) {
      const times = [...s.steps.map(st => st.at), s.end]
      expect(times).toEqual([...times].sort((a, b) => a - b))
      for (const st of s.steps) if ('tool' in st) expect(summarizeTool(st.tool, st.input).length).toBeGreaterThan(4)
    }
  })

  test('rehearsed through the narrator, each model answers every ask and closes the story', async () => {
    for (const s of SCENARIOS) {
      for (const model of NARRATOR_MODELS) {
        const { moments, unscripted, unused } = await rehearse(s, model)
        // The script has exactly one reply for each time the narrator asks.
        expect([s.id, model, unscripted, unused]).toEqual([s.id, model, 0, 0])
        const asks = moments.filter(m => m.kind === 'ask')
        expect(asks.length).toBe(s.replies[model].length)
        expect(asks.every(m => m.kind === 'ask' && m.model === model && m.prompt.includes(s.ask))).toBe(true)
        // A reply is drawn unless it was scripted to fail (no answer, or no caption).
        for (const m of moments) {
          if (m.kind !== 'reply') continue
          const scripted = s.replies[model].find(r => 'text' in r && r.text === m.text)
          if (scripted && !/"caption"/.test(m.text)) expect(m.scene).toBeNull()
          else if (scripted) expect(m.scene?.caption).toBeDefined()
        }
        // The closing scene is asked for once the turn ends, and drawn.
        const closing = asks.find(m => m.kind === 'ask' && m.closing)
        expect(closing?.at).toBeGreaterThanOrEqual(s.end * 1000)
        expect(moments.some(m => m.kind === 'show' && m.at > s.end * 1000)).toBe(true)
      }
    }
  })

  test('every scene is typed out and read before the next replaces it; only news cuts in, and says so', async () => {
    for (const s of SCENARIOS) {
      for (const model of NARRATOR_MODELS) {
        const { moments } = await rehearse(s, model)
        const shows = moments.filter(m => m.kind === 'show')
        for (const [i, next] of shows.entries()) {
          const prev = shows[i - 1]
          if (!prev || prev.kind !== 'show' || next.kind !== 'show') continue
          const up = next.at - prev.at
          const ask = moments.findLast(m => m.kind === 'ask' && m.at <= next.at && m.at >= prev.at)
          const cutsIn = ask?.kind === 'ask' && ask.prompt.includes('breaks off')
          // Nothing replaces a caption before it is typed out and glanced at; only a cut-in replaces one before it is read.
          expect([s.id, model, up >= typeMs(prev.scene.caption) + GLANCE_MS]).toEqual([s.id, model, true])
          if (!cutsIn) expect([s.id, model, up >= readMs(prev.scene.caption) - 1000]).toEqual([s.id, model, true])
        }
      }
    }
    // A turn over in seconds still shows its first scene. Sonnet's closing comes back while
    // that one is still being read, so it breaks off from it; Haiku's waits it out.
    const quick = SCENARIOS.find(s => s.id === 'quick')
    if (!quick) throw new Error('expected the quick session')
    for (const model of NARRATOR_MODELS) {
      const { moments } = await rehearse(quick, model)
      expect(moments.filter(m => m.kind === 'show').length).toBe(2)
      const closing = moments.find(m => m.kind === 'ask' && m.closing)
      expect(closing?.kind === 'ask' && closing.prompt.includes('breaks off')).toBe(model === 'sonnet')
    }
  })

  test('a scripted scene keeps its caption and tone whole through the validator', () => {
    for (const s of SCENARIOS) {
      for (const model of NARRATOR_MODELS) {
        for (const r of s.replies[model]) {
          if (!('text' in r)) continue
          const raw = extractJson(r.text) as { caption?: string; tone?: string } | undefined
          const scene = sceneFromReply(r.text)
          if (!raw?.caption) continue
          expect(scene?.caption).toBe(raw.caption)
          expect(scene?.tone).toBe(raw.tone)
        }
      }
    }
  })
})
