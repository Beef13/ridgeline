/**
 * Scatter placement, with no renderer and no network.
 *
 * The property that matters is that an instance's position depends only on
 * world x — never on which chunk claimed it, or on when the chunk was built.
 * Get that wrong and the ridge silently reshuffles itself as you run along it,
 * or drops instances at every seam.
 */
/* Size lives in the mesh's SCALE, not in the geometry: every instance shares
   one unit quad, so `geometry.parameters` is 1x1 for all of them and tells you
   nothing. These assertions measure the size as drawn, which is what matters
   and which stays true however the size is expressed. */
import * as THREE from 'three';
import { ScatterArt, SCATTER_DEFAULT } from '../src/world/scatterart.js';
import { heightAt } from '../src/world/terrain.js';
import { LAYERS } from '../src/world/scene.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

const CFG = { ...SCATTER_DEFAULT, on: true, dens: 20, sMin: 0.5, sMax: 1.5, yOff: -0.1, z0: -3, z1: -0.5, flip: true };

function make(cfg = CFG, layer = 1) {
  const s = new ScatterArt();
  s.kinds = [{
    spec: { file: 'x.png' }, layer, cfg: { ...CFG, ...cfg }, seed: 977, aspect: 1.2,
    material: new THREE.MeshBasicMaterial()
  }];
  s.ready = true;
  return s;
}

const xs = (grp) => grp.children.map((c) => +c.position.x.toFixed(6)).sort((a, b) => a - b);

// density is a promise about how many, per hundred units
{
  const s = make();
  const n = s.chunk(0, 100).children.length;
  check('density means instances per 100 units', Math.abs(n - 20) <= 2, `${n} in 100u at dens 20`);
}

// same window, same answer
{
  const s = make();
  check('placement is deterministic', xs(s.chunk(0, 16)).join() === xs(s.chunk(0, 16)).join());
}

// and a fresh instance of the whole thing agrees — nothing is carried in state
{
  check('and survives a rebuild from scratch',
    xs(make().chunk(48, 64)).join() === xs(make().chunk(48, 64)).join());
}

/* The real one: chunking must be a partition. Every instance in a wide span
   must appear in exactly one of the chunks covering it — none lost at a seam,
   none placed twice. */
{
  const s = make();
  const whole = xs(s.chunk(0, 160));
  let parts = [];
  for (let i = 0; i < 10; i++) parts = parts.concat(xs(s.chunk(i * 16, i * 16 + 16)));
  parts.sort((a, b) => a - b);
  check('chunking neither drops nor duplicates', whole.join() === parts.join(),
    `${whole.length} across the span vs ${parts.length} across 10 chunks`);
}

// negative x is not a special case — the runner starts near 0 and the terrain
// exists behind them
{
  const s = make();
  const n = s.chunk(-64, -48).children.length;
  check('works at negative x', n > 0, `${n} instances`);
}

// everything sits on the surface, at the height it was told to
{
  const s = make();
  const g = s.chunk(0, 160);
  const worst = Math.max(...g.children.map((c) => {
    const foot = c.position.y - c.scale.y * 0.5 - CFG.yOff;
    return Math.abs(foot - heightAt(c.position.x));
  }));
  check('every instance sits on the terrain', worst < 1e-6, `worst gap ${worst.toExponential(1)}u`);
}

// sizes stay inside the range asked for, and vary within it
{
  const s = make();
  const hs = s.chunk(0, 200).children.map((c) => c.scale.y);
  const lo = Math.min(...hs), hi = Math.max(...hs);
  check('sizes stay in range', lo >= CFG.sMin - 1e-9 && hi <= CFG.sMax + 1e-9, `${lo.toFixed(2)}–${hi.toFixed(2)}u`);
  check('and actually vary', hi - lo > (CFG.sMax - CFG.sMin) * 0.5, `spread ${(hi - lo).toFixed(2)}u`);
}

// depth spread, or everything lines up like a fence
{
  const s = make();
  const zs = s.chunk(0, 200).children.map((c) => c.position.z);
  check('depth is spread across the ledge',
    Math.max(...zs) - Math.min(...zs) > 1.5 && Math.min(...zs) >= CFG.z0 - 1e-9,
    `${Math.min(...zs).toFixed(2)} to ${Math.max(...zs).toFixed(2)}`);
}

// aspect ratio comes from the art, not from a guess
{
  const s = make();
  const m = s.chunk(0, 32).children[0];
  check('plane takes the image aspect',
    Math.abs(Math.abs(m.scale.x) / m.scale.y - 1.2) < 1e-9);
}

// zero density is off, not a crash
{
  check('zero density sows nothing', make({ ...CFG, dens: 0 }).chunk(0, 100).children.length === 0);
}

// nothing is placed before the art has loaded
{
  const s = make();
  s.ready = false;
  check('nothing is placed before the art lands', s.chunk(0, 100).children.length === 0);
}

