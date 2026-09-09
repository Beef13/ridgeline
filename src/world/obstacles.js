import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { heightAt } from './terrain.js';
import { feel } from '../player/tuning.js';

/**
 * Four things to dodge, each demanding a different answer:
 *
 *   boulder  — low and wide. A normal jump.
 *   spire    — tall. Needs a full-height jump, mistimed ones clip it.
 *   arch     — an overhang with a gap underneath. Must duck; jumping kills you.
 *   raptor   — a flyer at one of two altitudes. Low one you jump, high one you duck.
 *
 * The last is the one that makes the game readable rather than reflexive: the
 * player has to identify which answer applies, not just react.
 */
const M = {
  rock:  new THREE.MeshPhongMaterial({ color: SRGB('#5a574c'), shininess: 20, specular: SRGB('#9e9885'), flatShading: true }),
  dark:  new THREE.MeshPhongMaterial({ color: SRGB('#33322c'), shininess: 14, specular: SRGB('#5a574c'), flatShading: true }),
  wood:  new THREE.MeshPhongMaterial({ color: SRGB('#3a2213'), shininess: 16, specular: SRGB('#7d4f2c'), flatShading: true }),
  leaf:  new THREE.MeshPhongMaterial({ color: SRGB('#25552c'), shininess: 18, specular: SRGB('#4b9b41'), flatShading: true }),
  bird:  new THREE.MeshPhongMaterial({ color: SRGB('#3a2213'), shininess: 30, specular: SRGB('#a06a3c'), flatShading: true }),
  birdL: new THREE.MeshPhongMaterial({ color: SRGB('#7d4f2c'), shininess: 30, specular: SRGB('#dcb072'), flatShading: true })
};

const rnd = () => Math.random();

export const KINDS = {
  boulder: {
    weight: 4,
    box: () => ({ w: 0.9 + rnd() * 0.5, h: 0.75 + rnd() * 0.3, yOff: 0 }),
    build(b) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(b.h * 0.62, 0), M.rock);
      core.scale.set(b.w / (b.h * 1.1), 1, 0.9);
      core.position.y = b.h * 0.55;
      core.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(core);
      for (let i = 0; i < 2; i++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(b.h * 0.26, 0), M.dark);
        s.position.set((rnd() - 0.5) * b.w, b.h * 0.22, (rnd() - 0.5) * 0.8);
        g.add(s);
      }
      return g;
    }
  },
  spire: {
    weight: 2,
    box: () => ({ w: 0.62, h: 1.55 + rnd() * 0.35, yOff: 0 }),
    build(b) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, b.h, 6), M.rock);
      shaft.position.y = b.h / 2;
      shaft.rotation.y = rnd() * 3;
      g.add(shaft);
      const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), M.dark);
      foot.position.y = 0.16; g.add(foot);
      return g;
    }
  },
  arch: {
    weight: 2,
    // Sits above the ground with clear air beneath — the duck obstacle.
    box: () => ({ w: 1.5, h: 1.35, yOff: 1.12 }),
    build(b) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.34, 0.8), M.wood);
      beam.position.y = b.yOff + 0.2;
      beam.rotation.z = (rnd() - 0.5) * 0.12;
      g.add(beam);
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rnd() * 0.16, 0), M.leaf);
        l.position.set(-b.w / 2 + rnd() * b.w, b.yOff + 0.42 + rnd() * 0.4, (rnd() - 0.5) * 0.7);
        g.add(l);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, b.yOff + 0.3, 5), M.wood);
      post.position.set(-b.w / 2 + 0.05, (b.yOff + 0.3) / 2, 0);
      g.add(post);
      return g;
    }
  },
  raptor: {
    weight: 2,
    flying: true,
    box: () => {
      const high = rnd() > 0.5;                 // high: duck. low: jump.
      return { w: 0.95, h: 0.62, yOff: high ? 1.72 : 0.7, high };
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
  }

  reset() {
    for (const it of this.items) this.root.remove(it.group);
    this.items.length = 0;
    this.nextX = 26;
    this.lastKind = null;
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
    // Never two arches back to back — the player would still be standing up.
    if (k === this.lastKind && (k === 'arch' || k === 'spire')) {
      k = 'boulder';
    }
    this.lastKind = k;
    return k;
  }

  update(player, running) {
    if (running) {
      while (this.nextX < player.x + feel.spawnAhead) {
        const name = this.pickKind();
        const kind = KINDS[name];
        const b = kind.box();
        const g = kind.build(b);
        const gy = heightAt(this.nextX);
        g.position.x = this.nextX;
        g.position.y = (kind.flying ? gy : gy) + (kind.flying ? g.position.y : 0);
        if (!kind.flying) g.position.y = gy;
        this.root.add(g);
        this.items.push({ name, kind, box: b, group: g, x: this.nextX, gy, phase: Math.random() * 6.28 });
        this.nextX += this.gapFor(player.speed, player.distance) + b.w;
      }
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
      const flap = Math.sin(t * 11 + it.phase);
      const [wl, wr] = it.group.userData.wings;
      wl.rotation.x = flap * 0.7;
      wr.rotation.x = -flap * 0.7;
      it.group.position.y = it.gy + it.box.yOff + it.box.h / 2 + Math.sin(t * 2.2 + it.phase) * 0.12;
    }
  }

  /** World-space AABBs for collision. */
  boxes() {
    return this.items.map((it) => ({
      x0: it.x - it.box.w / 2, x1: it.x + it.box.w / 2,
      y0: it.gy + it.box.yOff, y1: it.gy + it.box.yOff + it.box.h,
      name: it.name
    }));
  }
}
