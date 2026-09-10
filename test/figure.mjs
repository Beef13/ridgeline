/**
 * Does the character stay in one piece?
 *
 * The limbs are siblings of the torso, so nothing in the scene graph makes
 * them follow it. Any pose that moves the body — ducking drops it half a unit
 * and folds it over — used to leave the arms and legs hanging where the
 * standing pose had put them. This walks every pose the game can be in and
 * measures the gap between each limb's pivot and the joint it belongs on.
 */
import * as THREE from 'three';
import { makeFigure, poseFigure } from '../src/player/figure.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  ok  ' : 'FAIL  ') + n + (d ? '  ' + d : '')); };

// where each part joins the torso, in the body's own space — the same numbers
// figure.js works from, restated here so a change there has to be deliberate
const JOINT = {
  head: [0.05, 0.50, 0],
  armL: [-0.02, 0.28, 0.26],
  armR: [-0.02, 0.28, -0.26],
  legL: [0.02, -0.30, 0.20],
  legR: [0.02, -0.30, -0.20]
};

const POSES = [
  ['running', { ducking: false, grounded: true, vy: 0, runPhase: 0.7 }, false],
  ['running, other stride', { ducking: false, grounded: true, vy: 0, runPhase: 3.9 }, false],
  ['ducking', { ducking: true, grounded: true, vy: 0, runPhase: 1.4 }, false],
  ['rising', { ducking: false, grounded: false, vy: 6, runPhase: 2.0 }, false],
  ['falling', { ducking: false, grounded: false, vy: -6, runPhase: 2.0 }, false],
  ['dead', { ducking: false, grounded: true, vy: 0, runPhase: 0 }, true]
];

const fig = makeFigure();
const world = new THREE.Vector3();

for (const [name, p, dead] of POSES) {
  poseFigure(fig, p, 0, dead);
  fig.group.updateMatrixWorld(true);
  let worst = 0, worstPart = '';
  for (const part in JOINT) {
    const want = new THREE.Vector3(...JOINT[part]).applyMatrix4(fig.body.matrixWorld);
    fig[part].getWorldPosition(world);
    const gap = want.distanceTo(world);
    if (gap > worst) { worst = gap; worstPart = part; }
  }
  check(`${name}: every limb sits on its joint`, worst < 1e-6,
    `worst ${worst.toFixed(4)}u (${worstPart})`);
}

/* Ducking has to fold FORWARD. A positive z rotation tips the torso backward,
   which is what the original pose did — the head was then hand-placed forward
   to disguise it, and the moment the limbs started following the body the
   whole figure leaned the wrong way. */
{
  poseFigure(fig, { ducking: true, grounded: true, vy: 0, runPhase: 0 }, 0, false);
  fig.group.updateMatrixWorld(true);
  const shoulder = new THREE.Vector3(...JOINT.armL).applyMatrix4(fig.body.matrixWorld);
  const hip = new THREE.Vector3(...JOINT.legL).applyMatrix4(fig.body.matrixWorld);
  check('ducking folds forward, not backward', shoulder.x > hip.x,
    `shoulder x ${shoulder.x.toFixed(2)} vs hip x ${hip.x.toFixed(2)}`);

  const standing = (() => {
    poseFigure(fig, { ducking: false, grounded: true, vy: 0, runPhase: 0 }, 0, false);
    fig.group.updateMatrixWorld(true);
    return new THREE.Vector3(...JOINT.head).applyMatrix4(fig.body.matrixWorld).y;
  })();
  poseFigure(fig, { ducking: true, grounded: true, vy: 0, runPhase: 0 }, 0, false);
  fig.group.updateMatrixWorld(true);
  const ducked = new THREE.Vector3(...JOINT.head).applyMatrix4(fig.body.matrixWorld).y;
  check('and actually gets the head down', ducked < standing - 0.45,
    `${standing.toFixed(2)}u standing -> ${ducked.toFixed(2)}u ducked`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
