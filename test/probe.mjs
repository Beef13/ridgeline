import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({viewport:{width:1200,height:820}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8899/',{waitUntil:'load'});
await p.waitForTimeout(1200);
await p.keyboard.press('Space');
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const d = window.__dbg;
  return {
    state: d.state(),
    playerX: +d.player.x.toFixed(1),
    playerY: +d.player.y.toFixed(2),
    camX: +d.camera.position.x.toFixed(1),
    chunks: [...d.streamer.chunks.keys()].sort((a,b)=>a-b),
    obstacles: d.obstacles.items.map(i=>i.name+'@'+i.x.toFixed(0)),
    playChildren: d.roots[1].children.length
  };
}), null, 1));
console.log('errors:', errs.join(' | ')||'(none)');
await b.close();
