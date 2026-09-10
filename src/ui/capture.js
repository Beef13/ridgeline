import { design } from '../design.js';
import { look } from './look.js';
import { feel } from '../player/tuning.js';

/**
 * One button, one file.
 *
 * Two programs write the same design: the bench, which owns the look and the
 * ground, and the game, whose panels tune the very same numbers live. Before
 * this they wrote to different places in different formats, so a slider you
 * dragged in the game had nowhere to go that the bench would not clobber on
 * the next paste. Now both ends emit the SAME shape — the whole design, with
 * whatever you changed folded in — and `public/design.json` is the only file
 * that holds a decision.
 *
 * The split between `feel` and `game` is not cosmetic. The bench has its own
 * character with its own numbers and rebuilds its panel from the keys it finds
 * in `feel`; handing it the runner's spawn distances and hitboxes would put
 * sliders in front of a designer for things their scene cannot show. Those
 * live under `game`, which the bench ignores and the game reads.
 */

// what the bench understands, and will hand back unchanged
const BENCH_FEEL = ['runSpeed', 'groundAccel', 'groundFriction', 'airAccel', 'turnBoost',
  'gravity', 'fallGravity', 'maxFall', 'jumpVelocity', 'doubleJumpVel', 'jumpCutoff',
  'airJumps', 'duckDrop', 'coyoteTime', 'jumpBuffer', 'groundSnap', 'maxStep'];

// the runner's own, meaningless in a bench scene with no obstacles in it
const GAME_FEEL = ['startSpeed', 'maxSpeed', 'speedRamp', 'duckSpeedMul',
  'standW', 'standH', 'duckW', 'duckH',
  'reactionTime', 'spawnAhead', 'difficultyAt', 'poseFps', 'camBehind', 'camLerpY', 'touchHold'];

const pick = (src, keys) => {
  const o = {};
  for (const k of keys) if (src[k] !== undefined) o[k] = src[k];
  return o;
};

/** The complete design as it stands right now, panels included. */
export function captureDesign(view) {
  const d = JSON.parse(JSON.stringify(design));   // never mutate what the game is running on

  d.saved = new Date().toISOString().slice(0, 16).replace('T', ' ');
  d.colour = { quant: look.quantise > 0.5, mode: String(look.ditherMode), amount: look.blend, pair: look.pairLimit };
  d.grade = { target: look.gradeTarget, bright: look.exposure, sat: look.saturation, contrast: look.contrast };
  d.crt = {
    on: look.crt > 0.5, soft: look.beam, scan: look.scanlines, mask: look.mask,
    glow: look.halation, curve: look.curvature, vign: look.vignette, gain: look.gain
  };
  d.optics = { ...d.optics, vistaMaster: look.vistaMaster, vistaHorizon: look.vistaHorizon };
  if (view && view.fov) d.optics.fov = view.fov;
  d.atmos = {
    ...d.atmos, dark: look.cueDark, cool: look.cueCool,
    fog: { ...d.atmos.fog, on: look.fog > 0.5, near: look.fogNear, far: look.fogFar, vistas: look.fogVistas > 0.5 }
  };
  d.time = { ...d.time, fps: feel.poseFps };

  d.feel = { ...d.feel, ...pick(feel, BENCH_FEEL) };
  d.game = { ...(d.game || {}), ...pick(feel, GAME_FEEL), obstacleWarm: look.obstacleWarm, cornerRadius: look.cornerRadius, screenGlow: look.screenGlow };
  return d;
}

export function copyDesign(btn) {
  const txt = JSON.stringify(captureDesign(window.__view), null, 2);
  const done = (m) => { const o = btn.textContent; btn.textContent = m; setTimeout(() => { btn.textContent = o; }, 2200); };
  navigator.clipboard?.writeText(txt).then(
    () => done('COPIED — pbpaste > public/design.json'),
    () => { console.log(txt); done('LOGGED TO CONSOLE'); }
  );
}
