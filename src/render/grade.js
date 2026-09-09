import { PAL_RGB, PAL_N } from './palette.js';

/**
 * Grading the PALETTE and grading the PIXELS are different operations and the
 * bench exposes both, so the game has to as well or an exported look will not
 * reproduce.
 *
 *   palette — the 67 colours themselves shift; everything re-maps onto the new
 *             ramp. A real change of look.
 *   pixels  — the palette stays put and only the choice of entry changes.
 *
 * With the palette snap OFF there is no palette to grade, so it falls back to
 * pixels — same rule the bench uses.
 */
let BASE = null;

/** Call after the sky ramp has been generated into PAL_RGB. */
export function snapshotPalette() {
  BASE = PAL_RGB.map((c) => c.slice());
}

const clamp255 = (v) => { v *= 255; return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); };

function gradeOne(p, bright, sat, contrast) {
  let r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
  r = (r - 0.5) * contrast + 0.5; g = (g - 0.5) * contrast + 0.5; b = (b - 0.5) * contrast + 0.5;
  r *= bright; g *= bright; b *= bright;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [clamp255(l + (r - l) * sat), clamp255(l + (g - l) * sat), clamp255(l + (b - l) * sat)];
}

export function applyGrade(pipeline, look) {
  if (!BASE) snapshotPalette();
  const u = pipeline.quantMat.uniforms;
  const toPixels = look.gradeTarget === 'pixels' || look.quantise < 0.5;

  if (toPixels) {
    u.uExposure.value = look.exposure;
    u.uSat.value = look.saturation;
    u.uContrast.value = look.contrast;
    pipeline.uploadPalette(BASE);
  } else {
    u.uExposure.value = 1;
    u.uSat.value = 1;
    u.uContrast.value = 1;
    pipeline.uploadPalette(BASE.map((p) => gradeOne(p, look.exposure, look.saturation, look.contrast)));
  }
}
