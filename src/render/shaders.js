/**
 * Two passes, in this order and no other:
 *
 *   1. QUANTISE — hard 15-bit output. What the console decided.
 *   2. TUBE     — softening, scanlines, mask. What the CRT did to it.
 *
 * Softening before quantising is the classic mistake: the palette snap just
 * re-hardens every edge you softened.
 */

export const fullscreenVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const quantiseFrag = (palN) => /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2  uRes;
  uniform float uQuant, uDither, uMode, uPair;
  uniform float uExposure, uSat, uContrast;
  uniform vec3  uPal[${palN}];

  float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;

    c = (c - 0.5) * uContrast + 0.5;
    c *= uExposure;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = clamp(mix(vec3(lum), c, uSat), 0.0, 1.0);

    float b8 = bayer8(vUv * uRes);
    if (uMode > 0.5 && uMode < 1.5) c = clamp(c + (b8 - 0.5) * uDither, 0.0, 1.0);

    if (uQuant > 0.5) {
      vec3 c1 = uPal[0], c2 = uPal[1];
      float d1 = 1e9, d2 = 1e9;
      for (int i = 0; i < ${palN}; i++) {
        vec3 p = uPal[i];
        vec3 dv = c - p;
        float d = dot(dv, dv);
        if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = p; }
        else if (d < d2) { d2 = d; c2 = p; }
      }
      if (uMode > 1.5) {
        vec3 seg = c2 - c1;
        float len2 = max(dot(seg, seg), 1e-6);
        // Two colours far apart in the palette are not a ramp. Blending them
        // reads as noise in a third hue — brown against red comes out pink.
        if (len2 > uPair * uPair) {
          c = c1;
        } else {
          float t = clamp(dot(c - c1, seg) / len2, 0.0, 1.0) * uDither;
          c = (b8 < t) ? c2 : c1;
        }
      } else {
        c = c1;
      }
    }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export const tubeFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tPal;
  uniform vec2 uRes;
  uniform float uOn, uSoft, uScan, uMask, uGlow, uCurve, uVign, uGain, uRadius;
  /* A patch of the tube where the vignette is eased off. The HUD tally lives in
     the top-left, which is exactly where the vignette is deepest — measured at
     16% down on a 0.25 vignette — so the star the player collects looks brighter
     out in the world than the one counting them in the corner. Relieving it
     there rather than lifting the icon's own colours is the only fix that
     survives the grade: the exposure pass clamps to 1.0 before the vignette is
     applied, so a brighter material has nothing left to give on the channels
     that already clipped. */
  uniform vec2 uReliefAt; uniform float uReliefR, uAspect;

  // A finite electron beam covers part of a pixel instead of snapping between
  // them. Widening this window is what softens the grid without blurring the
  // whole image — the trick handheld CRT filters use.
  vec2 beam(vec2 uv) {
    vec2 p = uv * uRes;
    vec2 i = floor(p) + 0.5;
    vec2 f = p - i;
    float w = max(uSoft, 0.0008);
    return (i + clamp(f / w, -0.5, 0.5)) / uRes;
  }
  vec3 tap(vec2 uv) { return texture2D(tPal, clamp(uv, 0.0005, 0.9995)).rgb; }
  /**
   * The silhouette of the glass, as a signed distance to a rounded box —
   * measured in the PICTURE's own space, so the curve bends it along with
   * everything else and the rounded corner is the corner of the image.
   *
   * This also replaces the old hard test for "outside the picture". That cut
   * a stair-stepped edge and, worse, filled the rest of the canvas with black:
   * a square frame around a curved tube, which is exactly what the rounding
   * and the glow were then following.
   */
  float glass(vec2 uv) {
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
    vec2 p = (uv - 0.5) * 2.0 * aspect;
    float r = max(uRadius, 0.0) * min(aspect.x, aspect.y);
    vec2 d = abs(p) - (aspect - r);
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
    return 1.0 - smoothstep(-0.012, 0.006, dist);
  }

  vec2 curve(vec2 uv) {
    vec2 c = uv * 2.0 - 1.0;
    vec2 off = abs(c.yx) / vec2(5.0, 4.0);
    c += c * off * off * uCurve * 3.0;
    return c * 0.5 + 0.5;
  }

  void main() {
    vec3 col = vec3(0.0);
    if (uOn < 0.5) {
      vec2 p = vUv * uRes;
      col = texture2D(tPal, (floor(p) + 0.5) / uRes).rgb;
      float m = glass(vUv);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * m, m);
      return;
    }
    vec2 uv = curve(vUv);
    float mask = glass(uv);
    if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec2 suv = beam(uv);
    col = tap(suv);

    if (uGlow > 0.001) {
      vec2 px = 1.0 / uRes;
      vec3 n = tap(suv + vec2(px.x, 0.0)) + tap(suv - vec2(px.x, 0.0))
             + tap(suv + vec2(0.0, px.y)) + tap(suv - vec2(0.0, px.y));
      col += max(n * 0.25 - col, 0.0) * uGlow;
    }
    if (uScan > 0.001) {
      float b = 0.5 - 0.5 * cos(uv.y * uRes.y * 6.28318530718);
      col *= 1.0 - uScan * (1.0 - b);
    }
    if (uMask > 0.001) {
      float m = mod(gl_FragCoord.x, 3.0);
      vec3 tri = m < 1.0 ? vec3(1.0, 0.62, 0.62)
               : (m < 2.0 ? vec3(0.62, 1.0, 0.62) : vec3(0.62, 0.62, 1.0));
      col *= mix(vec3(1.0), tri, uMask);
    }
    col *= uGain;
    if (uVign > 0.001) {
      vec2 v = uv * (1.0 - uv.yx);
      float vg = pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), 0.28);
      /* Feathered, not a rectangle. A hard-edged exemption puts a visible seam
         through whatever the ridge is doing behind the HUD — the corner would
         have a bright square cut out of it. A smooth falloff over a sixth of
         the screen reads as the tube simply being less dark there, which is
         what an actual CRT corner looks like anyway. Circular, so uv is
         aspect-corrected first or the patch comes out an ellipse. */
      float relief = 0.0;
      if (uReliefR > 0.0) {
        vec2 d = (uv - uReliefAt) * vec2(uAspect, 1.0);
        relief = 1.0 - smoothstep(0.0, uReliefR, length(d));
      }
      col *= mix(1.0, vg, uVign * (1.0 - relief));
    }
    /* Premultiplied: three's context expects it, and it is what makes the
       feathered edge composite against the page instead of against black. */
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * mask, mask);
  }
`;
