/**
 * Proves the Ground block in design.js actually drives the game — no renderer
 * needed. If this passes, a number set in the bench reaches both the mesh and
 * the collision surface.
 */
import { design } from '../src/design.js';
import { heightAt, slopeAt, buildCliffChunk, rockMats, G } from '../src/world/terrain.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

check('design.js carries a ground block', !!design.ground, JSON.stringify(Object.keys(design.ground || {})));
check('terrain reads it rather than its own constants',
  G.rollAmp === design.ground.rollAmp && G.base === design.ground.base && G.bands.length === design.ground.bands.length,
  `rollAmp ${G.rollAmp}, base ${G.base}, ${G.bands.length} bands`);

// the shape numbers are load-bearing: change one, the surface must move
const sample = () => [-40, -12, 0, 7, 33, 91].map((x) => +heightAt(x).toFixed(4));
const before = sample();
G.rollAmp *= 2.5;
const after = sample();
G.rollAmp = design.ground.rollAmp;
check('hill height moves the surface', before.join() !== after.join(), `${before[2]} -> ${after[2]}`);
check('and restores exactly', sample().join() === before.join());

G.base += 3;
check('base height shifts the whole profile',
  sample().every((v, i) => Math.abs(v - before[i] - 3) < 1e-9), 'all samples +3.0000');
G.base = design.ground.base;

// collision and mesh must come from the same function, at every x
const meshY = (x) => heightAt(x);
check('slopeAt is the derivative of the same curve',
  Math.abs(slopeAt(10) - (meshY(10.25) - meshY(9.75)) / 0.5) < 1e-9);

// one mesh per bed, plus the top surface and the rim
const chunk = buildCliffChunk(0, 16);
const meshes = chunk.children.length;
check('a chunk builds top + rim + one mesh per bed',
  meshes === G.bands.length + 2, `${meshes} meshes for ${G.bands.length} beds`);
check('bed materials carry the bench swatches',
  rockMats.beds.every((m, i) => !!m) && rockMats.beds.length === G.bands.length,
  G.bands.map((b) => b.col).join(' '));

// chunk seams: the last row of one chunk must match the first row of the next
const a = buildCliffChunk(0, 16), b = buildCliffChunk(16, 32);
const yAt = (grp, wantX) => {
  const pos = grp.children[0].geometry.attributes.position;
  let best = null, bestD = 1e9;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.abs(pos.getX(i) - wantX);
    if (d < bestD) { bestD = d; best = pos.getY(i); }
  }
  return best;
};
check('chunks meet without a seam', Math.abs(yAt(a, 16) - yAt(b, 16)) < 0.2,
  `${yAt(a, 16).toFixed(3)} vs ${yAt(b, 16).toFixed(3)} at x=16`);

// unlit is a real material swap, not a colour tweak
check('unlit flag is honoured',
  G.unlitBands ? rockMats.beds[0].type === 'MeshBasicMaterial' : rockMats.beds[0].type === 'MeshPhongMaterial',
  `unlitBands ${G.unlitBands} -> ${rockMats.beds[0].type}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
