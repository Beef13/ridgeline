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
    /* Touch: where you put your finger decides, not how long you hold it.
     *
     * Tap and hold share a prefix — a press IS a tap until it has gone on too
     * long — so a scheme built on duration cannot act on contact: the jump has
     * to wait for the lift and the duck for the clock. Position is known the
     * instant the finger lands, so both actions fire immediately.
     *
     * The split is uneven on purpose. Jumping is far the more common action,
     * so it gets the top two thirds and a mis-aimed tap still jumps; ducking
     * is deliberate, and lives where a thumb naturally rests anyway.
     */
    this._touchId = null;
    this.touchDuck = false;
    this.duckZone = 0.34;                  // bottom fraction of the screen

    const zoneIsDuck = (e) => {
      const el = document.querySelector('canvas');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      // above or below the canvas counts as the nearer half, so the dead space
      // around the screen on a tall phone is never an unresponsive strip
      return (e.clientY - r.top) / r.height > 1 - this.duckZone;
    };

    const down = (e) => {
      this._touchId = e.pointerId;         // the newest finger is the one that counts
      this._anyLatch = true;
      if (zoneIsDuck(e)) {
        this.touchDuck = true;
      } else {
        this._jumpLatch = true;
        /* A tap is over in an instant, so the finger is up before the jump
           resolves. Variable jump height works by cutting the rise on RELEASE,
           which would cut every touch jump to 45% on its own first frame — an
           apex of 0.38 units, which clears nothing. A tapped jump is full. */
        this._fullJump = true;
      }
    };
    const up = (e) => {
      if (e.pointerId !== this._touchId) return;
      this._touchId = null;
      this.touchDuck = false;
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    // a finger dragged off the canvas, or a call arriving, never sends pointerup
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);

    // A key held while the tab loses focus never sends keyup, and the player
    // comes back stuck in a duck.
    addEventListener('blur', () => {
      this.keys = Object.create(null);
      this._touchId = null;
      this.touchDuck = false;
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
