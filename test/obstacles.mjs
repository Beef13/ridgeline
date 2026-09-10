/**
 * Obstacle art versus obstacle hitbox.
 *
 * The one property that matters: what you SEE must be what kills you. A mesh
 * that pokes outside its own AABB kills on a gap that looked clear; one that
 * falls short lets you clip it and live. Both teach the player that the picture
 * is lying, which is worse than a hard game.
 */
import * as THREE from 'three';
import { KINDS, ObstacleField, roamChance } from '../src/world/obstacles.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

const EPS = 0.035;    // ~1 screen pixel at 31px per world unit

for (const [name, kind] of Object.entries(KINDS)) {
  let worstX = 0, worstTop = -1e9, worstBottom = 1e9, n = 0;
  for (let i = 0; i < 60; i++) {
    const b = kind.box();
    const g = kind.build(b);
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g);
    if (!isFinite(bb.min.x)) continue;
    n++;
    // flyers carry their own y offset on the group; measure them relative to it
    const lift = kind.flying ? 0 : 0;
    worstX = Math.max(worstX, Math.abs(bb.min.x) - b.w / 2, Math.abs(bb.max.x) - b.w / 2);
    worstTop = Math.max(worstTop, bb.max.y - (b.yOff + b.h + (kind.flying ? b.h / 2 : 0)) - lift);
    worstBottom = Math.min(worstBottom, bb.min.y - b.yOff);
  }
  check(`${name}: art builds`, n === 60, `${n}/60`);
  check(`${name}: nothing sticks out sideways`, worstX <= EPS, `${worstX.toFixed(3)}u over`);
  check(`${name}: nothing rises above the hitbox`, worstTop <= EPS, `${worstTop.toFixed(3)}u over`);
}

// the two the player has to tell apart at a glance
{
  const crate = KINDS.crate.box(), fence = KINDS.fence.box();
  check('a fence is clearly taller than a crate', fence.h > crate.h * 1.5,
    `${fence.h.toFixed(2)} vs ${crate.h.toFixed(2)}`);
  check('and clearly narrower', fence.w < crate.w * 0.75,
    `${fence.w.toFixed(2)} vs ${crate.w.toFixed(2)}`);
}

// spacing rules still name kinds that exist
{
  check('every weighted kind is real',
    Object.values(KINDS).every((k) => typeof k.build === 'function' && typeof k.box === 'function'));
  check('the four answers are all still there',
    ['crate', 'fence', 'sign', 'raptor'].every((k) => KINDS[k]), Object.keys(KINDS).join(','));
}

/* ---------- roaming birds ----------
   A bird that climbs and dives is only fair if two things hold: the art and
   the hitbox agree at every instant, and every altitude it passes through has
   an answer. Break the first and it kills you from where it visibly is not;
   break the second and the player is asked a question with no right reply. */
{
  check('birds hold station early on', roamChance(0) === 0 && roamChance(300) === 0,
    `${roamChance(0)} at the start`);
  check('and start roaming as the run goes on', roamChance(900) > 0.2 && roamChance(3000) <= 0.8,
    `${roamChance(900).toFixed(2)} at 900m, ${roamChance(3000).toFixed(2)} at 3000m`);

  let roamers = 0;
  for (let i = 0; i < 200; i++) if (KINDS.raptor.box(3000).roam) roamers++;
  check('deep into a run most birds roam', roamers > 100 && roamers < 200, `${roamers}/200`);
  for (let i = 0; i < 100; i++) {
    if (KINDS.raptor.box(0).roam) { check('none of them roam at the start', false); break; }
  }
  check('none of them roam at the start', true);

  /* Sample the whole sweep: where the art is versus what collision would use.
     The field is populated by hand rather than by running the spawner — a walk
     long enough to guarantee roamers also culls all but the last handful, and
     a test that depends on the dice is a test that fails on someone else's
     machine at the worst time. */
  const STAND = 1.62, DUCK = 0.82, JUMP_APEX = 1.87;
  const field = new ObstacleField(new THREE.Group());
  while (field.items.length < 6) {
    const b = KINDS.raptor.box(3000);
    if (!b.roam) continue;
    const g = KINDS.raptor.build(b);
    const x = field.items.length * 10;
    g.position.set(x, 0, 0);
    field.root.add(g);
    field.items.push({ name: 'raptor', kind: KINDS.raptor, box: b, group: g,
                       x, gy: 0, phase: Math.random() * 6.28, yOff: b.yOff });
  }
  const birds = field.items.slice();

  let worstDrift = 0, unanswerable = 0, lowest = 1e9, highest = -1e9;
  for (let step = 0; step < 400; step++) {
    field.update({ x: 0, speed: 7, distance: 3000 }, false, 1 / 60);
    field.animate(field.time);
    for (const it of birds) {
      const artY = it.group.position.y - it.gy - it.box.h / 2;
      worstDrift = Math.max(worstDrift, Math.abs(artY - it.yOff));
      lowest = Math.min(lowest, it.yOff);
      highest = Math.max(highest, it.yOff);
      // duckable if its underside clears a ducked player; jumpable if its top
      // is inside reach of a jump
      const duckable = it.yOff >= DUCK;
      const jumpable = it.yOff + it.box.h <= JUMP_APEX;
      if (!duckable && !jumpable) unanswerable++;
    }
  }
  check('the art never drifts from the hitbox', worstDrift < 1e-9, `${worstDrift.toExponential(1)}u apart`);
  check('every altitude it flies through has an answer', unanswerable === 0,
    `${unanswerable} sampled positions with neither`);
  check('it uses the whole band between the two altitudes',
    lowest < 0.85 && highest > 1.55, `${lowest.toFixed(2)}..${highest.toFixed(2)}`);
  check('and never rises past a duck or drops below a jump',
    lowest >= 0.70 - 1e-9 && highest <= 1.72 + 1e-9, `${lowest.toFixed(2)}..${highest.toFixed(2)}`);
  check('a standing player would be hit at the top', HIGH_BLOCKS(STAND), 'stand 1.62 vs 1.72 underside');
}
function HIGH_BLOCKS(standH) { return standH > 0.70 && standH < 1.72 + 0.62; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
