import * as THREE from 'three';
import { SRGB } from '../core/colour.js';
import { PAL_RGB, SKY_START, SKY_SLOTS } from '../render/palette.js';
import { design } from '../design.js';

/** Parallax planes, front to back. Depth is a property of the layer, not the art. */
export const LAYERS = [
  { name: 'foreground', z: 7.5,   tint: 0.06, cold: 0.00 },
  { name: 'play',       z: 0.0,   tint: 1.00, cold: 0.00 },
  { name: 'mid',        z: -7.0,  tint: 0.74, cold: 0.10 },
  { name: 'far',        z: -18.0, tint: 0.50, cold: 0.22 },
  { name: 'canopy',     z: -38.0, tint: 0.32, cold: 0.34 }
];

// Layer tints and visibility come straight from the bench export.
design.atmos.tints.forEach((t, i) => { if (LAYERS[i]) LAYERS[i].tint = t; });

export const SKY_Z = -170;

export function buildSkyTexture(stops, steps = 24) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  for (const s of [...stops].sort((a, b) => a.p - b.p)) g.addColorStop(Math.min(1, Math.max(0, s.p)), s.c);
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);

  // Hand the gradient its own slice of the palette, the way a SNES background
  // layer got a sub-palette. A shared ramp is never fine enough for a sky —
  // that is why skies band, not the dithering.
  const col = x.getImageData(4, 0, 1, c.height).data;
  for (let i = 0; i < SKY_SLOTS; i++) {
    const band = Math.min(steps - 1, Math.floor(i * steps / SKY_SLOTS));
    const y = Math.min(c.height - 1, Math.floor(((band + 0.5) / steps) * c.height));
    PAL_RGB[SKY_START + i] = [col[y * 4], col[y * 4 + 1], col[y * 4 + 2]];
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export function buildWorld() {
  const scene = new THREE.Scene();
  const roots = LAYERS.map(() => { const g = new THREE.Group(); scene.add(g); return g; });

  scene.add(new THREE.AmbientLight(SRGB('#1a4527'), 0.55));
  const key = new THREE.DirectionalLight(SRGB('#fff2d2'), 1.35); key.position.set(-3.2, 5.5, 4.0); scene.add(key);
  const rim = new THREE.DirectionalLight(SRGB('#5aa0b0'), 0.55); rim.position.set(4.0, 1.5, -3.5); scene.add(rim);
  const bounce = new THREE.DirectionalLight(SRGB('#46983f'), 0.30); bounce.position.set(0, -3, 1); scene.add(bounce);
  // Vertical rock faces point straight at the camera and would otherwise sit on ambient alone.
  const faceFill = new THREE.DirectionalLight(SRGB('#dcb072'), 0.42); faceFill.position.set(1.2, 1.6, 6); scene.add(faceFill);

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: buildSkyTexture(design.sky.stops, design.sky.steps),
      depthWrite: true, fog: false
    })
  );
  sky.position.z = SKY_Z;
  sky.renderOrder = -30;
  scene.add(sky);

  design.atmos.visible.forEach((v, i) => { if (roots[i]) roots[i].visible = v; });

  /**
   * Adding or removing scene.fog changes the shader every material compiles,
   * so they all have to be flagged. Colour and distance changes after that are
   * free. The sky is never fogged — it is the colour the fog fades toward, so
   * hazing it would be circular.
   */
  const setFog = (on, near, far) => {
    const wasOn = !!scene.fog;
    scene.fog = on ? new THREE.Fog(SRGB(design.atmos.fog.hex), near, far) : null;
    sky.material.fog = false;
    if (wasOn !== on) {
      scene.traverse((o) => {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m) m.needsUpdate = true; });
      });
    }
  };

  // Depth cue is applied by the streamer as it builds each chunk's art —
  // doing it here would run against empty layer roots and silently do nothing.
  return { scene, roots, sky, setFog };
}
