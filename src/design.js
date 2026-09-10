/**
 * The look, as designed in the Prerender Bench.
 *
 * THE FAST PATH: in the bench hit "Copy config", then
 *
 *     pbpaste > public/design.json
 *
 * and refresh. The game reads that file at boot, so a look change needs no
 * code edit and no rebuild. The object below is the BAKED-IN FALLBACK — what
 * you get if design.json is missing or unparseable, so a bad paste leaves you
 * with the last known-good look rather than a black screen.
 *
 * The `ground` block drives world/terrain.js: silhouette, bed heights, bed
 * colours and the unlit flag. heightAt() owns no constants of its own, and
 * collision reads the same function the mesh is built from.
 */
/* Base-relative, not absolute. On GitHub Pages the site lives under a project
   subpath (/ridgeline/), so a leading "/" points at the user's root domain and
   every asset 404s. Vite fills BASE_URL in at build; the guard is for the node
   tests, which import this file with no bundler around them. */
const BASE = (typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/';
export const ART_DIR = BASE + 'art/';
export const DESIGN_URL = BASE + 'design.json';

const BAKED = {
    "v": 1,
    "saved": "2026-09-10 03:47",
    "raster": {
      "w": 256,
      "h": 224,
      "snap": true
    },
    "colour": {
      "quant": false,
      "mode": "2",
      "amount": 1,
      "pair": 0.49
    },
    "grade": {
      "target": "palette",
      "bright": 1.82,
      "sat": 1.66,
      "contrast": 0.93
    },
    "time": {
      "fps": 12
    },
    "optics": {
      "fov": 14,
      "vistaMaster": 0.32,
      "vistaHorizon": -1
    },
    "atmos": {
      "cue": true,
      "dark": 0,
      "cool": 1.62,
      "tints": [
        0.06,
        1,
        0.74,
        0.5,
        0.32,
        0.62
      ],
      "visible": [
        true,
        true,
        true,
        true,
        true,
        true
      ],
      "fog": {
        "on": true,
        "hex": "#0787c5",
        "near": 118,
        "far": 232,
        "vistas": true
      }
    },
    "sky": {
      "mode": "gradient",
      "steps": 24,
      "stops": [
        {
          "c": "#b12dd2",
          "p": 0
        },
        {
          "c": "#42fff1",
          "p": 0.31
        }
      ]
    },
    "crt": {
      "on": true,
      "soft": 0.91,
      "scan": 0.43,
      "mask": 0.22,
      "glow": 0.69,
      "curve": 0.245,
      "vign": 0.25,
      "gain": 1.61
    },
    "materials": "flat",
    "ground": {
      "base": 1.4,
      "rollAmp": 3.5,
      "rollFreq": 0.056,
      "swellAmp": 0.7,
      "chipAmp": 0.14,
      "moss": 1,
      "depth": 8.5,
      "ledges": false,
      "dress": false,
      "unlitBands": true,
      "topCol": "#878271",
      "mossCol": "#3c8239",
      "rimCol": "#121306",
      "bands": [
        {
          "h": 0.2,
          "col": "#5e5e5e"
        },
        {
          "h": 1.1,
          "col": "#424242"
        },
        {
          "h": 2.6,
          "col": "#20201e"
        }
      ]
    },
    "feel": {
      "runSpeed": 6.4,
      "groundAccel": 26,
      "groundFriction": 26,
      "airAccel": 12,
      "turnBoost": 1.8,
      "gravity": -30,
      "fallGravity": -46,
      "maxFall": -30,
      "jumpVelocity": 10.6,
      "doubleJumpVel": 9.2,
      "jumpCutoff": 0.45,
      "airJumps": 0,
      "duckDrop": -26,
      "coyoteTime": 0.09,
      "jumpBuffer": 0.12,
      "groundSnap": 0.38,
      "maxStep": 0.62
    },
    "assets": [
      {
        "file": "mountain_01_sunset.png",
        "kind": "image",
        "layer": 5,
        "h": 37.5,
        "px": 0,
        "py": 9,
        "pz": 0,
        "fitW": 0,
        "fitDither": 0,
        "fitQuant": true,
        "flip": false,
        "fill": false,
        "drift": 0.02,
        "depth": 165
      },
      {
        "file": "mountain_02_day time.p",
        "kind": "image",
        "layer": 5,
        "h": 37,
        "px": 0,
        "py": 8.5,
        "pz": 0,
        "fitW": 0,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false,
        "drift": 0.03,
        "depth": 128
      },
      {
        "file": "endless-green-forest-s",
        "kind": "image",
        "layer": 5,
        "h": 22,
        "px": 0,
        "py": 0,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false,
        "drift": 0.11,
        "depth": 106
      },
      {
        "file": "White_Small_Cloud_PNG_",
        "kind": "image",
        "layer": 5,
        "scatter": {
          "on": true,
          "dens": 113,
          "sMin": 0.5,
          "sMax": 6,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -15.5,
          "yMax": 21.5,
          "z0": -60,
          "z1": 46.5,
          "depth": 138,
          "drift": 0.41,
          "op": 0.37,
          "rot": 0
        },
        "h": 22,
        "px": 0,
        "py": 0,
        "pz": 0,
        "fitW": 0,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false,
        "drift": 0.19000000000000003,
        "depth": 80
      },
      {
        "file": "Realistic_Pine_Tree_PN",
        "kind": "image",
        "layer": 3,
        "scatter": {
          "on": true,
          "dens": 92,
          "sMin": 6,
          "sMax": 6,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -4.5,
          "yMax": -2,
          "z0": -13,
          "z1": 8,
          "depth": 110,
          "drift": 0.06,
          "op": 1,
          "rot": 0
        },
        "h": 12,
        "px": -2.25,
        "py": 5,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": true,
        "flip": false,
        "fill": false
      },
      {
        "file": "a-dead-tree-on-a-trans",
        "kind": "image",
        "layer": 2,
        "scatter": {
          "on": true,
          "dens": 48,
          "sMin": 3.65,
          "sMax": 4.6,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -2.5,
          "yMax": -1,
          "z0": 4.5,
          "z1": -4.2,
          "depth": 110,
          "drift": 0.06,
          "op": 1,
          "rot": 0
        },
        "h": 6,
        "px": -38.25,
        "py": 2.5,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "vibrant-green-boston-f",
        "kind": "image",
        "layer": 1,
        "scatter": {
          "on": true,
          "dens": 79,
          "sMin": 1,
          "sMax": 1.5,
          "flip": true,
          "mode": "ground",
          "yOff": -0.32,
          "yMin": 0,
          "yMax": 2,
          "z0": -5.7,
          "z1": 0.4,
          "depth": 110,
          "drift": 0.06,
          "op": 1,
          "rot": 18
        },
        "h": 4,
        "px": -72,
        "py": 1.75,
        "pz": 0,
        "fitW": 256,
        "fitDither": 1,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "rock-isolated-on-white",
        "kind": "image",
        "layer": 1,
        "scatter": {
          "on": true,
          "dens": 83,
          "sMin": 0.35,
          "sMax": 1.85,
          "flip": true,
          "mode": "ground",
          "yOff": -0.4,
          "yMin": -1.5,
          "yMax": 0,
          "z0": -1.2,
          "z1": -11.3,
          "depth": 110,
          "drift": 0.06,
          "op": 1,
          "rot": 0
        },
        "h": 6,
        "px": -72,
        "py": 2.5,
        "pz": 0,
        "fitW": 256,
        "fitDither": 1,
        "fitQuant": true,
        "flip": false,
        "fill": false
      },
      {
        "file": "Realistic_Pine_Tree_PN",
        "kind": "image",
        "layer": 0,
        "scatter": {
          "on": true,
          "dens": 190,
          "sMin": 4.9,
          "sMax": 4.3,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -4,
          "yMax": -2,
          "z0": -4.8,
          "z1": 8,
          "depth": 110,
          "drift": 0.06,
          "op": 0.91,
          "rot": 0
        },
        "h": 9,
        "px": -36.5,
        "py": 3.75,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "White_Small_Cloud_PNG_",
        "kind": "image",
        "layer": 0,
        "scatter": {
          "on": true,
          "dens": 164,
          "sMin": 3.4,
          "sMax": 3.8,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -4,
          "yMax": -0.5,
          "z0": 8,
          "z1": -7.5,
          "depth": 110,
          "drift": 0.06,
          "op": 0.11,
          "rot": 0
        },
        "h": 9,
        "px": -45.5,
        "py": 3.75,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "vibrant-green-boston-f",
        "kind": "image",
        "layer": 0,
        "scatter": {
          "on": true,
          "dens": 153,
          "sMin": 0.6,
          "sMax": 2.2,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -1.5,
          "yMax": -1,
          "z0": -2.4,
          "z1": 8,
          "depth": 110,
          "drift": 0.06,
          "op": 0.71,
          "rot": 10
        },
        "h": 9,
        "px": -26.5,
        "py": 3.75,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "a-large-rock-with-a-grey-and-brown-color-it-is-a-solid-piece-of-rock-with-no-visible-cracks-or-crevices-png-LIGHTER.png",
        "kind": "image",
        "layer": 1,
        "scatter": {
          "on": true,
          "dens": 105,
          "sMin": 2.2,
          "sMax": 3.1,
          "flip": true,
          "mode": "ground",
          "yOff": -2.6,
          "yMin": 0,
          "yMax": 2,
          "z0": 2.8,
          "z1": 0.5,
          "depth": 110,
          "drift": 0.06,
          "op": 1,
          "rot": 16
        },
        "h": 4,
        "px": 16.5,
        "py": 1.75,
        "pz": 0,
        "fitW": 256,
        "fitDither": 1,
        "fitQuant": false,
        "flip": false,
        "fill": false
      },
      {
        "file": "cloud for distance.png",
        "kind": "image",
        "layer": 5,
        "scatter": {
          "on": true,
          "dens": 300,
          "sMin": 3.95,
          "sMax": 4.4,
          "flip": true,
          "mode": "free",
          "yOff": 0,
          "yMin": -9.5,
          "yMax": -3.5,
          "z0": 60,
          "z1": 21,
          "depth": 89,
          "drift": 0.415,
          "op": 0.18,
          "rot": 0
        },
        "h": 22,
        "px": 0,
        "py": 0,
        "pz": 0,
        "fitW": 256,
        "fitDither": 0,
        "fitQuant": false,
        "flip": false,
        "fill": false,
        "drift": 0.24000000000000002,
        "depth": 100
      }
    ],
    "player": null
  };

/* A design is only a design if it has the blocks the engine reads. Half a file
   is worse than no file: it would take the fallback for everything it lacks and
   leave you debugging a look that is half one design and half another. */
function usable(d) {
  return !!(d && d.ground && d.ground.bands && d.optics && d.atmos && d.sky && d.feel && Array.isArray(d.assets));
}

/* Top-level await: every module that imports `design` waits for this, so the
   terrain, the layers and the scatter all read the same numbers. Reading it
   after the fact would mean half the world built from the fallback. */
async function live() {
  try {
    const r = await fetch(DESIGN_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    if (!usable(d)) { console.warn('[design] ' + DESIGN_URL + ' is missing blocks — using the baked-in look'); return null; }
    return d;
  } catch (e) {
    return null;                       // no file, or not valid JSON
  }
}

export const design = (await live()) || BAKED;

/**
 * Which of the bench's feel numbers mean anything in an endless runner.
 * The bench's character walks under player control; the runner only moves
 * right, so horizontal numbers are meaningless here and the runner's own
 * startSpeed / maxSpeed / speedRamp own that axis instead.
 */
export const FEEL_KEYS_THAT_TRANSFER = [
  'gravity', 'fallGravity', 'maxFall',
  'jumpVelocity', 'doubleJumpVel', 'jumpCutoff', 'duckDrop',
  'coyoteTime', 'jumpBuffer', 'groundSnap'
];
