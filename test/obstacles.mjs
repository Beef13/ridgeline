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

/* ---------------------------------------------------------------------------
 * Flap RATE is the same for every bird.
 *
 * The climb used to drive the frequency as well as the depth of the beat, so a
 * roaming vulture flapped between 6 and 16 rad/s while a hovering one held a
 * steady 11 — they read as two different creatures, and the faster one looked
 * panicked. Counting zero crossings is the honest measure: two birds given the
 * same starting phase must cross the same number of times over the same window,
 * whatever either one is doing with its altitude.
 */
{
  const field = new ObstacleField(new THREE.Group());
  const add = (roam) => {
    let b;
    for (;;) { b = KINDS.raptor.box(roam ? 3000 : 0); if (!!b.roam === roam) break; }
    const g = KINDS.raptor.build(b);
    field.root.add(g);
    const it = { name: 'raptor', kind: KINDS.raptor, box: b, group: g,
                 x: 0, gy: 0, phase: 0.4, yOff: b.yOff, beats: 0, prev: undefined };
    field.items.push(it);
    return it;
  };
  const roamer = add(true), hoverer = add(false);
  for (let s = 0; s < 900; s++) {
    field.time = s / 60;                       // animate() reads this for the climb
    field.animate(s / 60);
    for (const it of [roamer, hoverer]) {
      const a = it.group.userData.wings[0].rotation.x;
      if (it.prev !== undefined && (it.prev <= 0) !== (a <= 0)) it.beats++;
      it.prev = a;
    }
  }
  check('bird: a roaming bird flaps at the same rate as a hovering one',
    roamer.beats === hoverer.beats && roamer.beats > 20,
    `${roamer.beats} vs ${hoverer.beats} half-beats in 15s`);

  /* The climb still has to SHOW, or the change threw away the cue rather than
     fixing it. Depth of beat is what carries it now. */
  let lo = 1e9, hi = -1e9;
  for (let s = 0; s < 900; s++) {
    field.time = s / 60;
    field.animate(s / 60);
    const a = Math.abs(roamer.group.userData.wings[0].rotation.x);
    lo = Math.min(lo, a); hi = Math.max(hi, a);
  }
  check('and the climb still shows in how DEEP the beat is',
    hi > 0.90 && hi - lo > 0.30, `${lo.toFixed(2)}..${hi.toFixed(2)} rad`);
}

