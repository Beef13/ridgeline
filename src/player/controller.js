import { heightAt } from '../world/terrain.js';
import { feel } from './tuning.js';

export const STATE = { READY: 'ready', RUNNING: 'running', DEAD: 'dead' };

/**
 * An endless runner controller. The player only ever moves right; every
 * decision is vertical. Three things carry the feel and none of them show up
 * in a screenshot: asymmetric gravity, coyote time and jump buffering.
 */
export class Runner {
  constructor() { this.reset(); }

  reset() {
    this.x = 0;
    this.y = heightAt(0);
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.jumping = false;      // airborne because we jumped, not because of a bump
    this.cutArmed = false;
    this.jumpsLeft = feel.airJumps;
    this.runPhase = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.speed = feel.startSpeed;
    this.distance = 0;
    this.dead = false;
    this.wasDucking = false;
  }

  /** Hitbox in world space; ducking swaps it for a short wide one. */
  get box() {
    const f = feel;
    const w = this.ducking ? f.duckW : f.standW;
    const h = this.ducking ? f.duckH : f.standH;
    return { x0: this.x - w / 2, x1: this.x + w / 2, y0: this.y, y1: this.y + h };
  }

  step(dt, input, running) {
    const f = feel;
    if (!running) return;

    this.speed = Math.min(f.maxSpeed, this.speed + f.speedRamp * dt);

    const wantDuck = input.duck;

    this.coyote = this.grounded ? f.coyoteTime : Math.max(0, this.coyote - dt);
    this.buffer = input.jumpPressed ? f.jumpBuffer : Math.max(0, this.buffer - dt);

    if (this.buffer > 0) {
      if (this.coyote > 0) {
        if (this.onAction) this.onAction('jump');
        this.vy = f.jumpVelocity;
        this.grounded = false;
        this.jumping = true;
        this.cutArmed = true;
        this.coyote = 0;
        this.buffer = 0;
        this.jumpsLeft = f.airJumps;
      } else if (this.jumpsLeft > 0) {
        if (this.onAction) this.onAction('doubleJump');
        this.vy = f.doubleJumpVel;
        this.jumping = true;
        this.cutArmed = true;
        this.jumpsLeft--;
        this.buffer = 0;
      }
    }
    // Ducking is cancelled by JUMPING, not by being airborne. Gate it on
    // `grounded` and every crest in the terrain momentarily stands you up,
    // which under an arch kills you through no fault of your own. Resolved
    // AFTER the jump, or the launch frame is both ducking and jumping and the
    // hitbox disagrees with the pose for exactly one frame.
    this.ducking = wantDuck && !this.jumping;
    /* Reported HERE, where the duck actually resolves, not where the key was
       read. Holding down through a crest re-evaluates every step, and a sound
       fired off the raw input would stutter on every bump in the ground. */
    if (this.ducking && !this.wasDucking && this.onAction) this.onAction('duck');
    this.wasDucking = this.ducking;

    // Releasing early clips the arc ONCE, on the release edge. Applying it
    // every step compounds — at a 1/120 step the rise is crushed to nothing
    // within a few frames and variable jump height stops existing.
    if (input.jumpHeld || this.grounded) this.cutArmed = this.jumping;
    if (this.cutArmed && !input.jumpHeld && this.vy > 0) {
      this.vy *= f.jumpCutoff;
      this.cutArmed = false;
    }

    // Fast-fall only once you are already descending. Applying it while still
    // rising means holding duck and pressing jump cancels the jump on its very
    // first frame — the player presses jump and simply does not leave the ground.
    if (!this.grounded && wantDuck && this.vy <= 0) this.vy = Math.min(this.vy, f.duckDrop);

    const g = this.vy > 0 ? f.gravity : f.fallGravity;
    this.vy = Math.max(f.maxFall, this.vy + g * dt);

    this.x += this.speed * (this.ducking ? f.duckSpeedMul : 1) * dt;
    this.distance = this.x;
    this.y += this.vy * dt;

    const gy = heightAt(this.x);
    this.grounded = false;
    if (this.y <= gy) {
      this.y = gy;
      this.vy = 0;
      this.grounded = true;
      this.jumping = false;
      this.jumpsLeft = f.airJumps;
    } else if (!this.jumping && this.vy <= 0 && this.y - gy < f.groundSnap) {
      // Stick to the surface over crests and down slopes. Without this you
      // are launched by every bump, which makes ducking and the run cycle
      // flicker and turns uneven ground into a hazard it was never meant to be.
      this.y = gy;
      this.vy = 0;
      this.grounded = true;
      this.jumpsLeft = f.airJumps;
    }

    this.runPhase += this.speed * dt * 2.1;
  }

  get speed01() { return Math.min(1, this.speed / feel.maxSpeed); }
}

export function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
