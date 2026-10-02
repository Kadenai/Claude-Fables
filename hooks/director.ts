/**
 * The narrator's loop, free of any host: what it remembers, when it asks the
 * model for the next scene, what it does with the reply. The plugin runs it on
 * Claude Code's clock and model (register.tsx); the viewer runs the very same
 * loop on a scripted clock and scripted replies, so a session rehearsed there
 * plays out as it would live.
 */
import type { FablesScene } from '../types'

import { type Activity, pushActivity, summarizeSpeech, summarizeTool } from './activity'
import { backoffMs, buildPrompt, GLANCE_MS, readMs, remember, sceneFromReply, type StoryBeat, SYSTEM, typeMs } from './narrator'
import { lookFor } from './looks'

/** The models that can write the story: Sonnet by default, Haiku for quicker, cheaper scenes. */
export const NARRATOR_MODELS = ['sonnet', 'haiku'] as const
export type NarratorModel = (typeof NARRATOR_MODELS)[number]
export const DEFAULT_MODEL: NarratorModel = 'sonnet'
export const MODEL_LABELS: Record<NarratorModel, string> = { sonnet: 'Sonnet', haiku: 'Haiku' }

/** A model name as a person might type it, or as an older config holds it, to one of the narrators. */
export function findModel(name: unknown): NarratorModel | undefined {
  const s = typeof name === 'string' ? name.trim().toLowerCase() : ''
  return NARRATOR_MODELS.find(m => s === m || s.startsWith(`claude-${m}`) || s.includes(m))
}

/** How long the closing scene of a turn stays up. */
export const LINGER_MS = 30000
/** What the model is expected to take to answer until it has been timed, and the bounds of that guess. */
export const FIRST_LATENCY_MS = 3000
const LATENCY_BOUNDS = [1000, 10000] as const

export type Ending = 'answer' | 'aborted' | 'error' | 'refusal'

/** What the narrator asks of the model, as the host's model call takes it. */
export type Ask = { model: NarratorModel; system: string; prompt: string; maxTokens: number; effort: 'low'; timeoutMs: number }
export type Answer = { isAnswered: boolean; text: string }

/** What happens inside the loop, for whoever wants to watch it (the viewer does). */
export type Trace =
  | { kind: 'ask'; at: number; model: NarratorModel; prompt: string; closing?: Ending }
  | { kind: 'reply'; at: number; model: NarratorModel; text: string; isAnswered: boolean; scene: FablesScene | null; isStale: boolean }
  | { kind: 'failed'; at: number; error: string }
  | { kind: 'wait'; at: number; until: number; failures: number }
  | { kind: 'hold'; at: number; until: number }
  | { kind: 'clear'; at: number }

/** The host's side: its clock, its model, and the band the scene goes to. */
export type Host = {
  now(): number | Promise<number>
  complete(ask: Ask): Promise<Answer>
  show(scene: FablesScene | null): void | Promise<void>
  after(ms: number, run: () => void): { cancel(): void }
  trace?(event: Trace): void
}

export class Director {
  model: NarratorModel = DEFAULT_MODEL
  isOn = true
  /** The style scenes are drawn in, so the narrator can write in its voice. */
  look = 'pixel'
  ask = ''
  log: Activity[] = []
  story: StoryBeat[] = []
  isTurnRunning = false
  isDirty = false
  isAsking = false
  ending: Ending | undefined = undefined
  nextAt = 0
  failures = 0
  turn = 0
  /** The scene on the band, if any. */
  shown: FablesScene | undefined = undefined
  /** Until then the scene on the band is still typing, or only just typed: nothing replaces it. */
  typedUntil = 0
  /** Until then the scene on the band is still being read: only news (a failure, the turn ending) cuts in. */
  readUntil = 0
  /** A scene come back while the one on the band is still being read; it goes up when that one is. */
  waiting: { scene: FablesScene; closing: Ending | undefined; cutsIn: boolean } | undefined = undefined
  /** Something failed since the last ask: the next scene may cut in on the one being read. */
  isUrgent = false
  /** How long the model takes to answer, smoothed, so the next scene is asked for in time to follow on. */
  latency = FIRST_LATENCY_MS
  private linger: { cancel(): void } | undefined

  private note(entry: Activity) {
    this.log = pushActivity(this.log, entry)
    this.isDirty = true
  }

  /** The person asked something: a new turn, a fresh log. */
  submit(text: string) {
    this.turn++
    this.ask = text.replace(/\s+/g, ' ').trim().slice(0, 300)
    this.log = []
    this.ending = undefined
    this.isTurnRunning = true
    this.isDirty = true
    this.isUrgent = false
    this.waiting = undefined
    // The last turn's closing scene has been read enough once typed: the new story may begin.
    this.readUntil = Math.min(this.readUntil, this.typedUntil)
    this.linger?.cancel()
  }

  /** The agent called a tool. */
  tool(tool: string, input: Readonly<Record<string, unknown>>) {
    this.note({ kind: 'tool', text: summarizeTool(tool, input) })
  }

