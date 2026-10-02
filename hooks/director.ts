/**
 * The narrator's loop, free of any host: what it remembers, when it asks the
 * model for the next scene, what it does with the reply. The plugin runs it on
 * Claude Code's clock and model (register.tsx); the viewer runs the very same
 * loop on a scripted clock and scripted replies, so a session rehearsed there
 * plays out as it would live.
 */
import type { FablesScene } from '../types'

import { type Activity, pushActivity, summarizeSpeech, summarizeTool } from './activity'
import { backoffMs, buildPrompt, remember, sceneFromReply, type StoryBeat, SYSTEM } from './narrator'
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
    this.linger?.cancel()
  }

  /** The agent called a tool. */
  tool(tool: string, input: Readonly<Record<string, unknown>>) {
    this.note({ kind: 'tool', text: summarizeTool(tool, input) })
  }

  /** A tool call was denied or came back an error. */
  failed(tool: string, input: Readonly<Record<string, unknown>>) {
    this.note({ kind: 'failed', text: summarizeTool(tool, input) })
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
   * Called once a second, with the host to ask through: asks for the next scene
   * when there is news and the gap since the last has passed.
   */
  async tick(host: Host) {
    if (!this.isOn || this.isAsking) return
    if (this.ending) return this.narrate(host)
    if (!this.isTurnRunning || !this.isDirty) return
    if ((await host.now()) < this.nextAt) return
    return this.narrate(host)
  }

  private async narrate(host: Host) {
    this.isAsking = true
    this.isDirty = false
    const forTurn = this.turn
    const closing = this.ending
    this.ending = undefined
    const look = lookFor(this.look)
    const prompt = buildPrompt({ ask: this.ask, log: this.log, story: this.story, ending: closing, look: look.voice ? look : undefined })
    host.trace?.({ kind: 'ask', at: await host.now(), model: this.model, prompt, closing })
    try {
      const reply = await host.complete({ model: this.model, system: SYSTEM, prompt, maxTokens: 2000, effort: 'low', timeoutMs: 30000 })
      const drawn = reply.isAnswered ? sceneFromReply(reply.text) : null
      // A reply that lands after a newer turn began belongs to a story nobody is watching.
      const isStale = forTurn !== this.turn
      host.trace?.({ kind: 'reply', at: await host.now(), model: this.model, text: reply.text, isAnswered: reply.isAnswered, scene: drawn, isStale })
      if (!drawn) {
        this.failures++
        return
      }
      this.failures = 0
      if (isStale) return
      this.story = remember(this.story, drawn)
      await host.show(drawn)
      if (closing) {
        this.linger?.cancel()
        this.linger = host.after(LINGER_MS, () => {
          if (this.isTurnRunning) return
          void host.show(null)
          void Promise.resolve(host.now()).then(at => host.trace?.({ kind: 'clear', at }))
        })
      }
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

  /** Turned off: no more asking, and the band is cleared. */
  async setOn(host: Host, value: boolean) {
    this.isOn = value
    if (!value) await host.show(null)
  }
}
