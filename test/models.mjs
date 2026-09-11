/**
 * The .glb pipeline, against the REAL models.
 *
 * Three things have to hold and none is visible from Rhino. The exports are
 * organised for modelling — the crate arrived as 81 separate objects — and must
 * come out as one mesh per material, or a single obstacle costs more draw calls
 * than the rest of the scene put together. The result must be normalised, so
 * the spawn code can scale it straight to a collision box and trust that the
 * art and the hitbox are then the same shape. And for anything you duck under,
 * the underside of the art must be somewhere a ducked player fits and a
 * standing one does not — a sign that fails that looks perfectly fine and plays
 * as an unavoidable death.
 *
 * GLTFLoader wants a browser, so the files are parsed here and handed to the
 * same `normalise` the game uses. That keeps every assertion on the part that
 * can actually be got wrong.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { normalise } from '../src/world/models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

// the game's own numbers, restated so a change there has to be deliberate
const DUCKED = 0.82, STANDING = 1.62, SIGN_WIDTH = 1.5;
const MAP = { timber: 'timber', plank: 'plank', nails: 'plank', stems: 'plank', fruit: 'fruit' };

// --- a minimal glTF reader: enough to get positions into world space --------
function read(file) {
  const buf = readFileSync(new URL('../public/models/' + file, import.meta.url));
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.toString('utf8', off + 4, off + 8);
    if (type === 'JSON') json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    if (type.startsWith('BIN')) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const nodeMatrix = (n) => n.matrix
    ? new THREE.Matrix4().fromArray(n.matrix)
    : new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(n.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(n.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(n.scale || [1, 1, 1]));
  const positions = (ai) => {
    const a = json.accessors[ai], v = json.bufferViews[a.bufferView];
    const base = (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || 12;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = bin.readFloatLE(base + i * stride);
      out[i * 3 + 1] = bin.readFloatLE(base + i * stride + 4);
      out[i * 3 + 2] = bin.readFloatLE(base + i * stride + 8);
    }
    return out;
  };
  const root = new THREE.Group();
  let primitives = 0;
  const walk = (ni, parent) => {
    const n = json.nodes[ni];
    const o = new THREE.Object3D();
    o.applyMatrix4(nodeMatrix(n));
    parent.add(o);
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        primitives++;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions(p.attributes.POSITION), 3));
        o.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ name: json.materials[p.material]?.name || '' })));
      }
    }
    for (const c of n.children || []) walk(c, o);
  };
  for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, root);
  root.updateMatrixWorld(true);

  // flatten exactly the way the loader does
  const byKey = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = String(o.material.name).toLowerCase();
    const key = MAP[name] || ('own:' + name);
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(g);
  });
  const parts = [...byKey].map(([key, list]) => {
    const pos = [];
    for (const g of list) pos.push(...g.attributes.position.array);
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    return { key, geometry: merged };
  });
  return { parts, primitives };
}

const bounds = (parts) => {
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  return box;
};

// ===========================================================================
console.log('crate');
{
  const { parts, primitives } = read('crate.glb');
  check('  the export really is many objects', primitives > 20, `${primitives} primitives`);
  check('  timber and its fixings take the game palette',
    parts.some((p) => p.key === 'timber') && parts.some((p) => p.key === 'plank'),
    parts.map((p) => p.key).join(', '));
  /* Anything else keeps the colour it was given in Rhino: the modeller should
     not have to ask permission to pick a colour, or edit code to change one. */
  check('  an unclaimed name keeps its own colour',
    parts.some((p) => p.key.startsWith('own:')), parts.map((p) => p.key).join(', '));
  check('  and it collapses to a handful of draw calls', parts.length <= 5,
    `${primitives} primitives -> ${parts.length} meshes`);

  const { aspect } = normalise(parts);
  const box = bounds(parts);
  const size = new THREE.Vector3(); box.getSize(size);
  check('  height is exactly 1', Math.abs(size.y - 1) < 1e-5, size.y.toFixed(6));
  check('  width is exactly 1, so scale.x IS the box width', Math.abs(size.x - 1) < 1e-5, size.x.toFixed(6));
  check('  it sits ON the ground', Math.abs(box.min.y) < 1e-5, box.min.y.toFixed(6));
  check('  centred on x and z',
    Math.abs(box.min.x + box.max.x) < 1e-5 && Math.abs(box.min.z + box.max.z) < 1e-5);
  /* Depth normalises by HEIGHT, not by its own extent — otherwise a crate that
     spawns wide would also come out inexplicably deep. */
  check('  depth keeps the modelled depth-to-height ratio',
    Math.abs(size.z - aspect.d) < 1e-5, `${size.z.toFixed(3)} vs modelled ${aspect.d.toFixed(3)}`);

  const w = 1.21, h = 0.87;
  const g = new THREE.Group();
  for (const p of parts) g.add(new THREE.Mesh(p.geometry));
  g.scale.set(w, h, h);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  check('  a scaled crate fills its collision box exactly',
    Math.abs(b.max.x - b.min.x - w) < 1e-4 && Math.abs(b.max.y - b.min.y - h) < 1e-4,
    `${(b.max.x - b.min.x).toFixed(3)} x ${(b.max.y - b.min.y).toFixed(3)}`);
  check('  and still stands on the ground', Math.abs(b.min.y) < 1e-4, b.min.y.toFixed(6));
}

