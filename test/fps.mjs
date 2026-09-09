import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({viewport:{width:1000,height:760}});
await p.goto('http://127.0.0.1:8899/',{waitUntil:'load'});
await p.waitForTimeout(1200);
const fps = await p.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(+(n / ((performance.now()-t0)/1000)).toFixed(1)); };
  requestAnimationFrame(tick);
}));
console.log('headless software-render fps:', fps);
console.log('(the simulation clamps each frame to 0.1s, so below ~10fps the game');
console.log(' runs in slow motion by design — that is the spiral-of-death guard)');
await b.close();
