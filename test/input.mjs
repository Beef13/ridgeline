/**
 * Touch input, with no browser and no renderer.
 *
 * A tap jumps and a longer press ducks — and the two gestures share a prefix,
 * so neither can be decided on contact. Getting that wrong is invisible on a
 * desktop and makes the game unplayable on a phone, so it is worth pinning
 * down somewhere that a slow frame cannot muddy the timing.
 */
import { Input } from '../src/core/input.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* A stand-in for the window: collects listeners so the test can fire events at
   exactly the moments it wants, rather than hoping a timer lands on time. */
function harness() {
  const on = Object.create(null);
  const target = { addEventListener: (t, f) => { (on[t] ||= []).push(f); } };
  if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
  const input = new Input(target);
  const fire = (type, ev = {}) => (on[type] || []).forEach((f) => f(ev));
  return { input, fire };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a tap jumps ------------------------------------------------------------
{
  const { input, fire } = harness();
  input.touchHold = 0.2;
  fire('pointerdown', { pointerId: 1 });
  await wait(40);
  check('a tap has not ducked while it is still short', !input.duck);
  fire('pointerup', { pointerId: 1 });
  const s = input.sample();
  check('a tap jumps', s.jumpPressed, JSON.stringify(s));
  check('and does not duck', !s.duck);
  check('and asks for a FULL jump, not a cut one', s.fullJump,
    'without this the cutoff fires on the jump frame and the hop clears nothing');
}

// --- a hold ducks -----------------------------------------------------------
{
  const { input, fire } = harness();
  input.touchHold = 0.08;
  fire('pointerdown', { pointerId: 1 });
  await wait(160);
  check('a press past the threshold ducks', input.sample().duck);
  fire('pointerup', { pointerId: 1 });
  check('and stops ducking on the lift', !input.sample().duck);
}

// --- a hold must never ALSO jump on release --------------------------------
{
  const { input, fire } = harness();
  input.touchHold = 0.08;
  fire('pointerdown', { pointerId: 1 });
  await wait(160);
  input.sample();                       // the duck is consumed by the game
  fire('pointerup', { pointerId: 1 });
  check('lifting out of a duck does not jump', !input.sample().jumpPressed);
}

// --- the run starts from any contact ---------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1 });
  check('any touch counts as a press to start', input.sample().anyPressed);
}

/* A finger dragged off the canvas, or a call arriving mid-run, never sends
   pointerup. Left unhandled the player is stuck ducking forever, which reads
   as the game freezing. */
{
  const { input, fire } = harness();
  input.touchHold = 0.05;
  fire('pointerdown', { pointerId: 1 });
  await wait(120);
  check('ducking after a hold', input.sample().duck);
  fire('pointercancel', { pointerId: 1 });
  check('a cancelled touch releases the duck', !input.sample().duck);
}

// --- the keyboard still works ----------------------------------------------
{
  const { input, fire } = harness();
  fire('keydown', { code: 'ArrowUp', repeat: false, preventDefault() {} });
  const k = input.sample();
  check('arrow up still jumps', k.jumpPressed);
  check('and a key jump is still cuttable', !k.fullJump, 'holding a key is how height varies');
  fire('keydown', { code: 'ArrowDown', repeat: false, preventDefault() {} });
  check('arrow down still ducks', input.sample().duck);
  fire('keyup', { code: 'ArrowDown' });
  check('and releases', !input.sample().duck);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
