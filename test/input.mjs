/**
 * Touch input, with no browser and no renderer.
 *
 * Tap jumps, swipe down ducks — and every swipe begins as a press, so the jump
 * is held for a few milliseconds to see whether the finger moves. That window
 * is the one number that can ruin the game: too short and a swipe jumps first,
 * too long and every tap feels laggy. Timing that fine cannot be checked in a
 * browser test, where a software-rendered frame can land 150ms late.
 */
import { Input } from '../src/core/input.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

function harness() {
  const on = Object.create(null);
  const target = { addEventListener: (t, f) => { (on[t] ||= []).push(f); } };
  if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
  const input = new Input(target);
  const fire = (type, ev = {}) => (on[type] || []).forEach((f) => f(ev));
  return { input, fire };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a tap jumps, on the lift ----------------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  check('a press has not jumped yet', !input.sample().jumpPressed,
    'it might still turn out to be a swipe');
  fire('pointerup', { pointerId: 1, clientY: 300 });
  const s = input.sample();
  check('lifting jumps', s.jumpPressed, JSON.stringify(s));
  check('and does not duck', !s.duck);
  check('and asks for a FULL jump, not a cut one', s.fullJump,
    'without this the cutoff fires on the jump frame and the hop clears nothing');
}

// --- a press held past the window jumps without waiting for the lift --------
{
  const { input, fire } = harness();
  input.jumpDelay = 0.03;
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  await wait(60);
  check('a held press jumps on the deadline', input.sample().jumpPressed,
    'holding must not feel like nothing happened');
  fire('pointerup', { pointerId: 1, clientY: 300 });
  check('and does not jump a second time on the lift', !input.sample().jumpPressed);
}

// --- a swipe down ducks, and never jumps ------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 330 });     // 30px, past the 18px threshold
  const s = input.sample();
  check('a downward swipe ducks', s.duck);
  check('and does not jump', !s.jumpPressed, 'the movement beat the deadline');
  fire('pointerup', { pointerId: 1, clientY: 330 });
  check('lifting out of a swipe still does not jump', !input.sample().jumpPressed);
}

// --- a small wobble is not a swipe ------------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 308 });     // 8px of thumb roll
  check('a thumb wobble does not duck', !input.sample().duck);
  fire('pointerup', { pointerId: 1, clientY: 308 });
  check('and the tap still jumps', input.sample().jumpPressed);
}

// --- a swipe UP is a tap, not a duck ----------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 240 });
  check('an upward flick never ducks', !input.sample().duck);
  fire('pointerup', { pointerId: 1, clientY: 240 });
  check('and jumps', input.sample().jumpPressed);
}

// --- a flick ducks on its own; holding extends it ---------------------------
{
  const { input, fire } = harness();
  input.duckMin = 0.12;
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 330 });
  fire('pointerup', { pointerId: 1, clientY: 330 });        // released at once
  check('a flick keeps ducking after the finger is gone', input.sample().duck);
  await wait(160);
  check('and lets go by itself', !input.sample().duck);
}
{
  const { input, fire } = harness();
  input.duckMin = 0.05;
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 330 });
  await wait(120);                                          // still holding
  check('holding after the swipe ducks past duckMin', input.sample().duck);
  fire('pointerup', { pointerId: 1, clientY: 330 });
  check('and ends on the lift', !input.sample().duck);
}

// --- the run starts from any contact ---------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  check('any touch counts as a press to start', input.sample().anyPressed,
    'the start screen must not need a full gesture');
}

/* A finger dragged off the canvas, or a call arriving mid-run, never sends
   pointerup. Left unhandled the player is stuck ducking forever. */
{
  const { input, fire } = harness();
  input.duckMin = 0.02;
  fire('pointerdown', { pointerId: 1, clientY: 300 });
  fire('pointermove', { pointerId: 1, clientY: 340 });
  check('ducking', input.sample().duck);
  fire('pointercancel', { pointerId: 1 });
  await wait(30);
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
