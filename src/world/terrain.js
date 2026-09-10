import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { design } from '../design.js';

/**
 * The ground is a pure function of x — no stored heightfield, no chunk seams
 * to reconcile. Mesh chunks are just windows onto it, so they can be built
 * and thrown away as the runner advances without the surface ever changing.
 *
 * Every number below comes from the bench's Ground panel via design.js. This
 * file owns no shape of its own: change it in the bench, export, and the game
 * follows. Collision reads heightAt() too, so what you see is what you stand on.
 */
const FALLBACK = {
  base: 1.4, rollAmp: 2.0, rollFreq: 0.040, swellAmp: 0.7, chipAmp: 0.14,
  moss: 1.0, depth: 5.0, unlitBands: false,
  topCol: '#878271', mossCol: '#3c8239', rimCol: '#b6af9a',
  bands: [{ h: 0.7, col: '#706c5e' }, { h: 1.1, col: '#46443c' }, { h: 2.6, col: '#20201e' }]
};
export const G = { ...FALLBACK, ...(design.ground || {}) };
if (!Array.isArray(G.bands) || !G.bands.length) G.bands = FALLBACK.bands;

const hash1 = (n) => { const a = Math.sin(n * 127.1) * 43758.5453; return a - Math.floor(a); };
const smooth = (t) => t * t * (3 - 2 * t);
const frac = (v) => v - Math.floor(v);

function valueNoise(x) {
  const i = Math.floor(x), f = x - i;
  return hash1(i) + (hash1(i + 1) - hash1(i)) * smooth(f);
}

export function heightAt(x) {
  let h = G.base;
  h += (valueNoise(x * G.rollFreq) - 0.5) * G.rollAmp;   // broad roll
  h += (valueNoise(x * 0.115 + 40) - 0.5) * G.swellAmp;
  // Angular chips, not smooth swell — rock fractures, it doesn't ripple.
  h += (0.5 - Math.abs(frac(x * 0.41) - 0.5)) * G.chipAmp
     + (0.5 - Math.abs(frac(x * 1.13 + 0.3) - 0.5)) * G.chipAmp * 0.57;
  return h;
}

/** Slope at x, for standing the figure and obstacles on the surface. */
export const slopeAt = (x) => (heightAt(x + 0.25) - heightAt(x - 0.25)) / 0.5;

/**
 * A swatch sets the MATERIAL colour, which the lighting rig then multiplies —
 * a neutral grey lands on screen as a warm brown before the grade has run. With
 * `unlitBands` the vertical faces take their swatch flat instead, so the colour
 * chosen in the bench is the colour that enters the output stage.
 *
 * The output chain never encodes back to sRGB — it treats whatever the scene
 * produces as the final display value. SRGB() converts a swatch INTO linear on
 * the way in, which a lit surface needs; an unlit one must skip it or it lands
 * as its much darker linear equivalent (#706c5e arrives as #29261d).
 */
const SW = (hex) => (G.unlitBands
  // LinearSRGBColorSpace means "already in the working space" — no transform.
  // setHex()'s default would convert, which is exactly what we are avoiding.
  ? new THREE.Color().setHex(parseInt(hex.slice(1), 16), THREE.LinearSRGBColorSpace)
  : SRGB(hex));

const face = (hex, shine, specHex) => (G.unlitBands
  ? new THREE.MeshBasicMaterial({ color: SW(hex) })
  : new THREE.MeshPhongMaterial({ color: SRGB(hex), shininess: shine, specular: SRGB(specHex), flatShading: true }));

// Shared across every chunk — one material set, not one per chunk.
export const rockMats = {
  lit: new THREE.MeshPhongMaterial({
    color: SRGB(G.topCol), shininess: 26, specular: SRGB('#b6af9a'),
    flatShading: true, vertexColors: true
  }),
  rim: G.unlitBands
    ? new THREE.MeshBasicMaterial({ color: SW(G.rimCol), side: THREE.DoubleSide })
    : new THREE.MeshPhongMaterial({ color: SRGB(G.rimCol), shininess: 44, specular: SRGB('#fff2d2'), side: THREE.DoubleSide }),
  // one per bed, in the order the bench listed them
  beds: G.bands.map((b) => face(b.col, 20, '#9e9885'))
};

