/**
 * The scene's entire colour vocabulary. Everything on screen resolves to one
 * of these, which is what makes disparate art read as a single world.
 *
 * The sky ramp is generated at runtime from the sky gradient, the way a SNES
 * background layer got its own sub-palette — a shared ramp is never fine
 * enough to hold a smooth sky.
 */
export const RAMPS = [
  { name: 'canopy', hex: ['#0b1a12','#102616','#16351d','#1d4425','#25552c','#2f6a33','#3c8239','#4b9b41','#63b74a','#8fd457'] },
  { name: 'undergrowth', hex: ['#04080a','#071410','#0a1e17','#0e2a1e'] },
  { name: 'bark', hex: ['#1c1008','#3a2213','#5a3620','#7d4f2c','#a06a3c','#c08c52','#dcb072'] },
  { name: 'stone', hex: ['#20201e','#33322c','#46443c','#5a574c','#706c5e','#878271','#9e9885','#b6af9a'] },
  { name: 'sky', hex: new Array(24).fill('#3a2a55'), generated: true },
  { name: 'haze', hex: ['#4a5a7a','#5f7089','#748698','#8a9ba7','#a0b0b6','#b8c6c4'] },
  { name: 'highlight', hex: ['#a89050','#d8c078','#f0dca0','#fff2d2'] },
  { name: 'accent', hex: ['#6a2020','#a83636','#33627f','#5aa0b0'] }
];

export const PALETTE = RAMPS.flatMap(r => r.hex);
export const PAL_N = PALETTE.length;

export const SKY_START = (() => {
  let n = 0;
  for (const r of RAMPS) { if (r.generated) return n; n += r.hex.length; }
  return 0;
})();
export const SKY_SLOTS = RAMPS.find(r => r.generated).hex.length;

export const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Mutable working copy — the sky ramp writes into it every time it changes. */
export const PAL_RGB = PALETTE.map(hexToRgb);
