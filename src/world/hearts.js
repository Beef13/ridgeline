import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SRGB } from '../core/colour.js';

/**
 * The extra lives, as spinning hearts.
 *
 * They sit beside the star tally and are built the same way it is: real meshes
 * parked in front of the camera rather than shapes drawn on the HUD canvas, so
 * they go through the same output stage as everything else and cannot drift
 * away from it. What they deliberately do NOT share is the star's look — the
 * star is faceted and banded, a struck-metal collectable; a life is smooth and
 * soft. Two things the player must never confuse under pressure, told apart by
 * shading as well as by shape and colour.
 */

/* Two reds, and again written as the inverse of the ~2.9x output grade, so
   they arrive on screen as #ff5252 and #8e1a1a. In an editor they look like
   dried blood. Worked out by inverting the grade rather than by eye — the same
   correction the stars needed twice before it stuck. */
export const HEART_TONES = { hi: '#9f3030', lo: '#560c0c' };
export const HEART_ON_SCREEN = { hi: '#ff5252', lo: '#8e1a1a' };

export const HEART_SPIN = 1.7;     // rad/sec — slower than the star, so they read apart
const HEART_R = 0.5;               // half-width in the geometry's own units

/**
 * A heart with volume in it.
 *
 * Bevelled rather than flat-extruded, and with its vertices merged before the
 * normals are computed. Both matter: the bevel is what gives the silhouette a
 * rolled edge instead of a cut one, and merging is what lets the normals be
 * averaged into a smooth surface. An unmerged extrusion has one normal per
 * face and shades in hard facets — which is exactly right for the star and
 * exactly wrong here.
 */
export function heartGeometry() {
  const s = new THREE.Shape();
  /* Drawn from the cleft down to the point and back up. The classic
     construction comes out point-UP, so the whole thing is flipped below
     rather than by rewriting seven bezier control points. */
  s.moveTo(0.5, 0.5);
  s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
  s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
  s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
  s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
  s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1.0, 0);
  s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);

  let g = new THREE.ExtrudeGeometry(s, {
    depth: 0.55, curveSegments: 14,
    bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 4
  });
  g.scale(1, -1, 1);                 // lobes up, point down
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  g.center();
  // normalise on the WIDER of the two axes, so a heart and a star asked for the
  // same pixel size occupy the same box rather than the same height
  g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox.getSize(size);
  const k = (HEART_R * 2) / Math.max(size.x, size.y);
  g.scale(k, k, k);
  return g;
}

/**
 * Smoothly shaded, and lit by a direction of its own rather than by the scene.
 *
 * Same reasoning as the star's material: the tally sits 6 units from the camera
 * and nothing else in the game does, so anything that depends on the scene's
 * lights or its fog would make the counter a different colour from the rest of
 * the frame for no reason a player could name. A constant direction keeps the
 * shading a function of the heart's own rotation alone.
 */
export function heartMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      cHi: { value: SRGB(HEART_TONES.hi) },
      cLo: { value: SRGB(HEART_TONES.lo) },
      lightDir: { value: new THREE.Vector3(-3.2, 5.5, 4.0).normalize() }
    },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 cHi, cLo, lightDir;
      varying vec3 vN;
      void main() {
        float d = dot(normalize(vN), lightDir);
        /* A continuous ramp, not the star's three steps. smoothstep rather than
           a raw dot so the terminator is not a hard line across a shape this
           small — at 11 pixels a linear falloff spends most of its range on
           two or three pixels and reads as an edge. */
        vec3 c = mix(cLo, cHi, smoothstep(-0.35, 0.85, d));
        // one small highlight, which is most of what says "smooth" at this size
        c += pow(max(d, 0.0), 22.0) * 0.30;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
}

/** The scale that makes the shared heart geometry `wantPx` pixels across. */
export function heartScale(halfH, bufH, wantPx) {
  return (wantPx * ((2 * halfH) / bufH)) / (HEART_R * 2);
}
