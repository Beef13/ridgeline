import { applyGrade } from '../render/grade.js';
import { design } from '../design.js';
import { tintObstacles } from '../world/obstacles.js';

/**
 * The output stage, live. These are the numbers that decide whether the frame
 * reads as 1994 or as low-poly 3D, and none of them can be judged from a
 * static value — they have to be dragged while the game is moving.
 *
 * Seeded from the bench export so the game opens on the approved look.
 */
const d = design;
export const look = {
  quantise: d.colour.quant ? 1 : 0,
  ditherMode: parseFloat(d.colour.mode),
  blend: d.colour.amount,
  pairLimit: 0.42,
  gradeTarget: d.grade.target,          // 'palette' or 'pixels'
  exposure: d.grade.bright,
  saturation: d.grade.sat,
  contrast: d.grade.contrast,
  crt: d.crt.on ? 1 : 0,
  beam: d.crt.soft, scanlines: d.crt.scan, mask: d.crt.mask,
  halation: d.crt.glow, curvature: d.crt.curve, vignette: d.crt.vign, gain: d.crt.gain,
  vistaMaster: d.optics.vistaMaster,
  vistaHorizon: d.optics.vistaHorizon,
  fog: d.atmos.fog.on ? 1 : 0,
  fogNear: d.atmos.fog.near,
  fogFar: d.atmos.fog.far,
  fogVistas: d.atmos.fog.vistas ? 1 : 0,
  cueDark: d.atmos.dark,
  cueCool: d.atmos.cool,
  /* Not a bench number — a bench scene has no obstacles in it. It rides in the
     design's `game` block, which the bench ignores and COPY DESIGN writes. */
  obstacleWarm: d.game?.obstacleWarm ?? 0.55,
  // Also not a bench number — the bench has no cabinet around its viewport.
  cornerRadius: d.game?.cornerRadius ?? 0,
  screenGlow: d.game?.screenGlow ?? 0
};

const PAL = { quantise: 'uQuant', ditherMode: 'uMode', blend: 'uDither', pairLimit: 'uPair' };
const TUBE = {
  crt: 'uOn', beam: 'uSoft', scanlines: 'uScan', mask: 'uMask',
  halation: 'uGlow', curvature: 'uCurve', vignette: 'uVign', gain: 'uGain'
};

/**
 * Apply the look. This SHIPS — the panel that tunes it does not.
 *
 * Keeping the two in one function was the trap: strip the panel from the
 * release build and the pipeline falls back to its own shader defaults, so the
 * public version renders nothing like the tuned one. The values and the act of
 * applying them belong to the game; only the sliders belong to development.
 */
export function pushLook(pipeline, vistas, world) {
  for (const [k, u] of Object.entries(PAL)) pipeline.quantMat.uniforms[u].value = look[k];
  for (const [k, u] of Object.entries(TUBE)) pipeline.tubeMat.uniforms[u].value = look[k];
  applyGrade(pipeline, look);
  vistas.master = look.vistaMaster;
  vistas.horizon = look.vistaHorizon;
  vistas.setFog(look.fogVistas > 0.5);
  world.setFog(look.fog > 0.5, look.fogNear, look.fogFar);
  tintObstacles(look.obstacleWarm);
  pipeline.setCornerRadius(look.cornerRadius);
  pipeline.setGlow(look.screenGlow);
}

export const LOOK_GROUPS = () => [
  ['Palette', look, [
    ['quantise', 0, 1, 1], ['ditherMode', 0, 2, 1], ['blend', 0, 1, 0.02], ['pairLimit', 0.05, 1.2, 0.01]
  ]],
  ['Grade', look, [
    ['exposure', 0.45, 1.85, 0.01], ['saturation', 0, 2.2, 0.02], ['contrast', 0.55, 1.75, 0.01]
  ]],
  ['Atmosphere', look, [
    ['cueDark', 0, 1.6, 0.02], ['cueCool', 0, 2, 0.02],
    ['fog', 0, 1, 1], ['fogNear', 1, 200, 1], ['fogFar', 20, 500, 2], ['fogVistas', 0, 1, 1]
  ]],
  ['Obstacles', look, [['obstacleWarm', 0, 1, 0.01]]],
  ['Parallax', look, [['vistaMaster', 0, 2, 0.02], ['vistaHorizon', -14, 14, 0.5]]],
  ['Tube', look, [
    ['crt', 0, 1, 1], ['beam', 0, 1, 0.01], ['scanlines', 0, 0.9, 0.01], ['mask', 0, 0.8, 0.01],
    ['halation', 0, 1, 0.01], ['curvature', 0, 0.3, 0.005], ['vignette', 0, 1, 0.01], ['gain', 0.6, 2, 0.01],
    ['cornerRadius', 0, 0.5, 0.005], ['screenGlow', 0, 1, 0.01]
  ]]
];
