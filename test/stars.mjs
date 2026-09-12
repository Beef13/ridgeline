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
import { StarField, reach, starGeometry, arcLift, STAR_R, planArc, pickShape,
         screenAnchor, iconScale, TONES, TONES_ON_SCREEN } from '../src/world/stars.js';
import { ObstacleField } from '../src/world/obstacles.js';
import { ICON, LIVES } from '../src/ui/hud.js';
import { heartGeometry, HEART_TONES, HEART_ON_SCREEN } from '../src/world/hearts.js';
import { feel } from '../src/player/tuning.js';
import { heightAt } from '../src/world/terrain.js';

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

/* ---- reachability ----
   The failure that matters is a star the player can see and cannot have: one in
   fifty is enough to teach them to stop trying for any of them. Two things made
   that happen and neither is visible in a screenshot. The reach is measured
   from the ground the player JUMPS from, which is behind the arc and usually
   lower than the ground beneath it. And the real ridge moves by as much as 0.79
   units across a single arc's length, so a height chosen as reachable at one
   end was out of reach at the other. Both are checked here against the actual
   terrain, not against flat ground where neither can occur. */
{
  const R = reach();
  const GAP = 0.62;
  let stars = 0, unreachable = 0, freebies = 0, buried = 0, skipped = 0;
  let trails = 0, trailOut = 0, worstHead = 1e9;

  for (let k = 0; k < 3000; k++) {
    const x0 = 40 + k * 1.7;
    const n = 4 + (k % 3);
    const kind = pickShape(((k * 2654435761) % 1000) / 1000);
    const ys = planArc(kind, x0, n, null, heightAt, ((k * 40503) % 997) / 997);
    if (!ys) { skipped++; continue; }

    // the worst ground the player could be standing on coming into it
    let launch = Infinity;
    for (let x = x0 - 6; x <= x0 + (n - 1) * GAP; x += 0.25) launch = Math.min(launch, heightAt(x));

    for (let i = 0; i < n; i++) {
      stars++;
      const x = x0 + i * GAP, g = heightAt(x);
      if (ys[i] > launch + R.doubleTop) unreachable++;
      if (ys[i] < g) buried++;
      if (kind === 'trail') {
        trails++;
        // swept up at a run: inside the box that reaches from the feet up
        if (ys[i] < g + 0.05 || ys[i] > g + R.standing - 0.05) trailOut++;
      } else {
        if (ys[i] < g + R.standing) freebies++;
        worstHead = Math.min(worstHead, ys[i] - g - R.standing);
      }
    }
  }

  check('no star on the real ridge is out of reach', unreachable === 0,
    `${unreachable} of ${stars} above a double jump from the approach`);
  check('and none of them is inside the ground', buried === 0, `${buried} buried`);
  check('and an arc that cannot fit is skipped rather than placed',
    skipped < stars * 0.1, `${skipped} skipped`);

  check('a trail is collected at a run, without jumping',
    trails > 0 && trailOut === 0, `${trails} trail stars, ${trailOut} out of the running box`);
  check('and a dome always clears a running head',
    freebies === 0 && worstHead > 0.2,
    `closest dome star sits ${worstHead.toFixed(2)}u above head height`);

  /* The mix has to contain all three, or one of the shapes is dead code that
     nobody notices for a month. */
  const seen = {};
  for (let i = 0; i < 1000; i++) seen[pickShape(i / 1000)] = true;
  check('and all three shapes actually occur',
    seen.trail && seen.reachable && seen.awkward, Object.keys(seen).join(', '));

  /* An arc under a fence has to clear the fence, and still be reachable. */
  const flat = () => 0;
  const over = planArc('reachable', 100, 5, 1.9, flat, 0);
  check('an arc over an obstacle is lifted clear of it',
    over && Math.min(...over) > 1.9 + 0.4, over ? Math.min(...over).toFixed(2) + 'u' : 'skipped');
  check('and a lifted arc is still inside a double jump',
    over && Math.max(...over) <= R.doubleTop, over ? Math.max(...over).toFixed(2) + 'u' : 'skipped');

  /* And a wall it cannot be lifted over is refused, not placed out of reach. */
  const absurd = planArc('awkward', 100, 5, 9, flat, 1);
  check('and an impossible lift is refused outright',
    absurd === null || Math.max(...absurd) <= R.doubleTop,
    absurd === null ? 'skipped' : Math.max(...absurd).toFixed(2) + 'u');
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

/* ---------------------------------------------------------------------------
 * The colour.
 *
 * The look being copied is a Donkey Kong Country banana, and what makes that
 * sprite work is not the yellow: it is that there are exactly three tones with
 * nothing between them. Two things can quietly break that. The hexes can be
 * authored by eye, which fails because the output stage multiplies by ~2.9 in
 * LINEAR light and an sRGB hex judged against that is always wrong — it came
 * out gold twice. And the shading can go smooth, which turns three blocks into
 * a gradient and the star back into a plastic bead.
 */
{
  const GRADE = 2.9;
  const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255);
  const grade = (h) => hex(h).map(s2l).map((v) => Math.min(1, v * GRADE));
  /* Compare in LINEAR light, and grade only the authored side — grading the
     sampled sprite value too would be asking whether the target matches itself
     put through the multiply twice, which every value fails. */
  const near = (h, want) => {
    const w = hex(want).map(s2l);
    return grade(h).every((v, i) => Math.abs(v - w[i]) < 0.012);
  };

  for (const k of ['hi', 'mid', 'lo']) {
    check(`the ${k} band lands on its intended tone`, near(TONES[k], TONES_ON_SCREEN[k]),
      `${TONES[k]} -> ~${TONES_ON_SCREEN[k]}`);
  }

  /* Three DISTINCT tones. Authored values 2.9x darker sit close together, and
     two bands that grade to nearly the same colour are two bands nobody can
     see — the whole effect is the steps between them. */
  const lum = (h) => { const g = grade(h); return 0.299 * g[0] + 0.587 * g[1] + 0.114 * g[2]; };
  check('and the three are far enough apart to read as steps',
    lum(TONES.hi) - lum(TONES.mid) > 0.15 && lum(TONES.mid) - lum(TONES.lo) > 0.15,
    `${lum(TONES.hi).toFixed(2)} / ${lum(TONES.mid).toFixed(2)} / ${lum(TONES.lo).toFixed(2)}`);

  /* The mid tone is NOT the highlight scaled down — it is relatively less
     green. That is why a toon gradient map cannot do this: three.js samples it
     for its red channel alone, giving one colour times a scalar ramp. */
  /* The highlight must stay YELLOW. Lifted past about 1.6x its green pins and
     it becomes #ffff5b — white with a cast. Brighter, and no longer the colour
     anyone asked for, so the ceiling here is the clip rather than taste. */
  const g = grade(TONES.hi);
  check('and the highlight is bright without going white',
    g[0] > 0.9 && g[1] > 0.75 && g[1] < 0.995 && g[2] < 0.4,
    `rgb ${g.map((v) => v.toFixed(2)).join(' ')}`);

  const hi = grade(TONES.hi), mid = grade(TONES.mid);
  const ratio = mid.map((v, i) => v / hi[i]);
  check('and the mid tone is its own colour, not the highlight dimmed',
    Math.max(...ratio) - Math.min(...ratio) > 0.06,
    `r/g/b ratios ${ratio.map((v) => v.toFixed(2)).join(', ')}`);

  const field = new StarField(new THREE.Group());
  check('the star is shaded by the bands, not by the scene lights',
    field.mat.type === 'ShaderMaterial', field.mat.type);
  check('and its bands sweep as it turns rather than sitting still',
    field.mat.uniforms.bandHi.value > field.mat.uniforms.bandMid.value,
    `${field.mat.uniforms.bandHi.value} / ${field.mat.uniforms.bandMid.value}`);

  /* Hard edges need ONE normal per face. Shared vertices average the normals of
     every face meeting at a point, and an interpolated normal through a step
     function comes out as a soft gradient — the exact thing three flat bands
     are for. */
  const geo = starGeometry();
  check('and every face carries its own normal, so the edges stay hard',
    geo.index === null, geo.index === null ? 'non-indexed' : 'indexed — normals will be averaged');
}

