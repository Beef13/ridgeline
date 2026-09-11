# Ridge Run — obstacle modelling reference

Four OBJ files of plain boxes. Import one, put it on a locked reference layer,
and model inside it.

| file | what's in it |
|---|---|
| `crate_reference.obj` | nominal box + the smallest and largest it ever spawns |
| `fence_reference.obj` | nominal box + shortest and tallest spawn |
| `sign_reference.obj` | the board (which collides) and the mast (which doesn't) |
| `all_obstacles_reference.obj` | the three side by side, for judging them as a set |

Every file also carries `PLAYER_standing_1.62` and `PLAYER_ducking_0.82`, off to
one side, and a bar along **+X** showing the direction of travel.

## Coordinates

Written **Z-up**, so they land the right way in Rhino. Model in Rhino's own
space and let the glTF exporter convert on the way out.

| Rhino | game | meaning |
|---|---|---|
| +X | +X | direction the player runs |
| +Y | −Z | away from the camera |
| +Z | +Y | up |

**Origin at the bottom centre of the footprint.** Units are game units, roughly
metres.

## Rules that bite

1. **The collision box comes from the code, not your mesh.** Fill the nominal
   box in X and Z; never exceed it. Overhang kills the player from somewhere
   they can see they aren't. Depth (Rhino Y) never collides — it is free.
2. **Crate and fence are randomly sized per spawn.** Model to the nominal box;
   the min/max boxes show how far it gets stretched. Anything whose proportions
   can't survive that (fine battens, mitred corners) will distort.
3. **The sign's mast must stay behind the running line** — it's at Rhino
   `y = +0.42` for that reason. Only the board collides; the player ducks under
   it. Mast geometry crossing `y = 0` will intersect the character.
4. **No colour, no textures.** The grade runs ≈2.9×, so anything above
   `#5a3a1e` clips to a flat glowing slab. Name your objects or layers
   **`plank`** or **`timber`** and the loader will assign the game's existing
   materials — which is also what keeps the LOOK panel's tint slider working.
5. **Nothing finer than ~0.1 units.** A crate is about 30 screen pixels tall;
   detail below ~3px dissolves in the palette snap. Materials use flat shading,
   so faceted and low-poly is the target, not a compromise.

## Export

GLB. Mesh the NURBS first and keep the render mesh coarse. Triangle count
barely matters — the GPU is idle. **Mesh and material count does**: the scene is
draw-call bound, so join objects sharing a material rather than exporting fifty
separate breps.
