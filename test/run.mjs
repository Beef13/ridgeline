import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(1800);
await p.screenshot({ path: 'r-ready.png' });
console.log('canvas:', await p.evaluate(() => { const c = document.querySelector('canvas'); return c.width + 'x' + c.height; }));

await p.keyboard.press('Space');
await p.waitForTimeout(3000);
await p.screenshot({ path: 'r-run.png' });

// play badly on purpose — never jump — and confirm the run ends
await p.waitForTimeout(9000);
await p.screenshot({ path: 'r-dead.png' });

console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
