/**
 * Scattered art must land on the layer it was assigned, and the vista layer
 * must ride with the camera. A still frame cannot tell you either of those —
 * the tell is what happens when the camera moves.
 */
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.keyboard.press('Space');
await p.waitForTimeout(2500);

const count = () => p.evaluate(() => {
  const d = window.__dbg, out = { byLayer: {}, vista: 0 };
  d.roots.forEach((r, i) => {
    let n = 0; r.traverse(o => { if (o.userData.scattered) n++; });
    if (n) out.byLayer[i] = n;
  });
  d.scene.children.forEach(c => { if (c.isGroup && c.children.some(k => k.userData.scattered)) out.vista += c.children.length; });
  return out;
});
const c0 = await count();
check('sown on the play plane', (c0.byLayer[1] || 0) > 0, `${c0.byLayer[1] || 0} instances`);
check('sown on the far layer too', (c0.byLayer[3] || 0) > 0, `${c0.byLayer[3] || 0} instances`);
check('and a camera-locked band exists', c0.vista > 0, `${c0.vista} instances`);

// depth: the far-layer instances must sit at that layer's z, not the play plane's
const depths = await p.evaluate(() => {
  const d = window.__dbg, out = {};
  d.roots.forEach((r, i) => {
    const zs = []; r.traverse(o => { if (o.userData.scattered) zs.push(o.getWorldPosition(new (o.position.constructor)()).z); });
    if (zs.length) out[i] = [Math.min(...zs).toFixed(1), Math.max(...zs).toFixed(1)];
  });
  return out;
});
check('far-layer art really is further back',
  parseFloat(depths[3][1]) < parseFloat(depths[1][0]),
  `play ${depths[1].join('..')}  vs  far ${depths[3].join('..')}`);

// the tell: run, and watch what each layer does relative to the camera
const before = await p.evaluate(() => {
  const d = window.__dbg;
  const g = d.scene.children.find(c => c.isGroup && c.children.some(k => k.userData.scattered));
  return { cam: d.camera.position.x, band: g.position.x };
});
await p.waitForTimeout(3000);
const after = await p.evaluate(() => {
  const d = window.__dbg;
  const g = d.scene.children.find(c => c.isGroup && c.children.some(k => k.userData.scattered));
  return { cam: d.camera.position.x, band: g.position.x };
});
const camMoved = after.cam - before.cam, bandMoved = after.band - before.band;
check('the camera actually moved', camMoved > 5, `${camMoved.toFixed(1)}u`);
check('the vista band follows but lags', bandMoved > 0 && bandMoved < camMoved,
  `camera ${camMoved.toFixed(1)}u, band ${bandMoved.toFixed(1)}u`);
check('it has not been left behind', Math.abs(bandMoved / camMoved - 1) < 0.35,
  `lag ratio ${(bandMoved / camMoved).toFixed(3)}`);

// chunks keep churning; nothing should leak
const n1 = await count();
await p.waitForTimeout(4000);
const n2 = await count();
check('instance counts stay bounded as it streams',
  Math.abs((n2.byLayer[1] || 0) - (n1.byLayer[1] || 0)) < (n1.byLayer[1] || 1) * 0.6,
  `${n1.byLayer[1]} -> ${n2.byLayer[1]}`);

await p.keyboard.press('Backquote'); await p.keyboard.press('Digit1');
await p.waitForTimeout(600);
await p.screenshot({ path: 'layers.png', clip: (await p.locator('canvas').boundingBox()) });
console.log(`\n${pass} passed, ${fail} failed`);
console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
process.exit(fail ? 1 : 0);
