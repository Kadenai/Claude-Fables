/**
 * Renders the sample scenes (or a JSON file of your own) to a gallery page, so
 * scenes can be tuned without a Claude session:
 *
 *   bun scripts/preview.ts [scenes.json] > gallery.html
 */
import { readFileSync } from 'node:fs'

import { parseScene } from '../hooks/scene'
import { sceneToSvg } from '../hooks/svg'

import { SAMPLES } from './samples'

const file = process.argv[2]
const scenes: unknown[] = file ? JSON.parse(readFileSync(file, 'utf8')) : SAMPLES
const tiles = scenes.map((raw, i) => {
  const scene = parseScene(raw)
  if (!scene) return `<p>scene ${i}: rejected by parseScene</p>`
  const svg = sceneToSvg(scene)
  return `<figure><figcaption>${i} · ${scene.backdrop} · ${scene.hero.action} · ${svg.length} chars</figcaption>${svg}</figure>`
})
console.log(`<!doctype html><meta charset="utf-8"><title>Claude Fables preview</title>
<style>body{background:#1a1a19;color:#9a978e;font:12px ui-monospace,monospace;margin:16px}figure{margin:0 0 18px}svg{max-width:100%;height:auto;display:block;margin-top:4px}</style>
${tiles.join('\n')}`)
