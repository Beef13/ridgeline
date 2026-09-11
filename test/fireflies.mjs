/**
 * Fireflies.
 *
 * Two things can go wrong here in ways that only show up as "something looks
 * odd" rather than as a crash: the flash envelope can be on too much of the
 * time, which turns insects into fairy lights, and the wrap can be smooth,
 * which sends a mote visibly flying backwards across the screen. Both are
 * arithmetic, so both can be measured rather than eyeballed.
 */
import { pulse, wrapX } from '../src/world/fireflies.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* ---- the flash ---- */
{
  const N = 4000, T = 40;
  let lit = 0, peak = 0;
  for (let i = 0; i < N; i++) {
    const p = pulse((i / N) * T, 0.7, 1.0);
    if (p > 0.15) lit++;
    peak = Math.max(peak, p);
  }
  const duty = lit / N;
  /* A sine over the same threshold would sit near 45%. Anything close to that
     is a fairy light: the point of the power curve is that a mote is DARK most
     of the time, so a dozen of them never read as a row of bulbs. */
  check('a firefly is dark most of the time', duty > 0.05 && duty < 0.22,
    `lit ${(duty * 100).toFixed(0)}% of the time`);
  check('and still reaches full brightness', peak > 0.98, peak.toFixed(3));
  check('and never goes negative', pulse(4.5, 0, 1) >= 0 && pulse(-1.2, 0, 1) >= 0);

  /* Different rates, or the swarm slides into unison and starts blinking
     together — which is the one thing real fireflies famously do and this
     resolution cannot sell. */
  const a = [], b = [];
  for (let i = 0; i < 600; i++) {
    a.push(pulse(i / 60, 0.0, 0.9) > 0.15);
    b.push(pulse(i / 60, 0.0, 1.4) > 0.15);
  }
  const together = a.filter((v, i) => v && b[i]).length;
  const either = a.filter((v, i) => v || b[i]).length;
  check('and two motes on different rates do not blink in unison',
    together / either < 0.5, `${((together / either) * 100).toFixed(0)}% overlap`);
}

/* ---- the wrap ---- */
{
  const SPAN = 10;
  check('a mote well behind the camera is thrown a whole span forward',
    wrapX(-9, 0, SPAN) === 1, `${wrapX(-9, 0, SPAN)}`);
  check('and one well ahead is thrown back', wrapX(9, 0, SPAN) === -1,
    `${wrapX(9, 0, SPAN)}`);
  check('and one already inside the band is left exactly alone',
    wrapX(2.5, 0, SPAN) === 2.5);

  /* The property that matters: however far the camera has travelled, a mote
     ends up within half a span of it. A wrap that only handles one span at a
     time leaves motes stranded off screen after a fast run. */
  let worst = 0;
  for (let camX = 0; camX < 5000; camX += 37.3) {
    const d = Math.abs(wrapX(4.2, camX, SPAN) - camX);
    worst = Math.max(worst, d);
  }
  check('and no camera position leaves one outside the band', worst <= SPAN / 2 + 1e-9,
    `worst ${worst.toFixed(2)} of ${SPAN / 2}`);

  /* It must move in WHOLE spans. Landing anywhere else means the mote has been
     nudged rather than teleported, and a nudge is visible. */
  const offsets = [-23.7, -4.1, 0, 3.3, 51.9].map((x) => (wrapX(x, 0, SPAN) - x) / SPAN);
  check('and always by a whole number of spans',
    offsets.every((o) => Math.abs(o - Math.round(o)) < 1e-9), offsets.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
