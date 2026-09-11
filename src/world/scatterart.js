import * as THREE from 'three';
import { design, ART_DIR } from '../design.js';
import { fitImage, canvasTexture, loadImage } from '../render/fit.js';
import { resolveArt } from '../render/artindex.js';
import { heightAt } from './terrain.js';
import { LAYERS } from './scene.js';

/**
 * Art sown along the ridge rather than placed once.
 *
 * The bench turns an asset into a RULE — how many per hundred units, how big,
 * how deep, how far to sink it — and this reads the same rule back. Placement
 * is a pure function of world x, exactly like the terrain, so a chunk built,
 * thrown away and rebuilt puts every instance back where it was. Seeding off
 * the chunk index instead would make the ridge reshuffle as you ran along it.
 *
 * Only images scatter. A GLB would have to be fetched, parsed and cloned per
 * instance, and at this resolution it buys nothing a baked sprite does not —
 * bake it in the bench and it arrives here as a PNG like any other.
 *
 * An asset carries its own layer, and the layer decides how it is placed. Only
 * the play plane has terrain under it; on any other layer "sit on the ground"
 * is meaningless, so instances take a height band instead. The vista layer is
 * different again — it is camera-locked, so those instances ride along with it
 * rather than sitting in the world (see `Vistas`, which drives them).
 */
export const SCATTER_DEFAULT = {
  dens: 12, sMin: 0.6, sMax: 1.3, flip: true,
  mode: 'ground', yOff: 0, yMin: 0, yMax: 2,
  z0: -2.4, z1: -0.6, depth: 110, drift: 0.06,
  op: 1,          // opacity of the sown copies
  rot: 0          // random lean, in degrees either way; 0 is none
};

const DEG = Math.PI / 180;

/* One plane, shared by every scattered instance.
 *
 * Each instance used to build its own PlaneGeometry just to bake its size into
 * the vertices — 2,200-odd geometries, each with its own buffers, its own
 * upload and its own bounding sphere, to describe two triangles that differ
 * only by a scale factor. A unit quad scaled by the mesh is the same four
 * vertices in the same places, and there is exactly one of it. */
const UNIT = new THREE.PlaneGeometry(1, 1);

const hash = (n) => { const a = Math.sin(n * 43758.5453) * 12345.6789; return a - Math.floor(a); };

