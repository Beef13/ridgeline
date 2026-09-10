import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { heightAt } from './terrain.js';
import { feel } from '../player/tuning.js';

/**
 * Four things to dodge, each demanding a different answer:
 *
 *   crate    — low and wide. A normal jump.
 *   fence    — tall. Needs a full-height jump, mistimed ones clip it.
 *   sign     — a signpost cantilevered over the path. Must duck; jumping kills you.
 *   raptor   — a flyer. Low one you jump, high one you duck; deeper into a run
 *              they climb and dive between the two, so the answer is only
 *              settled when you get there.
 *
 * The last is the one that makes the game readable rather than reflexive: the
 * player has to identify which answer applies, not just react.
 */
/**
 * Obstacle tint, live.
 *
 * Everything you have to dodge is warm and nothing else in the scene is: the
 * ridge and its dressing are green and grey, so separating the obstacles by
 * HUE is the only axis with room left. Brightness has none — the grade runs
 * about 2.9x, so anything light enough to stand out on luminance alone clips
 * to a flat glowing slab and loses its shape. Warm and mid-toned reads.
 *
 * How far to push it is a judgement call against whatever art is scattered on
 * the ridge that day, so it is a slider in the LOOK panel rather than a
 * constant here. Each material carries both ends and `tintObstacles` dials
 * between them — in LINEAR space, because that is where SRGB() lands and
 * mixing sRGB values directly would darken the midpoint.
 *
 * Two timbers, not one: at ~31 screen pixels per world unit a crate is about
 * 30px tall, and plank lines in the same tone as the body vanish in the
 * palette snap. The frame has to be a different value from what it frames.
 */
const TONE = {
  plank:  { cool: '#33200f', warm: '#5c2b0b', coolSpec: '#5a3a1e', warmSpec: '#8a4a18' },
  timber: { cool: '#57381b', warm: '#8a4a12', coolSpec: '#7d4f2c', warmSpec: '#b06a20' },
  bird:   { cool: '#3a2213', warm: '#63300c', coolSpec: '#a06a3c', warmSpec: '#c47a22' },
  birdL:  { cool: '#7d4f2c', warm: '#ab5d16', coolSpec: '#dcb072', warmSpec: '#f0a83e' }
};

const M = {
  plank:  new THREE.MeshPhongMaterial({ shininess: 8,  flatShading: true }),
  timber: new THREE.MeshPhongMaterial({ shininess: 14, flatShading: true }),
  bird:   new THREE.MeshPhongMaterial({ shininess: 30, flatShading: true }),
  birdL:  new THREE.MeshPhongMaterial({ shininess: 30, flatShading: true })
};

/** 0 keeps the authored browns, 1 pushes every obstacle to full orange. */
export function tintObstacles(warm) {
  const w = Math.max(0, Math.min(1, warm));
  for (const [k, t] of Object.entries(TONE)) {
    M[k].color.copy(SRGB(t.cool)).lerp(SRGB(t.warm), w);
    M[k].specular.copy(SRGB(t.coolSpec)).lerp(SRGB(t.warmSpec), w);
  }
}
tintObstacles(0.55);        // a starting point, not a decision — see the panel

const rnd = () => Math.random();

/* The two altitudes a bird can occupy. The player stands 1.62 and ducks to
   0.82, so LOW cannot be ducked and has to be jumped, and HIGH cannot be
   jumped cleanly and has to be ducked. Everything between the two has at
   least one answer available, which is what makes a roaming bird a decision
   rather than a coin toss. */
const LOW = 0.70, HIGH = 1.72;

const ROAM_FROM = 320, ROAM_ALL_BY = 1400;

/** How likely a bird is to roam, given how far the player has come. */
export function roamChance(distance) {
  const t = (distance - ROAM_FROM) / (ROAM_ALL_BY - ROAM_FROM);
  return Math.max(0, Math.min(0.8, t));       // never all of them: variety reads better
}

/**
 * Where a flyer is right now — ONE function, used by both the mesh and the
 * hitbox. The old bob moved the art and left the box behind, so a bird could
 * kill you from a place it visibly was not. Anything that moves has to answer
 * this question once.
 */
function flyerYOff(it, t) {
  const b = it.box;
  if (!b.roam) return b.yOff + Math.sin(t * 2.2 + it.phase) * 0.12;
  const s = (Math.sin(t * b.rate + it.phase) + 1) / 2;
  return LOW + (HIGH - LOW) * s;
}

