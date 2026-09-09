import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({viewport:{width:1280,height:820}});
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.goto('http://127.0.0.1:8899/',{waitUntil:'load'});
await p.waitForTimeout(2000);
console.log('canvas   :', await p.evaluate(()=>{const c=document.querySelector('canvas'); return c? c.width+'x'+c.height+' css '+c.style.width : 'MISSING';}));
console.log('tuner    :', await p.evaluate(()=>document.querySelectorAll('input[type=range]').length)+' sliders');

// walk + jump, then confirm the player actually moved and landed on terrain
await p.keyboard.down('ArrowRight');
for (let i=0;i<12;i++){ await p.waitForTimeout(160); if(i%4===3) await p.keyboard.press('Space'); }
await p.keyboard.up('ArrowRight');
await p.waitForTimeout(700);
await p.screenshot({ path: '/home/claude/rl-test/game.png' });
console.log('errors   :', errs.join(' | ')||'(none)');
await b.close();
