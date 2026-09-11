/**
 * Collectable stars.
 *
 * The failure that matters is not "the star did not appear" — you would see
 * that. It is a star the player can see and cannot reach, because that teaches
 * them to stop trying, and one unreachable star in fifty is enough to do it.
 * So the heights are checked against what the physics can actually do, derived
 * from the same tuning numbers the jump uses.
 */
import * as THREE from 'three';
import { StarField, arcHeight, reach, starGeometry, ARC_LIFT, STAR_R,
         screenAnchor, iconScale } from '../src/world/stars.js';
import { ICON } from '../src/ui/hud.js';
import { feel } from '../src/player/tuning.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* ---- what the runner can reach ---- */
{
  const R = reach();
  check('a single jump clears about two units', R.single > 2 && R.single < 2.5,
    `${R.single.toFixed(2)}u`);
  check('and a double roughly half as much again', R.double > R.single * 1.5,
    `${R.double.toFixed(2)}u`);
  /* The heights that decide difficulty are the top of the runner's HEAD, not
     the ground under their feet — collection is box against box. */
  check('and the head reaches 1.62 higher than the feet',
    Math.abs(R.singleTop - R.single - feel.standH) < 1e-9,
    `${R.singleTop.toFixed(2)}u standing on a single jump`);
}

/* ---- heights ----
   Three properties, and every one of them was broken in the first version of
   this file. Bands drawn against the jump APEX rather than the top of the
   player's box put the "hard" tier entirely inside an easy jump, and put the
   "easy" tier low enough to collect by running underneath it without pressing
   anything at all. None of that is visible in a screenshot. */
{
  const R = reach();
  let lowest = 1e9, highest = -1e9, freebies = 0, needsDouble = 0, easyOutOfReach = 0;
  for (let i = 0; i < 2000; i++) {
    const tier = i % 2 ? 'awkward' : 'reachable';
    const h = arcHeight(tier, 0, (i % 97) / 97) + ARC_LIFT;   // worst case: top of the dome
    lowest = Math.min(lowest, h);
    highest = Math.max(highest, h);
    if (h <= R.standing) freebies++;
    if (tier === 'awkward' && h > R.singleTop) needsDouble++;
    if (tier === 'reachable' && h > R.singleTop) easyOutOfReach++;
  }
  check('no star can be collected without leaving the ground', freebies === 0,
    `lowest ${lowest.toFixed(2)}u vs a ${R.standing.toFixed(2)}u runner`);
  check('and every star is inside a double jump', highest <= R.doubleTop,
    `highest ${highest.toFixed(2)}u, limit ${R.doubleTop.toFixed(2)}u`);
  check('and the easy tier is all inside a SINGLE jump', easyOutOfReach === 0,
    `${easyOutOfReach}/1000 out of reach`);
  check('and the hard tier really does cost the air jump', needsDouble === 1000,
    `${needsDouble}/1000 above a single jump`);

  /* An arc over a fence has to clear the fence. Placed at the easy tier with a
     1.9-unit obstacle underneath, the naive answer is a star buried in timber. */
  const over = arcHeight('reachable', 1.9, 0) + ARC_LIFT;
  check('an arc over an obstacle is lifted clear of it', over > 1.9 + 0.4,
    `${over.toFixed(2)}u over a 1.90u obstacle`);
  check('and a lifted arc is still reachable', over <= R.doubleTop,
    `${over.toFixed(2)}u`);
  /* Even a very tall thing must not push stars out of the world. The clamp has
     to win over the clearance lift, not the other way round. */
  const overTall = arcHeight('awkward', 6.0, 1) + ARC_LIFT;
  check('and an absurd obstacle cannot push one out of reach',
    overTall <= R.doubleTop, `${overTall.toFixed(2)}u over a 6.00u obstacle`);
}