export const KINDS = {
  /* A timber crate. Every detail sits on the FRONT face — at this resolution
     the sides are two pixels of nothing, and detail spent there is detail the
     player never sees. The silhouette stays a clean rectangle, which is what
     makes it read instantly as "jump this" against a noisy ridge. */
  crate: {
    weight: 4,
    box: () => ({ w: 0.95 + rnd() * 0.4, h: 0.8 + rnd() * 0.25, yOff: 0 }),
    build(b) {
      const g = new THREE.Group();
      const d = 0.78;                       // deep enough to catch the key light
      const t = 0.1;                        // batten thickness: ~3px, the floor
      const face = d / 2 + 0.03;            // battens ride just proud of the body

      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, d), M.plank);
      body.position.y = b.h / 2;
      g.add(body);

      const batten = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), M.timber);
        m.position.set(x, y, face);
        return m;
      };
      g.add(batten(t, b.h, -b.w / 2 + t / 2, b.h / 2));
      g.add(batten(t, b.h,  b.w / 2 - t / 2, b.h / 2));
      g.add(batten(b.w, t, 0, t / 2));
      g.add(batten(b.w, t, 0, b.h - t / 2));

      // one diagonal brace — the single mark that says crate rather than box
      const diag = new THREE.Mesh(
        new THREE.BoxGeometry(Math.hypot(b.w, b.h) * 0.94, t * 0.85, 0.04), M.timber);
      diag.position.set(0, b.h / 2, face - 0.01);
      diag.rotation.z = Math.atan2(b.h, b.w) * (rnd() > 0.5 ? 1 : -1);
      g.add(diag);
      return g;
    }
  },
  /* A length of timber fence. Tall and narrow, same as the spire it replaces —
     the read is "too tall to clear casually", and the rails give the eye a
     height to judge against, which the smooth spire never did. */
  fence: {
    weight: 2,
    box: () => ({ w: 0.62, h: 1.55 + rnd() * 0.35, yOff: 0 }),
    build(b) {
      const g = new THREE.Group();
      const postW = 0.15, d = 0.16;
      const px = b.w / 2 - postW / 2;

      /* The pointed caps are built INSIDE the stated height, not stacked on
         top of it. A silhouette that rises above its own hitbox is the worst
         kind of unfair-in-reverse: you clip the tip, survive, and learn that
         the picture is lying to you. */
      const capH = 0.18, shaft = b.h - capH;
      for (const x of [-px, px]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, shaft, d), M.timber);
        post.position.set(x, shaft / 2, 0);
        post.rotation.z = (rnd() - 0.5) * 0.05;    // never quite plumb
        g.add(post);
        // left unrotated: a 4-sided cone turned 45° puts its base corners on the
        // x axis and pushes the post's footprint out by a factor of root two
        const cap = new THREE.Mesh(new THREE.ConeGeometry(postW * 0.6, capH, 4), M.timber);
        cap.position.set(x, shaft + capH / 2, 0);
        g.add(cap);
      }

      /* Three rails is the most that survives the palette snap on a 1.6-unit
         post — a fourth turns the gaps into single pixels and the whole panel
         fills in solid. */
      for (let i = 0; i < 3; i++) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(b.w * 1.04, 0.13, 0.09), M.plank);
        rail.position.set(0, b.h * (0.22 + i * 0.3), 0.05);
        rail.rotation.z = (rnd() - 0.5) * 0.04;
        g.add(rail);
      }
      return g;
    }
  },
  /* A trail signpost, cantilevered over the path — clear air beneath, so you
     duck it. Collision covers the BOARDS only; the mast is not in the hitbox,
     which is why it stands back in z rather than on the running line. The arch
     this replaces put its post right where the runner passes and let them walk
     through it, and that is the sort of thing a player notices once and then
     stops trusting the art. */
  sign: {
    weight: 2,
    box: () => ({ w: 1.5, h: 1.35, yOff: 1.12 }),
    build(b) {
      const g = new THREE.Group();
      const right = b.w / 2 - 0.09;         // where the mast stands
      const boardZ = 0.05, mastZ = -0.42;

      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, b.yOff + b.h - 0.06, 0.16), M.timber);
      mast.position.set(right, (b.yOff + b.h - 0.06) / 2, mastZ);
      g.add(mast);

      /* A board plus a batten along each long edge. One flat slab of plank at
         14 screen pixels is a brown smear; the value step at top and bottom is
         the whole reason it reads as a sign at all. */
      const board = (w, h, y) => {
        const p = new THREE.Group();
        const face = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), M.plank);
        p.add(face);
        for (const s of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.09), M.timber);
          edge.position.set(0, s * (h / 2 - 0.03), 0);
          p.add(edge);
        }
        p.position.set(right + 0.08 - w / 2, y, boardZ);
        return p;
      };

      const bigW = b.w * 0.8, bigH = 0.44, bigY = b.yOff + b.h * 0.66;
      const big = board(bigW, bigH, bigY);
      // a pointed end, so it reads as pointing somewhere rather than just hanging
      const tip = new THREE.Mesh(new THREE.BoxGeometry(bigH * 0.7, bigH * 0.7, 0.07), M.plank);
      tip.position.set(-bigW / 2, 0, 0);
      tip.rotation.z = Math.PI / 4;
      big.add(tip);
      g.add(big);

      g.add(board(b.w * 0.62, 0.3, b.yOff + b.h * 0.24));

      // brackets back to the mast, so the boards are not floating in mid air
      for (const y of [bigY, b.yOff + b.h * 0.24]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, boardZ - mastZ), M.timber);
        arm.position.set(right, y, (boardZ + mastZ) / 2);
        g.add(arm);
      }
      return g;
    }
  },
  raptor: {
    weight: 2,
    flying: true,
    box: (distance = 0) => {
      /* Early on a bird holds one altitude and the answer is fixed the moment
         you see it. Later they climb and dive between the two, so the answer is
         only settled when you get there — the same obstacle asking a harder
         question rather than a new obstacle to learn. */
      if (rnd() < roamChance(distance)) {
        return {
          w: 0.95, h: 0.62, yOff: LOW, roam: true,
          /* Slow enough to read. The player commits about half a second out, and
             a sine spends most of its time near the ends, so the common case is
             a bird that is clearly high or clearly low with a visible drift —
             not a coin toss. */
          rate: (2 * Math.PI) / (2.0 + rnd() * 0.8)
        };
      }
      const high = rnd() > 0.5;                 // high: duck. low: jump.
      return { w: 0.95, h: 0.62, yOff: high ? HIGH : LOW, high };
    },
    build(b) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), M.bird);
      body.scale.set(1.5, 0.8, 0.8);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), M.birdL);
      head.position.set(0.34, 0.08, 0); g.add(head);
      const wing = (s) => {
        const p = new THREE.Group();
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.34), M.birdL);
        m.position.set(-0.05, 0, s * 0.24);
        p.add(m);
        return p;
      };
      const wl = wing(1), wr = wing(-1);
      g.add(wl, wr);
      g.userData.wings = [wl, wr];
      g.position.y = b.yOff + b.h / 2;
      /* Turned to face back down the ridge — the runner comes from -x, so a
         bird built nose-forward is showing them its tail. The flap is
         symmetric, so mirroring costs nothing. */
      g.rotation.y = Math.PI;
      return g;
    }
  }
};

