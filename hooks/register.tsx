import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FablesScene } from '../types'

import { type Activity, pushActivity, summarizeSpeech, summarizeTool } from './activity'
import { backoffMs, buildPrompt, remember, sceneFromReply, type StoryBeat, SYSTEM } from './narrator'
import { DEFAULT_LOOK, findLook, LOOK_NAMES, LOOKS, lookFor } from './looks'
import { H, sceneToSvg, W } from './svg'

const scene = atom({ plugin: 'fables', key: 'scene' } as const, null)
const enabled = atom({ plugin: 'fables', key: 'enabled' } as const, true)
const style = atom({ plugin: 'fables', key: 'style' } as const, DEFAULT_LOOK)

const STORE_ENABLED = 'enabled'
const STORE_PIXEL = 'pixelArt'
const STORE_STYLE = 'style'
/** Every scene is drawn with the 3D Claude, in the style the person chose (looks.ts). */
const FIGURE = '3d'
/** How long the closing scene of a turn stays up. */
const LINGER_MS = 30000
/** This plugin's own tools, if it ever registers any, are not part of the story. */
const OWN_TOOLS = 'mcp__fables__'

/**
 * The band's code font advance in CSS pixels: the desktop measures the band in
 * cells of it, and the Svg wants pixels.
 */
const PX_PER_COLUMN = 8
/** CSS pixels per stage unit: the stage's H units come out this many times taller. */
const SCALE = 1.5

/**
 * The band's box in CSS pixels: its whole width, at a fixed height so the art and
 * the caption keep one size whatever the window; the stage widens to fill it.
 */
function bandBox(columns: number): { width: number; height: number } {
  const width = Number.isFinite(columns) && columns > 0 ? Math.round(columns * PX_PER_COLUMN) : W * SCALE
  return { width, height: Math.round(H * SCALE) }
}

type Ending = 'answer' | 'aborted' | 'error' | 'refusal'

/** The narrator's working memory. A reload starts it over, which only costs continuity. */
type Narrator = {
  model: string
  isOn: boolean
  ask: string
  log: Activity[]
  story: StoryBeat[]
  isTurnRunning: boolean
  isDirty: boolean
  isAsking: boolean
  ending: Ending | undefined
  nextAt: number
  failures: number
  turn: number
  /** The style scenes are drawn in, so the narrator can write in its voice. */
  look: string
  linger: Timer | undefined
}

function note(n: Narrator, entry: Activity) {
  n.log = pushActivity(n.log, entry)
  n.isDirty = true
}

async function narrate($: EngineInterface, n: Narrator) {
  n.isAsking = true
  n.isDirty = false
  const forTurn = n.turn
  const closing = n.ending
  n.ending = undefined
  try {
    const reply = await $.model.complete({
      model: n.model,
      system: SYSTEM,
      prompt: buildPrompt({ ask: n.ask, log: n.log, story: n.story, ending: closing, look: lookFor(n.look).voice ? lookFor(n.look) : undefined }),
      maxTokens: 2000,
      effort: 'low',
      timeoutMs: 30000,
    })
    const drawn: FablesScene | null = reply.isAnswered ? sceneFromReply(reply.text) : null
    if (!drawn) {
      n.failures++
      return
    }
    n.failures = 0
    // A reply that lands after a newer turn began belongs to a story nobody is watching.
    if (forTurn !== n.turn) return
    n.story = remember(n.story, drawn)
    await update($, scene, () => drawn)
    if (closing) {
      n.linger?.cancel()
      n.linger = $.clock.after(LINGER_MS, () => {
        if (!n.isTurnRunning) void update($, scene, () => null)
      })
    }
  } catch {
    n.failures++
  } finally {
    n.isAsking = false
    n.nextAt = (await $.clock.now()) + backoffMs(n.failures)
  }
}

async function tick($: EngineInterface, n: Narrator) {
  if (!n.isOn || n.isAsking) return
  if (n.ending) return narrate($, n)
  if (!n.isTurnRunning || !n.isDirty) return
  if ((await $.clock.now()) < n.nextAt) return
  return narrate($, n)
}

async function chooseLook($: EngineInterface, n: Narrator, name: string) {
  const look = lookFor(name)
  n.look = look.name
  await $.store.set(STORE_STYLE, look.name)
  await update($, style, () => look.name)
  return { text: `Scenes are now drawn as ${look.label}.` }
}