/* ---------------------------------------------------------------------------
 * The shape of an arc.
 *
 * They were jagged for two reasons, and both are arithmetic rather than taste.
 * The bow was a fixed rise whatever the arc's length, so a short one was bent
 * nearly twice as hard as a long one and four points around a tight curve read
 * as a chevron. And the height of each star was measured against the ground
 * directly beneath it, which copied every bump in the ridge into the curve.
 */
{
  const GAP = 0.62;
  const steepest = (n) => {
    const span = (n - 1) * GAP;
    let worst = 0;
    for (let i = 0; i < n - 1; i++) {
      const d = Math.abs(arcLift((i + 1) / (n - 1), span) - arcLift(i / (n - 1), span));
      worst = Math.max(worst, Math.atan(d / GAP) * 180 / Math.PI);
    }
    return worst;
  };
  const angles = [4, 5, 6].map(steepest);
  check('every arc bends at about the same rate, whatever its length',
    Math.max(...angles) - Math.min(...angles) < 3,
    angles.map((a) => a.toFixed(1) + '\u00b0').join(' / '));
  check('and none of them kinks', Math.max(...angles) < 22,
    `steepest ${Math.max(...angles).toFixed(1)}\u00b0`);

  /* Symmetric, and peaking in the middle — it reads as the path of a jump, and
     a dome whose high point drifted off-centre would read as a mistake. */
  check('and an arc is symmetric about its middle',
    Math.abs(arcLift(0.2, 2.5) - arcLift(0.8, 2.5)) < 1e-9);
  check('and sits on the ground at both ends',
    arcLift(0, 2.5) < 1e-9 && arcLift(1, 2.5) < 1e-9);
  check('and rises highest at the centre',
    arcLift(0.5, 2.5) > arcLift(0.25, 2.5) && arcLift(0.5, 2.5) > 0.1,
    `${arcLift(0.5, 2.5).toFixed(2)}u on a 2.50u arc`);
}

