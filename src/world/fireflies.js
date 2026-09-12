import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { LAYERS } from './scene.js';
import { rndDecor } from '../core/rng.js';

/**
 * Fireflies.
 *
 * Two swarms at two depths, because one is not enough to read as depth: a
 * single layer of moving dots is a screen effect, and two moving at visibly
 * different rates is a world with air in it. The parallax is free — the layer
 * roots sit at different z under a perspective camera, so a mote in the mid
 * layer slides past slower than one in front with no code to say so.
 *
 * Deliberately SPARSE. About a dozen on screen: enough to notice on a second
 * run, not enough to compete with the ridge line for attention. The thing a
 * player is reading is a silhouette against the sky, and anything that blinks
 * near it is borrowing from the same budget.
 *
 * Two draw calls for the lot. Each swarm is one THREE.Points, which matters in
 * a scene that was draw-call bound before any of this was added.
 */

/* Points, not quads. A PointsMaterial with sizeAttenuation off sets the size
   in DESTINATION pixels, which is the 256x224 buffer — so a firefly is exactly
   one or two whole pixels and can never land on the sub-pixel problem that has
   bitten every small thing in this game. A quad scaled to look 1px wide would
   flicker with the sampling grid; a point simply does not have edges to miss. */
const SWARMS = [
  /* Foreground, in front of the ridge. Bigger, faster, fewer — it is the layer
     that sells the depth, and it sits where nothing can be hidden behind it. */
  { layer: 0, count: 4, px: 2, span: 6.2, rise: 2.6, drift: 0.45, rate: 1.15 },
  /* Mid, out past the play plane. Single pixels, because at that distance a
     2px mote reads as the same size as the near ones and the depth collapses. */
  { layer: 2, count: 8, px: 1, span: 10.4, rise: 3.4, drift: 0.28, rate: 0.85 }
];

/* Authored dim on purpose. The output stage multiplies by about 2.9, and these
   are drawn ADDITIVELY on top of whatever is behind them — a firefly that looks
   right in isolation clips to a white square the moment it crosses the sky. */
const GLOW = '#6b7a2e';

/**
 * The flash envelope: mostly dark, with a short soft bloom.
 *
 * A sine would have each mote lit half the time, which is a fairy light rather
 * than an insect. Raising it to a power keeps the peak and crushes everything
 * either side, so the mote spends most of its cycle off — which is also what
 * makes a dozen of them feel like more than a dozen.
 *
 * The exponent was measured, not guessed: at 6 a mote is visibly lit 26% of the
 * time, which still read as a slow bulb. 12 puts it at 19%, and the gap between
 * flashes is then long enough to be the thing you notice.
 */
export function pulse(t, phase, rate) {
  const s = Math.sin(t * rate + phase);
  return s <= 0 ? 0 : Math.pow(s, 12);
}

/**
 * Keep a world x inside a band that travels with the camera.
 *
 * Returns the x moved by whole spans, never smoothed — a mote that is wrapped
 * has to arrive at the far edge in one step, off screen. Nudging it there over
 * several frames is how you get a dot visibly flying backwards through the
 * scene at four times the speed of everything else.
 */
export function wrapX(x, camX, span) {
  const half = span / 2;
  let d = x - camX;
  while (d < -half) d += span;
  while (d > half) d -= span;
  return camX + d;
}

export class Fireflies {
  constructor(roots) {
    this.swarms = [];
    for (const cfg of SWARMS) {
      const root = roots[cfg.layer];
      if (!root) continue;
      const z0 = LAYERS[cfg.layer] ? LAYERS[cfg.layer].z : 0;

      const pos = new Float32Array(cfg.count * 3);
      const col = new Float32Array(cfg.count * 3);
      const motes = [];
      for (let i = 0; i < cfg.count; i++) {
        motes.push({
          x: (rndDecor() - 0.5) * cfg.span,
          y: (rndDecor() - 0.5) * cfg.rise,
          z: z0 + (rndDecor() - 0.5) * 2.2,
          phase: rndDecor() * 6.28,
          /* Each mote gets its own rate as well as its own phase. Shared rates
             drift into step with each other and the swarm starts blinking in
             unison, which looks authored rather than alive. */
          rate: cfg.rate * (0.7 + rndDecor() * 0.6),
          bobP: rndDecor() * 6.28,
          bobR: 0.5 + rndDecor() * 0.7
        });
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      /* Without this, three computes a bounding sphere from the initial (all
         zero) positions and frustum-culls the whole swarm the moment the camera
         moves. Infinite radius is the honest answer for something that follows
         the camera by design. */
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

      const mat = new THREE.PointsMaterial({
        size: cfg.px,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      root.add(points);
      this.swarms.push({ cfg, motes, points, pos, col, base: SRGB(GLOW) });
    }
  }

  /**
   * @param camX  camera x, so the swarms travel with the view
   * @param camY  camera y — the band is hung off the camera rather than off the
   *              terrain, which costs a height lookup per mote per frame and
   *              buys nothing a player could point at
   * @param t     seconds, for the flash and the bob
   * @param dt    seconds since the last DRAW
   */
  update(camX, camY, t, dt) {
    for (const s of this.swarms) {
      const { cfg, motes, pos, col, base } = s;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        // a slow sideways drift of their own, so they are not simply scenery
        // sliding past at exactly the speed of the ground
        m.x += cfg.drift * Math.sin(t * m.bobR + m.bobP) * dt;
        m.x = wrapX(m.x, camX, cfg.span);
        const y = camY + m.y + Math.sin(t * m.bobR * 0.8 + m.bobP) * 0.22;
        pos[i * 3] = m.x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = m.z;

        const p = pulse(t, m.phase, m.rate);
        col[i * 3] = base.r * p;
        col[i * 3 + 1] = base.g * p;
        col[i * 3 + 2] = base.b * p;
      }
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.geometry.attributes.color.needsUpdate = true;
    }
  }
}