async function setOn($: EngineInterface, n: Narrator, value: boolean) {
  n.isOn = value
  await $.store.set(STORE_ENABLED, value)
  await update($, enabled, () => value)
  if (!value) await update($, scene, () => null)
}

export const register: Register = (on, options) => {
  const n: Narrator = {
    model: typeof options.model === 'string' && options.model ? options.model : 'sonnet',
    isOn: true,
    ask: '',
    log: [],
    story: [],
    isTurnRunning: false,
    isDirty: false,
    isAsking: false,
    ending: undefined,
    nextAt: 0,
    failures: 0,
    turn: 0,
    look: DEFAULT_LOOK,
    linger: undefined,
  }

  on('session.start', async ($, e, next) => {
    n.isOn = (await $.store.get(STORE_ENABLED)) !== false
    await update($, enabled, () => n.isOn)
    const saved = await $.store.get(STORE_STYLE)
    // Pixel art was once a switch of its own: someone who turned it off keeps the original look, drawn smooth.
    const smooth = (await $.store.get(STORE_PIXEL)) === false
    n.look = typeof saved === 'string' && LOOKS[saved] ? saved : smooth ? 'original' : DEFAULT_LOOK
    await update($, style, () => n.look)
    await $.command.register({
      name: 'fables',
      description: 'Claude Fables: turn the cartoons above the prompt on or off, or pick a style',
      argumentHint: '[on|off|style [name|off]]',
    })
    $.clock.every(1000, () => void tick($, n))
    return next(e)
  })

  on('command.run', { command: 'fables' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const st = /^(?:style|styles|look)\b\s*(.*)$/.exec(arg)
    if (st) {
      const want = (st[1] ?? '').trim()
      if (!want) {
        const list = LOOK_NAMES.map(name => `${name === n.look ? '▸' : ' '} ${name} · ${lookFor(name).label}`).join('\n')
        return { text: `Scenes are drawn in ${lookFor(n.look).label}. Pick a style with /fables style <name>, or /fables style off for the default:\n${list}` }
      }
      const look = /^(off|none|default|plain)$/.test(want) ? lookFor(DEFAULT_LOOK) : findLook(want)
      if (!look) return { text: `No style called "${want}". /fables style lists them.` }
      return chooseLook($, n, look.name)
    }
    // Pixel art is a style now; the old switch still works, as a way to pick it or the smooth original.
    const px = /^pixel(?:\s+(on|off))?$/.exec(arg)
    if (px) return chooseLook($, n, px[1] === 'off' || (!px[1] && n.look === 'pixel') ? 'original' : 'pixel')
    const value = arg === 'on' ? true : arg === 'off' ? false : !n.isOn
    await setOn($, n, value)
    return {
      text: value
        ? `Claude Fables is on: cartoons written by ${n.model} play above the prompt while Claude works.`
        : 'Claude Fables is off.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    n.turn++
    n.ask = e.text.replace(/\s+/g, ' ').trim().slice(0, 300)
    n.log = []
    n.ending = undefined
    n.isTurnRunning = true
    n.isDirty = true
    n.linger?.cancel()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const isTold = e.agentId === undefined && !tool.startsWith(OWN_TOOLS)
    if (isTold) note(n, { kind: 'tool', text: summarizeTool(tool, e) })
    const ran = await next(e)
    if (isTold && (ran.deny !== undefined || ran.isError === true)) {
      note(n, { kind: 'failed', text: summarizeTool(tool, e) })
    }
    return ran
  })

  on('session.append', async ($, e, next) => {
    if (e.door === 'response' && e.agentId === undefined && Array.isArray(e.message.content)) {
      const said = e.message.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join(' ')
        .trim()
      if (said) note(n, { kind: 'said', text: summarizeSpeech(said) })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && n.isTurnRunning) {
      n.isTurnRunning = false
      if (n.isOn && n.log.length > 0) n.ending = e.reason
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    const current = await read($, scene)
    if (!current || !(await read($, enabled))) return next(e)
    const { Svg } = $.ui.resolve(e)
    // The interactive frame does not size itself from the markup (left alone it
    // is a 300x150 box), so give it the band's box; a new width draws anew.
    const { width, height } = bandBox(e.props.bodyColumns)
    return (
      <Svg
        source={sceneToSvg(current, { width, height, look: await read($, style), figure: FIGURE })}
        alt={current.caption}
        width={width}
        height={height}
        isInteractive
      />
    )
  })
}
