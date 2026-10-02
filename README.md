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

- **Sonnet writes data, not code.** Each scene is a small declarative JSON object: a backdrop, Claude's action, particles, a caption and its tone. `hooks/scene.ts` validates it strictly: unknown fields are dropped, numbers clamped, strings flattened and cut, and colors must be 3- or 6-digit hex. A bad reply can't break anything; it just doesn't show.
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
| `hooks/looks.ts` | The looks: Pixel Art, the Original, and the registry of styles |
| `hooks/styles/*.ts` | The nine gallery styles, each an art bible: inks, how each kind of element is drawn, Claude, caption, tag, frame |
| `hooks/art/roles.ts`, `hooks/art/painter.ts`, `hooks/art/ink.ts` | The roles scenes paint their elements under, and the painter a style redraws them with |
| `hooks/grade.ts` | The medium a grid style sets the drawn stage into: tesserae or a weave |
| `hooks/clawd3d.ts` | The 3D Claude: the box model, its motions and its projection (ported from the gallery) |
| `hooks/hero3d.ts` | Bakes the posed 3D model into SVG frames that SMIL plays in turn |
| `hooks/scenery.ts` | The seven authored scenes: light maps, materials, reflections |
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
- `/fables style <name>`: draw every scene in one of the styles below, for example `/fables style ukiyo-e` or `/fables style golden age`. `/fables style` lists them, and `/fables style off` goes back to the default, Pixel Art. It is remembered across sessions.
- `/fables pixel off` and `/fables pixel on` still work: they switch between the original look drawn smooth and its pixel art.
- **Scene model:** Sonnet by default. You can switch to `haiku` (cheaper, faster) or `opus` in the config menu, or under `pluginConfigs.fables.model` in settings.

Every scene is one small Sonnet request, so this costs a few requests per minute while Claude is working.

## The scenes

Claude is drawn as the gallery's 3D model: the same box body, arms, legs and pill eyes, lit and depth-sorted. The band's frame runs no script, so the model can't be drawn live. `hooks/clawd3d.ts` poses it 6 to 12 times per motion (walk, run, swim, fly, dig, inspect, celebrate, think, idle), `hooks/hero3d.ts` bakes each pose into flat SVG polygons, and the scene flips through them with SMIL. Walking and running end in an idle loop on arrival. The model can't follow the cursor or be dragged; those need the live engine.

Each of the seven backdrops in `hooks/scenery.ts` is an authored scene with one brief, one light source and a small palette:

| Backdrop | The scene |
| --- | --- |
| forest | Dawn in an old forest: a low sun behind two rows of firs on brown trunks, mist between them, light falling through in shafts and pooling in a clearing, two great trunks framing the edges |
| space | Earthrise over a lunar outpost: a low sun rakes the regolith, so every swell has a lit crest, every crater a black bowl and a bright far wall, every rock a long shadow |
| city | Blue hour after rain: towers with lit west edges and dark east faces, offices lit a floor at a time, a spire, an elevated train, and the whole skyline mirrored in the wet street |
| desert | Mesa sunset: the sun sets in a notch the ranges leave clear, so they face us in violet shade with their sunward sides burning, and their shadows fan toward us across the sand |
| volcano | A night eruption: the crater lights its own ash column from beneath, lava runs down a gullied cone, and a stream crosses a black crust crazed with glowing cracks |
| lab | Working late: an architect's lamp warms the board-formed concrete and the bench, dust turns in its cone, rain beads on the window over a city opened into bokeh, and the polished floor mirrors the room |
| night | A sleeping village: hills under a high moon, cottages with one lit window and a thread of smoke, a great oak framing the view, fireflies |

### How they are lit

Every surface is painted twice. First as light: a warm key where the light source reaches, cool shade facing away, deep tones where surfaces meet. Then that light map is multiplied by a material, built in an SVG filter from seeded noise cut into a small palette of related colors: needles, bark, grass, basalt, sandstone, sand, regolith, concrete, wood, asphalt. Light that has to brighten a dark material (shafts, lava glow, lamp pools) is added on top with a screen blend instead. Glows bloom, far layers sit slightly out of focus, rims of light appear only where the light can actually reach, and a lens pass adds fine grain and a vignette over the whole frame, Claude included.

Wet and polished floors reflect: the city's skyline and the lab's room are drawn once, then placed again upside down, blurred and broken by ripples, strongest in the puddles.

Depth comes from atmospheric perspective: further layers are lighter and nearer the sky's color. Focal points sit off the middle, so the middle of the stage, where Claude and the caption are, stays calm. Silhouettes come from smooth noise rather than repeated tiles, so there is no seam at any width. Everything is clipped to the stage, and motion is slow and belongs to the story.

The band's frame takes at most 131,072 characters, so repeated things are drawn once and placed many times: the firs, the grass clumps and the furthest tree line are templates. A scene that would still run over is redrawn leaner, then without particles, and as a last resort on the flat stage.

### Captions

The story is told in words. Props aren't drawn on the scene, so nothing competes with Claude and the caption.

In the Pixel Art look (the default), the whole stage, scenery and Claude together, goes through a pixelizer: one SVG filter that samples the drawing at the middle of every two-unit square and spreads each sample over its square, so everything reads as pixel art without any of it being redrawn, and no blur washes the colors out. The grid starts at the stage's corner, so the pixels line up. Claude gets a sprite filter of its own on the same grid: its body sampled crisp, its eyes (finer than a pixel) found by their darkness and thickened just enough to land on whole pixels, and a one-pixel dark outline round it, as a pixel-art character would have. The caption sits above it all, already in pixel type, so it stays sharp. In the Original look, scenes are drawn smooth and the scenery takes a slight blur instead, so Claude and the caption read first.