/* ---- the art ---- */
{
  const g = starGeometry();
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE.Vector3());
  const PX = 1 / 31;
  check('a star is big enough to read', s.x / PX > 8, `${(s.x / PX).toFixed(1)}px across`);
  /* It SPINS, so its narrowest view is its thickness. A flat star would be a
     fraction of a pixel edge-on and would strobe rather than turn — the same
     failure as the first underwing. */
  check('and thick enough that spinning never thins it below a pixel',
    s.z / PX > 1.5, `${(s.z / PX).toFixed(1)}px edge-on`);
}

/* ---- collecting ---- */
{
  const field = new StarField(new THREE.Group());
  const put = (x, y) => {
    const mesh = new THREE.Object3D();
    field.root.add(mesh);
    field.items.push({ x, y, mesh, phase: 0 });
  };
  put(10, 2);
  put(10.4, 2);
  put(40, 2);
  const box = { x0: 9.6, x1: 10.6, y0: 1.5, y1: 3.1 };
  check('touching two stars collects both', field.collect(box) === 2);
  check('and leaves the far one alone', field.items.length === 1);
  check('and collecting is not repeatable', field.collect(box) === 0);
  check('and the mesh is taken out of the scene', field.root.children.length === 1);

  /* Generosity is one-directional on purpose: a star that looked collected and
     was not is remembered far longer than one that came a pixel early. */
  put(20, 2);
  const nearMiss = { x0: 19.7, x1: 19.72, y0: 1.5, y1: 3.1 };
  check('and a very near miss still counts', field.collect(nearMiss) === 1,
    'padded in the player\'s favour');
}

/* ---------------------------------------------------------------------------
 * The tally icon.
 *
 * It is a real collectable parked in front of the camera, so the only thing
 * that can be wrong is WHERE it lands. Two ways to get that wrong and neither
 * looks like a bug in a screenshot: the icon drifts as the runner moves, or it
 * comes out the wrong size on a different field of view. Both are arithmetic.
 */
{
  const HALF_TAN = Math.tan((14 * Math.PI / 180) / 2);   // the game's 14-degree fov
  const W = 256, H = 224, DIST = 6;
  const place = (cam) => screenAnchor(ICON.x, ICON.y, cam, HALF_TAN, W / H, W, H, DIST);

  /* The whole point: whatever the camera is doing, the icon is at the same
     pixel. Projecting each result by hand is the honest check — trusting the
     function's own arithmetic to verify itself proves nothing. */
  let worstX = 0, worstY = 0;
  for (let i = 0; i < 500; i++) {
    const cam = { x: i * 3.7, y: 1.5 + (i % 11) * 0.3, z: 29.32 };
    const a = place(cam);
    const halfH = HALF_TAN * DIST, halfW = halfH * (W / H);
    const px = (((a.x - cam.x) / halfW) * 0.5 + 0.5) * W;
    const py = (0.5 - ((a.y - cam.y) / halfH) * 0.5) * H;
    worstX = Math.max(worstX, Math.abs(px - ICON.x));
    worstY = Math.max(worstY, Math.abs(py - ICON.y));
  }
  check('the icon lands on its pixel wherever the camera is',
    worstX < 1e-9 && worstY < 1e-9, `off by ${worstX.toExponential(1)}px`);

  /* Nearer the camera means a BIGGER z here, not a smaller one — the camera
     sits out at +29 looking back down the negative axis, so "in front of
     everything" is a z above the foreground layer's, not below it. */
  const a0 = place({ x: 0, y: 0, z: 29.32 });
  check('and sits in front of the whole scene', a0.z > 7.5,
    `z ${a0.z.toFixed(2)}, foreground layer at 7.5`);

  /* Sized in PIXELS, so it matches the number next to it rather than the
     distance it happens to be parked at. */
  const sc = iconScale(a0.halfH, H, ICON.px);
  const onScreen = (2 * STAR_R * sc) / ((2 * a0.halfH) / H);
  check('and comes out the size it was asked for',
    Math.abs(onScreen - ICON.px) < 1e-9, `${onScreen.toFixed(2)}px, wanted ${ICON.px}`);
  check('and is small enough to sit beside an 11px number',
    ICON.px <= 13, `${ICON.px}px`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