/* ---------- layers ----------
   The asset's layer decides where what you sowed ends up. Getting this wrong
   is invisible in a still and obvious the moment the camera moves: everything
   parallaxes at the play plane's rate however far back it was meant to be. */
{
  const s = make(CFG, 3);
  check('a kind only appears on its own layer',
    s.chunk(0, 100, 1).children.length === 0 && s.chunk(0, 100, 3).children.length > 0);
  const zs = s.chunk(0, 100, 3).children.map((c) => c.position.z);
  check('depth is measured from that layer, not the world',
    Math.min(...zs) >= LAYERS[3].z + CFG.z0 - 1e-9 && Math.max(...zs) <= LAYERS[3].z + CFG.z1 + 1e-9,
    `${Math.min(...zs).toFixed(1)}..${Math.max(...zs).toFixed(1)} around ${LAYERS[3].z}`);
  check('which layers are sown is reported', s.worldLayers().join() === '3', s.worldLayers().join());
}

// off the play plane there is no terrain, so a height band is the only sensible rule
{
  const s = make({ mode: 'free', yMin: -6, yMax: -2 }, 2);
  const feet = s.chunk(0, 100, 2).children.map((c) => c.position.y - c.scale.y / 2);
  check('free mode sits in the band asked for',
    Math.min(...feet) >= -6.001 && Math.max(...feet) <= -1.999,
    `${Math.min(...feet).toFixed(2)}..${Math.max(...feet).toFixed(2)}`);
  check('and ignores the terrain entirely',
    new Set(feet.map((f) => f > -6.001 && f < -1.999)).size === 1);
}

// ground mode only means anything on the play plane; anywhere else it would
// glue distant art to a surface that is not under it
{
  const s = make({ mode: 'ground', yOff: 0 }, 4);
  const feet = s.chunk(0, 100, 4).children.map((c) => c.position.y - c.scale.y / 2);
  check('ground mode off the play plane falls back to the band',
    feet.every((f) => Math.abs(f - heightAt(0)) > 1e-6 || CFG.yMin === CFG.yMax));
}

// the vista layer does not stream at all — it is one camera-locked band
{
  const s = make({ dens: 8, depth: 130, drift: 0.09, yMin: 1, yMax: 5 }, 5);
  check('vista kinds are kept out of the chunk stream',
    s.chunk(0, 200, 5).children.length === 0 && s.worldLayers().length === 0);
  const bands = s.vistaBands();
  check('and come back as a band instead', bands.length === 1 && bands[0].drift === 0.09,
    JSON.stringify({ n: bands.length, drift: bands[0] && bands[0].drift }));
  const kids = bands[0].group.children;
  /* The band repeats rather than being merely long. What makes the repeat
     invisible is that the layout spans a whole number of steps, so sliding it
     by `wide` lands every instance on the spacing its neighbour had. */
  const step = 100 / 8;
  check('the band covers a few screens, not the whole run', kids.length >= 24 && kids.length <= 64,
    `${kids.length} instances`);
  check('and spans a whole number of steps, so it tiles',
    Math.abs(bands[0].wide - kids.length * step) < 1e-9, `wide ${bands[0].wide} for ${kids.length} steps`);
  const bx = kids.map((c) => c.position.x).sort((a, b) => a - b);
  const gaps = bx.slice(1).map((v, i) => v - bx[i]);
  check('no gap wider than a step across the wrap',
    Math.max(...gaps, bands[0].wide - (bx[bx.length - 1] - bx[0])) <= step * 2,
    `worst gap ${Math.max(...gaps).toFixed(2)}u`);
  // spread in depth around the distance, not pinned flat to it — a single plane
  // of instances reads as one decal however far out it is
  const zs = kids.map((c) => c.position.z);
  check('all around the distance asked for',
    Math.min(...zs) >= -130 - 3 - 1e-9 && Math.max(...zs) <= -130 - 0.5 + 1e-9,
    `${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)} around -130`);
  check('and spread rather than pinned to one plane', Math.max(...zs) - Math.min(...zs) > 2);
  const feet = kids.map((c) => c.position.y - c.scale.y / 2);
  check('in the height band asked for',
    Math.min(...feet) >= 0.999 && Math.max(...feet) <= 5.001,
    `${Math.min(...feet).toFixed(2)}..${Math.max(...feet).toFixed(2)}`);
}

/* ---------- no stand-in scenery ----------
   With `dress: false` the design is saying "the art is mine now". Anything the
   engine adds on top of that is scenery the designer never placed and cannot
   see in the bench — which is exactly how a procedural slab ended up standing
   behind hand-placed vistas. */
{
  const { Streamer } = await import('../src/world/streamer.js');
  const { design } = await import('../src/design.js');
  check('this design has the built-in dressing switched off', design.ground.dress === false);

  const roots = LAYERS.map(() => new THREE.Group());
  const s = new Streamer(roots);
  s.scatter.ready = false;              // no network in a logic test
  s.build(0);
  let strays = 0;
  roots.forEach((r) => r.children.forEach((g) => {
    if (g.userData.terrain) return;                       // the ground itself
    g.traverse((o) => { if (o.isMesh && !o.userData.scattered) strays++; });
  }));
  check('and the streamer adds nothing of its own', strays === 0, strays + ' unowned meshes in a chunk');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
