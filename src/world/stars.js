import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { heightAt } from './terrain.js';
import { feel } from '../player/tuning.js';
import { rndWorld } from '../core/rng.js';

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
const ARC = { min: 4, max: 6, gap: 0.62 };

export const STAR_R = 0.23;   // half-width in world units: ~14px across
const COLLECT_PAD = 0.12;     // generosity on the pickup box, in the player's favour
/* Exported, because the HUD icon is the same star turning at the same rate —
   one number, so they can never drift into looking like two different props. */
export const SPIN = 2.2;      // rad/sec

/* The three tones, taken off a Donkey Kong Country banana pixel by pixel.
 *
 * What makes that sprite read the way it does is not the yellow — it is that
 * there are exactly THREE tones with nothing in between them. A highlight, a
 * body, and an amber shadow, each a flat block with a hard edge. Smooth shading
 * over the same colours gives a plastic bead; the hard steps give something
 * that looks drawn.
 *
 * Sampled: #f8d848, #d09838, #684818 — then lifted, because a sprite read off
 * a photographed CRT is darker than the same sprite wants to be here. Each band
 * is raised in LINEAR light rather than by nudging the hex: the highlight by
 * 1.3, the body by 1.35, and the shadow by 2.2. The shadow gets much the
 * biggest push on purpose — at the sampled value it was 8% luminance, which on
 * a dark ridge is a hole in the star rather than its shaded side.
 *
 * The highlight is NOT pushed further than 1.3. Past about 1.6 its green pins
 * and the tone goes to #ffff5b, which is white with a yellow cast — brighter,
 * and no longer yellow. The ceiling here is the clip, not taste.
 *
 * What is written below is each lifted tone put back through the inverse of the
 * output stage's ~2.9x multiply, so they arrive on screen as the values in
 * TONES_ON_SCREEN. They look like mud in an editor. Measured rather than
 * eyeballed, because an sRGB hex judged by eye against a linear multiply is how
 * this came out gold twice already. */
export const TONES = { hi: '#9f9730', mid: '#936b25', lo: '#5b3f14' };
/** What TONES should look like after the grade. */
export const TONES_ON_SCREEN = { hi: '#fff352', mid: '#eeae41', lo: '#966927' };

/* Which way the star thinks the sun is. Matches the scene's key light, so it
   agrees with everything around it — but it is a CONSTANT rather than the real
   light, which is the point: the bands then depend on nothing but the star's
   own rotation, so the icon in the HUD corner and a collectable out in the
   world are identical whatever the scene is doing. */
const LIGHT = [-3.2, 5.5, 4.0];

/* Where one band gives way to the next, as dot(normal, light). Chosen so that
   a star facing the camera is in the highlight band and sweeps down through
   both others in a single turn — if the front face never left the top band the
   spin would read as a flicker rather than as a rotation. */
const BAND_HI = 0.35, BAND_MID = -0.15;

/**
 * Three flat bands, hard edges, no lighting from the scene.
 *
 * Written as a shader rather than assembled from three.js materials because
 * none of them will do this. MeshToonMaterial is the close one and its gradient
 * map is sampled for its RED CHANNEL only — a scalar ramp multiplied by one
 * colour — so it cannot hold three independent hues, and the banana's mid tone
 * is not its highlight scaled down: it is relatively less green. Phong with a
 * low shininess still slides a specular across the facets as the star turns,
 * which is what read as metal.
 */
function bandedMaterial() {
  const c = (h) => ({ value: SRGB(h) });
  return new THREE.ShaderMaterial({
    uniforms: {
      cHi: c(TONES.hi), cMid: c(TONES.mid), cLo: c(TONES.lo),
      lightDir: { value: new THREE.Vector3(...LIGHT).normalize() },
      bandHi: { value: BAND_HI }, bandMid: { value: BAND_MID }
    },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 cHi, cMid, cLo, lightDir;
      uniform float bandHi, bandMid;
      varying vec3 vN;
      void main() {
        float d = dot(normalize(vN), lightDir);
        vec3 c = d > bandHi ? cHi : (d > bandMid ? cMid : cLo);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
}

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
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 1 })
    /* Non-indexed FIRST, then normals. Shared vertices average the normals of
       every face meeting at a point, which interpolates the shading across each
       face — and an interpolated normal through a three-way step function is a
       soft gradient, which is exactly the thing the bands exist to avoid. One
       normal per face is what makes the edges hard. */
    .toNonIndexed();
  g.center();
  g.scale(STAR_R, STAR_R, STAR_R);
  g.computeVertexNormals();
  return g;
}

