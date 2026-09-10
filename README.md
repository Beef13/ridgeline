# Ridgeline

An endless runner in three.js, rendered through a 1994 output stage: the scene
is drawn at 256x224, snapped to a fixed 63-colour palette with two-tone ordered
dithering, then optionally run through a CRT pass.

    git clone <this repo>
    cd ridgeline
    npm install
    npm run dev

(On Windows PowerShell use `npm.cmd`; plain `npm` is blocked by the default
script execution policy.)

**Space** starts the run, jumps, and double-jumps. **Down** ducks, and in the
air it slams you back to the ground. **M** mutes the music. **`** hides the
tuning panel.

## Tests

    npm run test:logic          # controller physics, no browser, instant

    npm run build && npm run preview   # in one terminal
    npm run test:browser               # in another

`test/logic.mjs` steps the controller directly at a fixed rate — no renderer,
no timing luck. It exists because the browser test misses short jumps at
software-render framerates. The browser tests need Chromium:
`npx playwright install chromium`.

## The design bench

`tools/prerender-bench.html` is the look-and-feel tool — open it directly in a
browser, no server needed. Every visual decision (sky, vistas, palette, grade,
CRT) and the platformer feel numbers are sliders there. **Copy config** exports
a JSON blob; that blob *is* `src/design.js`. The game reads it — it has no
look settings of its own.

## The four obstacles

Each one demands a different answer, which is what makes the game readable
rather than purely reflexive — you have to identify which answer applies.

| | |
|---|---|
| **crate** | a timber crate, low and wide — a normal jump |
| **fence** | a length of timber fence, tall — needs a full-height jump; a clipped one kills you |
| **sign** | a trail signpost cantilevered over the path, clear air beneath — you must duck; jumping kills you |
| **raptor** | a flyer — jump the low one, duck the high one. Past ~320m they start climbing and diving between the two, so the answer is only settled when you get there |

Difficulty is **spacing**, not speed. Speed ramps on its own; the gap between
obstacles is derived from current speed times a reaction window, so the game
stays fair as it gets faster.

## What matters here

**The order of the render passes is not arbitrary.** The scene renders to a
low-res target, gets quantised to the palette, and only then goes through the
tube. Softening before quantising doesn't work — the palette snap re-hardens
every edge you softened. The HUD is drawn into the same low-res buffer *before*
the palette pass, so it gets quantised too; a DOM overlay would sit at native
resolution and break the illusion instantly.

**Collision and terrain share one function.** `heightAt(x)` is a pure function
of x — it builds the mesh and answers the physics, so there is no second source
of truth to drift. Chunks are just mesh windows onto it, built ahead and thrown
away behind, which is what makes the level endless without the scene graph
growing.

**The ground owns no shape of its own.** Every number `heightAt` uses comes from
`design.ground`, so the bench is the only place terrain gets designed. The bed
heights vary per block but are derived from *world* x, never chunk-local — get
that wrong and every chunk seam shows as a step in the cliff face.

**Feel lives in `src/player/tuning.js`.** Every number is a live slider,
because feel is found by dragging, not by editing a file and reloading — you
lose the comparison in the reload. **Copy settings** puts the tuned block on
your clipboard to paste back into the file.

The three levers that matter most, none of which show up in a screenshot:

- **Asymmetric gravity** — heavier falling than rising. The biggest single lever.
- **Coyote time** — still jumpable just after leaving the ground.
- **Jump buffering** — a jump pressed just before landing still fires.

## Layout

    src/render/   palette, shaders, the two-pass pipeline
    src/world/    terrain height function + chunk meshes, streamer, scatter, sky
    src/player/   runner controller, tuning numbers, stand-in figure
    src/core/     fixed-step loop, input, colour helper
    src/ui/       in-buffer HUD, live tuning panel
    src/design.js the bench export — replace this whole file to redesign
                  (its `ground` block drives terrain.js: shape, beds, colours)
    tools/        the prerender bench (open the .html directly)
    test/         logic tests (no browser) + Playwright browser tests
    public/art/   vista PNGs, transparent-backed
    public/audio/ music

## Gotchas worth knowing

**Colour management.** three converts hex to linear automatically since r152,
so `new THREE.Color('#hex')` is already linear. Converting again makes
everything dark and swings warm greys red. `src/core/colour.js` is the one
place that conversion happens.

**Triangle winding.** Get it backwards and surfaces render black, because the
light ends up on the other side of the face. Every quad in `terrain.js` is
wound so its normal faces the camera.

**Vertical faces only.** A cliff face that recedes as it falls tilts its normal
downward, away from the key light, and goes black. The strata beds are vertical
planes stepped back in z instead.

**The frame clamp.** `startLoop` caps each frame at 0.1s to prevent a spiral of
death, which means a machine too slow to hold ~10fps runs the game in slow
motion rather than skipping ahead. Fair, but worth knowing.

**Scattered art is a rule, not a placement.** `scatterart.js` reads the bench's
per-asset rule (how many per 100 units, size range, depth spread) and derives
every instance from world x alone — never from the chunk index. Seed off the
chunk and the ridge reshuffles itself as you run along it, and instances vanish
at every seam. `test/scatter.mjs` asserts the chunking is a true partition.

**Looping music.** `<audio loop>` is not usable: the track ends on a fade-out,
so looping fades to silence then jumps back at full level. `src/core/audio.js`
runs two elements and equal-power crossfades the second in 18s before the end,
dropping the outro. Equal power means the *sum of squares* holds level — a
linear fade dips audibly in the middle.

## Next

- Swap the stand-in for a rigged `.glb` (import, strip textures, relight, drive
  clips or a procedural cycle).
- Sound effects, and a scoring curve that rewards near-misses.
- A pulsing difficulty curve in `gapFor` rather than a monotonic ramp.
