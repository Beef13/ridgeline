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
const TOUCH = typeof matchMedia === 'function' &&
  matchMedia('(hover: none) and (pointer: coarse)').matches;

const BRIGHT = '#ffd23a';
const DIM    = '#9a7a24';
/* A real bright red. The HUD is composited AFTER the output stage rather than
   multiplied by it — which is why BRIGHT above is already near the top of the
   range — so there is no headroom to leave here and no reason to. */
const HEART  = '#ff3a3a';

/* Where the tally sits, in buffer pixels.
 *
 * Exported because the icon is NOT drawn here. It is a real star mesh parked in
 * front of the camera in the main scene, so that it picks up the same lights,
 * the same material and the same output grade as the ones the player is
 * collecting — a canvas drawing of a star would have to imitate all three by
 * hand and would drift the first time any of them changed. These numbers are
 * what the two halves agree on, so the number sits beside the mesh instead of
 * beside where the mesh used to be. */
export const ICON = { x: 9, y: 11, px: 11 };

/* The distance milestone that flashes with the bell.
 *
 * Size carries it, not colour. The number has to register in peripheral vision
 * while the player's eyes are on the ridge ahead, and the loud way to do that —
 * a bright colour in the middle of the frame — pulls the eyes off the thing
 * they are supposed to be watching and gets you killed. So it is drawn at the
 * dim tone the high score already uses, and made large instead: a 30px glyph on
 * a 224px-tall buffer is read by the edge of the retina, which is poor at
 * colour and good at size and movement.
 *
 * It holds rather than blinks. A blink is read as an alert — it demands a
 * glance to find out what it wants — and this is not one; it is a number the
 * player already knows is coming. Held steady it can be taken in with a flick
 * of attention and ignored, which is the whole point of putting it out of the
 * way in the top third. */
export const MILESTONE = {
  hold:   3.0,      // seconds it stays on screen, solid
  size:   30,
  /* Semi-transparent, and the SHADOW fades with it. The HUD draws every glyph
     twice — a hard black offset, then the fill — so fading only the fill would
     leave a solid black number with a pale ghost sitting on it. Setting the
     alpha on the context instead takes both, which is what "semi transparent
     text" actually means here. */
  alpha:  0.55,
  colour: '#ffffff'
};

