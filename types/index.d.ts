export type FablesBackdrop =
  | 'forest'
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
      /** The look the band draws in: a name from hooks/looks.ts. */
      look: string
      /** How Claude is drawn: as each look says (auto), always the pixel sprite, or always the 3D model. */
      figure: 'auto' | 'pixel' | '3d'
    }
  }
}
