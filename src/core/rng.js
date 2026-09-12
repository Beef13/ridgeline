/**
 * Seeded randomness.
 *
 * The world used to come out of Math.random(), which cannot be steered: the
 * same run was unreproducible, a bug report could only ever be "a bird was in a
 * bad place somewhere around 400m", and a server had no way to check a claimed
 * score because it could not rebuild the level the claim was made on.
 *
 * Everything that shapes a run now comes out of a seed instead. Same seed, same
 * ridge, same obstacles, same stars, every time and on every machine.
 *
 * TWO STREAMS, not one
 * --------------------
 * `world` feeds anything that decides where the player can go — obstacles,
 * their sizes, the birds' patrol choices, star arcs. `decor` feeds anything
 * that only decides how it looks — scattered bushes, fireflies.
 *
 * They are separate because a shared stream would couple them: adding one
 * firefly, or skipping scenery on a slow machine, would pull a different number
 * for the next obstacle and silently change the level. With two streams the
 * scenery can be changed, tuned or turned off entirely and the run the player
 * gets is identical.
 *
 * The one thing to be careful of: obstacle code draws from `world` even for
 * cosmetic details like how far off plumb a fence post leans, because those are
 * drawn in lockstep with the obstacle itself. Adding or removing a draw inside
 * obstacles.js or stars.js shifts every later value, so an old seed will no
 * longer reproduce the level it used to. That is fine for debugging and it is
 * why any future replay verification has to record a content version alongside
 * the seed.
 */

/**
 * mulberry32. Thirty-two bits of state, one multiply-shift round, and it passes
 * the randomness tests that matter at this scale. Chosen over the fancier
 * generators because it is ten lines: whatever re-runs a replay later — a
 * server, a test, another language — has to reproduce it exactly, and a short
 * algorithm is one that can be reproduced exactly.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A seed a person can read out over a chat window and type back in. Six digits
   is small enough to dictate and large enough that two players in the same
   session almost never share one. */
export function randomSeed() {
  return (Math.floor(Math.random() * 900000) + 100000) >>> 0;
}

let seed = 0;
let world = makeRng(1);
let decor = makeRng(2);

/**
 * Starts a run. Call before anything generates, or the first chunk of level is
 * built from the previous run's stream and the seed is a lie.
 *
 * The decor stream is offset by the golden-ratio constant rather than seeded
 * with the same number, so the two streams do not march in step and produce
 * visibly correlated placements.
 */
export function seedRun(s) {
  seed = (s >>> 0) || 1;
  world = makeRng(seed);
  decor = makeRng((seed ^ 0x9e3779b9) >>> 0);
  return seed;
}

export const currentSeed = () => seed;

/* Called as functions rather than exported directly, because `world` and
   `decor` are reassigned on every seedRun and a captured reference would go on
   using the previous run's stream. */
export const rndWorld = () => world();
export const rndDecor = () => decor();
