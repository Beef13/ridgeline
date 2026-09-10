/**
 * Jump is latched on the keydown EVENT, not sampled from key state. A tap
 * shorter than one simulation step would otherwise be dropped completely —
 * the player presses jump, nothing happens, and it reads as the game being
 * broken rather than as a timing rule.
 */
const JUMP = ['Space', 'ArrowUp', 'KeyW'];
const DUCK = ['ArrowDown', 'KeyS'];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Input {
  constructor(target = window) {
    this.keys = Object.create(null);
    this._jumpLatch = false;
    this._anyLatch = false;
    this._fullJump = false;

    target.addEventListener('keydown', (e) => {
      if ([...JUMP, ...DUCK].includes(e.code)) e.preventDefault();
      if (e.repeat) return;                       // auto-repeat is not a new press
      this.keys[e.code] = true;
      if (JUMP.includes(e.code)) this._jumpLatch = true;
      if (JUMP.includes(e.code) || DUCK.includes(e.code)) this._anyLatch = true;
    });
    target.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    /* Touch: tap anywhere to jump, swipe down to duck.
     *
     * The two gestures share a prefix again — every swipe begins as a press —
     * so the jump cannot fire on the touch itself without also firing on the
     * first instant of every duck. But the thing that separates them is
     * MOVEMENT, not time, and a deliberate downward flick clears 18px within
     * about 20ms. So the jump is held for `jumpDelay` and released the moment
     * either the finger lifts or that window closes, whichever comes first:
     * a real tap jumps on the lift, a press-and-hold jumps on the deadline,
     * and a swipe never jumps at all because the movement lands first.
     *
     * `jumpDelay` is the whole cost of the scheme — the ceiling on how late a
     * jump can be — which is why it is a slider and why it is small.
     */
    this._touchId = null;
    this._pendAt = 0;                      // when the finger landed; 0 = nothing pending
    this._downY = 0;
    this.touchDuck = false;                // a finger is down and has swiped
    this._duckUntil = 0;                   // a released swipe still ducks until here

    this.swipeDist = 18;                   // px of downward travel that means "duck"
    this.duckMin = 0.35;                   // s a flick ducks for with no hold
    this.jumpDelay = 0.05;                 // s the jump waits to see a swipe instead

    const down = (e) => {
      /* The listener is on the window, so it sees presses meant for the mute
         button too — without this, muting the music also starts a run. */
      if (e.target && e.target.closest && e.target.closest('button,input,select,textarea,a,label')) return;
      this._touchId = e.pointerId;         // the newest finger is the one that counts
      this._anyLatch = true;               // any contact starts or restarts a run
      this._pendAt = now();
      this._downY = e.clientY || 0;
    };
    const move = (e) => {
      if (e.pointerId !== this._touchId || this.touchDuck) return;
      if ((e.clientY || 0) - this._downY < this.swipeDist) return;
      this._pendAt = 0;                    // this was never a tap
      this.touchDuck = true;
      // a flick ducks for a beat on its own; keeping the finger down extends it
      this._duckUntil = now() + this.duckMin * 1000;
    };
    const up = (e) => {
      if (e.pointerId !== this._touchId) return;
      this._touchId = null;
      if (this._pendAt) { this._pendAt = 0; this.fireJump(); }
      this.touchDuck = false;
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    // a finger dragged off the canvas, or a call arriving, never sends pointerup
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);

    // A key held while the tab loses focus never sends keyup, and the player
    // comes back stuck in a duck.
    addEventListener('blur', () => {
      this.keys = Object.create(null);
      this._touchId = null;
      this._pendAt = 0;
      this.touchDuck = false;
      this._duckUntil = 0;
    });
  }

  /* A tap is over before the jump fires, so the finger is already up. Variable
     jump height works by cutting the rise on RELEASE — which would cut every
     touch jump to 45% on its own first frame, an apex of 0.38 units that
     clears nothing. A tapped jump is always a full one. */
  fireJump() { this._jumpLatch = true; this._fullJump = true; }

  get jumpHeld() { return JUMP.some((k) => this.keys[k]); }
  get duck() {
    return this.touchDuck || now() < this._duckUntil || DUCK.some((k) => this.keys[k]);
  }

  /** Call exactly once per fixed step — it consumes the latches. */
  sample() {
    /* The held jump is resolved here rather than on a timer: sample() runs
       every fixed step, so the deadline lands within a frame of where it
       should, and nothing depends on a setTimeout the browser may defer. */
    if (this._pendAt && now() - this._pendAt >= this.jumpDelay * 1000) {
      this._pendAt = 0;
      this.fireJump();
    }
    const jumpPressed = this._jumpLatch;
    const anyPressed = this._anyLatch;
    const fullJump = this._fullJump;
    this._jumpLatch = false;
    this._anyLatch = false;
    this._fullJump = false;
    return { jumpHeld: this.jumpHeld, jumpPressed, duck: this.duck, anyPressed, fullJump };
  }
}