export class ScatterArt {
  constructor() {
    this.kinds = (design.assets || [])
      .filter((a) => a.kind === 'image' && a.scatter && a.scatter.on)
      .map((a, i) => ({
        spec: a,
        layer: a.layer ?? 1,
        cfg: { ...SCATTER_DEFAULT, ...a.scatter },
        seed: (i + 1) * 977,
        aspect: 1,
        /* alphaTest compares the texel's alpha AFTER opacity multiplies in, so a
           faded cut-out under a fixed 0.5 cutoff discards every pixel and the
           asset disappears. Scale the cutoff with the fade and the silhouette
           survives it. */
        material: new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: a.scatter.op ?? 1,
          alphaTest: 0.5 * (a.scatter.op ?? 1),
          depthWrite: (a.scatter.op ?? 1) >= 1,
          side: THREE.DoubleSide, visible: false
        })
      }));
    this.ready = this.kinds.length === 0;
    this.onReady = null;
  }

  /** Fetch and palette-fit every scattered image, then let the caller rebuild. */
  async load() {
    await Promise.all(this.kinds.map(async (k) => {
      try {
        const img = await loadImage(ART_DIR + encodeURIComponent(await resolveArt(k.spec.file)));
        const c = fitImage(img, k.spec.fitW ?? 0, k.spec.fitQuant !== false, k.spec.fitDither ?? 1);
        k.aspect = c.width / c.height;
        k.material.map = canvasTexture(c);
        k.material.visible = true;
        k.material.needsUpdate = true;
      } catch (e) {
        // a missing file must not take the ridge down with it
        console.warn('[scatter] could not load', k.spec.file, e.message || e);
        k.material.visible = false;
        k.dead = true;
      }
    }));
    this.ready = true;
    if (this.onReady) this.onReady();
  }

  /**
   * Instances whose x falls inside this chunk. The candidate positions are laid
   * out across the whole world, not the chunk, so an instance never lands
   * differently depending on which chunk happened to claim it.
   */
  chunk(x0, x1, layer = 1) {
    const g = new THREE.Group();
    if (!this.ready) return g;
    const SPAN = 100;                       // density is quoted per 100 units
    const L = LAYERS[layer];
    for (const k of this.kinds) {
      // layer 5 never streams — it is camera-locked, see vistaBands()
      if (k.dead || k.cfg.dens <= 0 || k.layer === 5 || k.layer !== layer) continue;
      const step = SPAN / k.cfg.dens;       // nominal gap between instances
      const first = Math.floor(x0 / step), last = Math.ceil(x1 / step);
      for (let n = first; n <= last; n++) {
        const r = (j) => hash(k.seed + n * 7.13 + j * 131.7);
        const x = (n + r(1) * 0.85) * step;
        if (x < x0 || x >= x1) continue;
        const s = k.cfg.sMin + r(2) * Math.max(0, k.cfg.sMax - k.cfg.sMin);
        // depth is measured from the layer's own z, so moving an asset between
        // layers moves what you sowed with it
        const z = (L ? L.z : 0) + k.cfg.z0 + r(3) * (k.cfg.z1 - k.cfg.z0);
        const foot = (k.cfg.mode === 'ground' && layer === 1)
          ? heightAt(x) + k.cfg.yOff
          : k.cfg.yMin + r(5) * (k.cfg.yMax - k.cfg.yMin);
        const m = new THREE.Mesh(UNIT, k.material);
        m.position.set(x, foot + s * 0.5, z);
        m.scale.set(s * k.aspect * (k.cfg.flip && r(4) > 0.5 ? -1 : 1), s, 1);
        if (k.cfg.rot) m.rotation.z = (r(6) - 0.5) * 2 * k.cfg.rot * DEG;
        /* Nothing moves an instance once it is placed — the GROUP is what
           streams — so the local matrix is composed once here instead of being
           rebuilt from position/quaternion/scale on all 2,200 of them, every
           frame, forever. */
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.userData.scattered = k.spec.file;
        g.add(m);
      }
    }
    return g;
  }

  /** Which world layers have anything sown on them, so the streamer knows. */
  worldLayers() {
    return [...new Set(this.kinds.filter((k) => k.layer !== 5).map((k) => k.layer))];
  }

  /**
   * Vista-layer kinds, laid out once across a band. These do not stream — they
   * ride with the camera and lag by their own drift, so there is nothing to
   * chunk.
   *
   * The band TILES rather than being made merely wide. A wide band still runs
   * out: it lags the camera, so however far it reaches the sky eventually goes
   * empty, and at the densities the bench allows a band long enough to outlast
   * a real run would be tens of thousands of meshes. Instead it covers a few
   * screens and repeats — instances are laid out on exactly `count` steps, so
   * sliding the group by exactly `wide` puts identical spacing back under the
   * camera with no seam (see Vistas.update).
   */
  vistaBands() {
    // a kind whose art never arrived would otherwise fill the sky with hundreds
    // of invisible planes that still cost a matrix update and a cull every frame
    return this.kinds.filter((k) => k.layer === 5 && !k.dead && k.cfg.dens > 0).map((k) => {
      const g = new THREE.Group();
      const SPAN = 100;
      const step = SPAN / Math.max(0.01, k.cfg.dens);
      // a few screens' worth at vista distance, rounded to a whole number of
      // steps — the rounding is what makes the repeat invisible
      const count = Math.max(24, Math.round(200 / step));
      const WIDE = count * step;
      for (let n = -count / 2; n < count / 2; n++) {
        const r = (j) => hash(k.seed + n * 7.13 + j * 131.7);
        const x = (n + r(1) * 0.85) * step;
        const s = k.cfg.sMin + r(2) * Math.max(0, k.cfg.sMax - k.cfg.sMin);
        const m = new THREE.Mesh(UNIT, k.material);
        // spread in depth around the band's distance, same rule as a world layer
        const z = -k.cfg.depth + k.cfg.z0 + r(3) * (k.cfg.z1 - k.cfg.z0);
        m.position.set(x, k.cfg.yMin + r(5) * (k.cfg.yMax - k.cfg.yMin) + s * 0.5, z);
        m.scale.set(s * k.aspect * (k.cfg.flip && r(4) > 0.5 ? -1 : 1), s, 1);
        if (k.cfg.rot) m.rotation.z = (r(6) - 0.5) * 2 * k.cfg.rot * DEG;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.userData.scattered = k.spec.file;
        g.add(m);
      }
      g.renderOrder = -15;
      return { group: g, drift: k.cfg.drift, wide: WIDE };
    });
  }
}
