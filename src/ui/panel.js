/**
 * Live sliders over the game. Feel and look are both found by dragging, not by
 * editing a file and reloading — you lose the comparison in the reload.
 */
function row(obj, key, min, max, step, onChange) {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-bottom:6px';
  const lab = document.createElement('div');
  lab.style.cssText = 'display:flex;justify-content:space-between';
  lab.innerHTML = `<span>${key}</span><b style="color:#dcb072;font-weight:400"></b>`;
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = obj[key];
  inp.style.cssText = 'width:100%;accent-color:#8fd457';
  const show = () => { lab.querySelector('b').textContent = (+obj[key]).toFixed(step < 0.05 ? 3 : 2); };
  inp.addEventListener('input', () => { obj[key] = parseFloat(inp.value); show(); onChange && onChange(key, obj[key]); });
  show();
  d.append(lab, inp);
  return d;
}

export function mountPanel({ title, side = 'right', groups, hotkey, onChange, extraButtons = [] }) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:12px; ${side}:12px; width:250px; max-height:calc(100vh - 24px);
    overflow:auto; z-index:50; background:#0e1512ee; border:1px solid #22302a;
    color:#c4d4c9; font:11px/1.5 ui-monospace,Menlo,Consolas,monospace; padding:10px 12px 12px;`;
  el.innerHTML = `<div style="color:#8fd457;letter-spacing:.14em;margin-bottom:8px">${title}
    <span style="color:#4c5f56">${hotkey} to hide</span></div>`;

  for (const [group, obj, keys] of groups) {
    const h = document.createElement('div');
    h.textContent = group.toUpperCase();
    h.style.cssText = 'color:#71877c;letter-spacing:.12em;margin:10px 0 5px';
    el.append(h);
    for (const [k, a, b, c] of keys) el.append(row(obj, k, a, b, c, onChange));
  }

  for (const [label, fn] of extraButtons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'width:100%;margin-top:6px;padding:7px;background:#1d3a1e;color:#8fd457;border:1px solid #3d6b31;cursor:pointer;font:inherit';
    btn.onclick = () => fn(btn);
    el.append(btn);
  }

  document.body.append(el);
  addEventListener('keydown', (e) => {
    if (e.code === hotkeyCode(hotkey)) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  });
  return el;
}

const hotkeyCode = (k) => (k === '`' ? 'Backquote' : 'Digit1');

export function copyBlock(name, obj, btn) {
  const txt = `export const ${name} = ` + JSON.stringify(obj, null, 2) + ';';
  const done = (msg) => { const o = btn.textContent; btn.textContent = msg; setTimeout(() => btn.textContent = o, 1800); };
  navigator.clipboard?.writeText(txt).then(() => done('COPIED'), () => { console.log(txt); done('LOGGED TO CONSOLE'); });
}
