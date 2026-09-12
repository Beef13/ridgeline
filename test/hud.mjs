/**
 * The distance milestone.
 *
 * It holds solid rather than blinking, so the thing to defend is that it comes
 * on once, stays on, and goes off once. A single stray gap would read as a
 * flicker — the exact effect the hold replaced — and would be invisible in any
 * test that only checked the start and the end.
 */
import { MILESTONE, milestoneOn, starLabel } from '../src/ui/hud.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

/* Sampled at 240Hz, well above any refresh rate, so a single dropped frame of
   visibility cannot hide between samples. */
{
  let edges = 0, prev = false, doneAt = -1, onFor = 0;
  for (let i = 0; i < 240 * 8; i++) {
    const e = i / 240;
    const { show, done } = milestoneOn(e);
    if (show !== prev) edges++;
    if (show) onFor++;
    prev = show;
    if (done && doneAt < 0) doneAt = e;
  }
  check('the milestone comes on once and goes off once', edges === 2,
    `${edges} edges — anything more is a flicker`);
  check('and it holds for three seconds', Math.abs(onFor / 240 - 3) < 0.02,
    `${(onFor / 240).toFixed(2)}s solid`);
  /* It has to be gone before the next one can raise it. At full speed — 17
     units/sec — 100m is about 5.9 seconds, so three is comfortable but it is
     not a number with much left to give away. */
  check('and it is over before the next 100m could arrive', doneAt > 0 && doneAt < 5,
    `done at ${doneAt.toFixed(2)}s`);
  check('and it starts ON, so the first frame after the bell shows it',
    milestoneOn(0).show === true);
  check('and nothing shows before it starts', milestoneOn(-0.01).show === false);
}

/* Peripheral vision is poor at colour and good at size, so the size is the part
   that has to be defended. A third of the buffer's height is 74px; the glyph
   has to be a real fraction of that or it is a caption, not a signal. */
{
  check('the text is big enough to read out of the corner of an eye',
    MILESTONE.size >= 24, `${MILESTONE.size}px on a 224px buffer`);
  /* And it must still FIT. "1000M" at this size has to stay inside 256px or
     the milestone that matters most is the one that runs off both edges. */
  const widest = 'MMMMM'.length * MILESTONE.size * 0.62;
  check('and a five-character distance still fits the screen', widest < 256,
    `${Math.round(widest)}px of 256`);
  /* Transparent, but not so faint the palette snap swallows it. The buffer is
     63 colours deep and everything is dithered, so a wash under about a third
     quantises to the ridge behind it and the flash simply is not there. */
  check('and it is see-through without disappearing',
    MILESTONE.alpha < 1 && MILESTONE.alpha > 0.35, `alpha ${MILESTONE.alpha}`);
}

/* ---------------------------------------------------------------------------
 * The star count.
 *
 * Two digits, always. The width of this field decides where the hearts sit, so
 * a count that is sometimes one glyph and sometimes two makes them jump
 * sideways on the tenth star — small, instant to notice, and reads as the HUD
 * being unstable rather than as a number growing.
 */
{
  check('it starts at 00', starLabel(0) === '00', starLabel(0));
  check('and pads a single digit', starLabel(7) === '07', starLabel(7));
  check('and every count is the same width',
    [0, 5, 9, 10, 42, 99].every((n) => starLabel(n).length === 2));
  /* 99 is the last number there is. The hundredth star is spent on a life in
     the same step it is collected, so 100 never reaches the HUD — and if a
     change ever lets it through, it must not widen the field. */
  check('and 99 is the highest it ever shows', starLabel(99) === '99' && starLabel(100) === '99',
    `100 -> ${starLabel(100)}`);
  check('and nothing nonsensical gets through',
    starLabel(-4) === '00' && starLabel(NaN) === '00' && starLabel(12.9) === '12',
    `${starLabel(-4)} / ${starLabel(NaN)} / ${starLabel(12.9)}`);
}

/* ---------------------------------------------------------------------------
 * Two announcements, one slot.
 *
 * The distance and "NEW BEST" share the same holder, so the sizes have to be
 * related deliberately rather than by whichever was typed last — and the word
 * has to FIT, which the number never had to worry about because it is three
 * characters and this is eight.
 */
{
  check('a personal best is announced smaller than a distance',
    MILESTONE.bestSize < MILESTONE.size,
    `${MILESTONE.bestSize}px vs ${MILESTONE.size}px`);
  /* Not so much smaller that it stops being peripheral — the whole point of
     the size is that it registers without a direct look. */
  check('but not so small it stops carrying', MILESTONE.bestSize >= MILESTONE.size * 0.6,
    `${(MILESTONE.bestSize / MILESTONE.size * 100).toFixed(0)}% of the number`);

  /* Arial Black runs about 0.62em a character. Eight characters at 30px would
     be 149 of a 256-pixel screen and read as a banner rather than a note. */
  const wide = 'NEW BEST'.length * MILESTONE.bestSize * 0.62;
  check('and "NEW BEST" fits the frame with room either side', wide < 256 * 0.6,
    `about ${Math.round(wide)}px of 256`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