/* How far an arc bows, as a fraction of its own LENGTH.
 *
 * This was a fixed 0.28 units regardless of how long the arc was, which is
 * where the jaggedness came from: a four-star arc is 1.86 units end to end and
 * a six-star arc is 3.10, so the same rise made the short ones nearly twice as
 * steep. Four points around a tight curve is a chevron, not an arc. Tying the
 * rise to the span gives every arc the same curvature, so they all read as
 * pieces of one shape however many stars are in them. */
const ARC_CURVE = 0.11;

/** Height above the arc's base at `u` (0..1 along it), for an arc `span` long. */
export function arcLift(u, span) {
  return Math.sin(u * Math.PI) * ARC_CURVE * span;
}

/** The most any arc can bow. */
export const ARC_LIFT_MAX = ARC_CURVE * (ARC.max - 1) * ARC.gap;

/* How often each shape turns up. The trail is common because it is the one a
   player can take without committing to anything — it keeps the collectables
   in the run rather than making every one of them a decision. */
const SHAPES = [
  { kind: 'trail',    weight: 0.38 },
  { kind: 'reachable', weight: 0.42 },
  { kind: 'awkward',   weight: 0.20 }
];

export function pickShape(r = rndWorld()) {
  let acc = 0;
  for (const s of SHAPES) { acc += s.weight; if (r < acc) return s.kind; }
  return 'reachable';
}

/* How far above the ridge a trail floats. The runner's box is 1.62 tall and
   starts at their feet, so anything in roughly 0.2..1.5 is swept up simply by
   running through it. Sat at 0.95 — near the middle, which is what leaves room
   for the ground to be rougher than the trail without the line passing over
   the player's head or under their feet. */
const TRAIL_H = 0.95;

/* How far back a jump can start. At 7 to 17 units a second a jump covers about
   2.5 to 6 units before it peaks, so this is the stretch of ground the player
   could plausibly be standing on when they commit. The LOWEST point in it is
   what has to be able to reach the arc — assuming they launch from the highest
   is assuming they saw it coming. */
const APPROACH = 6;

/**
 * Plan a whole arc at once: the world height of every star in it.
 *
 * Deciding a height and then adding the ground under each star separately was
 * wrong in two ways that only showed up on sloped ground. The ridge moves by
 * as much as 0.79 units across a single arc's length, so a height that was
 * inside a double jump where it was chosen was out of reach a metre later; and
 * the reach itself is measured from the ground the player JUMPS from, which is
 * behind the arc and usually lower than the ground beneath it.
 *
 * So the ceiling is computed first, from the lowest ground in the approach, and
 * everything else is fitted underneath it. Returns null when nothing fits —
 * far better than placing a star nobody can have.
 *
 * @param clearTop the WORLD height of the top of the tallest obstacle under the
 *                arc, or null if the stretch is empty. Absolute, not a height
 *                above the ground: the obstacle and the arc stand on different
 *                samples of a ridge that moves, and measuring one against its
 *                own ground and the other against a different one is how stars
 *                ended up inside signposts about once every thousand units.
 * @param ground  x -> terrain height. Passed in rather than imported so the
 *                tests can drive it with slopes the real ridge rarely makes.
 */
