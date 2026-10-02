export type FablesBackdrop =
  | 'forest'
  | 'space'
  | 'city'
  | 'desert'
  | 'volcano'
  | 'lab'
  | 'night'

export type FablesHeroAction =
  | 'walk'
  | 'run'
  | 'swim'
  | 'fly'
  | 'dig'
  | 'inspect'
  | 'celebrate'
  | 'think'

export type FablesMotion = 'none' | 'bob' | 'drift' | 'shake' | 'fall' | 'spin' | 'blink' | 'scroll'

export type FablesParticles = 'stars' | 'rain' | 'bubbles' | 'sparks' | 'snow' | 'leaves'

export type FablesPixelArt = { pixels: string[]; colors: Record<string, string> }

export type FablesProp = {
  sprite: string | FablesPixelArt
  x: number
  y: 'ground' | 'air' | 'sky'
  label?: string
  motion: FablesMotion
  color?: string
}

export type FablesScene = {
  backdrop: FablesBackdrop
  palette: { sky?: string; ground?: string; accent?: string }
  hero: { action: FablesHeroAction; from: number; to: number }
  props: FablesProp[]
  particles?: { kind: FablesParticles; density: number }
  caption: string
  /** How the work is going, which the caption's paper shows. */
  tone?: 'work' | 'trouble' | 'milestone'
  title?: string
}

declare module 'claude-code' {
  interface PluginState {
    fables: {
      scene: FablesScene | null
      enabled: boolean
      /** Draw the stage as pixel art (the default), or smooth. */
      pixelArt: boolean
    }
  }
}