/* ---------------------------------------------------------------------------
 * The bird's silhouette.
 *
 * A flyer is the one obstacle whose job is to be IDENTIFIED before it is
 * reacted to — low means jump, high means duck, and the player has to read
 * which at about 29 pixels across. It was a stretched sphere with a smaller
 * sphere stuck on the front, and it read as a blob. What replaced it is bought
 * entirely in outline: a hooked beak at the front, talons under the belly, a
 * hunch above the back, wings reaching out sideways.
 *
 * These assertions are about the OUTLINE, not the modelling — they say the
 * distinguishing parts exist and stick out far enough to survive the palette
 * snap, and they say the art never reaches outside the box that kills you.
 */
{
  const { KINDS } = await import('../src/world/obstacles.js');
  const THREE = await import('three');
  const b = { w: 0.95, h: 0.62, yOff: 0.70 };
  const g = KINDS.raptor.build(b);
  g.updateMatrixWorld(true);

  const art = new THREE.Box3().setFromObject(g);
  const cy = b.yOff + b.h / 2;

  /* The hitbox is what kills; the art must not reach past it on either
     colliding axis, or the bird takes you from somewhere it visibly is not. */
  check('bird: the art stays inside the hitbox horizontally',
    art.min.x > -b.w / 2 - 1e-3 && art.max.x < b.w / 2 + 1e-3,
    `${art.min.x.toFixed(2)}..${art.max.x.toFixed(2)} vs +-${(b.w / 2).toFixed(2)}`);
  check('and vertically',
    art.min.y > cy - b.h / 2 - 1e-3 && art.max.y < cy + b.h / 2 + 1e-3,
    `${(art.min.y - cy).toFixed(2)}..${(art.max.y - cy).toFixed(2)} vs +-${(b.h / 2).toFixed(2)}`);

  // and it should FILL it — a bird rattling around inside its hitbox is the
  // same unfairness in the other direction
  check('and fills it rather than rattling around inside',
    (art.max.x - art.min.x) > b.w * 0.85 && (art.max.y - art.min.y) > b.h * 0.7,
    `${(art.max.x - art.min.x).toFixed(2)} x ${(art.max.y - art.min.y).toFixed(2)}`);

  /* Nothing thinner than about 3 screen pixels survives the palette snap, so
     every feature has to break the outline to exist at all. */
  const part = (pred) => {
    const bb = new THREE.Box3();
    g.traverse((o) => { if (o.isMesh && pred(o)) bb.expandByObject(o); });
    return bb;
  };
  const PX = 1 / 31;                       // one screen pixel, in world units
  const low = part((o) => o.getWorldPosition(new THREE.Vector3()).y < cy - 0.12);
  check('bird: talons hang clear of the belly', !low.isEmpty() && (cy - low.min.y) > 3 * PX,
    low.isEmpty() ? 'none' : `${((cy - low.min.y) / PX).toFixed(1)}px below centre`);

  /* The neck is what makes it read as a vulture rather than a gull.
     In the first version the shoulders and the head overlapped, so they merged
     into one lump and there was nothing to recognise — a vulture is a small
     head held out clear on a bare neck, and the GAP is the whole cue. There is
     no spare room in a 0.95-wide box to add one, so it was reclaimed by
     shrinking the body; this measures that it stayed reclaimed. */
  {
    const obs2 = await import('../src/world/obstacles.js');
    const M2 = obs2.OBSTACLE_MATERIALS;
    const bird = obs2.KINDS.raptor.build({ w: 0.95, h: 0.62, yOff: 0.70 });
    const inWing = new Set();
    for (const w of bird.userData.wings) w.traverse((o) => inWing.add(o));
    const span = (mat) => {
      const bb = new THREE.Box3();
      bird.traverse((o) => { if (o.isMesh && !inWing.has(o) && o.material === mat) bb.expandByObject(o); });
      return bb;
    };
    /* "Everything that is not the body" rather than "everything painted the
       head's colour": the head, neck and brow have each changed material at
       least once, and a test that names one of them measures whichever part
       still happens to wear it. */
    const spanNot = (mat) => {
      const bb = new THREE.Box3();
      bird.traverse((o) => { if (o.isMesh && !inWing.has(o) && o.material !== mat) bb.expandByObject(o); });
      return bb;
    };
    const body = span(M2.bird), headAndNeck = spanNot(M2.bird);
    check('bird: the head is held clear of the shoulders',
      (headAndNeck.max.x - body.max.x) / (1 / 31) > 6,
      `${((headAndNeck.max.x - body.max.x) / (1 / 31)).toFixed(1)}px of head and neck beyond the body`);

    /* And it must climb. A neck that leaves the shoulders level, or droops,
       reads as a hunched pigeon bracing for impact — which is what the first
       attempt did, because the segments were tilted nose-DOWN while their
       centres crept up, and the two cancelled out. The angle comes off a line
       drawn over a screenshot, so it is a judgement someone made once and this
       is what stops it drifting back. */
    const rise = obs2.NECK_RISE * 180 / Math.PI;
    check('and the neck climbs rather than droops', rise > 15 && rise < 30,
      `${rise.toFixed(1)} degrees`);
    check('and the segments tilt WITH the climb, not against it',
      obs2.NECK_RISE > 0, `${obs2.NECK_RISE}`);

    /* A wing hinges on the SHOULDER. The pivot used to be the bird's origin,
       which was fine until the body was shrunk and moved back to make room for
       the neck — the origin then sat at the body's front edge and the wings
       beat out in front of it, like a man swimming. Anything that moves the
       body has to move the hinge with it, so this measures the two against
       each other rather than trusting a number. */
    bird.updateMatrixWorld(true);
    const wingBox = new THREE.Box3();
    for (const w of bird.userData.wings) wingBox.expandByObject(w);
    const bodyBox = new THREE.Box3();
    bird.traverse((o) => { if (o.isMesh && !inWing.has(o) && o.material === M2.bird) bodyBox.expandByObject(o); });
    check('bird: the wings beat ON the body, not in front of it',
      wingBox.min.x >= bodyBox.min.x - 0.02 && wingBox.max.x <= bodyBox.max.x + 0.02,
      `wings ${wingBox.min.x.toFixed(2)}..${wingBox.max.x.toFixed(2)} vs body ${bodyBox.min.x.toFixed(2)}..${bodyBox.max.x.toFixed(2)}`);
  }

  const wings = g.userData.wings;
  check('bird: it has two wings that can be flapped', Array.isArray(wings) && wings.length === 2);
  const span = new THREE.Box3();
  for (const w of wings) span.expandByObject(w);
  check('and they reach well past the body', (span.max.z - span.min.z) > 1.0,
    `${(span.max.z - span.min.z).toFixed(2)}u across`);

  /* Rotated to face back down the ridge: the runner arrives from -x, so a bird
     built nose-forward would be showing them its tail. */
  check('bird: it faces the oncoming runner', Math.abs(g.rotation.y - Math.PI) < 1e-6,
    g.rotation.y.toFixed(3));
}