/* ---------------------------------------------------------------------------
 * An arc has to STAY a curve once it is moving.
 *
 * The placement can be perfectly smooth and the result still look rough: every
 * star used to bob on its own random phase, 0.07 units of it, which is about
 * two screen pixels on a fourteen pixel star. Five of those out of step turn a
 * dome into a zig-zag, and nothing about the planned heights shows it.
 */
{
  const field = new StarField(new THREE.Group());
  const ys = planArc('reachable', 200, 5, null, () => 0, 0.5);
  const bob = 1.234;                         // one phase, as the spawner gives it
  for (let i = 0; i < ys.length; i++) {
    const mesh = new THREE.Object3D();
    field.root.add(mesh);
    field.items.push({ x: 200 + i * 0.62, y: ys[i], mesh, bob, phase: bob + i * 0.5 });
  }

  /* The whole arc must move as ONE. Whatever the bob is doing at any instant,
     every star in the arc has to be displaced by exactly the same amount —
     which is what makes it a moving curve rather than a rippling one. */
  let worstSpread = 0;
  for (let k = 0; k < 400; k++) {
    const t = k * 0.037;
    field.animate(t);
    const offs = field.items.map((it, i) => it.mesh.position.y - ys[i]);
    worstSpread = Math.max(worstSpread, Math.max(...offs) - Math.min(...offs));
  }
  check('an arc rises and falls as one object', worstSpread < 1e-9,
    `${worstSpread.toExponential(1)}u between the most and least displaced star`);

  /* And it is still a dome at every instant: one peak, in the middle, with the
     rise easing off toward it rather than running straight at it. */
  field.animate(0.8);
  const y = field.items.map((it) => it.mesh.position.y);
  const rising = y.slice(1).map((v, i) => v - y[i]);
  const peakAt = y.indexOf(Math.max(...y));
  check('and it is still a single dome, peaking in the middle',
    peakAt === 2 && rising[0] > 0 && rising[rising.length - 1] < 0,
    `peak at star ${peakAt + 1} of ${y.length}`);
  check('and the curve eases rather than running straight at its peak',
    rising[0] > rising[1] && rising[1] > 0,
    `steps ${rising.map((v) => v.toFixed(3)).join(', ')}`);

  /* The spin is staggered, not shared — a wave down the line, not five props
     turning in lockstep and not five turning at random. */
  const spins = field.items.map((it) => it.phase);
  const gaps = spins.slice(1).map((v, i) => v - spins[i]);
  check('and the spin runs down the arc as a wave',
    gaps.every((g) => Math.abs(g - gaps[0]) < 1e-9 && g > 0),
    `${gaps[0].toFixed(2)} rad between neighbours`);
}

