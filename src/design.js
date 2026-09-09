/**
 * A look exported from the Prerender Bench, verbatim.
 *
 * This file is DATA. To change the look, design it in the bench, hit
 * "Show as JSON", and replace the object below — nothing else needs editing.
 * Keeping it in one place is what makes the bench a design tool rather than a
 * toy that has to be re-implemented by hand every time.
 *
 * The two long filenames were truncated to 22 characters by the bench's export
 * (a bug, now fixed there); they are written out in full here. ART_DIR files
 * are matched by prefix as a safety net, so a truncated name still resolves.
 */
export const ART_DIR = '/art/';

export const design = {
  "v": 1,
  "saved": "2026-09-09 09:50",
  "raster": {
    "w": 256,
    "h": 224,
    "snap": true
  },
  "colour": {
    "quant": false,
    "mode": "2",
    "amount": 1
  },
  "grade": {
    "target": "palette",
    "bright": 1.67,
    "sat": 1.66,
    "contrast": 1.05
  },
  "time": {
    "fps": 12
  },
  "optics": {
    "fov": 14,
    "vistaMaster": 1,
    "vistaHorizon": 3
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
      false,
      true,
      false,
      false,
      false,
      true
    ],
    "fog": {
      "on": true,
      "hex": "#0787c5",
      "near": 149,
      "far": 226,
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
    "scan": 0.3,
    "mask": 0.22,
    "glow": 0.25,
    "curve": 0.115,
    "vign": 0.25,
    "gain": 1.61
  },
  "materials": "flat",
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
      "file": "mountain_02_day time.png",
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
      "file": "endless-green-forest-stockcake.png",
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
    }
  ],
  "player": null
};

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
