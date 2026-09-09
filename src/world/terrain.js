import * as THREE from 'three';
import { SRGB } from '../core/colour.js';

/**
 * The ground is a pure function of x — no stored heightfield, no chunk seams
 * to reconcile. Mesh chunks are just windows onto it, so they can be built
 * and thrown away as the runner advances without the surface ever changing.
 */
const BASE = 1.4;
const hash1 = (n) => { const a = Math.sin(n * 127.1) * 43758.5453; return a - Math.floor(a); };
const smooth = (t) => t * t * (3 - 2 * t);

function valueNoise(x) {
  const i = Math.floor(x), f = x - i;
  return hash1(i) + (hash1(i + 1) - hash1(i)) * smooth(f);
}

export function heightAt(x) {
  let h = BASE;
  h += (valueNoise(x * 0.040) - 0.5) * 2.0;   // broad roll
  h += (valueNoise(x * 0.115 + 40) - 0.5) * 0.7;
  // Angular chips, not smooth swell — rock fractures, it doesn't ripple.
  const frac = (v) => v - Math.floor(v);
  h += (0.5 - Math.abs(frac(x * 0.41) - 0.5)) * 0.14
     + (0.5 - Math.abs(frac(x * 1.13 + 0.3) - 0.5)) * 0.08;
  return h;
}

/** Slope at x, for standing the figure and obstacles on the surface. */
export const slopeAt = (x) => (heightAt(x + 0.25) - heightAt(x - 0.25)) / 0.5;

export const ROCK = {
  lit:  () => new THREE.MeshPhongMaterial({ color: SRGB('#878271'), shininess: 26, specular: SRGB('#b6af9a'), flatShading: true, vertexColors: true }),
  rim:  () => new THREE.MeshPhongMaterial({ color: SRGB('#b6af9a'), shininess: 44, specular: SRGB('#fff2d2'), side: THREE.DoubleSide }),
  mid:  () => new THREE.MeshPhongMaterial({ color: SRGB('#706c5e'), shininess: 22, specular: SRGB('#9e9885'), flatShading: true }),
  deep: () => new THREE.MeshPhongMaterial({ color: SRGB('#46443c'), shininess: 16, specular: SRGB('#706c5e'), flatShading: true }),
  dark: () => new THREE.MeshPhongMaterial({ color: SRGB('#20201e'), shininess: 12, specular: SRGB('#46443c'), flatShading: true })
};

// Shared across every chunk — one material set, not one per chunk.
export const rockMats = {
  lit: ROCK.lit(), rim: ROCK.rim(), mid: ROCK.mid(), deep: ROCK.deep(), dark: ROCK.dark()
};

const hash = (n) => { const a = Math.sin(n * 12.9898) * 43758.5453; return a - Math.floor(a); };

/**
 * Build one span of cliff as a single group of five meshes.
 * The player walks at z = 0, so the front face sits BEHIND that — put it in
 * front and it draws over their legs.
 */
export function buildCliffChunk(x0, x1) {
  const group = new THREE.Group();
  const D = 5.0, STEP = 0.34, NZ = 3, DROP = 20, zF = -0.45, zBack = zF - D;
  const zAt = (j) => zBack + (D * j) / (NZ - 1);
  const bump = (x, z) => (Math.sin(x * 2.3 + z * 1.7) * 0.13 + Math.sin(x * 5.1 - z * 3.3) * 0.07) * ((zF - z) / D);

  const top = [], topCol = [], rim = [], band = [], bed2 = [], skirt = [];
  const cRock = SRGB('#878271'), cMoss = SRGB('#3c8239');
  const pushCol = (x, z) => {
    const n = Math.sin(x * 0.31 + 2.1) * 0.5 + Math.sin(x * 0.77 - 1.4) * 0.3 + Math.sin(z * 0.9) * 0.2;
    const m = Math.min(1, Math.max(0, Math.min(1, Math.max(0, (n + 0.15) * 1.6)) * ((zF - z) / D + 0.25)));
    topCol.push(cRock.r + (cMoss.r - cRock.r) * m, cRock.g + (cMoss.g - cRock.g) * m, cRock.b + (cMoss.b - cRock.b) * m);
  };
  // Wound so normals face the camera. Backwards and every surface renders
  // black, because the light is on the other side of the triangle.
  const quad = (a, p0, p1, p2, p3) => { a.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2); };

  const bed = (v) => {
    const seg = Math.floor(v / 2.7), t = v / 2.7 - seg;
    const a = 0.85 + hash(seg) * 1.25, b = 0.85 + hash(seg + 1) * 1.25;
    return t < 0.86 ? a : a + (b - a) * ((t - 0.86) / 0.14);
  };
  const bed2f = (v) => {
    const seg = Math.floor(v / 4.1 + 0.37), t = v / 4.1 + 0.37 - seg;
    const a = 1.0 + hash(seg * 7.3) * 1.6, b = 1.0 + hash(seg * 7.3 + 7.3) * 1.6;
    return t < 0.9 ? a : a + (b - a) * ((t - 0.9) / 0.1);
  };

  for (let x = x0; x < x1; x += STEP) {
    const x1s = Math.min(x + STEP, x1), h0 = heightAt(x), h1 = heightAt(x1s);
    for (let j = 0; j < NZ - 1; j++) {
      const zA = zAt(j), zB = zAt(j + 1);
      const p00 = [x, h0 + bump(x, zA), zA], p10 = [x1s, h1 + bump(x1s, zA), zA];
      const p11 = [x1s, h1 + bump(x1s, zB), zB], p01 = [x, h0 + bump(x, zB), zB];
      top.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
      pushCol(x, zA); pushCol(x1s, zB); pushCol(x1s, zA);
      pushCol(x, zA); pushCol(x, zB); pushCol(x1s, zB);
    }
    const RIM = 0.16;
    quad(rim, [x, h0, zF], [x1s, h1, zF], [x1s, h1 - RIM, zF], [x, h0 - RIM, zF]);

    // Beds are VERTICAL planes stepped back in z. A face that recedes as it
    // falls tilts its normal downward, away from the key light, and goes black.
    const B0 = 0.16, b0 = bed(x), b1 = bed(x1s);
    const zb = zF - 0.10, zc = zF - 0.34, zs = zF - 0.72;
    quad(band, [x, h0 - B0, zb], [x1s, h1 - B0, zb], [x1s, h1 - b1, zb], [x, h0 - b0, zb]);
    const c0 = b0 + bed2f(x), c1 = b1 + bed2f(x1s);
    quad(bed2, [x, h0 - b0 + 0.02, zc], [x1s, h1 - b1 + 0.02, zc], [x1s, h1 - c1, zc], [x, h0 - c0, zc]);
    quad(skirt, [x, h0 - c0 + 0.02, zs], [x1s, h1 - c1 + 0.02, zs], [x1s, h1 - DROP, zs], [x, h0 - DROP, zs]);
  }

  const mk = (arr, mat, cols) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    if (cols) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  };
  mk(top, rockMats.lit, topCol);
  mk(rim, rockMats.rim);
  mk(band, rockMats.mid);
  mk(bed2, rockMats.deep);
  mk(skirt, rockMats.dark);
  return group;
}

export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  g.removeFromParent();
}