/* ---------------------------------------------------------------------------
 * Nothing overlaps an obstacle.
 *
 * A star inside a crate is not a hard star, it is a broken one, and it is the
 * kind of bug that is rare enough to look like bad luck. Three separate causes
 * produced it and none of them shows in a single frame:
 *
 *   - stars were placed as far ahead as the obstacles were, so an arc could go
 *     into clear air and have a crate spawned into it a moment later;
 *   - only the arc's FIRST star was checked against that frontier, so its tail
 *     still reached past it;
 *   - the lift over an obstacle was measured from the ground under the
 *     obstacle while the arc was built from the ground under itself, and the
 *     ridge moves between the two.
 *
 * So this drives both fields for a real run rather than testing the placement
 * function in isolation — every one of those three only happens over time.
 */
{
  const obs = new ObstacleField(new THREE.Group());
  const field = new StarField(new THREE.Group());
  const player = { x: 0, speed: 7, distance: 0 };
  let hits = 0, placed = 0, worst = 0;
  const culprits = {};
  const seen = new Set();

  for (let step = 0; step < 60000; step++) {
    const dt = 1 / 60;
    player.speed = Math.min(17, player.speed + 0.16 * dt);
    player.x += player.speed * dt;
    player.distance = player.x;
    obs.update(player, true, dt);
    field.update(player, obs, dt);
    for (const it of field.items) {
      const k = it.x.toFixed(3);
      if (!seen.has(k)) { seen.add(k); placed++; }
    }
    if (step % 3) continue;

    const boxes = obs.boxes();
    for (const it of field.items) {
      const sx0 = it.x - STAR_R, sx1 = it.x + STAR_R;
      const sy0 = it.y - STAR_R, sy1 = it.y + STAR_R;
      for (const o of boxes) {
        if (o.x1 < sx0 || o.x0 > sx1) continue;
        /* A flyer is judged on the whole band it can roam through, not on
           where it happens to be this frame. A star that is clear of a bird
           now and inside it four seconds later is still a trap. */
        const oy0 = o.flying ? o.y0 - 1.1 : o.y0;
        const oy1 = o.flying ? o.y1 + 1.1 : o.y1;
        if (oy1 < sy0 || oy0 > sy1) continue;
        hits++;
        culprits[o.name] = (culprits[o.name] || 0) + 1;
        worst = Math.max(worst, Math.min(sy1, oy1) - Math.max(sy0, oy0));
      }
    }
  }

  check('no star ever overlaps an obstacle', hits === 0,
    hits ? `${hits} overlaps, worst ${worst.toFixed(2)}u — ${JSON.stringify(culprits)}`
         : `${placed} stars over ${player.x.toFixed(0)} units, clean`);
  /* Refusing arcs is how the above is achieved, so the density has to be
     checked alongside it — a rule that skipped everything would also pass. */
  const per1000 = placed / player.x * 1000;
  check('and they are still placed thickly enough to matter', per1000 > 100,
    `${per1000.toFixed(0)} stars per 1000 units`);
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
  check('touching two stars collects both', field.collect(box).length === 2);
  check('and leaves the far one alone', field.items.length === 1);
  check('and collecting is not repeatable', field.collect(box).length === 0);
  check('and the mesh is taken out of the scene', field.root.children.length === 1);

  /* Generosity is one-directional on purpose: a star that looked collected and
     was not is remembered far longer than one that came a pixel early. */
  put(20, 2);
  const nearMiss = { x0: 19.7, x1: 19.72, y0: 1.5, y1: 3.1 };
  check('and a very near miss still counts', field.collect(nearMiss).length === 1,
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
  /* The icon and a life have to look like a matched pair. Comparing the two
     `px` numbers proves nothing — they scale different geometries — so this
     measures what each one actually renders and asks for the star to be in the
     same bracket, and slightly the larger of the two. */
  const starGeo = starGeometry(); starGeo.computeBoundingBox();
  const heartGeo2 = heartGeometry(); heartGeo2.computeBoundingBox();
  const sz = starGeo.boundingBox.getSize(new THREE.Vector3());
  const hz = heartGeo2.boundingBox.getSize(new THREE.Vector3());
  const starW = ICON.px * sz.x / (2 * STAR_R);
  const heartW = LIVES.px;                          // its geometry is normalised to 1
  check('the icon and a life are a matched pair on screen',
    starW > heartW && starW < heartW * 1.2,
    `star ${starW.toFixed(1)}px vs heart ${heartW.toFixed(1)}px wide`);
  check('and neither crowds a 13px number beside it',
    starW < 16 && heartW < 16, `${starW.toFixed(1)} / ${heartW.toFixed(1)}`);
  /* Grown leftward as well as right — it must not run off the frame. */
  check('and the icon still clears the left edge', ICON.x - starW / 2 > 2,
    `${(ICON.x - starW / 2).toFixed(1)}px of margin`);
}

/* ---------------------------------------------------------------------------
 * The lives.
 *
 * A life has to be unmistakable from a star at a glance, under pressure, at
 * eleven pixels. Shape and colour do most of that; the shading does the rest,
 * and the shading is the part that can silently regress — merge the vertices
 * the wrong side of computing the normals and the heart comes out faceted,
 * which at this size looks exactly like the star.
 */
{
  const h = heartGeometry();
  h.computeBoundingBox();
  const s = h.boundingBox.getSize(new THREE.Vector3());
  const PX = 1 / 31;

  check('a heart is indexed, so its normals can be averaged smooth',
    h.index !== null, h.index ? 'merged' : 'non-indexed — it will shade in facets');
  /* The star is deliberately the opposite. If these two ever agree, one of
     them has been broken. */
  check('and the star is not, so the two shade differently',
    starGeometry().index === null);

  check('and it is wider than it is tall, as a heart is',
    s.x > s.y, `${s.x.toFixed(2)} x ${s.y.toFixed(2)}`);
  /* It spins, so its narrowest view is its depth — the same sub-pixel trap
     that has caught the underwing, the eye and the star. */
  const spun = (LIVES.px / Math.max(s.x, s.y)) * s.z;
  check('and thick enough that spinning never thins it below a pixel',
    spun > 1.5, `${spun.toFixed(1)}px edge-on at ${LIVES.px}px wide`);

  /* Lobes up, point down. A heart built from the usual construction comes out
     point-up, and upside down at this size it is just a blob. */
  const p = h.attributes.position;
  let top = 0, bottom = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = Math.abs(p.getX(i));
    if (y > s.y * 0.15) top = Math.max(top, x);
    if (y < -s.y * 0.3) bottom = Math.max(bottom, x);
  }
  check('and it is the right way up', top > bottom * 1.5,
    `half-width ${top.toFixed(2)} at the lobes vs ${bottom.toFixed(2)} at the point`);

  /* Red, and bright, once the grade has had it. */
  const GRADE = 2.9;
  const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const hex = (x) => [1, 3, 5].map((i) => parseInt(x.substr(i, 2), 16) / 255);
  const g = hex(HEART_TONES.hi).map(s2l).map((v) => Math.min(1, v * GRADE));
  const want = hex(HEART_ON_SCREEN.hi).map(s2l);
  check('and its lit tone lands where it was aimed',
    g.every((v, i) => Math.abs(v - want[i]) < 0.012),
    `${HEART_TONES.hi} -> ~${HEART_ON_SCREEN.hi}`);
  check('and reads as red, not as orange', g[0] > 0.9 && g[1] < 0.25 && g[2] < 0.25,
    `rgb ${g.map((v) => v.toFixed(2)).join(' ')}`);

  check('and the player can hold at most three', LIVES.max === 3, String(LIVES.max));
  /* The gap after the number is wider than the gap between hearts, or "47" and
     three lives read as one run of five symbols rather than as two things. */
  check('and the hearts are spaced apart from the count',
    LIVES.gapAfterNumber + LIVES.px / 2 > LIVES.pitch - LIVES.px,
    `${LIVES.gapAfterNumber}px after the digits, ${LIVES.pitch}px pitch`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
