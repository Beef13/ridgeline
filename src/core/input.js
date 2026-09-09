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

    target.addEventListener('keydown', (e) => {
      if ([...JUMP, ...DUCK].includes(e.code)) e.preventDefault();
      if (e.repeat) return;                       // auto-repeat is not a new press
      this.keys[e.code] = true;
      if (JUMP.includes(e.code)) this._jumpLatch = true;
      if (JUMP.includes(e.code) || DUCK.includes(e.code)) this._anyLatch = true;
    });
    target.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // Tap to jump, so it works on a touchscreen without extra plumbing.
    target.addEventListener('pointerdown', () => {
      this.keys.Space = true;
      this._jumpLatch = true;
      this._anyLatch = true;
    });
    target.addEventListener('pointerup', () => { this.keys.Space = false; });
    // A key held while the tab loses focus never sends keyup, and the player
    // comes back stuck in a duck.
    addEventListener('blur', () => { this.keys = Object.create(null); });
  }

  get jumpHeld() { return JUMP.some((k) => this.keys[k]); }
  get duck() { return DUCK.some((k) => this.keys[k]); }

  /** Call exactly once per fixed step — it consumes the latches. */
  sample() {
    const jumpPressed = this._jumpLatch;
    const anyPressed = this._anyLatch;
    this._jumpLatch = false;
    this._anyLatch = false;
    return { jumpHeld: this.jumpHeld, jumpPressed, duck: this.duck, anyPressed };
  }
}