export function planArc(kind, x0, n, clearTop, ground, r = rndWorld()) {
  /* eslint-disable-next-line no-param-reassign */
  const R = reach();
  const gap = ARC.gap, span = (n - 1) * gap;
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(x0 + i * gap);

  /* A smoothed ground, so a trail glides over the ridge instead of copying
     every pit in it — and so the dome's base is not decided by one spike. */
  const smooth = (x) => {
    let sum = 0, k = 0;
    for (let d = -0.6; d <= 0.61; d += 0.3) { sum += ground(x + d); k++; }
    return sum / k;
  };

  /* A trail runs at chest height along the ground, which is exactly where a
     crate, a fence and a signpost's mast all are. There is no version of it
     that threads past them, so a stretch with anything standing in it gets a
     dome instead — the shape that goes OVER things. */
  const hasObstacle = clearTop !== null && clearTop !== undefined && isFinite(clearTop);
  if (kind === 'trail' && !hasObstacle) {
    /* Follows the ridge. No jump, no decision — the reward for running the
       line you were already running. */
    return xs.map((x) => smooth(x) + TRAIL_H);
  }
  if (kind === 'trail') kind = 'reachable';

  // the worst ground the player could be launching from
  let launch = Infinity;
  for (let x = x0 - APPROACH; x <= x0 + span; x += 0.5) launch = Math.min(launch, ground(x));
  const ceiling = launch + R.doubleTop - 0.45;

  // the dome sits on the highest ground it crosses, so it never dips into it
  let base = -Infinity;
  for (const x of xs) base = Math.max(base, smooth(x));

  const bow = ARC_CURVE * span;
  const band = kind === 'awkward'
    ? [R.singleTop + 0.1, R.doubleTop - 0.45]
    : [R.standing + 0.3, R.singleTop - 0.45];
  let h = band[0] + r * Math.max(0, band[1] - band[0]);
  // lifted in the SAME frame of reference the arc is built in
  if (hasObstacle) h = Math.max(h, clearTop + 0.55 - base);

  /* Lower the whole arc until its highest star is inside the ceiling. Lowering
     the arc rather than flattening it keeps every arc the same shape, which is
     the point of tying the bow to the span in the first place. */
  const over = (base + h + bow) - ceiling;
  if (over > 0) h -= over;

  /* Lowering for the ceiling can push the arc back down INTO the thing it was
     lifted over, which is how stars ended up inside crates. The lift is not
     negotiable — an uncollectable star is worse than no star — so if both
     cannot hold at once the arc is refused. */
  if (hasObstacle && base + h < clearTop + 0.55) return null;
  // and it must still clear a running player's head everywhere along it
  if (h < R.standing + 0.25) return null;
  return xs.map((x, i) => base + h + arcLift(i / (n - 1), span));
}

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
    this.mat = bandedMaterial();
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
    /* Never place a star past where the obstacles have been decided.
       Both fields stream ahead of the player, and the stars used to run to the
       same distance as the obstacles — so an arc could be placed in clear air
       and have a crate spawned into it a moment later. `nextX` is where the
       next obstacle will go, so everything behind it is settled and safe to
       build on. */
    const ahead = Math.min(player.x + feel.spawnAhead, obstacles.nextX - 1.2);
    if (this.nextX < player.x) this.nextX = player.x + 12;

    for (;;) {
      const n = ARC.min + Math.floor(rndWorld() * (ARC.max - ARC.min + 1));
      const span = (n - 1) * ARC.gap;
      const x0 = this.nextX;
      /* The WHOLE arc has to be behind the frontier, not just its first star.
         Testing the start alone let the tail of an arc reach past the last
         decided obstacle, which is where a crate could still land. */
      if (x0 + span >= ahead) break;

      // the top of the tallest thing standing under this arc, in world height
      let clearTop = null, patrolled = false;
      for (const o of obstacles.boxes()) {
        if (o.x1 < x0 - 0.6 || o.x0 > x0 + span + 0.6) continue;
        /* A flyer is not something to be cleared. It roams between two
           altitudes, so over its stretch of ground there is no height that is
           safe for the length of time a star sits there — and a star inside a
           bird's sweep is not a collectable, it is a trap wearing one. */
        if (o.flying) { patrolled = true; break; }
        clearTop = clearTop === null ? o.y1 : Math.max(clearTop, o.y1);
      }
      if (patrolled) { this.nextX = x0 + span + 10; continue; }

      const ys = planArc(pickShape(), x0, n, clearTop, heightAt);
      /* null means nothing fitted between the ground and what a jump can
         reach — a cliff, usually. Skipping is the right answer: a star the
         player can see and cannot have teaches them to ignore all of them. */
      if (ys) {
        /* ONE bob phase for the whole arc.
           Every star having its own was the last of the roughness, and the only
           part of it that was in the animation rather than in the placement:
           the curve is planned perfectly smooth and then each star was given an
           independent 0.07-unit wobble — about two screen pixels on a fourteen
           pixel star — which shook the line apart into a zig-zag. Sharing the
           phase makes the arc rise and fall as one object, so it can breathe
           without stopping being a curve. */
        const bob = rndWorld() * 6.28;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * ARC.gap;
          const mesh = new THREE.Mesh(this.geo, this.mat);
          mesh.position.set(x, ys[i], 0);
          this.root.add(mesh);
          /* The SPIN is staggered along the arc rather than shared or random —
             a fixed offset per position, so the turn reads as one wave running
             down the line instead of five unrelated props. */
          this.items.push({ x, y: ys[i], mesh, bob, phase: bob + i * 0.5 });
        }
      }
      // a long gap between arcs: they are a treat, not a carpet
      this.nextX = x0 + span + 14 + rndWorld() * 18;
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
    /* Returns the items taken rather than a count, because a collected star is
       not finished — it flies to the counter, and the caller needs its mesh
       and where it was to launch that. It is taken OUT of `items` here either
       way, so it cannot be collected twice on its way. */
    const got = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const r = STAR_R + COLLECT_PAD;
      if (it.x + r < box.x0 || it.x - r > box.x1) continue;
      if (it.y + r < box.y0 || it.y - r > box.y1) continue;
      /* Detached from the parallax layer, not disposed. From here it belongs
         to the HUD's world, where nothing scrolls. */
      this.root.remove(it.mesh);
      this.items.splice(i, 1);
      got.push(it);
    }
    return got;
  }

  animate(t) {
    for (const it of this.items) {
      it.mesh.rotation.y = t * SPIN + it.phase;
      it.mesh.position.y = it.y + Math.sin(t * 1.6 + it.bob) * 0.07;
    }
  }
}
