import * as THREE from 'three';
import { design, ART_DIR } from '../design.js';
import { fitImage, canvasTexture, loadImage } from '../render/fit.js';
import { ridgeTexture } from './art.js';

/**
 * Distant bands. A vista is not really "far away" — it is a cheat. Real
 * perspective would need it thousands of units out; instead each band rides
 * with the camera and lags by its own drift, which is how every game has done
 * skies since forever. Lower drift reads as further.
 *
 * Bands come from the bench export: each one's image, height, offset, drift
 * and distance are the values that were approved there.
 */
const FALLBACK = [
  { seed: 7,  roughness: 0.024, height: 0.34, tint: '#5b457c' },
  { seed: 31, roughness: 0.040, height: 0.42, tint: '#42305f' },
  { seed: 53, roughness: 0.062, height: 0.50, tint: '#241a38' }
];

export class Vistas {
  constructor(scene) {
    this.master = design.optics.vistaMaster;
    this.horizon = design.optics.vistaHorizon;
    this.tint = design.atmos.tints[5] ?? 1;

    const specs = design.assets.filter((a) => a.kind === 'image' && a.layer === 5);
    this.bands = specs.map((spec, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          // A placeholder ridge stands in until the real art decodes, so the
          // first frames are never an empty sky.
          map: ridgeTexture(FALLBACK[i % 3].seed, FALLBACK[i % 3].roughness,
                            FALLBACK[i % 3].tint, FALLBACK[i % 3].height),
          transparent: true,
          alphaTest: 0.5,       // hard cutout — the SNES had no alpha blending
          depthWrite: true,
          fog: design.atmos.fog.vistas
        })
      );
      mesh.material.color.setScalar(Math.min(2, this.tint));
      mesh.renderOrder = -20;
      scene.add(mesh);
      return { spec, mesh, aspect: 2 };
    });

    // farthest first, so nearer bands draw over
    this.bands.sort((a, b) => b.spec.depth - a.spec.depth);
    this.load();
  }

  async load() {
    for (const b of this.bands) {
      try {
        const img = await loadImage(ART_DIR + encodeURIComponent(b.spec.file));
        const c = fitImage(img, b.spec.fitW, b.spec.fitQuant, b.spec.fitDither);
        const old = b.mesh.material.map;
        b.mesh.material.map = canvasTexture(c);
        b.mesh.material.needsUpdate = true;
        if (old) old.dispose();
        b.aspect = c.width / c.height;
      } catch (e) {
        console.warn('[vista] ' + e.message + ' — keeping the procedural stand-in');
      }
    }
  }

  setFog(on) {
    for (const b of this.bands) {
      if (b.mesh.material.fog !== on) { b.mesh.material.fog = on; b.mesh.material.needsUpdate = true; }
    }
  }

  setTint(mul) {
    if (mul === this.tint) return;
    this.tint = mul;
    for (const b of this.bands) b.mesh.material.color.setScalar(Math.min(2, mul));
  }

  update(camX, camY, camZ, halfTan, aspect, snap) {
    for (const b of this.bands) {
      const s = b.spec;
      const d = Math.min(0.98, s.drift * this.master);
      b.mesh.position.x = snap(camX * (1 - d) + s.px);
      b.mesh.position.y = snap(camY * (1 - d * 0.6) + s.py + this.horizon);
      b.mesh.position.z = -s.depth;
      const h = s.h;
      b.mesh.scale.set(h * b.aspect * (s.flip ? -1 : 1), h, 1);
    }
  }
}
