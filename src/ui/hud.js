/**
 * Drawn into the low-res buffer BEFORE the palette pass, so the HUD gets
 * quantised and softened like everything else. A DOM overlay would sit at
 * native resolution and instantly break the illusion.
 */
import * as THREE from 'three';

/* The HUD is drawn into the low-res buffer before the output stage, so these
   are the values the tube pass then lifts by its gain — authored a shade below
   where they should land rather than at full brightness, or the bright one
   clips flat and loses its edge against the shadow. */
const BRIGHT = '#ffd23a';
const DIM    = '#9a7a24';

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

  /**
   * Everything is drawn twice: a hard black offset first, then the fill. At
   * 256x224 over a ridge full of foliage there is no colour that reads on its
   * own, and a soft shadow would be eaten by the tube pass. One solid pixel of
   * offset is what keeps it legible.
   */
  text(s, x, y, colour, align = 'left', size = 8, weight = 'bold') {
    const c = this.ctx;
    c.font = `${weight} ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = align;
    c.textBaseline = 'top';
    const off = size >= 16 ? 2 : 1;
    c.fillStyle = '#0a0d06';
    c.fillText(s, x + off, y + off);
    c.fillStyle = colour;
    c.fillText(s, x, y);
  }

  draw(state, score, best, t) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    /* Two shades, one job each: what you are doing now is bright, what you
       have to beat sits under it dimmer. Same hue, so they read as one block
       rather than two unrelated numbers. */
    this.text(String(Math.floor(score)).padStart(5, '0'), this.w - 5, 5, BRIGHT, 'right', 13);
    this.text('HI ' + String(Math.floor(best)).padStart(5, '0'), this.w - 5, 20, DIM, 'right', 9);

    if (state === 'ready') {
      /* Whole pixels only. The buffer is 256 across, so a fractional offset
         re-antialiases every glyph each frame and reads as a shimmer rather
         than a float. Rounding costs the motion its smoothness and buys back
         the crispness, which at this resolution is the better trade. */
      const bob = Math.round(Math.sin(t * 2.1) * 2);
      this.text('PRESS SPACE TO RUN', this.w / 2, this.h / 2 - 30 + bob, BRIGHT, 'center', 14);
      this.text('SPACE JUMP  \u00B7  DOWN DUCK', this.w / 2, this.h / 2 - 12 + bob, DIM, 'center', 9);
    } else if (state === 'dead') {
      this.text('OUCH', this.w / 2, this.h / 2 - 38, BRIGHT, 'center', 28);
      if (Math.floor(t * 2) % 2 === 0) {
        this.text('SPACE TO RUN AGAIN', this.w / 2, this.h / 2 - 2, BRIGHT, 'center', 12);
      }
    }
    this.tex.needsUpdate = true;
  }
}
