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
        uVign: { value: 0.18 }, uGain: { value: 1.08 }
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
