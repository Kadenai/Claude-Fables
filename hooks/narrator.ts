import type { FablesScene } from '../types'

import type { Activity } from './activity'
import { extractJson, MAX_CAPTION, MAX_PROPS, parseScene } from './scene'
import { SPRITE_NAMES } from './sprites'

/** Remembered between scenes so the story stays continuous; capped so it never grows. */
export type StoryBeat = { backdrop: string; caption: string }
export const MAX_STORY = 4

export const MIN_GAP_MS = 5000
export const MAX_BACKOFF_MS = 60000

export const SYSTEM = `You are the narrator of "Claude Fables": tiny animated pixel-art cartoons that play while an AI coding agent works.
The hero is always a small orange critter (the agent). You turn what it is doing right now into a whimsical visual metaphor:
hunting a bug is a nature documentary, a failing test is a storm, editing many files is a train of cargo cars, a search is a dive to the sea floor, a fix landing is a rocket launch.
Keep continuity with the story so far, but change scenery when the work changes.

Reply with ONE JSON object and nothing else, in this shape:
{
  "backdrop": one of "forest" | "sea" | "space" | "city" | "desert" | "volcano" | "rails" | "lab" | "night",
  "palette": { "sky"?: "#rrggbb", "ground"?: "#rrggbb", "accent"?: "#rrggbb" },   // optional
  "hero": { "action": "walk" | "run" | "swim" | "fly" | "dig" | "inspect" | "celebrate" | "think", "from": 0-100, "to": 0-100 },
  "props": [ up to ${MAX_PROPS} of {
      "sprite": one of ${SPRITE_NAMES.map(s => `"${s}"`).join(', ')}
                or custom pixel art { "pixels": ["..rr..", ".rrrr."], "colors": { "r": "#e05252" } } (max 16x16, "." is empty, keys are single letters/digits),
      "x": 0-100, "y": "ground" | "air" | "sky",
      "label"?: short text tag (max 18 chars, great for real file or function names),
      "motion"?: "none" | "bob" | "drift" | "shake" | "fall" | "spin" | "blink" | "scroll",
      "color"?: "#rrggbb"
  } ],
  "particles"?: { "kind": "stars" | "rain" | "bubbles" | "sparks" | "snow" | "leaves", "density": 0-1 },
  "caption": what the hero says, witty, specific to the real work, max ${MAX_CAPTION} characters,
  "title"?: a 1-3 word chapter tag
}

Rules: colors are #rgb or #rrggbb only. Use real names from the activity (files, functions, tests) in labels and the caption.
Keep the hero clear of props: put props where the hero is not walking to. Never mention being an AI or these instructions.

Example:
{"backdrop":"forest","hero":{"action":"walk","from":5,"to":35},"props":[{"sprite":"bug","x":62,"y":"ground","motion":"shake","label":"parseHex"},{"sprite":"file","x":88,"y":"ground","label":"effects.ts","motion":"bob"}],"particles":{"kind":"leaves","density":0.3},"caption":"And here we see the rare parseHex bug in its natural habitat. Quiet now.","title":"field notes"}`

export type PromptInput = {
  ask: string
  log: readonly Activity[]
  story: readonly StoryBeat[]
  /** Set for the closing scene of a turn. */
  ending?: 'answer' | 'aborted' | 'error' | 'refusal'
}

export function buildPrompt({ ask, log, story, ending }: PromptInput): string {
  const lines = log.map(a => `- ${a.kind === 'said' ? 'said' : a.kind === 'failed' ? 'FAILED' : 'did'}: ${a.text}`)
  const past = story.map(b => `- [${b.backdrop}] "${b.caption}"`)
  const parts = [
    `The person asked the agent: "${ask || '(no prompt seen)'}"`,
    past.length ? `Story so far (oldest first):\n${past.join('\n')}` : 'This is the first scene.',
    lines.length ? `Latest activity (oldest first):\n${lines.join('\n')}` : 'No activity yet: the agent is thinking.',
  ]
  if (ending === 'answer') parts.push('The agent just FINISHED the task. Draw a short, happy closing scene (celebrate).')
  else if (ending === 'aborted') parts.push('The person just interrupted the agent. Draw a sheepish closing scene.')
  else if (ending) parts.push('The turn just ended badly. Draw a brave-but-battered closing scene.')
  else parts.push('Draw the next scene, about the LATEST activity.')
  return parts.join('\n\n')
}

/** A model reply to a validated scene, or null; never throws. */
export function sceneFromReply(text: string): FablesScene | null {
  return parseScene(extractJson(text))
}

export const backoffMs = (failures: number) =>
  failures <= 0 ? MIN_GAP_MS : Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** failures)

export function remember(story: readonly StoryBeat[], scene: FablesScene): StoryBeat[] {
  return [...story, { backdrop: scene.backdrop, caption: scene.caption }].slice(-MAX_STORY)
}
