/**
 * Drawn into the low-res buffer BEFORE the palette pass, so the HUD gets
 * quantised and softened like everything else. A DOM overlay would sit at
 * native resolution and instantly break the illusion.
 */
import * as THREE from 'three';

export class Hud {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;

    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false })
    ));
    this.blink = 0;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
  }

  text(s, x, y, colour, align = 'left') {
    const c = this.ctx;
    c.font = '8px "Courier New", monospace';
    c.textAlign = align;
    c.textBaseline = 'top';
    c.fillStyle = '#04080a';
    c.fillText(s, x + 1, y + 1);       // hard drop shadow keeps it legible on any ground
    c.fillStyle = colour;
    c.fillText(s, x, y);
  }

  draw(state, score, best, t) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    this.text(String(Math.floor(score)).padStart(5, '0'), this.w - 6, 6, '#f0dca0', 'right');
    if (best > 0) this.text('HI ' + String(Math.floor(best)).padStart(5, '0'), this.w - 6, 16, '#878271', 'right');

    if (state === 'ready') {
      this.text('PRESS SPACE TO RUN', this.w / 2, this.h / 2 - 26, '#f0dca0', 'center');
      this.text('SPACE JUMP  \u00B7  DOWN DUCK', this.w / 2, this.h / 2 - 14, '#878271', 'center');
    } else if (state === 'dead') {
      this.text('DOWN THE CLIFF', this.w / 2, this.h / 2 - 30, '#dcb072', 'center');
      if (Math.floor(t * 2) % 2 === 0) {
        this.text('SPACE TO RUN AGAIN', this.w / 2, this.h / 2 - 16, '#f0dca0', 'center');
      }
    }
    this.tex.needsUpdate = true;
  }
}