/* The loose rock scattered by the streamer stays in family with the beds it
   was broken out of, so swapping a bed colour carries through. */
rockMats.mid  = rockMats.beds[0];
rockMats.deep = rockMats.beds[1] || rockMats.beds[0];
rockMats.dark = rockMats.beds[rockMats.beds.length - 1];

const hash = (n) => { const a = Math.sin(n * 12.9898) * 43758.5453; return a - Math.floor(a); };

/**
 * Build one span of cliff as a single group of meshes.
 * The player walks at z = 0, so the front face sits BEHIND that — put it in
 * front and it draws over their legs.
 */
export function buildCliffChunk(x0, x1) {
  const group = new THREE.Group();
  // marks everything the ground itself owns, so a test can tell the terrain
  // apart from scenery that has no business being in the scene
  group.userData.terrain = true;
  const D = G.depth, STEP = 0.34, NZ = 3, DROP = 20, zF = -0.45;
  const zBack = zF - D;
  const zAt = (j) => zBack + (D * j) / (NZ - 1);
  const bump = (x, z) => (Math.sin(x * 2.3 + z * 1.7) * 0.13 + Math.sin(x * 5.1 - z * 3.3) * 0.07) * ((zF - z) / D);

  const NB = G.bands.length;
  const top = [], topCol = [], rim = [];
  const beds = G.bands.map(() => []);
  // The top surface stays lit whatever `unlitBands` says, so its vertex colours
  // are always converted — mixing an unconverted swatch into a lit shader would
  // blow it out.
  const cRock = SRGB(G.topCol), cMoss = SRGB(G.mossCol);
  const pushCol = (x, z) => {
    const n = Math.sin(x * 0.31 + 2.1) * 0.5 + Math.sin(x * 0.77 - 1.4) * 0.3 + Math.sin(z * 0.9) * 0.2;
    const m = Math.min(1, Math.max(0, Math.min(1, Math.max(0, (n + 0.15) * 1.6 * G.moss)) * ((zF - z) / D + 0.25)));
    topCol.push(cRock.r + (cMoss.r - cRock.r) * m, cRock.g + (cMoss.g - cRock.g) * m, cRock.b + (cMoss.b - cRock.b) * m);
  };
  // Wound so normals face the camera. Backwards and every surface renders
  // black, because the light ends up on the other side of the triangle.
  const quad = (a, p0, p1, p2, p3) => { a.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2); };

  /* Each bed holds flat across a block then breaks sharply at the joint, so the
     face reads as bedding planes rather than one smooth wall. Derived from world
     x, never from chunk-local position — otherwise every chunk seam would show. */
  const bedH = (v, i, nominal) => {
    const per = 2.7 + i * 1.4;
    const u = v / per + i * 0.37;
    const seg = Math.floor(u), t = u - seg;
    const a = nominal * (0.62 + hash(seg + i * 7.3) * 0.76);
    const b = nominal * (0.62 + hash(seg + 1 + i * 7.3) * 0.76);
    return t < 0.88 ? a : a + (b - a) * ((t - 0.88) / 0.12);
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
    let c0 = RIM, c1 = RIM;
    for (let i = 0; i < NB; i++) {
      const zb = zF - 0.10 - i * 0.24;
      const last = i === NB - 1;
      const n0 = last ? DROP : c0 + bedH(x, i, G.bands[i].h);
      const n1 = last ? DROP : c1 + bedH(x1s, i, G.bands[i].h);
      quad(beds[i], [x, h0 - c0 + (i ? 0.02 : 0), zb], [x1s, h1 - c1 + (i ? 0.02 : 0), zb],
                    [x1s, h1 - n1, zb], [x, h0 - n0, zb]);
      c0 = n0; c1 = n1;
    }
  }

  const mk = (arr, mat, cols) => {
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    if (cols) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, mat));
  };
  mk(top, rockMats.lit, topCol);
  mk(rim, rockMats.rim);
  beds.forEach((arr, i) => mk(arr, rockMats.beds[i]));
  return group;
}

export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  g.removeFromParent();
}
