# Claude Fables

A Claude Code mod for the **desktop app**. It turns whatever Claude is doing into a small animated pixel-art cartoon, played in the band above the prompt.

While Claude works, Fables watches each tool call it makes and each line it says. Every few seconds it asks Sonnet to retell the latest moment as a scene. Bug hunts turn into nature documentaries and bad regexes get pulled over by the train police. Claude appears as a small orange critter walking, swimming or flying through the story. When the turn ends there is a closing scene, and it stays up for 30 seconds.

## How it works

```
tool calls, Claude's own words ──► activity log (last 14 lines)
                                         │  every ≥5s while a turn runs
                                         ▼
               Sonnet ($.model.complete) ──► JSON scene ──► parseScene (validate + clamp)
                                                                  │
                                                                  ▼
                                    sceneToSvg ──► one self-animating SVG (SMIL)
                                                                  │
                                                                  ▼
                                        <Svg isInteractive/> in the AbovePrompt band
```

- **Sonnet writes data, not code.** Each scene is a small declarative JSON object: a backdrop, Claude's action, up to 8 props from a sprite library (custom pixel art up to 16×16 is also allowed), particles and a caption. `hooks/scene.ts` validates it strictly: unknown fields are dropped, numbers clamped, strings flattened and cut, and colors must be 3- or 6-digit hex. A bad reply can't break anything; it just doesn't show.
- **The animation runs inside the SVG.** `hooks/svg.ts` compiles a scene into one SVG document that animates itself with SMIL: walk cycles, bobbing, scrolling trains, twinkling stars, and a speech bubble that types itself out. Once the scene is drawn, the desktop needs no redraws for it.
- **It has limits.** Only one Sonnet request runs at a time, scenes come at least 5 seconds apart, and after errors it backs off exponentially, up to 60 seconds. The prompt is always bounded (the last 14 activity lines and the last 4 scenes), so a long session can't outgrow the context window.
- **It fits the window.** The band always gets a cartoon as wide as it is and 192 px tall. A wider window shows more of the scene, not a bigger one, so the art and the text stay the same size. Resizing the window redraws it.
- **Desktop only.** In the terminal the band is left exactly as the engine draws it.

| File | What it does |
| --- | --- |
| `hooks/register.tsx` | The hooks: watches tool calls, replies and turns; draws the band; handles `/fables` |
| `hooks/narrator.ts` | Sonnet's system prompt, prompt building, reply parsing, backoff |
| `hooks/activity.ts` | Boils each tool call down to one readable line |
| `hooks/scene.ts` | The scene format and its validator |
| `hooks/sprites.ts` | The pixel-art library: Claude in two walk frames, plus 30+ props |
| `hooks/svg.ts` | Scene → animated SVG: backdrops, particles, props, hero, caption |
| `hooks/looks.ts` | The graphic styles: color remaps, pixel treatments, textures and frames |
| `hooks/clawd3d.ts` | The 3D Claude: the box model, its motions and its projection (ported from the gallery) |
| `hooks/hero3d.ts` | Bakes the posed 3D model into SVG frames that SMIL plays in turn |
| `types/index.d.ts` | The scene types and the mod's `$.state` contract |

## Install (Claude Code desktop)