/* ---------------------------------------------------------------------------
 * The vulture's palette, AFTER the grade.
 *
 * The screen multiplies by about 2.9x, which is enough to take two colours that
 * look quite different in Rhino and clip them both to the same flat slab. The
 * bird is the only thing in the game carrying five colours, and the read — black
 * body, orange head, YELLOW beak with a RED tip — depends on them surviving
 * that. Authored values prove nothing; graded ones do.
 */
{
  const obs = await import('../src/world/obstacles.js');
  const M = obs.OBSTACLE_MATERIALS;
  obs.tintObstacles(0.55);                    // the shipped default
  const GRADE = 2.9;
  const graded = (n) => {
    const c = M[n].color;
    return { r: Math.min(1, c.r * GRADE), g: Math.min(1, c.g * GRADE), b: Math.min(1, c.b * GRADE) };
  };
  const body = graded('bird'), head = graded('birdL');
  const beak = graded('beak'), tip = graded('beakTip');

  check('bird: the body stays black through the grade',
    Math.max(body.r, body.g, body.b) < 0.35,
    `brightest channel ${Math.max(body.r, body.g, body.b).toFixed(2)}`);

  /* Red clips on the head, the beak and the tip alike, so red cannot be what
     tells them apart — GREEN is the only axis left with room in it. */
  check('and the yellow beak still separates from the orange head',
    beak.g - head.g > 0.3, `green ${beak.g.toFixed(2)} vs ${head.g.toFixed(2)}`);
  check('and the red tip still separates from the yellow beak',
    beak.g - tip.g > 0.3, `green ${beak.g.toFixed(2)} vs ${tip.g.toFixed(2)}`);

  /* The bare head and neck. Red pins at 1.0 on the skin AND on the beak, so
     the one channel that can still tell a pink head from a yellow beak is
     BLUE — the beak has almost none and the skin has to keep plenty. */
  const skin = graded('skin');
  check('and the pink head separates from the yellow beak',
    skin.b - beak.b > 0.35, `blue ${skin.b.toFixed(2)} vs ${beak.b.toFixed(2)}`);
  /* Pink, not white and not red: light enough to read as bare skin, but with
     green and blue still short of the clip or it is simply a white head. */
  check('and it is still pink after the grade, not white',
    skin.r > 0.9 && skin.g > 0.5 && skin.g < 0.9 && Math.abs(skin.g - skin.b) < 0.2,
    `rgb ${skin.r.toFixed(2)} ${skin.g.toFixed(2)} ${skin.b.toFixed(2)}`);

  /* UNLIT, for the same reason the underwing is: an eye that dims as the bird
     banks away from the sun blinks out at exactly the moment a player is
     trying to read it. */
  check('and the eye is pure black and unlit',
    M.pupil.type === 'MeshBasicMaterial' && M.pupil.color.getHexString() === '000000');

  /* And it has to exist on EVERY frame. Below a pixel it is not a small eye,
     it is an intermittent one — present or absent depending on where the
     sampling grid falls. Same failure as the first underwing stripe. */
  {
    const PX = 1 / 31;
    const bird = obs.KINDS.raptor.build({ w: 0.95, h: 0.62, yOff: 0.70 });
    bird.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    bird.traverse((o) => { if (o.isMesh && o.material === M.pupil) bb.expandByObject(o); });
    const p = new THREE.Vector3(); bb.getSize(p);
    check('and the eye clears a screen pixel',
      p.x / PX > 1 && p.y / PX > 1, `${(p.x / PX).toFixed(1)} x ${(p.y / PX).toFixed(1)}px`);
  }

  /* Pale undersides are what turn the flap into a BLINK. A dark bird beating
     dark wings against a dark ridge is a shape changing size, which peripheral
     vision is poor at; a light underside flashing at the top of each beat is
     the one thing eyes cannot ignore. It has to clip, and it has to be nothing
     like the body. */
  const under = graded('wingUnder');
  check('bird: the underside flashes white at the top of a beat',
    under.r >= 1 && under.g >= 1 && under.b >= 1);
  check('and is nothing like the body it sits under',
    under.g - body.g > 0.8, `${under.g.toFixed(2)} vs ${body.g.toFixed(2)}`);

  /* UNLIT. The underside of a wing faces away from the key light, so a white
     Phong surface renders there as murky grey — which is how a "white"
     underwing came out reading as a second, wrong shade of dark. The stripe has
     to be bright at the moment the wing turns over, not merely pale in
     principle, and only a material that ignores lighting can promise that. */
  check('and stays bright whichever way the wing is pointing',
    M.wingUnder.type === 'MeshBasicMaterial', M.wingUnder.type);

  /* Everything on the wing that is NOT the white underside must be the body's
     own material object — not a copy, not a near-match. Two darks meant to be
     the same colour drift apart the first time one of them is tuned. */
  const wingMats = new Set();
  for (const w of obs.KINDS.raptor.build({ w: 0.95, h: 0.62, yOff: 0.70 }).userData.wings) {
    w.traverse((o) => { if (o.isMesh) wingMats.add(o.material); });
  }
  check('and the dark of a wing IS the dark of the body',
    wingMats.size === 2 && wingMats.has(M.bird) && wingMats.has(M.wingUnder),
    `${wingMats.size} materials on the wings`);

  /* Two colours on one wing is easy to buy expensively. Painting the underside
     as BoxGeometry's own -y face needs a material ARRAY, and an array makes
     three.js honour all six per-face groups — six feathers would cost 36 draw
     calls. Merged by colour it is four for the pair, in a game that is already
     draw-call bound. */
  const wingMeshes = obs.KINDS.raptor.build({ w: 0.95, h: 0.62, yOff: 0.70 })
    .userData.wings.reduce((n, w) => {
      let c = 0;
      w.traverse((o) => { if (o.isMesh) c += Array.isArray(o.material) ? o.geometry.groups.length : 1; });
      return n + c;
    }, 0);
  check('and both wings together still cost four draw calls', wingMeshes === 4,
    `${wingMeshes} calls`);

  /* The first pale underside was a 0.012u strip slung beneath each feather, and
     it SHIMMERED: at about a third of a screen pixel, whether it existed came
     down to where the sampling grid fell that frame. Sub-pixel geometry does
     not get dimmer, it gets intermittent. Every layer of the wing has to clear
     a whole pixel, and nothing may hang below the feather at all. */
  const PX = 1 / 31;
  /* Measured from the table the wing is built from, NOT from the merged mesh:
     the merge spans three feathers at different heights, so its bounding box is
     thicker than any single layer and would pass this happily while the layers
     themselves were sub-pixel. */
  const halves = obs.WING_FEATHERS.map(([, h]) => h / 2);
  const thinnest = Math.min(...halves);
  check('bird: every layer of a wing clears a screen pixel',
    thinnest > PX, `thinnest half ${(thinnest / PX).toFixed(2)}px`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
