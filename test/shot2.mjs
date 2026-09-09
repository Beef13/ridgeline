import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1500, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8899/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
await p.keyboard.press('Space');
await p.waitForTimeout(4000);

// report what the design actually resolved to inside the engine
console.log(JSON.stringify(await p.evaluate(() => {
  const d = window.__dbg;
  const u = d.pipeline.quantMat.uniforms, t = d.pipeline.tubeMat.uniforms;
  return {
    internal: d.pipeline.width + 'x' + d.pipeline.height,
    quantise: u.uQuant.value, ditherMode: u.uMode.value,
    exposure: +u.uExposure.value.toFixed(2), sat: +u.uSat.value.toFixed(2),
    crtOn: t.uOn.value, beam: t.uSoft.value, mask: t.uMask.value, gain: t.uGain.value,
    fog: d.scene.fog ? { near: d.scene.fog.near, far: d.scene.fog.far, col: d.scene.fog.color.getHexString() } : null,
    layersVisible: d.roots.map(r => r.visible),
    vistaMaster: d.vistas.master, vistaHorizon: d.vistas.horizon,
    fov: +d.camera.fov.toFixed(0)
  };
}), null, 1));

// hide the panels for a clean frame
await p.keyboard.press('Backquote');
await p.keyboard.press('Digit1');
await p.waitForTimeout(700);
const box = await p.locator('canvas').boundingBox();
await p.screenshot({ path: 'design.png', clip: box });

console.log('errors:', errs.join(' | ') || '(none)');
await b.close();