// ===========================================================================
console.log('sign');
{
  const { parts, primitives } = read('sign.glb');
  check('  the post takes the game palette', parts.some((p) => p.key === 'timber'),
    parts.map((p) => p.key).join(', '));
  check('  and the sign faces keep their own colours',
    parts.filter((p) => p.key.startsWith('own:')).length >= 2,
    parts.map((p) => p.key).join(', '));

  /* Uniform, because a signpost is one fixed shape. Normalising x on its own
     would squash the board and take the mast with it. */
  const { overhang, aspect } = normalise(parts, { uniform: true });
  const box = bounds(parts);
  const size = new THREE.Vector3(); box.getSize(size);
  check('  height is 1 and the post is on the ground',
    Math.abs(size.y - 1) < 1e-5 && Math.abs(box.min.y) < 1e-5);
  check('  proportions are preserved, not stretched to a unit square',
    Math.abs(size.x - aspect.w) < 1e-5, `width ${size.x.toFixed(3)} = aspect ${aspect.w.toFixed(3)}`);

  /* The overhang is found by SHAPE — the piece you duck under spans the
     obstacle, whatever holds it up is narrow. Doing it by material name would
     break the first time somebody framed a board in timber. */
  check('  the overhang is identified', !!overhang,
    overhang ? `y ${overhang.y0.toFixed(3)}..${overhang.y1.toFixed(3)} of height` : 'none');
  check('  and it is NOT the whole model — the post is excluded',
    overhang && overhang.y0 > 0.2, overhang ? overhang.y0.toFixed(3) : '-');

  // the fit the game computes, reproduced here
  const scale = SIGN_WIDTH / aspect.w;
  const fit = { w: SIGN_WIDTH, yOff: overhang.y0 * scale, h: (overhang.y1 - overhang.y0) * scale };
  console.log(`       -> ${(1 * scale).toFixed(2)}u tall, board ${fit.yOff.toFixed(2)}..${(fit.yOff + fit.h).toFixed(2)}`);

  check('  a ducked player fits under it', fit.yOff > DUCKED,
    `underside ${fit.yOff.toFixed(2)} vs ducked head ${DUCKED}`);
  check('  a standing player does NOT', fit.yOff < STANDING,
    `underside ${fit.yOff.toFixed(2)} vs standing head ${STANDING}`);
  /* Clearance wants to be real but not generous: too tight and a correct duck
     still clips, too loose and the obstacle stops asking anything. */
  check('  with sane clearance', fit.yOff - DUCKED > 0.1 && fit.yOff - DUCKED < 0.8,
    `${(fit.yOff - DUCKED).toFixed(2)}u of room`);

  /* The whole reason the box is read off the art: the authored 1.12 would have
     put the hitbox well below the modelled boards, killing the player in clear
     air. Any model whose underside differs from the authored number by more
     than a hair proves the derived box is doing real work. */
  const g = new THREE.Group();
  for (const p of parts) g.add(new THREE.Mesh(p.geometry));
  g.scale.setScalar(scale);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  /* The post carries a finial above the boards, so the ART is taller than the
     hitbox — and it SHOULD be. The hitbox tracks the thing you duck under, not
     the tallest pixel: a player jumping past the top of the post must not be
     killed by a decoration standing clear of the path. */
  check('  the hitbox tops out at the boards, not at the post',
    b.max.y > fit.yOff + fit.h && b.max.y - (fit.yOff + fit.h) < 0.3,
    `art ${b.max.y.toFixed(3)}, hitbox ${(fit.yOff + fit.h).toFixed(3)}, finial ${(b.max.y - fit.yOff - fit.h).toFixed(3)}u proud`);
  check('  the post still reaches the ground', Math.abs(b.min.y) < 1e-4, b.min.y.toFixed(4));
  check('  and the sign is the width it was asked for',
    Math.abs(b.max.x - b.min.x - SIGN_WIDTH) < 1e-3, (b.max.x - b.min.x).toFixed(3));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
