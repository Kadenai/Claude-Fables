export type FablesBackdrop =
  | 'forest'
  | 'sea'
  | 'space'
  | 'city'
  | 'desert'
  | 'volcano'
  | 'rails'
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
  title?: string
}

declare module 'claude-code' {
  interface PluginState {
    fables: {
      scene: FablesScene | null
      enabled: boolean
    }
  }
}
