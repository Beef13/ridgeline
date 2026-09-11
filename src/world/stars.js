import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { heightAt } from './terrain.js';
import { feel } from '../player/tuning.js';

/**
 * Collectable stars.
 *
 * They exist to give the player a reason to do something other than the
 * minimum. An endless runner where the optimal line is "jump as late as
 * possible, never leave the ground otherwise" has one interesting decision in
 * it; a run with stars hanging above the obstacles has a second, which is how
 * much risk to take for them.
 *
 * So the placement rule is not "somewhere in the air" — it is at heights that
 * cost something. Two tiers, both measured against what the physics can
 * actually reach rather than guessed:
 *
 *   reachable   inside a single jump's arc. You get these by jumping slightly
 *               earlier or later than you had to, which is a real choice and a
 *               cheap one.
 *   awkward     above a single jump, inside a double. You must spend the air
 *               jump — the same one that saves you from a misjudged obstacle —
 *               so taking it is a bet that nothing is coming.
 *
 * Nothing is placed where it cannot be had. A collectable the player can see
 * and provably cannot reach teaches them to ignore collectables.
 */

/* What the runner can actually do, derived rather than typed in, so retuning
   the jump moves the stars with it instead of quietly stranding them.
   
   The heights that matter are not the apexes. A star is collected by the
   player's BOX, which is 1.62 tall, so what decides whether a star needs a jump
   is the top of the runner's head, not the ground under their feet. Getting
   this wrong is silent and total: bands drawn against the apex put "hard"
   stars inside an easy jump and "easy" stars low enough to collect by running
   underneath them without pressing anything. */
export function reach() {
  const f = feel;
  const single = (f.jumpVelocity * f.jumpVelocity) / (2 * Math.abs(f.gravity));
  const double = single + (f.doubleJumpVel * f.doubleJumpVel) / (2 * Math.abs(f.gravity));
  return {
    single, double,
    standing: f.standH,            // collected without leaving the ground
    singleTop: single + f.standH,  // highest a single jump can touch
    doubleTop: double + f.standH   // highest anything can touch
  };
}

/* An arc of stars, not a single one. A lone star is a yes/no question the
   player answers before they get there; a curve of four is a line they have to
   fly, and the shape of it tells them where to jump from. */
const ARC = { min: 3, max: 5, gap: 0.62 };

/* How often each tier turns up. Weighted toward the cheap one deliberately —
   the awkward tier costs the air jump, and a run that constantly asks for it
   stops being about the obstacles. */
const AWKWARD_CHANCE = 0.3;

export const STAR_R = 0.23;   // half-width in world units: ~14px across
const COLLECT_PAD = 0.12;     // generosity on the pickup box, in the player's favour
/* Exported, because the HUD icon is the same star turning at the same rate —
   one number, so they can never drift into looking like two different props. */
export const SPIN = 2.2;      // rad/sec

/* BRIGHT yellow, and the hex has to be read through the grade to see why it is
   not written as one. The output stage multiplies by about 2.9 in linear light,
   so what lands on screen is roughly (1.00, 0.94, 0.02): red pinned, green
   nearly pinned, no blue — a hot yellow. The previous value was a stop lower on
   green and came out gold, which at 63 colours was close enough to the timber
   to belong to it. Authoring the yellow you actually want gives a white
   lozenge with the points burnt off, and the points are the whole read. */
export const YELLOW = '#b89a12';

/**
 * A five-pointed star, and a THICK one.
 *
 * The obvious build is a flat extrusion a few hundredths deep, and it fails
 * the same way everything small in this game fails: edge-on it is a fraction
 * of a screen pixel, so a spinning star does not thin out, it strobes. At 0.5
 * of the shape's own radius the narrowest view is still about 3 pixels, so the
 * spin reads as a spin all the way round.
 */
export function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 1 });
  g.center();
  g.scale(STAR_R, STAR_R, STAR_R);
  g.computeVertexNormals();
  return g;
}

/**
 * Pick the height for an arc.
 *
 * `clear` is the top of anything already sitting in that stretch of ground. A
 * star inside a fence is not a hard star, it is a broken one, so the arc is
 * lifted over whatever is there — which turns the collision into the good
 * version of the same idea: collect it on the way over the obstacle.
 */
export function arcHeight(tier, clear, r = Math.random()) {
  const R = reach();
  /* MARGIN keeps both ends off the exact boundary. At the top it is the
     difference between "hard" and "frame perfect" — a star at the very limit is
     touched for one frame at the apex of a maximum jump, which is not a
     challenge, it is a coin toss. At the bottom it is what stops a running
     player collecting by accident. */
  const MARGIN = 0.5;
  const band = tier === 'awkward'
    // above anything one jump can touch, below the practical double-jump limit
    ? [R.singleTop + 0.1, R.doubleTop - MARGIN]
    // needs a jump, but not a big one
    : [R.standing + 0.3, R.singleTop - MARGIN];
  let y = band[0] + r * Math.max(0, band[1] - band[0]);
  if (clear > 0) y = Math.max(y, clear + 0.55);
  return Math.min(y, R.doubleTop - MARGIN);
}

/* The dome an arc is bent into, at its highest point. Exported so the ceiling
   check can include it — the clamp above is applied to the BASE height, and a
   star lifted over the top of the dome is the one that ends up out of reach. */
