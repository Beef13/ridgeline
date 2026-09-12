/**
 * Seeded worlds.
 *
 * The claim this file has to defend is not "the generator returns numbers" —
 * it is that a seed rebuilds a LEVEL. So most of what follows drives the real
 * ObstacleField and StarField over a long stretch of ground and compares what
 * came out, because that is the thing a bug report, a replay or a server-side
 * score check would actually depend on.
 */
import { makeRng, seedRun, randomSeed, currentSeed, rndWorld, rndDecor } from '../src/core/rng.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* ---------------------------------------------------------------------------
 * The generator itself.
 */
{
  const a = makeRng(12345), b = makeRng(12345), c = makeRng(12346);
  const A = Array.from({ length: 500 }, a);
  const B = Array.from({ length: 500 }, b);
  const C = Array.from({ length: 500 }, c);

  check('the same seed gives the same sequence', A.every((v, i) => v === B[i]));
  check('and a seed one apart gives a different one', A.some((v, i) => v !== C[i]),
    `${A.filter((v, i) => v === C[i]).length} of 500 collided`);

  check('every value is in [0, 1)', A.every((v) => v >= 0 && v < 1));

  /* A generator that drifts or clumps would place obstacles in bands, which is
     the kind of thing that looks like a level-design bug for a week. */
  const mean = A.reduce((s, v) => s + v, 0) / A.length;
  check('the mean sits near 0.5', Math.abs(mean - 0.5) < 0.04, mean.toFixed(4));

  const bins = new Array(10).fill(0);
  for (const v of A) bins[Math.floor(v * 10)]++;
  const worst = Math.max(...bins.map((n) => Math.abs(n - 50)));
  check('and no tenth of the range is starved or favoured', worst < 25,
    `worst bin off by ${worst} of 50`);

  /* 500 draws from a 2^32 generator should not repeat. If they do, the state is
     too small or the mixing has collapsed. */
  check('and it does not repeat within a run', new Set(A).size === A.length);
}

/* ---------------------------------------------------------------------------
 * Two streams, and the reason they exist.
 */
{
  seedRun(777);
  const w1 = Array.from({ length: 50 }, rndWorld);
  seedRun(777);
  const w2 = Array.from({ length: 50 }, rndWorld);
  check('re-seeding restarts the world stream exactly', w1.every((v, i) => v === w2[i]));

  seedRun(777);
  const d = Array.from({ length: 50 }, rndDecor);
  check('and decor is a different stream, not a copy of it',
    d.some((v, i) => v !== w1[i]));

  /* The whole point of the split: scenery must not be able to move the level.
     Drawing decor between world draws has to leave the world sequence alone. */
  seedRun(777);
  const mixed = [];
  for (let i = 0; i < 50; i++) {
    for (let k = 0; k < 3; k++) rndDecor();      // as if scenery were denser
    mixed.push(rndWorld());
  }
  check('and drawing scenery cannot shift the world sequence',
    mixed.every((v, i) => v === w1[i]),
    'three extra decor draws per step changed nothing');

  check('seedRun reports the seed it used', seedRun(4242) === 4242 && currentSeed() === 4242);
  check('and seed 0 is never used', seedRun(0) !== 0, `0 -> ${currentSeed()}`);
}

/* ---------------------------------------------------------------------------
 * A seed a person can read aloud.
 */
{
  const seeds = Array.from({ length: 2000 }, randomSeed);
  check('generated seeds are six digits', seeds.every((s) => s >= 100000 && s <= 999999));
  /* 2000 draws from 900k values: the birthday bound puts expected collisions
     around 2. Ten would mean the range is not being used. */
  check('and collisions are rare', 2000 - new Set(seeds).size < 10,
    `${2000 - new Set(seeds).size} duplicates in 2000`);
}

/* ---------------------------------------------------------------------------
 * The claim that matters: a seed rebuilds the level.
 */
const { ObstacleField } = await import('../src/world/obstacles.js');
const { StarField } = await import('../src/world/stars.js');

/* Driven the way test/stars.mjs drives them — a real player advancing at the
 * game's own acceleration, real three.js groups, and no swallowed errors. A
 * harness that quietly caught its own failures is what made the first version
 * of this test report a deterministic level with one obstacle in it.
 */
const THREE = await import('three');

function run(seed, steps = 40000) {
  seedRun(seed);
  const obs = new ObstacleField(new THREE.Group());
  const field = new StarField(new THREE.Group());
  const player = { x: 0, speed: 7, distance: 0 };
  const out = { obstacles: [], stars: [], path: [] };
  const seenOb = new Set(), seenSt = new Set();

  for (let i = 0; i < steps; i++) {
    const dt = 1 / 60;
    player.speed = Math.min(17, player.speed + 0.16 * dt);
    player.x += player.speed * dt;
    player.distance = player.x;
    obs.update(player, true, dt);
    field.update(player, obs, dt);

    /* Birds move, so sampling their box every frame would count one bird
       thousands of times. Static obstacles are recorded once by where they
       stand; birds are recorded as their whole sampled path, which makes the
       comparison stricter rather than weaker — two runs have to agree on every
       position of every bird, not merely on where it spawned. */
    for (const b of obs.boxes()) {
      if (b.flying) {
        out.path.push(`${b.x0.toFixed(3)}|${b.y1.toFixed(3)}`);
      } else {
        const k = `${b.x0.toFixed(3)}|${b.y1.toFixed(3)}`;
        if (!seenOb.has(k)) { seenOb.add(k); out.obstacles.push(k); }
      }
    }
    for (const it of field.items) {
      const k = `${it.x.toFixed(3)}|${it.y.toFixed(3)}`;
      if (!seenSt.has(k)) { seenSt.add(k); out.stars.push(k); }
    }
  }
  out.metres = player.x;
  return out;
}

{
  const a = run(31337), b = run(31337), c = run(31338);

  check('the run under test is a real one', a.obstacles.length > 200 && a.stars.length > 200,
    `${Math.round(a.metres)}m, ${a.obstacles.length} obstacles, ${a.stars.length} stars`);

  check('the same seed builds the same obstacles',
    a.obstacles.join() === b.obstacles.join(),
    `${a.obstacles.length} obstacles, identical`);

  check('and the same stars',
    a.stars.join() === b.stars.join(),
    `${a.stars.length} stars, identical`);

  check('and every bird flies the same path, frame by frame',
    a.path.length > 1000 && a.path.join() === b.path.join(),
    `${a.path.length} sampled bird positions, identical`);

  check('and a different seed builds a different level',
    c.obstacles.length > 200 && a.obstacles.join() !== c.obstacles.join(),
    `${c.obstacles.length} obstacles from the other seed`);

  /* Determinism is worthless if it was won by making the level uniform, so
     check the world is still doing its job. */
  const heights = new Set(a.obstacles.map((k) => k.split('|')[1]));
  check('and the level is still varied, not merely repeatable', heights.size > 10,
    `${heights.size} distinct obstacle heights`);

  check('and it still has birds in it', a.path.length > 1000,
    `${a.path.length} bird samples over the run`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
