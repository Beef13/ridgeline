import * as THREE from 'three';

/**
 * Art drawn on a canvas with the shading baked in, then treated as flat
 * texture. That is the Rare pipeline in miniature: the lighting decision is
 * made once, at authoring time, instead of being recomputed per frame — which
 * is exactly why pre-rendered sprites hold together at this resolution when
 * real-time lit geometry does not.
 */
function tex(size, draw) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/** A split frond, the shape that reads as jungle faster than anything else. */
export const frondTexture = () => tex(256, (x, S) => {
  const g = x.createLinearGradient(S * 0.05, S * 0.95, S * 0.9, S * 0.1);
  g.addColorStop(0.00, '#0b1a12'); g.addColorStop(0.30, '#1a4527');
  g.addColorStop(0.62, '#327a36'); g.addColorStop(0.86, '#63b74a');
  g.addColorStop(1.00, '#8fd457');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(S * 0.06, S * 0.95);
  x.bezierCurveTo(S * -0.02, S * 0.44, S * 0.34, S * 0.01, S * 0.92, S * 0.07);
  x.bezierCurveTo(S * 1.00, S * 0.58, S * 0.58, S * 0.99, S * 0.06, S * 0.95);
  x.closePath(); x.fill();

  const ax = S * 0.06, ay = S * 0.95, bx = S * 0.92, by = S * 0.07;
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  x.globalCompositeOperation = 'destination-out';
  for (let i = 1; i <= 5; i++) {
    const t = i / 6, px = ax + dx * t, py = ay + dy * t;
    for (const s of [1, -1]) {
      const nx = -uy * s, ny = ux * s, wdt = S * 0.028;
      x.beginPath();
      x.moveTo(px + nx * S * 0.6, py + ny * S * 0.6);
      x.lineTo(px + ux * wdt, py + uy * wdt);
      x.lineTo(px - ux * wdt, py - uy * wdt);
      x.closePath(); x.fill();
    }
  }
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = 'rgba(143,212,87,0.45)'; x.lineWidth = S * 0.014;
  x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
  x.strokeStyle = 'rgba(240,220,160,0.30)'; x.lineWidth = S * 0.02;
  x.beginPath(); x.moveTo(S * 0.30, S * 0.30);
  x.quadraticCurveTo(S * 0.60, S * 0.18, S * 0.84, S * 0.16); x.stroke();
});

/** Grass blades radiating from a point. */
export const bladeTexture = () => tex(256, (x, S) => {
  const cx = S * 0.5, cy = S * 0.98;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.5 + (i - 4) * 0.2 + Math.sin(i * 3.1) * 0.04;
    const L = S * (0.62 + (i % 3) * 0.14), wdt = S * 0.045, lit = i % 3;
    const g = x.createLinearGradient(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    g.addColorStop(0, '#0b1a12');
    g.addColorStop(0.55, lit === 0 ? '#245c2e' : (lit === 1 ? '#327a36' : '#1a4527'));
    g.addColorStop(1, lit === 0 ? '#63b74a' : (lit === 1 ? '#8fd457' : '#46983f'));
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - Math.sin(a) * wdt, cy + Math.cos(a) * wdt);
    x.quadraticCurveTo(cx + Math.cos(a) * L * 0.5 - Math.sin(a) * wdt * 1.4,
                       cy + Math.sin(a) * L * 0.5 + Math.cos(a) * wdt * 1.4,
                       cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    x.quadraticCurveTo(cx + Math.cos(a) * L * 0.5 + Math.sin(a) * wdt * 1.4,
                       cy + Math.sin(a) * L * 0.5 - Math.cos(a) * wdt * 1.4,
                       cx + Math.sin(a) * wdt, cy - Math.cos(a) * wdt);
    x.closePath(); x.fill();
  }
});

/**
 * A jungle tree: a trunk with stacked frond tiers. Cones read as geometry at
 * this size; an irregular silhouette reads as a tree.
 */
export const treeTexture = (dark = false) => tex(256, (x, S) => {
  const trunk = dark ? '#071410' : '#1c1008';
  const c1 = dark ? '#0a1e17' : '#16351d';
  const c2 = dark ? '#0e2a1e' : '#25552c';
  const c3 = dark ? '#123020' : '#3c8239';

  x.strokeStyle = trunk;
  x.lineWidth = S * 0.045;
  x.beginPath();
  x.moveTo(S * 0.5, S);
  x.quadraticCurveTo(S * 0.46, S * 0.62, S * 0.5, S * 0.34);
  x.stroke();

  const tier = (cy, r, col) => {
    x.fillStyle = col;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + cy;
      const px = S * 0.5 + Math.cos(a) * r * 0.62;
      const py = cy + Math.sin(a) * r * 0.3;
      x.beginPath();
      x.ellipse(px, py, r * (0.42 + (i % 3) * 0.1), r * 0.3, a * 0.6, 0, Math.PI * 2);
      x.fill();
    }
  };
  tier(S * 0.62, S * 0.30, c1);
  tier(S * 0.46, S * 0.32, c2);
  tier(S * 0.30, S * 0.26, c3);
  tier(S * 0.18, S * 0.18, c2);
});

/**
 * A distant ridge as a cut-out: opaque rock below a jagged skyline, fully
 * transparent above it. The sky shows through, so bands can be stacked.
 */
export const ridgeTexture = (seed, roughness, colour, height = 0.55) => tex(512, (x, S) => {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  x.clearRect(0, 0, S, S);
  x.fillStyle = colour;
  x.beginPath();
  x.moveTo(0, S);
  let y = S * (1 - height);
  for (let px = 0; px <= S; px += 8) {
    y += (rnd() - 0.5) * roughness * S;
    y = Math.max(S * (1 - height) - S * 0.16, Math.min(S * 0.96, y));
    x.lineTo(px, y);
  }
  x.lineTo(S, S);
  x.closePath();
  x.fill();
});
