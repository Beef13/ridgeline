import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { heightAt, buildCliffChunk, disposeGroup } from './terrain.js';
import { frondTexture, bladeTexture, treeTexture } from './art.js';
import { LAYERS } from './scene.js';

/**
 * Keeps a rolling window of ground and scenery around the player. Chunks are
 * built ahead and thrown away behind, so the level is endless without the
 * scene graph ever growing.
 */
const CHUNK = 16;
const AHEAD = 5, BEHIND = 2;
const rnd = () => Math.random();

let ART = null;
function art() {
  if (!ART) {
    ART = {
      frond: frondTexture(),
      blade: bladeTexture(),
      tree: treeTexture(false),
      treeDark: treeTexture(true)
    };
  }
  return ART;
}

const bushDark = new THREE.MeshPhongMaterial({ color: SRGB('#25552c'), shininess: 14, specular: SRGB('#4b9b41'), flatShading: true });
const bushLit  = new THREE.MeshPhongMaterial({ color: SRGB('#4b9b41'), shininess: 24, specular: SRGB('#8fd457'), flatShading: true });
const stone    = new THREE.MeshPhongMaterial({ color: SRGB('#5a574c'), shininess: 18, specular: SRGB('#9e9885'), flatShading: true });

/**
 * Layer tint. Distance darkens and cools, baked per layer rather than fogged —
 * a fixed palette holds discrete steps far better than a gradient.
 */
export const cue = { dark: 1, cool: 1 };

function layerColour(i) {
  const L = LAYERS[i];
  const c = new THREE.Color(1, 1, 1);
  const cold = new THREE.Color(0.22, 0.17, 0.36);
  c.lerp(cold, Math.min(1, L.cold * cue.cool));
  // dark scales the DEPARTURE from 1, so 0 flattens the scene and 1 is as authored
  c.multiplyScalar(Math.max(0, 1 + (L.tint - 1) * cue.dark));
  return c;
}

function sprite(map, colour, w, h) {
  const m = new THREE.MeshBasicMaterial({
    map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, color: colour
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Dressing sits behind the front lip, or the cliff face hides it. */
function dressChunk(x0, x1) {
  const g = new THREE.Group();
  const A = art();
  const play = layerColour(1);
  for (let x = x0; x < x1; x += 0.8 + rnd() * 1.4) {
    const y = heightAt(x), roll = rnd();
    if (roll < 0.34) {
      const b = new THREE.Group();
      const n = 5 + Math.floor(rnd() * 5), spread = 0.45 + rnd() * 0.4;
      for (let i = 0; i < n; i++) {
        const r = 0.07 + rnd() * 0.1;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rnd() > 0.55 ? bushLit : bushDark);
        m.position.set((rnd() - 0.5) * spread * 2, r * 0.5 + rnd() * 0.28, (rnd() - 0.5) * spread);
        m.scale.set(1 + rnd() * 0.5, 0.75 + rnd() * 0.4, 1);
        b.add(m);
      }
      b.position.set(x, y, -2.2 + rnd() * 1.5);
      b.scale.setScalar(0.85 + rnd() * 0.5);
      g.add(b);
    } else if (roll < 0.58) {
      const s = 0.5 + rnd() * 0.5;
      const q = sprite(A.blade, play, s, s);
      q.position.set(x, y + s * 0.42, -2.0 + rnd() * 1.4);
      g.add(q);
    } else if (roll < 0.74) {
      const s = 0.7 + rnd() * 0.6;
      const q = sprite(A.frond, play, s, s);
      q.position.set(x, y + s * 0.3, -2.4 + rnd() * 1.6);
      q.rotation.z = (rnd() - 0.5) * 1.3;
      if (rnd() > 0.5) q.scale.x = -1;
      g.add(q);
    } else if (roll < 0.9) {
      const r = 0.12 + rnd() * 0.24;
      const k = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), stone);
      k.position.set(x, y + r * 0.45, -2.3 + rnd() * 1.8);
      k.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(k);
    }
  }
  return g;
}

/**
 * Parallax scatter, now drawn art rather than cones. Distant layers converge
 * toward the horizon, so their bases sit well BELOW the play plane or they
 * fill the sky instead of standing behind it.
 */
const SCATTER = [
  { root: 2, z: -7,   spacing: 3.4, size: 2.6, base: -1.6, jitter: 0.5, density: 0.9,  kind: 'tree'  },
  { root: 3, z: -18,  spacing: 6.0, size: 5.5, base: -3.4, jitter: 1.2, density: 0.85, kind: 'tree'  },
  { root: 4, z: -38,  spacing: 11,  size: 11,  base: -7.5, jitter: 2.4, density: 0.85, kind: 'dark'  },
  { root: 0, z: 7.5,  spacing: 9,   size: 5.0, base: -4.6, jitter: 0.9, density: 0.55, kind: 'frond' }
];

function layerScatter(cfg, x0, x1) {
  const g = new THREE.Group();
  const A = art();
  const col = layerColour(cfg.root);
  const map = cfg.kind === 'frond' ? A.frond : (cfg.kind === 'dark' ? A.treeDark : A.tree);
  for (let x = x0; x < x1; x += cfg.spacing * (0.5 + rnd() * 0.9)) {
    if (rnd() > cfg.density) continue;
    const s = cfg.size * (0.7 + rnd() * 0.6);
    const q = sprite(map, col, s, s);
    q.position.set(x, cfg.base + s * 0.45 + rnd() * cfg.jitter, cfg.z + (rnd() - 0.5) * 3);
    if (cfg.kind === 'frond') {
      q.rotation.z = (rnd() - 0.5) * 1.6;
      q.position.y = cfg.base + rnd() * cfg.jitter;
    }
    if (rnd() > 0.5) q.scale.x = -1;
    g.add(q);
  }
  return g;
}

export class Streamer {
  constructor(roots) {
    this.roots = roots;
    this.chunks = new Map();
  }

  reset() {
    for (const [, c] of this.chunks) c.groups.forEach(disposeGroup);
    this.chunks.clear();
  }

  build(i) {
    const x0 = i * CHUNK, x1 = x0 + CHUNK;
    const groups = [];
    const cliff = buildCliffChunk(x0, x1);
    this.roots[1].add(cliff); groups.push(cliff);
    const dress = dressChunk(x0, x1);
    this.roots[1].add(dress); groups.push(dress);
    for (const s of SCATTER) {
      const g = layerScatter(s, x0, x1);
      this.roots[s.root].add(g);
      groups.push(g);
    }
    this.chunks.set(i, { groups });
  }

  update(x) {
    const c = Math.floor(x / CHUNK);
    for (let i = c - BEHIND; i <= c + AHEAD; i++) if (!this.chunks.has(i)) this.build(i);
    for (const [i, chunk] of this.chunks) {
      if (i < c - BEHIND - 1 || i > c + AHEAD + 1) {
        chunk.groups.forEach(disposeGroup);
        this.chunks.delete(i);
      }
    }
  }
}
