import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_MODEL, Director, findModel, type Host, MODEL_LABELS, NARRATOR_MODELS, type NarratorModel } from './director'
import { DEFAULT_LOOK, findLook, LOOK_NAMES, LOOKS, lookFor } from './looks'
import { typeMs } from './narrator'
import { ENTRANCE_SECONDS } from './scene'
import { H, sceneToSvg, W } from './svg'

const scene = atom({ plugin: 'fables', key: 'scene' } as const, null)
const enabled = atom({ plugin: 'fables', key: 'enabled' } as const, true)
const style = atom({ plugin: 'fables', key: 'style' } as const, DEFAULT_LOOK)

const STORE_ENABLED = 'enabled'
const STORE_PIXEL = 'pixelArt'
const STORE_STYLE = 'style'
const STORE_MODEL = 'model'
/** Every scene is drawn with the 3D Claude, in the style the person chose (looks.ts). */
const FIGURE = '3d'
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

/** The narrator's host in a session: Claude Code's clock, its model, and the band. */
function host($: EngineInterface): Host {
  return {
    now: () => $.clock.now(),
    complete: ask => $.model.complete(ask),
    show: drawn => update($, scene, () => drawn),
  }
}

async function chooseLook($: EngineInterface, n: Director, name: string) {
  const look = lookFor(name)
  n.look = look.name
  await $.store.set(STORE_STYLE, look.name)
  await update($, style, () => look.name)
  return { text: `Scenes are now drawn as ${look.label}.` }
}

async function chooseModel($: EngineInterface, n: Director, model: NarratorModel) {
  n.model = model
  await $.store.set(STORE_MODEL, model)
  return { text: `${MODEL_LABELS[model]} now writes the story.` }
}

async function setOn($: EngineInterface, n: Director, value: boolean) {
  await n.setOn(host($), value)
  await $.store.set(STORE_ENABLED, value)
  await update($, enabled, () => value)
}

/**
 * The band's drawing of the scene up now. The same scene in the same box draws
 * the same, so the desktop keeps playing it; redrawn in a new box or style
 * once its caption is out, it opens with the caption already written rather
 * than typing it again.
 */
type Drawn = { scene: string; key: string; source: string; at: number }

export const register: Register = (on, options) => {
  const n = new Director()
  let drawn: Drawn | undefined
  // The config menu's choice is the default; /fables model overrides it.
  const configured = findModel(options.model) ?? DEFAULT_MODEL
  n.model = configured
  n.look = DEFAULT_LOOK

  on('session.start', async ($, e, next) => {
    n.isOn = (await $.store.get(STORE_ENABLED)) !== false
    n.model = findModel(await $.store.get(STORE_MODEL)) ?? configured
    await update($, enabled, () => n.isOn)
    const saved = await $.store.get(STORE_STYLE)
    // Pixel art was once a switch of its own: someone who turned it off keeps the original look, drawn smooth.
    const smooth = (await $.store.get(STORE_PIXEL)) === false
    n.look = typeof saved === 'string' && LOOKS[saved] ? saved : smooth ? 'original' : DEFAULT_LOOK
    await update($, style, () => n.look)
    await $.command.register({
      name: 'fables',
      description: 'Claude Fables: turn the cartoons above the prompt on or off, pick a style, or pick the model that writes them',
      argumentHint: '[on|off|style [name|off]|model [sonnet|haiku]]',
    })
    $.clock.every(1000, () => void n.tick(host($)))
    return next(e)
  })

  on('command.run', { command: 'fables' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const md = /^(?:model|models|narrator)\b\s*(.*)$/.exec(arg)
    if (md) {
      const want = (md[1] ?? '').trim()
      if (!want) {
        const list = NARRATOR_MODELS.map(m => `${m === n.model ? '▸' : ' '} ${m} · ${MODEL_LABELS[m]}`).join('\n')
        return { text: `${MODEL_LABELS[n.model]} writes the story. Pick another with /fables model <name>:\n${list}` }
      }
      const model = findModel(want)
      if (!model) return { text: `No narrator called "${want}". Try /fables model sonnet or /fables model haiku.` }
      return chooseModel($, n, model)
    }
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
        ? `Claude Fables is on: cartoons written by ${MODEL_LABELS[n.model]} play above the prompt while Claude works.`
        : 'Claude Fables is off.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    n.submit(e.text)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const isTold = e.agentId === undefined && !tool.startsWith(OWN_TOOLS)
    if (isTold) n.tool(tool, e)
    const ran = await next(e)
    if (isTold && (ran.deny !== undefined || ran.isError === true)) n.failed(tool, e)
    return ran
  })

  on('session.append', async ($, e, next) => {
    if (e.door === 'response' && e.agentId === undefined && Array.isArray(e.message.content)) {
      const said = e.message.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join(' ')
        .trim()
      n.said(said)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) n.complete(e.reason)
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
    const look = await read($, style)
    const key = `${width}x${height}|${look}`
    const now = await $.clock.now()
    const same = JSON.stringify(current)
    if (drawn?.scene !== same || drawn.key !== key) {
      const isUp = drawn?.scene === same
      const isSettled = isUp && now - (drawn?.at ?? now) >= typeMs(current.caption) + (current.enter ? ENTRANCE_SECONDS * 1000 : 0)
      drawn = { scene: same, key, at: isUp ? (drawn?.at ?? now) : now, source: sceneToSvg(current, { width, height, look, figure: FIGURE, isSettled }) }
    }
    return (
      <Svg
        source={drawn.source}
        alt={current.caption}
        width={width}
        height={height}
        isInteractive
      />
    )
  })
}
