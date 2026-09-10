import * as THREE from 'three';
import { PAL_RGB, PAL_N } from './palette.js';
import { fullscreenVert, quantiseFrag, tubeFrag } from './shaders.js';

const QUAD = new THREE.PlaneGeometry(2, 2);

/**
 * Renders the scene at a fixed internal resolution, snaps it to the palette,
 * then runs it through the tube. The canvas is always an exact whole-number
 * multiple of the internal size — never a fractional scale, or the pixel grid
 * stops being a grid.
 */
export class Pipeline {
  constructor(renderer, { width = 256, height = 224 } = {}) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.scale = 1;

    const rtOpts = { format: THREE.RGBAFormat, stencilBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(width, height, {
      ...rtOpts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true
    });
    this.rtPal = new THREE.WebGLRenderTarget(width, height, {
      ...rtOpts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false
    });

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.quantMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rtScene.texture },
        uRes: { value: new THREE.Vector2(width, height) },
        uQuant: { value: 1 }, uDither: { value: 1 }, uMode: { value: 2 }, uPair: { value: 0.42 },
        uExposure: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 1 },
        uPal: { value: PAL_RGB.map(c => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255)) }
      },
      vertexShader: fullscreenVert,
      fragmentShader: quantiseFrag(PAL_N),
      depthTest: false, depthWrite: false
    });

    this.tubeMat = new THREE.ShaderMaterial({
      uniforms: {
        tPal: { value: this.rtPal.texture },
        uRes: { value: new THREE.Vector2(width, height) },
        uOn: { value: 0 }, uSoft: { value: 0.4 }, uScan: { value: 0.22 },
        uMask: { value: 0.1 }, uGlow: { value: 0.3 }, uCurve: { value: 0 },
        uVign: { value: 0.18 }, uGain: { value: 1.08 }, uRadius: { value: 0 }
      },
      vertexShader: fullscreenVert,
      fragmentShader: tubeFrag,
      depthTest: false, depthWrite: false
    });

    this.quantScene = new THREE.Scene().add(new THREE.Mesh(QUAD, this.quantMat));
    this.tubeScene = new THREE.Scene().add(new THREE.Mesh(QUAD, this.tubeMat));
  }

  get unitsPerPixel() { return this.viewHeight / this.height; }

  setInternalSize(w, h) {
    this.width = w; this.height = h;
    this.rtScene.setSize(w, h);
    this.rtPal.setSize(w, h);
    this.quantMat.uniforms.uRes.value.set(w, h);
    this.tubeMat.uniforms.uRes.value.set(w, h);
  }

  /** Fit to the container at a whole-number scale, and report it. */
  /**
   * Corner fillet, as a fraction of the shorter side of the PICTURE.
   *
   * Cut in the tube pass rather than clipped off the canvas element. Clipping
   * the element rounded the canvas rectangle — but the picture is barrel-bent
   * and sits inside that rectangle, so the corner being rounded belonged to a
   * black frame around the tube rather than to the tube itself.
   */
  setCornerRadius(frac) {
    this.corner = Math.max(0, Math.min(0.5, frac || 0));
    this.tubeMat.uniforms.uRadius.value = this.corner;
  }

  /**
   * Light spill around the tube.
   *
   * A real CRT throws its picture onto the wall behind it, so the glow has to
   * follow what is on screen — a fixed colour reads as a sticker, not as light.
   * The frame's average is taken by drawing the canvas into a 1x1 context,
   * which makes the BROWSER do the box filter on the GPU; reading the pixels
   * back out of WebGL ourselves would stall the pipeline every time.
   *
   * Sampled every sixth frame and eased toward, not snapped. At full rate it
   * costs more than it is worth, and a hard cut makes the wall flicker on
   * every jump between sky and undergrowth.
   */
  setGlow(amount) {
    this.glow = Math.max(0, Math.min(1, amount || 0));
    this.applyGlow();
  }

  sampleGlow() {
    if (!this.glow) return;
    this._gframe = (this._gframe | 0) + 1;
    if (this._gframe % 6) return;
    if (!this._gctx) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      this._gctx = c.getContext('2d', { willReadFrequently: true });
    }
    try {
      this._gctx.clearRect(0, 0, 1, 1);
      this._gctx.drawImage(this.renderer.domElement, 0, 0, 1, 1);
      const d = this._gctx.getImageData(0, 0, 1, 1).data;
      /* The canvas is transparent outside the glass, so averaging it to one
         pixel drags the colour toward nothing. Divide the mean back out by the
         mean coverage to get the colour of the LIT part alone. */
      const cov = d[3] / 255;
      if (cov < 0.05) return;
      const now = [0, 1, 2].map((i) => Math.min(255, d[i] / cov));
      const prev = this.glowRGB || now;
      this.glowRGB = [0, 1, 2].map((i) => Math.round(prev[i] + (now[i] - prev[i]) * 0.22));
      this.applyGlow();
    } catch (e) { /* unreadable this frame; keep the colour we had */ }
  }

  applyGlow() {
    const el = this.renderer.domElement;
    el.style.boxShadow = 'none';
    if (!this.glow) { el.style.filter = 'none'; return; }
    const c = this.glowRGB || [110, 130, 110];
    // lifted, because the frame average is always duller than the light a tube
    // actually throws — and clamped, or a bright sky blows the wall out
    const lift = (v) => Math.min(255, Math.round(v * 1.45 + 12));
    const rgb = `${lift(c[0])}, ${lift(c[1])}, ${lift(c[2])}`;
    /* drop-shadow, not box-shadow: box-shadow traces the element's RECTANGLE,
       and the element is now mostly transparent with a curved tube in the
       middle of it. drop-shadow traces the alpha, so the light follows the
       glass. Two of them — a tight core and a wide halo — because a single
       blur either hugs too close or washes out. */
    const near = Math.round(4 + 26 * this.glow);
    const far = Math.round(14 + 90 * this.glow);
    el.style.filter =
      `drop-shadow(0 0 ${near}px rgba(${rgb}, ${(0.55 * this.glow).toFixed(3)})) ` +
      `drop-shadow(0 0 ${far}px rgba(${rgb}, ${(0.42 * this.glow).toFixed(3)}))`;
  }

  fit(containerW, containerH) {
    this.scale = Math.max(1, Math.floor(Math.min(containerW / this.width, containerH / this.height)));
    const w = this.width * this.scale, h = this.height * this.scale;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    return { w, h, scale: this.scale };
  }

  /** Push the (possibly graded) palette to the shader. */
  uploadPalette(list) {
    const u = this.quantMat.uniforms.uPal.value;
    for (let i = 0; i < PAL_N; i++) u[i].set(list[i][0] / 255, list[i][1] / 255, list[i][2] / 255);
  }

  /**
   * The HUD is drawn into the SAME low-res buffer as the scene, before the
   * palette pass, so it is quantised and softened along with everything else.
   * A DOM overlay would sit at native resolution and break the illusion.
   */
  render(scene, camera, overlayScene, overlayCam) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    if (overlayScene) r.render(overlayScene, overlayCam);
    r.setRenderTarget(this.rtPal);
    r.clear();
    r.render(this.quantScene, this.cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.tubeScene, this.cam);
  }
}
