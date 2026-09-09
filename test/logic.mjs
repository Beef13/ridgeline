/**
 * Steps the controller directly at a fixed rate — no renderer, no timing luck.
 * The browser test can miss a short jump between frames; this cannot.
 */
import { Runner } from '../src/player/controller.js';
import { feel } from '../src/player/tuning.js';

const DT = 1 / 120;
const NONE = { jumpHeld: false, jumpPressed: false, duck: false, anyPressed: false };
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

const run = (script, steps) => {
  const p = new Runner();
  const log = [];
  for (let i = 0; i < steps; i++) {
    p.step(DT, { ...NONE, ...script(i, p) }, true);
    log.push({ i, y: p.y, vy: p.vy, grounded: p.grounded, ducking: p.ducking, jumping: p.jumping });
  }
  return { p, log };
};

// 1. Holding duck across uneven ground never stands the player up.
{
  const { log } = run(() => ({ duck: true, jumpHeld: false }), 1400);
  const dropped = log.filter(f => !f.ducking).length;
  check('duck holds across the whole ridge', dropped === 0, `${dropped}/${log.length} frames stood up`);
}

// 2. A jump beats a held duck, and the duck resumes on landing.
{
  const { log } = run((i) => ({ duck: true, jumpPressed: i === 30, jumpHeld: i >= 30 && i < 60 }), 400);
  const air = log.filter(f => f.jumping);
  check('jump overrides a held duck', air.length > 0 && air.every(f => !f.ducking), `${air.length} airborne frames, none ducking`);
  const after = log.slice(log.findIndex(f => f.jumping)).filter(f => f.grounded);
  check('duck resumes on landing', after.length > 0 && after[after.length - 1].ducking);
}

// 3. Variable jump height: tap vs hold must differ clearly.
const apex = (holdFor) => {
  const { log } = run((i) => ({ jumpPressed: i === 5, jumpHeld: i >= 5 && i < 5 + holdFor }), 300);
  const y0 = log[0].y;
  return Math.max(...log.map(f => f.y)) - y0;
};
{
  const tap = apex(2), held = apex(200);
  check('variable jump height', held > tap * 1.8, `tap ${tap.toFixed(2)}u vs held ${held.toFixed(2)}u`);
  check('cut-off applies once, not every step', tap > 0.2, `tap still clears ${tap.toFixed(2)}u`);
}

// 4. Forgiveness windows actually fire.
{
  // buffered: press before landing, jump must still happen
  const { log } = run((i, p) => ({ jumpPressed: i === 40, jumpHeld: i >= 40 && i < 90 }), 400);
  check('a jump fires from a buffered press', log.some(f => f.jumping));
}

// 5. Double jump is available exactly once per airtime.
{
  const p = new Runner();
  const jumps = [];
  for (let i = 0; i < 400; i++) {
    const press = i === 10 || i === 60 || i === 90;
    if (press) jumps.push(p.jumpsLeft);
    // hold the key, or the cut-off ends the first jump early and the player
    // is back on the ground before the second press
    p.step(DT, { ...NONE, jumpPressed: press, jumpHeld: true }, true);
  }
  check('one air jump, then no more', jumps[0] === 1 && jumps[1] === 1 && jumps[2] === 0, JSON.stringify(jumps));
}

// 6. Ground snapping keeps the runner on the surface at speed.
{
  const p = new Runner();
  p.speed = feel.maxSpeed;
  let airborne = 0;
  for (let i = 0; i < 3000; i++) { p.step(DT, NONE, true); if (!p.grounded) airborne++; }
  check('never launched by terrain at top speed', airborne === 0, `${airborne} airborne frames over ${(3000 * DT).toFixed(0)}s`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