/** Is the milestone showing `e` seconds in, and is it finished? */
export function milestoneOn(e) {
  const done = e >= MILESTONE.hold;
  return { show: e >= 0 && !done, done };
}

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
    this.flashText = null;
    this.flashStart = -1;
  }

  /**
   * Announce a distance milestone. Timed from the first frame that DRAWS it
   * rather than from the moment it was called, so the three flashes are always
   * three flashes — a milestone raised during a long frame would otherwise
   * have part of its first blink already behind it.
   */
  flash(label) {
    this.flashText = label;
    this.flashStart = -1;
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

  /**
   * Arrows drawn as triangles, not typed as glyphs. A canvas asks the system
   * for whatever font has the character, so an arrow can silently arrive from
   * a different face at a different weight — or as an empty box. Three points
   * and a fill always look like the same arrow.
   */
  tri(cx, top, size, up, colour) {
    const c = this.ctx;
    const w = size * 1.05, h = size * 0.9;
    const path = (dx, dy, fill) => {
      c.beginPath();
      if (up) { c.moveTo(cx + dx, top + dy); c.lineTo(cx - w / 2 + dx, top + h + dy); c.lineTo(cx + w / 2 + dx, top + h + dy); }
      else { c.moveTo(cx + dx, top + h + dy); c.lineTo(cx - w / 2 + dx, top + dy); c.lineTo(cx + w / 2 + dx, top + dy); }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    };
    path(1, 1, '#0a0d06');
    path(0, 0, colour);
  }

  /** The control legend: an arrow and its word, twice, centred as one block. */
  legend(top, size) {
    /* On a touch device the arrow keys do not exist, and showing them is worse
       than showing nothing — it names two controls the player cannot reach. */
    if (TOUCH) {
      this.text('TAP JUMP  \u00B7  SWIPE DOWN DUCK', this.w / 2, top, DIM, 'center', size);
      return;
    }
    const c = this.ctx;
    c.font = `bold ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    const aw = size * 1.05, gap = 3, pad = 14;
    const wJump = c.measureText('JUMP').width;
    const wDuck = c.measureText('DUCK').width;
    let x = (this.w - (aw * 2 + gap * 2 + wJump + wDuck + pad)) / 2;
    this.tri(x + aw / 2, top + 1, size, true, DIM);
    x += aw + gap;
    this.text('JUMP', x, top, DIM, 'left', size);
    x += wJump + pad;
    this.tri(x + aw / 2, top + 1, size, false, DIM);
    x += aw + gap;
    this.text('DUCK', x, top, DIM, 'left', size);
  }

  /**
   * A heart. Two lobes and a point, drawn with beziers.
   *
   * Not a typed character, for the same reason as the star and the arrows: a
   * canvas asks the system for whatever font has the glyph, and the emoji one
   * arrives in full colour at the wrong size on some machines and as a hollow
   * outline on others. And red here can be an honest bright red — the HUD is
   * composited after the grade, not multiplied by it, which is why the gold
   * next to it is #ffd23a rather than something authored dark.
   */
  heart(cx, cy, s, colour) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx, cy + s * 0.85);
    c.bezierCurveTo(cx - s * 1.45, cy - s * 0.2, cx - s * 0.62, cy - s * 1.2, cx, cy - s * 0.34);
    c.bezierCurveTo(cx + s * 0.62, cy - s * 1.2, cx + s * 1.45, cy - s * 0.2, cx, cy + s * 0.85);
    c.closePath();
    c.fillStyle = colour;
    c.fill();
  }

  /**
   * Stars collected, and lives in hand.
   *
   * The icon is THE collectable, not a picture of one: same five points, same
   * spin, same rate. A static outline next to a number would be a legend
   * explaining what the stars are; a turning one is the thing itself, sitting
   * in the corner, and the player never has to be told they match.
   *
   * Just the digit, no "/100". The denominator never changes, so after the
   * first ten seconds it is four characters of the frame spent restating a
   * rule the player has already learnt — and the count resets to zero when it
   * buys a life, which says where the ceiling is without printing it.
   *
   * Lives are hearts, drawn one per life. A shape is read at a glance where
   * "x2" is a glance plus a read, and this is exactly the thing a player needs
   * to know without looking away from the ridge.
   */
  tally(stars, lives) {
    /* No star drawn here — the mesh in the scene shows through. This canvas is
       composited over the graded frame, so anything painted on this spot would
       simply cover it. */
    const c = this.ctx;
    const label = String(stars);
    const left = ICON.x + ICON.px / 2 + 3;
    this.text(label, left, ICON.y - 6, BRIGHT, 'left', 11);

    c.font = 'bold 11px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    let hx = left + c.measureText(label).width + 8;
    for (let i = 0; i < Math.min(lives, 6); i++) {
      this.heart(hx + 1, ICON.y + 1, 4, '#0a0d06');
      this.heart(hx, ICON.y, 4, HEART);
      hx += 11;
    }
  }

  draw(state, score, best, t, stars = 0, lives = 0) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    /* Distance only. The high score used to sit under it, and it was the wrong
       thing to carry inside the frame: it never changes during a run, so it is
       nine pixels of screen spent on a number the player cannot affect until
       they are dead. It lives on the cabinet outside the screen now, which is
       where an arcade machine put it anyway.

       Lower-case m, because at 13px a capital M is nearly as wide as a digit
       and the eye reads "100M" as five characters rather than a number with a
       unit on it. */
    this.text(String(Math.floor(score)) + 'm', this.w - 5, 5, BRIGHT, 'right', 13);
    if (state !== 'ready') this.tally(stars, lives);

    /* Centred in the top third — clear of the runner and of the ridge line the
       player is reading, and clear of the score in the corner. Dropped the
       instant the run ends, so it can never sit under the OUCH screen. */
    if (this.flashText && state !== 'running') this.flashText = null;
    if (this.flashText) {
      if (this.flashStart < 0) this.flashStart = t;
      const { show, done } = milestoneOn(t - this.flashStart);
      if (done) this.flashText = null;
      else if (show) {
        c.globalAlpha = MILESTONE.alpha;
        this.text(this.flashText, Math.round(this.w / 2),
          Math.round(this.h / 6 - MILESTONE.size / 2), MILESTONE.colour, 'center', MILESTONE.size);
        c.globalAlpha = 1;
      }
    }

    if (state === 'ready') {
      /* Whole pixels only. The buffer is 256 across, so a fractional offset
         re-antialiases every glyph each frame and reads as a shimmer rather
         than a float. Rounding costs the motion its smoothness and buys back
         the crispness, which at this resolution is the better trade. */
      const bob = Math.round(Math.sin(t * 2.1) * 2);
      this.text(TOUCH ? 'TAP TO RUN' : 'PRESS UP TO RUN', this.w / 2, this.h / 2 - 30 + bob, BRIGHT, 'center', 14);
      this.legend(this.h / 2 - 11 + bob, 9);
    } else if (state === 'dead') {
      this.text('OUCH', this.w / 2, this.h / 2 - 38, BRIGHT, 'center', 28);
      if (Math.floor(t * 2) % 2 === 0) {
        this.text(TOUCH ? 'TAP TO RUN AGAIN' : 'PRESS UP TO RUN AGAIN', this.w / 2, this.h / 2 - 2, BRIGHT, 'center', 12);
      }
    }
    this.tex.needsUpdate = true;
  }
}
