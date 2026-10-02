import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FablesScene } from '../types'

import { type Activity, pushActivity, summarizeSpeech, summarizeTool } from './activity'
import { backoffMs, buildPrompt, remember, sceneFromReply, type StoryBeat, SYSTEM } from './narrator'
import { H, sceneToSvg, W } from './svg'

const scene = atom({ plugin: 'fables', key: 'scene' } as const, null)
const enabled = atom({ plugin: 'fables', key: 'enabled' } as const, true)

const STORE_ENABLED = 'enabled'
/** How long the closing scene of a turn stays up. */
const LINGER_MS = 30000
/** This plugin's own tools, if it ever registers any, are not part of the story. */
const OWN_TOOLS = 'mcp__fables__'

/** CSS pixels per cell of the band, to turn its width in cells into pixels. */
const PX_PER_COLUMN = 8

/** The band's width in CSS pixels, kept between the stage's size and twice it so text stays legible. */
function bandWidth(columns: number): number {
  const px = Number.isFinite(columns) && columns > 0 ? columns * PX_PER_COLUMN : W
  return Math.round(Math.min(W * 2, Math.max(W / 2, px)))
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
      prompt: buildPrompt({ ask: n.ask, log: n.log, story: n.story, ending: closing }),
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
    linger: undefined,
  }

  on('session.start', async ($, e, next) => {
    n.isOn = (await $.store.get(STORE_ENABLED)) !== false
    await update($, enabled, () => n.isOn)
    await $.command.register({
      name: 'fables',
      description: 'Claude Fables: turn the cartoons above the prompt on or off',
      argumentHint: '[on|off]',
    })
    $.clock.every(1000, () => void tick($, n))
    return next(e)
  })

  on('command.run', { command: 'fables' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
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
    // is a 300x150 box), so give it the band's whole width at the stage's shape.
    const width = bandWidth(e.props.bodyColumns)
    const height = Math.round((width * H) / W)
    return (
      <Svg
        source={sceneToSvg(current, { width, height })}
        alt={current.caption}
        width={width}
        height={height}
        isInteractive
      />
    )
  })
}
