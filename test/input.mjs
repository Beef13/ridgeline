/**
 * Touch input, with no browser and no renderer.
 *
 * Where the finger lands decides the action, so both fire on contact: no
 * gesture waits on a clock. That is the whole point of the scheme, and it is
 * exactly the property a browser test cannot check — under software rendering
 * a frame can land 150ms late and make an instant action look delayed.
 */
import { Input } from '../src/core/input.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* A stand-in for the window, plus a stand-in canvas 100px tall at y=0, so a
   clientY IS a percentage down the screen. */
function harness(canvasTop = 0, canvasH = 100) {
  const on = Object.create(null);
  const target = { addEventListener: (t, f) => { (on[t] ||= []).push(f); } };
  if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
  globalThis.document = {
    querySelector: () => ({ getBoundingClientRect: () => ({ top: canvasTop, height: canvasH }) })
  };
  const input = new Input(target);
  const fire = (type, ev = {}) => (on[type] || []).forEach((f) => f(ev));
  return { input, fire };
}

// --- the top jumps, on contact ---------------------------------------------
{
  const { input, fire } = harness();
  input.duckZone = 0.34;
  fire('pointerdown', { pointerId: 1, clientY: 20 });
  const s = input.sample();                 // sampled BEFORE any lift
  check('a touch in the top jumps immediately', s.jumpPressed, JSON.stringify(s));
  check('and does not duck', !s.duck);
  check('and asks for a FULL jump, not a cut one', s.fullJump,
    'without this the cutoff fires on the jump frame and the hop clears nothing');
}

// --- the bottom ducks, on contact, and holds --------------------------------
{
  const { input, fire } = harness();
  input.duckZone = 0.34;
  fire('pointerdown', { pointerId: 1, clientY: 90 });
  const s = input.sample();
  check('a touch in the bottom ducks immediately', s.duck);
  check('and does not jump', !s.jumpPressed);
  check('the duck holds while the finger is down', input.sample().duck);
  fire('pointerup', { pointerId: 1, clientY: 90 });
  check('and stops on the lift', !input.sample().duck);
}

// --- lifting out of a duck must never jump ----------------------------------
{
  const { input, fire } = harness();
  input.duckZone = 0.34;
  fire('pointerdown', { pointerId: 1, clientY: 95 });
  input.sample();
  fire('pointerup', { pointerId: 1, clientY: 95 });
  check('lifting out of a duck does not jump', !input.sample().jumpPressed);
}

// --- the boundary moves with the slider -------------------------------------
{
  const { input, fire } = harness();
  input.duckZone = 0.5;                     // half the screen ducks
  fire('pointerdown', { pointerId: 1, clientY: 60 });
  check('a wider zone catches a touch the default would have jumped', input.sample().duck);
}
{
  const { input, fire } = harness();
  input.duckZone = 0.2;
  fire('pointerdown', { pointerId: 1, clientY: 60 });
  check('a narrower zone leaves that same touch jumping', input.sample().jumpPressed);
}

// --- the run starts from any contact ---------------------------------------
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 90 });
  check('even a duck-zone touch counts as a press to start', input.sample().anyPressed);
}

/* A finger dragged off the canvas, or a call arriving mid-run, never sends
   pointerup. Left unhandled the player is stuck ducking forever, which reads
   as the game freezing. */
{
  const { input, fire } = harness();
  fire('pointerdown', { pointerId: 1, clientY: 90 });
  check('ducking', input.sample().duck);
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