1. Clone this repo somewhere permanent, for example `~/code/Claude-Fables`.
2. Add it to the `env` block in `~/.claude/settings.json`:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/you/code/Claude-Fables"
     }
   }
   ```

   To work on the mod with hot reload, also add `"CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"`.
3. Restart the desktop app and give Claude a task in the Code tab. The cartoon appears above the prompt after the first few seconds.

To try it from the terminal for one session instead, run `claude --plugin-dir ~/code/Claude-Fables`. Note that in the terminal the mod only watches and draws nothing.

## Use

- `/fables`: toggle the mod on or off. `/fables on` and `/fables off` also work. The setting is remembered across sessions.
- `/fables figure auto|pixel|3d`: draw Claude as each style chooses, or always as the pixel sprite or the 3D model.
- `/fables style`: list the graphic styles. `/fables style <name>` picks one, and `/fables style shuffle` draws each turn in a different style. The choice is remembered across sessions.
- **Scene model:** Sonnet by default. You can switch to `haiku` (cheaper, faster) or `opus` in the config menu, or under `pluginConfigs.fables.model` in settings.

Every scene is one small Sonnet request, so this costs a few requests per minute while Claude is working.

## Styles

Eighteen graphic styles, after looks from the [Claude Mascot Style Gallery](https://github.com/henrik-thevibe/Claude-Mascot-Style-Gallery). A style changes how a scene is painted, never what happens in it. It remaps every color, chooses how one art pixel is drawn (a solid block, a mosaic tile, a pane of leaded glass, a cross stitch, a printed character, a drafted square) and adds its own textures and frames. The narrator hears which style it is writing for, so the caption's voice can suit it.

| Name | Style | Claude | What it looks like |
| --- | --- | --- | --- |
| `pixel` | Pixel Art | pixel | the original: solid 16-bit pixels (the default) |
| `handheld` | Handheld | pixel | four shades of green on a dotted LCD |
| `teletext` | Teletext Page | pixel | eight broadcast colors, blocky cells, scanlines |
| `mosaic` | Mosaic | pixel | tesserae and grout with a meander border |
| `sampler` | Sampler | pixel | cross stitches on linen |
| `printer` | Line Printer | pixel | ASCII characters on greenbar paper |
| `blueprint` | Blueprint | 3D | white drafting lines on a blue grid, with a title block |
| `neon` | Neon | 3D | glowing tubes on a brick wall that flickers now and then |
| `silhouette` | Silhouette | 3D | black cut paper on cream, in a gilt frame |
| `ukiyoe` | Ukiyo-e | 3D | indigo and vermilion woodblock print on grainy paper |
| `tomb` | Tomb Painting | 3D | earth pigments with a painted frieze |
| `glass` | Stained Glass | 3D | jewel-toned panes with leading |
| `comic` | Golden Age Comic | 3D | primary colors, ink outlines and halftone dots |
| `bauhaus` | Bauhaus | 3D | primary red, blue and yellow shapes on cream |
| `midcentury` | Mid-Century Modern | 3D | teal sky, half-lit sun, mustard ground |
| `lowpoly` | Low Poly | 3D | a late-90s 3D platformer with a gradient sky and a HUD |
| `deco` | Art Deco | 3D | gold sunbeams over a navy skyline, in a double gold frame |
| `pin` | Enamel Pin | 3D | gold-rimmed enamel on pink, with sparkles |

### The 3D Claude

Most styles draw Claude as the gallery's 3D model rather than the pixel sprite: the same box body, arms, legs and pill eyes, lit and depth-sorted. The band's frame runs no script, so the model can't be drawn live. `hooks/clawd3d.ts` poses it 6 to 12 times per motion (walk, run, swim, fly, dig, inspect, celebrate, think, idle), `hooks/hero3d.ts` bakes each pose into flat SVG polygons, and the scene flips through them with SMIL. Walking and running end in an idle loop on arrival. The model can't follow the cursor or be dragged; those need the live engine.

`/fables figure 3d` or `/fables figure pixel` draws Claude the same way in every style. `/fables figure auto`, the default, lets each style choose.

The model and its projection are ported from the gallery's engine by [ChetasLua](https://github.com/ChetasLua), under the MIT License.

The styles live in `hooks/looks.ts`. Adding one means adding one entry there.

## Develop

```sh
claude plugin validate .              # manifest, hooks and state contract
claude plugin test .                  # unit tests plus engine tests (stubbed Sonnet)
bun scripts/preview.ts > gallery.html # render sample scenes to a page in the browser
bun scripts/preview.ts --look all > gallery.html # every sample in every style
```

`bun scripts/preview.ts my-scenes.json` renders your own scenes, which is handy for tuning sprites or trying out what Sonnet sent back.

The mod API is early access and may change between Claude Code releases. This mod was built against Claude Code 2.1.287. If something stops drawing, run `claude --debug`: the log line will name what the engine refused.