export const ARC_LIFT = 0.28;

/**
 * Where to put something so it lands on a given PIXEL of the output buffer.
 *
 * This is what lets the tally icon be a real star from the game rather than a
 * drawing of one. A shape drawn on the HUD canvas would have to imitate the
 * collectable's colour, its lighting and its grade by hand, and would drift
 * away from it the first time any of the three were touched. A mesh parked in
 * front of the camera gets all of that for free, because it IS one — same
 * geometry, same material, same lights, same output stage.
 *
 * @param px,py   pixel in the 256x224 buffer, from its top-left
 * @param cam     the camera's position, already snapped to the pixel grid — the
 *                icon has to sit on the same grid as the HUD text beside it, or
 *                it shivers against letters that do not
 * @param halfTan tan(fov/2)
 * @param dist    how far in front of the camera to park it. Anything nearer
 *                than the foreground layer will sit in front of the whole
 *                scene without needing the depth test turned off.
 */
export function screenAnchor(px, py, cam, halfTan, aspect, bufW, bufH, dist) {
  const halfH = halfTan * dist;
  const halfW = halfH * aspect;
  const ndcX = (px / bufW) * 2 - 1;
  const ndcY = 1 - (py / bufH) * 2;
  return { x: cam.x + ndcX * halfW, y: cam.y + ndcY * halfH, z: cam.z - dist, halfH };
}

/** The scale that makes the shared star geometry `wantPx` pixels across. */
export function iconScale(halfH, bufH, wantPx) {
  const worldPerPx = (2 * halfH) / bufH;
  return (wantPx * worldPerPx) / (2 * STAR_R);
}

export class StarField {
  constructor(root) {
    this.root = root;
    this.geo = starGeometry();
    this.mat = new THREE.MeshPhongMaterial({
      color: SRGB(YELLOW), specular: SRGB('#f0e070'), shininess: 60, flatShading: true
    });
    this.items = [];
    this.nextX = 0;
    this.time = 0;
  }

  /**
   * A star for the HUD corner: the same geometry and the same material
   * instance as every collectable in the world, so there is nothing to keep in
   * step. It is added to the SCENE rather than to a parallax layer root, so the
   * LOOK panel's per-layer switches cannot hide the player's own tally.
   */
  icon() {
    return new THREE.Mesh(this.geo, this.mat);
  }

  reset() {
    for (const it of this.items) this.root.remove(it.mesh);
    this.items.length = 0;
    this.nextX = 0;
    this.time = 0;
  }

  /**
   * @param obstacles the live ObstacleField, so an arc can be lifted clear of
   *        whatever is already standing in that stretch. Asking it directly
   *        beats trying to keep a parallel copy of the spawn plan in step.
   */
  update(player, obstacles, dt) {
    this.time += dt;
    const ahead = player.x + feel.spawnAhead;
    if (this.nextX < player.x) this.nextX = player.x + 12;

    while (this.nextX < ahead) {
      const n = ARC.min + Math.floor(Math.random() * (ARC.max - ARC.min + 1));
      const span = (n - 1) * ARC.gap;
      const x0 = this.nextX;

      // the tallest thing already standing under this arc, if anything is
      let clear = 0;
      for (const o of obstacles.boxes()) {
        if (o.x1 < x0 - 0.4 || o.x0 > x0 + span + 0.4) continue;
        clear = Math.max(clear, o.y1 - heightAt(o.x0));
      }
      const tier = Math.random() < AWKWARD_CHANCE ? 'awkward' : 'reachable';
      const h = arcHeight(tier, clear);

      for (let i = 0; i < n; i++) {
        const x = x0 + i * ARC.gap;
        /* A shallow dome rather than a level row. It reads as the path of a
           jump, which is the instruction: start here, land there. */
        const lift = Math.sin((i / (n - 1)) * Math.PI) * ARC_LIFT;
        const gy = heightAt(x);
        const mesh = new THREE.Mesh(this.geo, this.mat);
        mesh.position.set(x, gy + h + lift, 0);
        this.root.add(mesh);
        this.items.push({ x, y: gy + h + lift, mesh, phase: Math.random() * 6.28 });
      }
      // a long gap between arcs: they are a treat, not a carpet
      this.nextX = x0 + span + 14 + Math.random() * 18;
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].x < player.x - 12) {
        this.root.remove(this.items[i].mesh);
        this.items.splice(i, 1);
      }
    }
  }

  /**
   * Collect anything the player's box is touching. Returns how many.
   *
   * The box is padded outward, always in the player's favour: a star that
   * looked collected and was not is remembered far longer than one that came a
   * pixel early.
   */
  collect(box) {
    let got = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const r = STAR_R + COLLECT_PAD;
      if (it.x + r < box.x0 || it.x - r > box.x1) continue;
      if (it.y + r < box.y0 || it.y - r > box.y1) continue;
      this.root.remove(it.mesh);
      this.items.splice(i, 1);
      got++;
    }
    return got;
  }

  animate(t) {
    for (const it of this.items) {
      it.mesh.rotation.y = t * SPIN + it.phase;
      it.mesh.position.y = it.y + Math.sin(t * 1.6 + it.phase) * 0.07;
    }
  }
}
