import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

const q = () => p.evaluate(() => {
  const d = window.__dbg, pl = d.player;
  return {
    state: d.state(), x: +pl.x.toFixed(1), y: +pl.y.toFixed(2), vy: +pl.vy.toFixed(1),
    grounded: pl.grounded, ducking: pl.ducking, jumpsLeft: pl.jumpsLeft,
    speed: +pl.speed.toFixed(1), obstacles: d.obstacles.items.length,
    chunks: d.streamer.chunks.size, playChildren: d.roots[1].children.length
  };
});
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + name + (detail ? '  ' + detail : '')); };

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(1200);
check('starts on the ready screen', (await q()).state === 'ready');

await p.keyboard.press('Space');
await p.waitForTimeout(400);
check('space starts the run', (await q()).state === 'running');

// jump
await p.keyboard.down('Space'); await p.waitForTimeout(90);
const air = await q();
check('jump leaves the ground', !air.grounded && air.vy > 0, `vy=${air.vy}`);
// double jump while airborne
const before = (await q()).jumpsLeft;
await p.keyboard.up('Space'); await p.waitForTimeout(60);
await p.keyboard.press('Space'); await p.waitForTimeout(90);
const dbl = await q();
check('double jump consumes the air jump', before === 1 && dbl.jumpsLeft === 0, `${before} -> ${dbl.jumpsLeft}`);
await p.waitForTimeout(900);

// duck
await p.keyboard.down('ArrowDown'); await p.waitForTimeout(400);
check('duck engages on the ground', (await q()).ducking);
await p.keyboard.up('ArrowDown'); await p.waitForTimeout(200);
check('duck releases', !(await q()).ducking);

// speed ramps, world streams, nothing leaks
const a = await q();
await p.waitForTimeout(3500);
const c = await q();
check('speed ramps up', c.speed > a.speed, `${a.speed} -> ${c.speed}`);
check('world advances', c.x > a.x + 2, `x ${a.x} -> ${c.x} (software render is slow; the frame clamp puts the sim in slow motion here)`);
check('chunks stay bounded', c.chunks <= 10, `${c.chunks} chunks`);
check('scene graph stays bounded', c.playChildren < 60, `${c.playChildren} children on play plane`);
check('obstacles keep spawning', c.obstacles >= 3, `${c.obstacles} live`);

// die by standing still into an obstacle, then restart
let died = false;
for (let i = 0; i < 60; i++) { await p.waitForTimeout(200); if ((await q()).state === 'dead') { died = true; break; } }
check('collision ends the run', died);
if (died) {
  await p.waitForTimeout(600);
  await p.keyboard.press('Space');
  await p.waitForTimeout(500);
  const r = await q();
  check('restart resets the run', r.state === 'running' && r.x < 5, `x=${r.x}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
