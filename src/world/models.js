import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Modelled obstacles, loaded from .glb and made cheap enough to spawn.
 *
 * A Rhino export is organised for MODELLING, not for drawing: the first crate
 * arrived as 81 separate objects, which is 81 draw calls for one obstacle in a
 * scene that already spends 660 on everything else. Four crates on screen would
 * have cost more than the entire rest of the game. So the file is taken apart
 * at load and put back together grouped by material — 81 calls become four, and
 * nothing about how the artist organises their layers matters any more.
 *
 * Doing it here rather than asking for tidy exports is deliberate. A rule that
 * lives in a person's head gets forgotten on the fifth model; a rule that lives
 * in the loader does not.
 */

/**
 * Rhino material name -> the game's own material.
 *
 * Named, not positional, because the ORDER materials appear in a glTF is
 * whatever the exporter felt like that day — it changed between two exports of
 * the same crate. Names are stable, and they are the one thing a modeller
 * controls directly.
 *
 * The list is deliberately short, because the NAME is the whole interface:
 *
 *   named here          the game's timber palette, and the LOOK tint slider
 *                       moves it with everything else you have to dodge
 *   any other name      keeps exactly the colour it was given in Rhino
 *
 * So the structural parts stay on-message automatically, and anything that
 * wants to be its own colour just needs a name nobody has claimed. That beats
 * a config file: the decision lives next to the thing it describes, and a new
 * model needs no code at all.
 */
const MAP = {
  timber: 'timber',
  plank: 'plank',
  nails: 'plank',
  stems: 'plank',
  fruit: 'fruit'      // opt IN to being tinted warm, by name
};

/* One material per distinct model colour, shared across every clone. Built
   once and cached: without this each crate would carry its own copy and the
   merge would have nothing to group by. */
const own = new Map();
function ownMaterial(src) {
  const key = String(src?.name || '') + '|' + (src?.color ? src.color.getHexString() : 'fff');
  if (own.has(key)) return own.get(key);
  const m = new THREE.MeshPhongMaterial({ shininess: 22, flatShading: true });
  if (src?.color) m.color.copy(src.color);
  // a specular a shade up from the body, so the facets still catch the key light
  m.specular.copy(m.color).lerp(new THREE.Color(1, 1, 1), 0.35);
  own.set(key, m);
  return m;
}

const loader = new GLTFLoader();
const cache = Object.create(null);

/**
 * Flatten a loaded scene into one mesh per material.
 *
 * Every geometry is baked into world space first. The transforms live on the
 * nodes, and merging without applying them would stack all 81 pieces at the
 * origin — a crate-shaped pile of splinters.
 */
const warned = new Set();
function warnOnce(url, msg) {
  const k = url + '|' + msg;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn('[models]', url, '-', msg);
}

function flatten(scene, materials, url) {
  const byKey = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const name = String(o.material?.name || '').toLowerCase();
    /* A nameless material is almost always an object that never got one
       assigned, so it carries Rhino's default rather than a decision. It still
       goes through — the name is the interface and an empty name is a name —
       but it is worth saying out loud, because the usual result is a
       featureless black slab that looks like a hole in the obstacle. */
    if (!name) warnOnce(url, 'a mesh has no material name; it will keep whatever colour it was given');
    // unmapped names keep their own colour, and each one gets its own group
    const key = MAP[name] || ('own:' + name);
    if (!materials[key] && key.startsWith('own:')) materials[key] = ownMaterial(o.material);
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    /* Merging demands identical attribute sets. Rhino exports normals and
       sometimes UVs; the game's materials are flat-shaded and untextured, so
       the extras are both useless and a reason for the merge to fail. */
    for (const attr of Object.keys(g.attributes)) {
      if (attr !== 'position') g.deleteAttribute(attr);
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(g);
  });

  const out = [];
  for (const [key, list] of byKey) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;                       // a merge can refuse; skip that group
    merged.computeVertexNormals();               // flat shading still needs them present
    out.push({ key, geometry: merged, material: materials[key] });
  }
  return out;
}

/**
 * Rescale the baked geometry into a unit crate: x and z centred on 0, y sitting
 * on 0, height exactly 1.
 *
 * This is what lets a spawn say `scale.set(w, h, h)` and get exactly the
 * collision box it asked for. Depth is normalised by the HEIGHT factor, not its
 * own — so the modelled depth-to-height ratio survives, and a crate that
 * happens to spawn wide does not also become inexplicably deep.
 */
export function normalise(parts, { uniform = false } = {}) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(tmp.copy(p.geometry.boundingBox));
  }
  const size = new THREE.Vector3(); box.getSize(size);
  const mid = new THREE.Vector3(); box.getCenter(mid);
  const sy = size.y > 1e-6 ? 1 / size.y : 1;
  /* Two modes, because two kinds of obstacle.
     A crate is stretched to a randomly sized box, so x is normalised on its own
     and the distortion is the point. A sign is one fixed shape whose parts have
     to stay in proportion — squashing the board would take the post with it. */
  const sx = uniform ? sy : (size.x > 1e-6 ? 1 / size.x : 1);

  const m = new THREE.Matrix4()
    .makeScale(sx, sy, sy)
    .multiply(new THREE.Matrix4().makeTranslation(-mid.x, -box.min.y, -mid.z));
  for (const p of parts) {
    p.geometry.applyMatrix4(m);
    p.geometry.computeBoundingBox();
  }

  /* Which parts are the OVERHANG — the thing a player ducks under.
     Found by shape, not by name: the piece you duck under spans the obstacle,
     and whatever holds it up is narrow. A signpost is a board plus a mast at
     9.7% of the width, and that gap is not a close call. Doing it by material
     name would break the first time somebody framed a board in timber. */
  const wide = new THREE.Box3();
  const full = new THREE.Box3();
  for (const p of parts) full.union(tmp.copy(p.geometry.boundingBox));
  const span = full.max.x - full.min.x;
  for (const p of parts) {
    const b = p.geometry.boundingBox;
    if ((b.max.x - b.min.x) > span * 0.5) wide.union(tmp.copy(b));
  }
  const overhang = wide.isEmpty() ? null : { y0: wide.min.y, y1: wide.max.y };

  return { parts, overhang, aspect: { w: size.x / size.y, d: size.z / size.y } };
}

/** Build the reusable prototype. Clones of it share geometry and material. */
function prototype(parts, info) {
  const g = new THREE.Group();
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    g.add(mesh);
  }
  // measurements the spawn code needs, carried with the thing they describe
  g.userData.aspect = info.aspect;
  g.userData.overhang = info.overhang;
  return g;
}

/**
 * Load one model. Resolves to a prototype Group, or to null if anything at all
 * goes wrong — a missing or broken file must leave the game playable on its
 * built-in shapes, not take it down.
 */
export function loadModel(name, url, materials, opts = {}) {
  if (cache[name]) return cache[name];
  cache[name] = new Promise((resolve) => {
    loader.load(url, (gltf) => {
      try {
        const parts = flatten(gltf.scene, materials, url);
        if (!parts.length) throw new Error('no meshes in ' + url);
        const info = normalise(parts, opts);
        resolve(prototype(parts, info));
      } catch (e) {
        console.warn('[models] could not use', url, e.message || e);
        resolve(null);
      }
    }, undefined, (e) => {
      console.warn('[models] could not load', url, e?.message || e);
      resolve(null);
    });
  });
  return cache[name];
}
