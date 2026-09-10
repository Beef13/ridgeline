import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { PAL_RGB } from './render/palette.js';
import { buildWorld, SKY_Z } from './world/scene.js';
import { Streamer } from './world/streamer.js';
import { ObstacleField } from './world/obstacles.js';
import { heightAt } from './world/terrain.js';
import { Runner, STATE, overlaps } from './player/controller.js';
import { feel } from './player/tuning.js';
import { makeFigure, poseFigure } from './player/figure.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Music } from './core/audio.js';
import { Vistas } from './world/vista.js';
import { Hud } from './ui/hud.js';
import { pushLook } from './ui/look.js';
import { design, FEEL_KEYS_THAT_TRANSFER } from './design.js';
import { snapshotPalette } from './render/grade.js';
import { cue } from './world/streamer.js';

const VIEW_H = 7.2;                       // world units visible vertically
const view = { fov: 14, internalW: 256, internalH: 224 };

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x241a38, 1);
renderer.autoClear = false;               // the HUD draws over the scene, in-buffer
stage.append(renderer.domElement);

const pipeline = new Pipeline(renderer, { width: view.internalW, height: view.internalH });
pipeline.viewHeight = VIEW_H;

const { scene, roots, sky, setFog } = buildWorld();
// buildWorld generated the sky ramp into PAL_RGB; snapshot it before grading,
// or each grade would compound on the last.
snapshotPalette();
pipeline.uploadPalette(PAL_RGB);

// Only the numbers that mean something in a runner. The bench's character is
// player-driven horizontally; the runner owns that axis itself.
for (const k of FEEL_KEYS_THAT_TRANSFER) {
  if (k in design.feel) feel[k] = design.feel[k];
}
view.fov = design.optics.fov;
feel.poseFps = design.time.fps;
pipeline.setInternalSize(design.raster.w, design.raster.h);
cue.dark = design.atmos.dark;
cue.cool = design.atmos.cool;

const camera = new THREE.PerspectiveCamera(view.fov, view.internalW / view.internalH, 0.5, 600);
const camDist = () => (VIEW_H / 2) / Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);

/* The streamer owns the scatter loader, and the vistas need it for anything
   sown on their layer — so it is built first and handed over. */
const streamer = new Streamer(roots);
const vistas = new Vistas(scene, streamer.scatter);
const obstacles = new ObstacleField(roots[1]);
const player = new Runner();
const fig = makeFigure();
roots[1].add(fig.group);

const hud = new Hud(view.internalW, view.internalH);
const input = new Input();
const music = new Music();

let state = STATE.READY;
let best = 0;
try { best = parseFloat(localStorage.getItem('ridgeline.best') || '0') || 0; } catch (e) {}
let deadAt = 0;

function restart() {
  player.reset();
  obstacles.reset();
  streamer.reset();
  streamer.update(player.x);
  camera.position.set(player.x + feel.camBehind, 2.6, camDist());
  state = STATE.RUNNING;
}

// the look always applies; the sliders that tune it are development only, and
// the dynamic import is what lets the release build drop them entirely
pushLook(pipeline, vistas, { setFog });
if (import.meta.env.DEV) {
  import('./ui/panels.js').then((m) =>
    m.mountPanels({ pipeline, vistas, world: { setFog }, feel, view, music }));
}
// The vista layer's own tint is the sixth entry in the bench's list.
vistas.setTint(design.atmos.tints[5] ?? 1);

function resize() {
  const { w, h } = pipeline.fit(stage.clientWidth, stage.clientHeight);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = pipeline.width / pipeline.height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
streamer.update(0);
camera.position.set(feel.camBehind, 2.6, camDist());

window.__dbg = { player, streamer, obstacles, camera, roots, state: () => state, pipeline, scene, vistas, music };

startLoop({
  step: (dt) => {
    const inp = input.sample();

    if (state === STATE.READY && inp.anyPressed) { music.start(); restart(); return; }
    if (state === STATE.DEAD) {
      // Short lockout, or the death press instantly restarts and reads as a bug.
      if (inp.anyPressed && performance.now() / 1000 - deadAt > 0.4) { music.setDuck(false); restart(); }
      return;
    }
    if (state !== STATE.RUNNING) return;

    player.step(dt, inp, true);
    streamer.update(player.x);
    obstacles.update(player, true, dt);

    const box = player.box;
    for (const o of obstacles.boxes()) {
      if (overlaps(box, o)) {
        state = STATE.DEAD;
        deadAt = performance.now() / 1000;
        music.setDuck(true);          // pull the music back so the run-over screen lands
        if (player.distance > best) {
          best = player.distance;
          try { localStorage.setItem('ridgeline.best', String(best)); } catch (e) {}
        }
        break;
      }
    }
  },

  render: (dt, t) => {
    music.update(dt);

    // Pose steps at 12fps while position stays smooth. Continuous motion at
    // this resolution reads as low-poly 3D; stepped motion reads as a sprite.
    const posedT = feel.poseFps >= 60 ? t : Math.floor(t * feel.poseFps) / feel.poseFps;
    const saved = player.runPhase;
    if (feel.poseFps < 60) player.runPhase = Math.floor(player.runPhase * feel.poseFps / 6) * 6 / feel.poseFps;
    poseFigure(fig, player, posedT, state === STATE.DEAD);
    player.runPhase = saved;

    obstacles.animate(t);

    // Everything lands on whole pixels. Skip this and the edges crawl — most
    // of the difference between '16-bit' and 'early 3D'.
    const upp = VIEW_H / pipeline.height;
    const snap = (v) => Math.round(v / upp) * upp;

    fig.group.position.set(snap(player.x), snap(player.y), 0);

    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    const tx = player.x + feel.camBehind;
    const ty = 1.9 + THREE.MathUtils.clamp(Math.max(player.y, heightAt(player.x)) * 0.62, 0, 4.2);
    // Horizontal is locked to the runner — a lagging camera on an auto-runner
    // just makes obstacles arrive at an inconsistent screen position.
    camera.position.x = tx;
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * feel.camLerpY);
    camera.position.z = camDist();
    const cx = camera.position.x, cy = camera.position.y;
    camera.position.x = snap(cx); camera.position.y = snap(cy);

    const halfTan = Math.tan(THREE.MathUtils.degToRad(view.fov) / 2);
    sky.position.set(snap(cx), snap(cy), SKY_Z);
    const sh = 2 * halfTan * (camera.position.z - SKY_Z) * 1.06;
    sky.scale.set(sh * camera.aspect, sh, 1);
    vistas.update(cx, cy, camera.position.z, halfTan, camera.aspect, snap);

    hud.draw(state, player.distance, best, t);
    pipeline.render(scene, camera, hud.scene, hud.cam);

    camera.position.x = cx; camera.position.y = cy;
  }
});
