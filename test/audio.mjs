import { chromium } from 'playwright';

const b = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
});
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(2000);

const audio = () => p.evaluate(() => {
  const els = [...document.querySelectorAll('audio')];
  return {
    count: els.length,
    srcs: [...new Set(els.map(a => a.src.split('/').pop()))],
    playing: els.filter(a => !a.paused).length,
    volumes: els.map(a => +a.volume.toFixed(3)),
    duration: els[0] ? +(els[0].duration || 0).toFixed(1) : 0,
    loopFlag: els.map(a => a.loop),
    target: window.__dbg?.music ? window.__dbg.music.target() : 0
  };
});

const before = await audio();
check('two audio elements created', before.count === 2, JSON.stringify(before.srcs));
check('silent before any input', before.playing === 0);
check('native loop is OFF', before.loopFlag.every(l => l === false), 'we crossfade instead');

await p.keyboard.press('Space');
await p.waitForTimeout(2500);
const started = await audio();
check('starts on the gesture that starts the run', started.playing === 1, JSON.stringify(started.volumes));
check('track decoded', started.duration > 400, started.duration + 's');

// mute
await p.keyboard.press('KeyM');
await p.waitForTimeout(600);
check('M mutes', (await audio()).volumes[0] === 0);
await p.keyboard.press('KeyM');
await p.waitForTimeout(600);
check('M unmutes', (await audio()).volumes[0] > 0);

// the crossfade: jump near the loop point and watch the handover
// Clear the course first: dying mid-blend ducks the music and would look like
// a dip in the crossfade.
await p.evaluate(() => { const o = window.__dbg.obstacles; o.reset(); o.nextX = 1e9; });
await p.evaluate(() => {
  const m = window.__dbg.music;
  const a = m.els[m.cur];               // seek whichever copy is actually playing
  a.currentTime = a.duration - 19;      // just before the crossfade trigger at -18s
});
let sawBoth = false, worst = 99, samples = 0;
for (let i = 0; i < 90; i++) {
  await p.waitForTimeout(200);
  const s = await audio();
  if (s.playing === 2) {
    sawBoth = true;
    // equal-power: the SUM OF SQUARES, not the sum, is what should stay level
    const power = Math.sqrt(s.volumes[0] ** 2 + s.volumes[1] ** 2) / s.target;
    worst = Math.min(worst, power);
    samples++;
  }
  if (sawBoth && s.playing === 1) break;
}
check('crossfade runs (both playing at once)', sawBoth, samples + ' overlapping samples');
check('level never dips during the blend', worst > 0.95, 'quietest point ' + (worst === 99 ? 'n/a' : (worst * 100).toFixed(0) + '% of full'));
const after = await audio();
check('handover completes, one left playing', after.playing === 1, JSON.stringify(after.volumes));
check('never fell silent', after.volumes.some(v => v > 0.1));

console.log(`\n${pass} passed, ${fail} failed`);
console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