const TABLE = Object.entries(KINDS).flatMap(([k, v]) => Array(v.weight).fill(k));

export class ObstacleField {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.nextX = 26;          // first obstacle is far enough to read the scene
    this.lastKind = null;
    this.time = 0;            // the field's own clock, so flight is not tied to frame rate
  }

  reset() {
    for (const it of this.items) this.root.remove(it.group);
    this.items.length = 0;
    this.nextX = 26;
    this.lastKind = null;
    this.time = 0;
  }

  /** Difficulty is spacing, not speed — speed ramps on its own. */
  gapFor(speed, distance) {
    const f = feel;
    const t = Math.min(1, distance / f.difficultyAt);
    const reaction = f.reactionTime * (1.0 - 0.35 * t);
    const base = speed * reaction;
    const slack = (2.4 - 1.6 * t) * (0.6 + Math.random() * 0.9);
    return base + slack;
  }

  pickKind() {
    let k = TABLE[Math.floor(Math.random() * TABLE.length)];
    // Never two ducks back to back — the player would still be standing up.
    if (k === this.lastKind && (k === 'sign' || k === 'fence')) {
      k = 'crate';
    }
    this.lastKind = k;
    return k;
  }

  update(player, running, dt = 0) {
    this.time += dt;
    if (running) {
      while (this.nextX < player.x + feel.spawnAhead) {
        const name = this.pickKind();
        const kind = KINDS[name];
        const b = kind.box(player.distance);
        const g = kind.build(b);
        const gy = heightAt(this.nextX);
        g.position.set(this.nextX, gy, 0);
        this.root.add(g);
        const it = { name, kind, box: b, group: g, x: this.nextX, gy,
                     phase: Math.random() * 6.28, yOff: b.yOff };
        this.items.push(it);
        this.nextX += this.gapFor(player.speed, player.distance) + b.w;
      }
    }

    /* Altitude is settled HERE, before collision reads it — not in animate(),
       which runs after. A flyer resolved on the render side would be judged
       against where it was a frame ago. */
    for (const it of this.items) {
      if (it.kind.flying) it.yOff = flyerYOff(it, this.time);
    }
    // Cull well behind, so nothing pops out while still on screen.
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].x < player.x - 30) {
        this.root.remove(this.items[i].group);
        this.items.splice(i, 1);
      }
    }
  }

  animate(t) {
    for (const it of this.items) {
      if (!it.kind.flying) continue;
      // beat harder on the climb: it is the tell that the bird is going up
      const climb = it.box.roam ? Math.cos(this.time * it.box.rate + it.phase) : 0;
      const flap = Math.sin(t * (11 + climb * 5) + it.phase);
      const [wl, wr] = it.group.userData.wings;
      wl.rotation.x = flap * (0.7 + climb * 0.25);
      wr.rotation.x = -flap * (0.7 + climb * 0.25);
      // the same yOff collision used this step — one number, two consumers
      it.group.position.y = it.gy + it.yOff + it.box.h / 2;
    }
  }

  /** World-space AABBs for collision. */
  boxes() {
    return this.items.map((it) => ({
      x0: it.x - it.box.w / 2, x1: it.x + it.box.w / 2,
      y0: it.gy + it.yOff, y1: it.gy + it.yOff + it.box.h,
      name: it.name
    }));
  }
}
