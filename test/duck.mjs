import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.keyboard.press('Space');
await p.waitForTimeout(500);

// Hold duck across a long stretch of uneven terrain and sample every frame.
// Before the fix, `ducking` flickered off on every crest.
await p.keyboard.down('ArrowDown');
const trace = await p.evaluate(() => new Promise(res => {
  const d = window.__dbg, out = { frames: 0, duckDrops: 0, airborne: 0, wasDuck: true };
  const t0 = performance.now();
  const tick = () => {
    const pl = d.player;
    if (d.state() === 'running') {
      out.frames++;
      if (!pl.ducking) out.duckDrops++;
      if (!pl.grounded) out.airborne++;
    }
    if (performance.now() - t0 < 6000) requestAnimationFrame(tick); else res(out);
  };
  requestAnimationFrame(tick);
}));
await p.keyboard.up('ArrowDown');

const pct = (n) => ((n / trace.frames) * 100).toFixed(1) + '%';
console.log(`sampled ${trace.frames} frames holding duck`);
console.log(`  frames not ducking : ${trace.duckDrops}  (${pct(trace.duckDrops)})`);
console.log(`  frames airborne    : ${trace.airborne}  (${pct(trace.airborne)})`);
console.log(trace.duckDrops === 0 ? '  -> duck never dropped out' : '  -> DUCK STILL FLICKERING');

// Six seconds of ducking through obstacles usually ends in a death; get back
// into a live run before testing anything else.
if (await p.evaluate(() => window.__dbg.state()) !== 'running') {
  await p.waitForTimeout(500);
  await p.keyboard.press('Space');
  await p.waitForTimeout(700);
}
// Clear the course so the jump measurements aren't cut short by a death.
await p.evaluate(() => { const o = window.__dbg.obstacles; o.reset(); o.nextX = 1e9; });
console.log('state before jump test:', await p.evaluate(() => window.__dbg.state()), '(course cleared)');

// A jump must beat a held duck. Run it entirely in-page: Playwright queues
// input behind a pending evaluate, so a press sent from Node never lands
// while a sampling promise is open.
const j = await p.evaluate(() => new Promise(async (res) => {
  const d = window.__dbg, pl = d.player;
  const out = { sawJumping: false, duckedWhileJumping: false, duckBack: false };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  key('keydown', 'ArrowDown');
  await new Promise(r => setTimeout(r, 250));
  key('keydown', 'Space'); key('keyup', 'Space');
  const t0 = performance.now();
  while (performance.now() - t0 < 1400) {
    if (pl.jumping) { out.sawJumping = true; if (pl.ducking) out.duckedWhileJumping = true; }
    if (out.sawJumping && pl.grounded && pl.ducking) out.duckBack = true;
    await new Promise(r => requestAnimationFrame(r));
  }
  key('keyup', 'ArrowDown');
  res(out);
}));
console.log('jump while holding duck ->', JSON.stringify(j),
  j.sawJumping && !j.duckedWhileJumping && j.duckBack
    ? '(correct: jump wins, duck resumes on landing)' : '(WRONG)');

// tap vs hold should give visibly different heights
const arc = async (hold) => p.evaluate(async (h) => {
  const d = window.__dbg, pl = d.player;
  while (!pl.grounded) await new Promise(r => requestAnimationFrame(r));
  const y0 = pl.y;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  if (!h) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  let peak = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 1200) {
    peak = Math.max(peak, pl.y - y0);
    await new Promise(r => requestAnimationFrame(r));
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  return +peak.toFixed(2);
}, hold);
const tap = await arc(false), held = await arc(true);
console.log(`tap height ${tap}u  vs  held height ${held}u`,
  held > tap * 1.4 ? '(correct: variable jump height works)' : '(WRONG: cutoff not doing anything)');

console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
