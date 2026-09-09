import * as THREE from 'three';
import { PAL_RGB } from './palette.js';

/**
 * The bench's palette fitter, reproduced exactly, so an image looks in the
 * game precisely as it looked when it was approved.
 *
 * Two-tone dithering: find the two palette colours a pixel sits between and
 * checkerboard them in proportion. Nudging a colour then snapping — the
 * obvious approach — can only reach across gaps smaller than the nudge, which
 * is why skies band under it.
 */
const BAYER8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
];

function nearestTwo(r, g, b) {
  let i1 = 0, i2 = 1, d1 = Infinity, d2 = Infinity;
  for (let i = 0; i < PAL_RGB.length; i++) {
    const p = PAL_RGB[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  return [PAL_RGB[i1], PAL_RGB[i2]];
}

/**
 * @param targetW 0 keeps the source resolution — matching the bench's
 *                "original size". Authoring near the on-screen size is better,
 *                because the palette pass cannot fix undersampling.
 */
export function fitImage(img, targetW, quant, dither) {
  const w = targetW > 0 ? targetW : img.naturalWidth;
  const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  if (!quant && dither <= 0) return c;

  const id = x.getImageData(0, 0, w, h);
  const d = id.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (d[i + 3] < 8) continue;
      const b01 = BAYER8[(py % 8) * 8 + (px % 8)] / 64;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      if (quant) {
        const [c1, c2] = nearestTwo(r, g, bl);
        const sx = c2[0] - c1[0], sy = c2[1] - c1[1], sz = c2[2] - c1[2];
        const len2 = Math.max(sx * sx + sy * sy + sz * sz, 1e-6);
        let t = ((r - c1[0]) * sx + (g - c1[1]) * sy + (bl - c1[2]) * sz) / len2;
        t = (t < 0 ? 0 : t > 1 ? 1 : t) * dither;
        const p = b01 < t ? c2 : c1;
        d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
      } else {
        const off = (b01 - 0.5) * dither * 40;
        d[i] = Math.max(0, Math.min(255, r + off));
        d[i + 1] = Math.max(0, Math.min(255, g + off));
        d[i + 2] = Math.max(0, Math.min(255, bl + off));
      }
      d[i + 3] = d[i + 3] < 128 ? 0 : 255;   // hard alpha, like a sprite
    }
  }
  x.putImageData(id, 0, 0);
  return c;
}

export function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

export function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('could not load ' + url));
    img.src = url;
  });
}
