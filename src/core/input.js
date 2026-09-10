/**
 * Jump is latched on the keydown EVENT, not sampled from key state. A tap
 * shorter than one simulation step would otherwise be dropped completely —
 * the player presses jump, nothing happens, and it reads as the game being
 * broken rather than as a timing rule.
 */
const JUMP = ['Space', 'ArrowUp', 'KeyW'];
const DUCK = ['ArrowDown', 'KeyS'];

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
    /* Touch: a short tap jumps, a longer press ducks.
     *
     * The two gestures share a prefix — a press IS a tap until it has gone on
     * too long — so neither can fire on contact. The jump waits for the lift
     * and the duck waits for the clock. That is the cost of putting both
     * actions on one target rather than on two halves of the screen, and it is
     * why `touchHold` is a slider rather than a constant: it is the line
     * between the two and it wants to be found by feel.
     */
    this._touchAt = 0;
    this._touchId = null;
    this._holdTimer = 0;
    this.touchDuck = false;
    this.touchHold = 0.13;                  // seconds; overwritten from feel

    const down = (e) => {
      if (this._touchId !== null) return;   // one finger decides; the rest are noise
      this._touchId = e.pointerId;
      this._touchAt = performance.now();
      this._anyLatch = true;                // any contact starts or restarts a run
      clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        if (this._touchId !== null) this.touchDuck = true;
      }, this.touchHold * 1000);
    };
    const up = (e) => {
      if (e.pointerId !== this._touchId) return;
      this._touchId = null;
      clearTimeout(this._holdTimer);
      const held = (performance.now() - this._touchAt) / 1000;
      if (!this.touchDuck && held < this.touchHold) {
        this._jumpLatch = true;
        /* A tap is over before the jump fires, so the finger is already up.
           Variable jump height works by cutting the rise on RELEASE — which
           would cut every touch jump to 45% on its own first frame, an apex of
           0.38 units that clears nothing. A tapped jump is a full one. */
        this._fullJump = true;
      }
      this.touchDuck = false;
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    // a finger dragged off the element, or a call arriving, never sends pointerup
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    // A key held while the tab loses focus never sends keyup, and the player
    // comes back stuck in a duck.
    addEventListener('blur', () => {
      this.keys = Object.create(null);
      this._touchId = null;
      this.touchDuck = false;
      clearTimeout(this._holdTimer);
    });
  }

  get jumpHeld() { return JUMP.some((k) => this.keys[k]); }
  get duck() { return this.touchDuck || DUCK.some((k) => this.keys[k]); }

  /** Call exactly once per fixed step — it consumes the latches. */
  sample() {
    const jumpPressed = this._jumpLatch;
    const anyPressed = this._anyLatch;
    const fullJump = this._fullJump;
    this._jumpLatch = false;
    this._anyLatch = false;
    this._fullJump = false;
    return { jumpHeld: this.jumpHeld, jumpPressed, duck: this.duck, anyPressed, fullJump };
  }
}
