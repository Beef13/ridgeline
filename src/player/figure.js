import * as THREE from 'three';
import { SRGB } from '../core/colour.js';

/**
 * A stand-in built from primitives. Deliberately not a character — it exists
 * to make the physics legible, and gets replaced by a rigged .glb later.
 */
export function makeFigure() {
  const g = new THREE.Group();
  const fur  = new THREE.MeshPhongMaterial({ color: SRGB('#7d4f2c'), shininess: 34, specular: SRGB('#a89050') });
  const furD = new THREE.MeshPhongMaterial({ color: SRGB('#3a2213'), shininess: 26, specular: SRGB('#7d4f2c') });
  const skin = new THREE.MeshPhongMaterial({ color: SRGB('#c08c52'), shininess: 62, specular: SRGB('#f0dca0') });

  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 11), fur);
  torso.scale.set(1.18, 1.02, 0.88);
  body.add(torso);
  body.position.y = 0.92;
  g.add(body);

  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 11), fur));
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), skin);
  face.scale.set(0.95, 0.8, 0.7); face.position.set(0.13, -0.05, 0.14);
  head.add(face);
  head.position.set(0.05, 1.42, 0);
  g.add(head);

  const limb = (len, thick, mat) => {
    const grp = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.85, thick, len, 8), mat);
    seg.position.y = -len / 2;
    const end = new THREE.Mesh(new THREE.SphereGeometry(thick * 1.15, 10, 8), mat);
    end.position.y = -len;
    grp.add(seg, end);
    return grp;
  };
  const armL = limb(0.72, 0.13, fur);  armL.position.set(-0.02, 1.20, 0.26);
  const armR = limb(0.72, 0.13, furD); armR.position.set(-0.02, 1.20, -0.26);
  const legL = limb(0.52, 0.15, fur);  legL.position.set(0.02, 0.62, 0.20);
  const legR = limb(0.52, 0.15, furD); legR.position.set(0.02, 0.62, -0.20);
  g.add(armL, armR, legL, legR);

  return { group: g, body, head, armL, armR, legL, legR, crouch: new THREE.Group() };
}

/**
 * Where each part joins the torso, in the BODY's own space.
 *
 * The limbs are siblings of the body, not children — so nothing made them
 * follow it. Every pose that moved the torso (ducking most of all, which drops
 * it half a unit and tips it over) left the arms and legs hanging in the air
 * where the standing pose had put them. Deriving their positions from the
 * body's matrix each frame means they cannot come apart, whatever the pose
 * does, including poses nobody has written yet.
 */
const JOINT = {
  head: new THREE.Vector3(0.05, 0.50, 0),
  armL: new THREE.Vector3(-0.02, 0.28, 0.26),
  armR: new THREE.Vector3(-0.02, 0.28, -0.26),
  legL: new THREE.Vector3(0.02, -0.30, 0.20),
  legR: new THREE.Vector3(0.02, -0.30, -0.20)
};
const _j = new THREE.Vector3();

function reattach(fig) {
  fig.body.updateMatrix();
  for (const k in JOINT) fig[k].position.copy(_j.copy(JOINT[k]).applyMatrix4(fig.body.matrix));
}

export function poseFigure(fig, p, t, dead) {
  const ph = p.runPhase * 1.05;
  const s = Math.sin(ph), c = Math.cos(ph);

  if (dead) {
    fig.armL.rotation.z = -2.4; fig.armR.rotation.z = -2.2;
    fig.legL.rotation.z = 0.9; fig.legR.rotation.z = 0.4;
    fig.body.rotation.z = 0.5; fig.head.rotation.z = 0.6;
    fig.body.position.y = 0.86;
  } else if (p.ducking) {
    // Fold down rather than shrink — a scaled character reads as a bug.
    fig.armL.rotation.z = -2.0 + s * 0.2; fig.armR.rotation.z = -1.8 + s * 0.3;
    fig.legL.rotation.z = 0.95 + s * 0.35; fig.legR.rotation.z = 0.8 - s * 0.35;
    fig.body.rotation.z = -1.15;          // negative folds FORWARD, over the knees
    fig.body.position.y = 0.52;
    fig.head.rotation.z = -0.55;
  } else if (!p.grounded) {
    const tuck = p.vy > 0 ? 1 : -1;
    fig.armL.rotation.z = -2.1; fig.armR.rotation.z = -1.9;
    fig.legL.rotation.z = 0.55 * tuck + 0.3; fig.legR.rotation.z = -0.35 * tuck + 0.3;
    fig.body.rotation.z = -0.10; fig.body.position.y = 0.96;
    fig.head.rotation.z = -0.08;
  } else {
    fig.armL.rotation.z = s * 1.25;  fig.armR.rotation.z = -s * 1.25;
    fig.legL.rotation.z = -s * 0.95; fig.legR.rotation.z = s * 0.95;
    fig.body.rotation.z = -0.26;
    fig.body.position.y = 0.92 + Math.abs(c) * 0.06;
    fig.head.rotation.z = -0.12 + s * 0.05;
  }

  // last, and unconditionally: every pose above only says what the torso does
  reattach(fig);
}