  /** A tool call was denied or came back an error. */
  failed(tool: string, input: Readonly<Record<string, unknown>>) {
    this.note({ kind: 'failed', text: summarizeTool(tool, input) })
    this.isUrgent = true
  }

  /** The agent said something between its tool calls. */
  said(text: string) {
    const flat = text.trim()
    if (flat) this.note({ kind: 'said', text: summarizeSpeech(flat) })
  }

  /** The turn ended; if anything happened, a closing scene follows. */
  complete(reason: Ending) {
    if (!this.isTurnRunning) return
    this.isTurnRunning = false
    if (this.isOn && this.log.length > 0) this.ending = reason
  }

  /**
   * Called once a second, with the host to ask through. Puts up a scene that was
   * waiting once the one on the band has been read, and asks for the next scene
   * when there is news: early enough that it comes back as the one on the band
   * is read through, or at once for a failure or the turn's end.
   */
  async tick(host: Host) {
    if (!this.isOn) return
    const now = await host.now()
    if (this.waiting) {
      if (now >= (this.waiting.cutsIn ? this.typedUntil : this.readUntil)) await this.present(host, this.waiting, now)
      return
    }
    if (this.isAsking) return
    if (this.ending) return this.narrate(host, now)
    if (!this.isTurnRunning || !this.isDirty) return
    if (now < this.nextAt) return
    if (!this.isUrgent && now < this.readUntil - this.latency) return
    return this.narrate(host, now)
  }

  private async narrate(host: Host, startedAt: number) {
    this.isAsking = true
    this.isDirty = false
    const forTurn = this.turn
    const closing = this.ending
    this.ending = undefined
    const isUrgent = this.isUrgent || closing !== undefined
    this.isUrgent = false
    // News that will come back while the scene on the band is still being read cuts in on it, and the narrator is told so.
    const interrupts =
      isUrgent && this.shown && startedAt + this.latency < this.readUntil ? { why: closing ? ('ended' as const) : ('failed' as const), line: this.shown.caption } : undefined
    const look = lookFor(this.look)
    const prompt = buildPrompt({ ask: this.ask, log: this.log, story: this.story, ending: closing, look: look.voice ? look : undefined, interrupts })
    host.trace?.({ kind: 'ask', at: startedAt, model: this.model, prompt, closing })
    try {
      const reply = await host.complete({ model: this.model, system: SYSTEM, prompt, maxTokens: 2000, effort: 'low', timeoutMs: 30000 })
      const now = await host.now()
      if (reply.isAnswered) {
        const [lo, hi] = LATENCY_BOUNDS
        this.latency = Math.round(Math.min(hi, Math.max(lo, this.latency * 0.6 + (now - startedAt) * 0.4)))
      }
      const drawn = reply.isAnswered ? sceneFromReply(reply.text) : null
      // A reply that lands after a newer turn began belongs to a story nobody is watching.
      const isStale = forTurn !== this.turn
      host.trace?.({ kind: 'reply', at: now, model: this.model, text: reply.text, isAnswered: reply.isAnswered, scene: drawn, isStale })
      if (!drawn) {
        this.failures++
        return
      }
      this.failures = 0
      if (isStale) return
      // Only a scene written to cut in may cut in; any other waits for the one on the band to be read.
      this.waiting = { scene: drawn, closing, cutsIn: interrupts !== undefined }
      const until = interrupts ? this.typedUntil : this.readUntil
      if (now >= until) await this.present(host, this.waiting, now)
      else host.trace?.({ kind: 'hold', at: now, until })
    } catch (err) {
      this.failures++
      host.trace?.({ kind: 'failed', at: await host.now(), error: err instanceof Error ? err.message : String(err) })
    } finally {
      this.isAsking = false
      const now = await host.now()
      this.nextAt = now + backoffMs(this.failures)
      host.trace?.({ kind: 'wait', at: now, until: this.nextAt, failures: this.failures })
    }
  }

  /** Puts a scene on the band, and holds it there until it has been read. */
  private async present(host: Host, next: NonNullable<Director['waiting']>, now: number) {
    this.waiting = undefined
    const { scene, closing } = next
    this.story = remember(this.story, scene)
    this.shown = scene
    this.typedUntil = now + typeMs(scene.caption) + GLANCE_MS
    this.readUntil = now + readMs(scene.caption)
    await host.show(scene)
    if (closing) {
      this.linger?.cancel()
      this.linger = host.after(LINGER_MS, () => {
        if (this.isTurnRunning) return
        this.shown = undefined
        void host.show(null)
        void Promise.resolve(host.now()).then(at => host.trace?.({ kind: 'clear', at }))
      })
    }
  }

  /** Turned off: no more asking, and the band is cleared. */
  async setOn(host: Host, value: boolean) {
    this.isOn = value
    if (value) return
    this.waiting = undefined
    this.shown = undefined
    await host.show(null)
  }
}