The caption is one standard bubble of cartoon paper with a tail pointing at Claude, set in [Monocraft](https://github.com/IdreesInc/Monocraft) by Idrees Hassan (SIL Open Font License, `fonts/Monocraft-OFL.txt`), embedded as a 5 KB subset so it reads the same everywhere. It stays with Claude and never covers it: it takes a spot just beside, above or (for a flying Claude) below, checked against Claude's whole path, jumps and sways included, and while Claude walks the bubble walks along. Inside it, kinds of words are set apart, so a caption reads like a terminal:

| Kind | Example | Looks like |
| --- | --- | --- |
| code and commands (in backticks, or a known command) | `npm test` | teal |
| files and paths | dates.ts, src/auth | blue |
| functions | daysInMonth() | purple |
| numbers and timings | 312, 2.41s, 42/42 | orange, bold |
| failures | failed, TypeError, N+1 | red, bold |
| successes | passed, clean, green | green, bold |
| ASCII faces and symbols | ^_^ >_< \o/ -> [OK] | warm accent |

The narrator also picks a tone for the moment. Trouble leads the caption with a red ✗ and a milestone with a green ✓; a celebration is a milestone unless it says otherwise. The narrator is asked to write like a developer, with backticks around code and the odd ASCII face.

The model and its projection are ported from the gallery's engine by [ChetasLua](https://github.com/ChetasLua), under the MIT License.

## Styles

Two looks draw the authored scenes as they are: **Pixel Art** (`pixel`, the default) and the **Original** (`original`), the same scenes drawn smooth.

Nine more styles, from the [Claude Mascot Style Gallery](https://github.com/henrik-thevibe/Claude-Mascot-Style-Gallery), are artworks of their own. Each one redraws every element of every scene, Claude, the caption bubble, the chapter tag and the frame in its own medium, translated from the gallery's original plate. They are cosmetic only: the story, the scenery's composition and Claude's path stay as they are, and nothing is added to a scene.

| Style | `/fables style …` | The artwork |
| --- | --- | --- |
| Cave Painting | `cave` | Ochre, soot and pale earth rubbed thin on torch-lit limestone; no sky, only the wall; broken soot outlines; Claude in red ochre |
| Blueprint | `blueprint` | White line work on a cyanotype sheet; shade section-hatched, air and light as phantom lines; Claude as a patent drawing with hidden edges dashed |
| Mosaic | `mosaic` | Laid in the floor's stones and set as tesserae in grout, outlined in rows of dark stones; a meander border |
| Frutiger Aero | `aero` | Saturated glossy gradients with a white rim on every surface: a deep azure sky with cumulus and a sun flare, Frutiger Aurora ribbons and bokeh at night; Claude as tangerine jelly |
| Copperplate Engraving | `engraving` | One sepia ink on laid paper, every tone cut as hatching along the grain of what it is; a plate mark |
| Millefleur Tapestry | `tapestry` | Woven in madder, woad, weld and walnut wool on the loom's grid; grass becomes the field of a thousand flowers |
| Golden Age Comic | `golden` | Flat newsprint inks, shade in Ben-Day dots, heavy keylines; a lettered balloon |
| Ukiyo-e | `ukiyoe` | Flat woodblock inks over a key line, bokashi skies, kasumi mist, a vermilion sun; a cartouche and seal |
| Kamon | `kamon` | Cream planes on black silk parted by cuts of one width; Claude as a crest; the vermilion hanko |

### How a style redraws a scene

Every element of a scene is handed to a painter under a *role* that says what it is and how deep it stands (`hooks/art/roles.ts`): a fir, a mist bank, a mesa, the lamp's cone, the wet street. The original looks keep the lit, photographic painting. A style's painter (`hooks/art/painter.ts`, `hooks/styles/*.ts`) reads that painting for its shapes and tones and draws it again:
- the lit look's blooms, materials and lens are left out;
- each lit color becomes one of the style's inks, wools, stones or threads, chosen by the element's family and depth;
- shapes take the style's line;
- what has no edge in the art form (sun and moon, mist, light, water) is redrawn by the style's own conventions.

Claude is drawn by each style's hero painter, from the 3D model's faces, its parts' outline hulls and its edges, which are classed as outline, crease or hidden as in the gallery's engine. A style made on a grid (Mosaic, Tapestry) names that grid as its medium: the drawn stage is set into tesserae or a weave, and its grout or the weave's ribs are laid over it. The narrator hears each style's voice, so a caption can sound like a 1938 comic or a woodblock print while still being about the real work.

The styles draw as fast as the original look or faster, since they leave out the lit look's material filters, and every one fits the band's size limit at every width.

## Develop

```sh
claude plugin validate .              # manifest, hooks and state contract
claude plugin test .                  # unit tests plus engine tests (stubbed Sonnet)
bun scripts/preview.ts > gallery.html # render sample scenes to a page in the browser
bun scripts/preview.ts --look all > styles.html # every look
```

`scripts/scenarios.ts` holds five whole sessions (prompt, tool calls, Claude's words, and the scenes for each moment) that the viewer plays back on the mod's own narration loop; a test keeps every scripted scene valid. `bun scripts/preview.ts my-scenes.json` renders your own scenes, which is handy for tuning sprites or trying out what Sonnet sent back.

The mod API is early access and may change between Claude Code releases. This mod was built against Claude Code 2.1.287. If something stops drawing, run `claude --debug`: the log line will name what the engine refused.
