/**
 * The frame cap, driven by hand.
 *
 * A 120Hz laptop offers twice as many frames as this game has anything new to
 * show, and each one costs the whole render. Rationing them is the single
 * cheapest saving available — but only if two things hold: the simulation must
 * not notice, and a 60Hz display must not lose a single frame to rounding.
 * That second one cannot be checked in a browser here (the test renderer runs
 * at 13fps, far below any cap), so the gate is driven with synthetic
 * timestamps instead, which is both exact and instant.
 */
import { startLoop } from '../src/core/loop.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* Stand in for the browser: hold the callback so the test decides when each
   frame arrives and what the clock says. */
function run({ hz, seconds, maxFps }) {
  let cb = null;
  globalThis.requestAnimationFrame = (f) => { cb = f; };
  let steps = 0, draws = 0;
  const drawAt = [];
  const renderDt = [];
  startLoop({
    maxFps,
    step: () => { steps++; },
    render: (dt, t) => { draws++; drawAt.push(t * 1000); renderDt.push(dt); }
  });
  const gap = 1000 / hz;
  const frames = Math.round(hz * seconds);
  // start at a non-round offset: real frames never land on exact multiples
  for (let i = 1; i <= frames; i++) { const f = cb; cb = null; f(i * gap + 0.37); }
  return { steps, draws, drawAt, renderDt };
}

// --- a 120Hz display draws half the frames ----------------------------------
{
  const r = run({ hz: 120, seconds: 2, maxFps: 60 });
  check('120Hz display draws ~60 times a second', Math.abs(r.draws / 2 - 60) <= 1,
    `${r.draws} draws in 2s`);
  check('and the simulation still runs its full 120 steps a second',
    Math.abs(r.steps / 2 - 120) <= 2, `${r.steps} steps in 2s`);
}

/* The one that matters. Frames do not arrive on exact multiples of 16.67ms, so
   a hard comparison judges some of them early and drops them — a stutter on
   the very displays this was supposed to leave alone. */
{
  const r = run({ hz: 60, seconds: 3, maxFps: 60 });
  check('60Hz display loses NO frames to the cap', r.draws === 180,
    `${r.draws}/180 drawn`);
}
{
  // a display that is fractionally slow (59.94Hz, the broadcast rate) must also
  // never be rationed
  const r = run({ hz: 59.94, seconds: 3, maxFps: 60 });
  check('59.94Hz loses none either', r.draws === Math.round(59.94 * 3),
    `${r.draws}/${Math.round(59.94 * 3)} drawn`);
}

/* High-refresh displays land on a whole-number divisor, which is the point:
   an even cadence at or just above the target, never under it. A time-based
   gate gave 144Hz a steady 48fps — slower than the cap it was enforcing. */
for (const [hz, want] of [[144, 72], [240, 60], [165, 82.5]]) {
  const r = run({ hz, seconds: 2, maxFps: 60 });
  const fps = r.draws / 2;
  check(`${hz}Hz settles on ${want}fps`, Math.abs(fps - want) <= 3, `${fps.toFixed(1)}fps`);
  check(`  and never dips below the 60 target`, fps >= 59, `${fps.toFixed(1)}fps`);
}

// an even cadence is the reason for the divisor; check the draws are regular
{
  const r = run({ hz: 144, seconds: 2, maxFps: 60 });
  const gaps = r.drawAt.slice(6).map((t, k, a) => (k ? t - a[k - 1] : 0)).slice(1);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  check('and the draws are evenly spaced', spread < 1.5, `${spread.toFixed(2)}ms spread`);
}

/* Anything animating on render time — the vista drift, the glow ease — is
   handed the delta since the last DRAW. Handed the frame delta instead it
   would run at half speed the moment frames start being skipped. */
{
  const r = run({ hz: 120, seconds: 1, maxFps: 60 });
  const mean = r.renderDt.slice(2).reduce((a, b) => a + b, 0) / (r.renderDt.length - 2);
  check('render dt is the gap between DRAWS, not between frames',
    Math.abs(mean - 1 / 60) < 0.002, `${(mean * 1000).toFixed(2)}ms, want ~16.67ms`);
}

// --- the cap can be switched off --------------------------------------------
{
  const r = run({ hz: 120, seconds: 1, maxFps: 0 });
  check('maxFps 0 draws every frame', r.draws === 120, `${r.draws}/120`);
}

// --- a stall must not be made up with a burst of steps -----------------------
{
  let cb = null;
  globalThis.requestAnimationFrame = (f) => { cb = f; };
  let steps = 0;
  startLoop({ maxFps: 60, step: () => { steps++; }, render: () => {} });
  cb(16.7);
  const before = steps;
  cb(16.7 + 4000);            // the tab was in the background for four seconds
  check('a long stall is clamped, not replayed step by step', steps - before <= 13,
    `${steps - before} steps for a 4s gap`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
