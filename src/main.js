import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { PAL_RGB } from './render/palette.js';
import { buildWorld, SKY_Z } from './world/scene.js';
import { Streamer } from './world/streamer.js';
import { ObstacleField, useModel, OBSTACLE_MATERIALS } from './world/obstacles.js';
import { loadModel } from './world/models.js';
import { Fireflies } from './world/fireflies.js';
import { StarField, SPIN, screenAnchor, iconScale } from './world/stars.js';
import { ICON } from './ui/hud.js';
import { heightAt } from './world/terrain.js';
import { Runner, STATE, overlaps } from './player/controller.js';
import { feel } from './player/tuning.js';
import { makeFigure, poseFigure } from './player/figure.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { Music } from './core/audio.js';
import { Sfx } from './core/sfx.js';
import { Vistas } from './world/vista.js';
import { Hud } from './ui/hud.js';
import { pushLook } from './ui/look.js';
import { design, FEEL_KEYS_THAT_TRANSFER } from './design.js';
import { snapshotPalette } from './render/grade.js';
import { cue } from './world/streamer.js';

const VIEW_H = 7.2;                       // world units visible vertically
const view = { fov: 14, internalW: 256, internalH: 224 };

const stage = document.getElementById('stage');
/* alpha, because the tube pass now writes the SHAPE of the screen into the
   canvas: everything outside the glass is transparent, so the page shows
   through and there is no black frame for the glow to trace. */
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
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
/* The runner's own numbers — spawn distances, hitboxes, camera. They ride in
   the same file under a key the bench ignores, so one paste carries the whole
   game and not just the half a bench scene can show. */
for (const [k, v] of Object.entries(design.game || {})) {
  if (k in feel) feel[k] = v;
}
view.fov = design.optics.fov;
window.__view = view;   // capture.js reads the live fov back out
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
/* Ambient, and parented to the parallax roots — so the LOOK panel's per-layer
   visibility switches turn them off with the rest of that layer rather than
   needing a toggle of their own. */
const fireflies = new Fireflies(roots);
/* On the play layer, because a star has to be at the same depth as the player
   to be collected by looking like it is being touched. */
const stars = new StarField(roots[1]);
/* The tally icon: a real collectable, parked in front of the camera.
   Added to the SCENE rather than to a parallax root, so the LOOK panel's
   per-layer visibility switches cannot hide the player's own counter. */
const starIcon = stars.icon();
starIcon.visible = false;
scene.add(starIcon);
const ICON_DIST = 6;      // well inside the foreground layer, so nothing occludes it

/* Stars, and what they buy.
 *
 * The counter RESETS when it buys a life, rather than counting up forever with
 * a life awarded at each hundred. Both give the same lives; the reset gives the
 * player a bar that visibly empties and fills, which is the part they can read
 * at a glance mid-run. Neither survives a run — this is an arcade game, and a
 * stockpile carried between runs would make the first thirty seconds of every
 * later run meaningless. */
const STARS_PER_LIFE = 100;

/* Test flags, off the URL: ?lives=3 starts a run with three in hand, ?stars=95
   starts it five short of the next one.
 *
 * A URL flag rather than an edited constant, on purpose. A hardcoded 3 has to
 * be remembered and put back, and the one time it is not, it ships — and it
 * ships silently, because a game that is too easy looks exactly like a game
 * that is working. This cannot be left on by accident: the default is what
 * every player gets, and turning it on takes a deliberate act that is visible
 * in the address bar the whole time it is on. */
function flag(name, max) {
  try {
    const v = parseInt(new URLSearchParams(location.search).get(name) || '', 10);
    return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
  } catch (e) { return 0; }
}
const START_LIVES = flag('lives', 9);
const START_STARS = flag('stars', STARS_PER_LIFE - 1);
if (START_LIVES || START_STARS) {
  console.log('[ridgeline] test flags:', START_LIVES, 'lives,', START_STARS, 'stars');
}

let starCount = START_STARS;
let lives = START_LIVES;
/* Seconds of invulnerability bought by spending a life. Long enough to get
   clear of the thing that hit you AND of the next one at full speed, or the
   life is spent twice on one mistake. */
const MERCY = 3.0;
let mercyUntil = -1;
const obstacles = new ObstacleField(roots[1]);
/* Modelled obstacles, loaded in the background. Deliberately NOT awaited: the
   game is playable on its built-in shapes from the first frame, and the swap
   happens on the next spawn once the file lands. */
const MODEL_BASE = ((typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/') + 'models/';
loadModel('crate', MODEL_BASE + 'crate.glb', OBSTACLE_MATERIALS)
  .then((proto) => useModel('crate', proto));
// uniform: a signpost is one fixed shape, not a box to be stretched
loadModel('sign', MODEL_BASE + 'sign.glb', OBSTACLE_MATERIALS, { uniform: true })
  .then((proto) => useModel('sign', proto));
// uniform too: only the fence's HEIGHT varies, so there is nothing to gain by
// squashing it sideways as well
loadModel('fence', MODEL_BASE + 'fence.glb', OBSTACLE_MATERIALS, { uniform: true })
  .then((proto) => useModel('fence', proto));
const player = new Runner();
const fig = makeFigure();
roots[1].add(fig.group);

const hud = new Hud(view.internalW, view.internalH);
const input = new Input();
const music = new Music();
const sfx = new Sfx();
/* The controller reports the action it actually took, not the key that was
   pressed: a jump with no air jumps left, or a duck cancelled by a jump, must
   not make a sound. At a 120Hz fixed step this is at most 8ms after the key. */
player.onAction = (what) => sfx.play(what === 'doubleJump' ? 'jump' : what,
                                     what === 'doubleJump' ? 1.18 : 1);

/* A bell on every hundred metres. Counted in WHOLE hundreds crossed rather
   than by testing the distance against a multiple: distance advances by a
   fraction of a metre per step, so a proximity test either fires several
   times on the same hundred or misses one entirely at speed. */
let bellsRung = 0;
// M mutes the music; it should mute the effects with it, or half the game
// goes quiet and the player assumes the key is broken
addEventListener('keydown', (e) => { if (e.code === 'KeyM') sfx.setMuted(music.muted); });

/* The mute button, and the M key, are two ways into one piece of state — so
   the icon is repainted from `music.muted` rather than from its own toggle
   count. Press M with the button on screen and the glyph still follows. */
const musicBtn = document.getElementById('m-music');
if (musicBtn) {
  const paintMusic = () => {
    musicBtn.classList.toggle('off', music.muted);
    musicBtn.setAttribute('aria-pressed', String(music.muted));
    musicBtn.querySelector('[data-on]').hidden = music.muted;
    musicBtn.querySelector('[data-off]').hidden = !music.muted;
  };
  musicBtn.addEventListener('click', (e) => { e.preventDefault(); music.toggleMute(); paintMusic(); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyM') paintMusic(); });
  paintMusic();   // the choice is remembered across visits
}

/* Wake the audio inside the gesture's OWN call stack.
 *
 * Both engines used to be started from the fixed step, one frame after the
 * press that armed them. Desktop Chrome forgives that — its user activation is
 * sticky, so anything on the page may play once you have touched it once. iOS
 * does not: play() and an AudioContext have to be reached synchronously from
 * the handler, and a frame later is already too late. So the game was silent
 * on every phone and fine on every desktop, which is exactly the shape of bug
 * that survives testing.
 *
 * Capture phase, so nothing downstream can stop it first. Both calls are
 * idempotent, and the loop still calls them as a belt-and-braces fallback.
 */
const unlock = () => {
  sfx.init();                 // first: it owns the context the music hangs on
  music.attach(sfx.ctx);
  music.start();
  removeEventListener('pointerdown', unlock, true);
  removeEventListener('keydown', unlock, true);
};
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);

let state = STATE.READY;
let best = 0;
try { best = parseFloat(localStorage.getItem('ridgeline.best') || '0') || 0; } catch (e) {}
let deadAt = 0;
/* One clock for the run's own timing. performance.now() is monotonic where
   Date.now() is not — a system clock correction mid-run would otherwise hand
   the player an hour of invulnerability, or end it instantly. */
const now = () => performance.now() / 1000;

/* The high score is shown OUTSIDE the frame, in the page around it. The HUD
   inside the 256x224 buffer stays as it is — that has to be quantised with
   everything else or it breaks the illusion — but a personal best belongs to
   the cabinet, not to the game, so it lives in the DOM at full resolution. */
const hiscoreEl = document.getElementById('hiscore');
function showBest() {
  if (!hiscoreEl) return;
  hiscoreEl.innerHTML = 'HIGH SCORE: ' + Math.floor(best) + '<span class="m">m</span>';
}
showBest();

function restart() {
  bellsRung = 0;
  starCount = START_STARS;
  lives = START_LIVES;
  mercyUntil = -1;
  stars.reset();
  fig.group.visible = true;
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
  /* Measure against the free space, then PIN the stage to what actually fits.
     The screen only scales in whole multiples of 256x224, so there is almost
     always leftover — and a stage that keeps it sits as a dead band under the
     screen, which is what made the page look bottom-heavy. Handing it back
     lets the column centre and the gap above match the gap below. */
  stage.style.flex = '1 1 auto';
  stage.style.height = 'auto';
  const budgetH = stage.clientHeight;             // reading it forces the layout
  const budgetW = stage.clientWidth;

  /* Two scales, deliberately. The RENDER stays a whole multiple of 256x224 —
     that is what the palette pass and the tube pass are built on and it must
     not be fractional. The DISPLAY then stretches that buffer to fill the box,
     which is how the screen uses the leftover of a step instead of leaving it
     as empty page. The stretch is small (never more than one step's worth) and
     the tube pass has already done the hard-edged work by then. */
  const { w, h } = pipeline.fit(budgetW, budgetH);
  /* 0.95 leaves the screen a little short of its box on purpose — filling it
     edge to edge made the page feel cramped. Everything above scales with it,
     so the marquee and the screen keep the same relationship. */
  const k = Math.max(1, Math.min(budgetW / w, budgetH / h) * 0.95);
  const cssW = Math.round(w * k), cssH = Math.round(h * k);

  stage.style.flex = '0 0 auto';
  stage.style.height = cssH + 'px';
  renderer.domElement.style.width = cssW + 'px';
  renderer.domElement.style.height = cssH + 'px';
  camera.aspect = pipeline.width / pipeline.height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
/* The logo decides how much height is left for the screen, and it arrives
   after first paint. Watching the stage instead would loop: resize() sets the
   stage's own height. */
const logoEl = document.getElementById('logo');
if (logoEl) logoEl.addEventListener('load', resize);
resize();
streamer.update(0);
camera.position.set(feel.camBehind, 2.6, camDist());

/* Lift the veil when the art has actually arrived AND a frame has been drawn
   with it. Either alone is a lie: the scatter can be ready before anything is
   on screen, and the first frame can render before a single texture decodes. */
let framesDrawn = 0, veilUp = true;
let artReady = streamer.scatter.ready;
{
  /* Both conditions must be able to RETRY the lift. Checking only from the
     render loop meant that once enough frames had gone by — about a tenth of a
     second — nothing asked again, and a veil waiting on art that arrived a
     second later sat there until the failsafe fired. */
  const prev = streamer.scatter.onReady;
  streamer.scatter.onReady = () => { if (prev) prev(); artReady = true; liftVeil(); };
}
function liftVeil() {
  if (!veilUp || !artReady || framesDrawn < 3) return;
  veilUp = false;
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.classList.add('gone'), 500);
}
// Never leave it up on a slow or broken load — a spinner that never goes is
// worse than a game missing some scenery; four seconds is the most black
// screen anyone should be asked to sit through.
setTimeout(() => { artReady = true; liftVeil(); }, 4000);

window.__dbg = { player, streamer, obstacles, camera, roots, state: () => state, pipeline, scene, vistas, music, sfx, fig, input, feel };

startLoop({
  step: (dt) => {
    // live, so the sliders mean something
    input.swipeDist = feel.swipeDist;
    input.duckMin = feel.duckMin;
    input.jumpDelay = feel.jumpDelay;
    const inp = input.sample();

    // the first gesture is the only moment an AudioContext can be created
    // unsuspended, so it has to happen here rather than at load
    if (state === STATE.READY && inp.anyPressed) { music.start(); sfx.init(); restart(); return; }
    if (state === STATE.DEAD) {
      // Short lockout, or the death press instantly restarts and reads as a bug.
      if (inp.anyPressed && performance.now() / 1000 - deadAt > 0.4) { music.setDuck(false); sfx.resume(); restart(); }
      return;
    }
    if (state !== STATE.RUNNING) return;

    player.step(dt, inp, true);
    const hundreds = Math.floor(player.distance / 100);
    if (hundreds > bellsRung) {
      bellsRung = hundreds;
      sfx.play('bell');
      hud.flash(hundreds * 100 + 'M');
    }
    streamer.update(player.x);
    obstacles.update(player, true, dt);
    /* After the obstacles, so an arc can be lifted clear of whatever was just
       spawned under it rather than of last frame's idea of the layout. */
    stars.update(player, obstacles, dt);

    const box = player.box;
    const got = stars.collect(box);
    if (got) {
      starCount += got;
      sfx.play('bell', 2.2);
      while (starCount >= STARS_PER_LIFE) {
        starCount -= STARS_PER_LIFE;
        lives++;
      }
    }

    // still paying for the last mistake: nothing can touch the runner
    if (now() < mercyUntil) return;
    for (const o of obstacles.boxes()) {
      if (!overlaps(box, o)) continue;
      /* Landing ON a bird is not hitting one.
         Two conditions, and both are needed. Descending, because a player
         rising into a bird's belly has clearly mistimed a jump and should die
         for it. And feet above `stompTop` of the bird's height, because at
         this scale the boxes overlap for several frames before the sprites
         touch — judged on overlap alone, running chest-first into a low bird
         would count as a stomp. */
      if (o.flying && player.vy < 0 &&
          box.y0 >= o.y0 + (o.y1 - o.y0) * feel.stompTop &&
          obstacles.stomp(o.id)) {
        player.bounce();
        sfx.play('jump', 0.8);
        continue;
      }
      /* A life is spent HERE, and play does not stop. No pause, no screen, no
         reset of the obstacle field — the runner keeps running and the thing
         that would have killed them passes through. The only feedback is the
         flashing, which is why the flashing has to be unmistakable. */
      if (lives > 0) {
        lives--;
        mercyUntil = now() + MERCY;
        sfx.play('crash', 1.5);
        break;
      }
      {
        state = STATE.DEAD;
        deadAt = performance.now() / 1000;
        sfx.play('crash');
        music.setDuck(true);          // pull the music back so the run-over screen lands
        if (player.distance > best) {
          best = player.distance;
          try { localStorage.setItem('ridgeline.best', String(best)); } catch (e) {}
          showBest();
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
    /* Handed the UNSNAPPED camera. The scene is snapped to whole buffer pixels
       to stop everything shimmering, but a firefly IS one pixel — snapping its
       anchor as well would lock it to the same grid as the ridge and the drift
       would come out in steps. */
    fireflies.update(cx, cy, t, dt);

    /* Placed from the SNAPPED camera, not from cx/cy: the icon has to sit on
       the same pixel grid as the HUD number beside it, or it shivers against
       letters that do not move. */
    starIcon.visible = state !== 'ready';
    if (starIcon.visible) {
      const a = screenAnchor(ICON.x, ICON.y, camera.position, halfTan, camera.aspect,
                             view.internalW, view.internalH, ICON_DIST);
      starIcon.position.set(a.x, a.y, a.z);
      starIcon.scale.setScalar(iconScale(a.halfH, view.internalH, ICON.px));
      starIcon.rotation.y = t * SPIN;
    }

    /* Before the render, not after: this reads back the PREVIOUS frame, which
       the GPU finished long ago, so it never waits. Sampling it straight after
       drawing blocks on work that was just submitted — 78ms a time. */
    pipeline.sampleGlow();
    /* Flashing, at 9Hz — fast enough to be unmistakable, slow enough that the
       runner is actually visible for half of it. Driven off render time rather
       than a counter so it looks the same at any frame rate, and forced back
       on the moment mercy ends, or a run could end on an invisible runner. */
    const mercy = now() < mercyUntil;
    fig.group.visible = !mercy || Math.floor(t * 9) % 2 === 0;

    stars.animate(t);
    hud.draw(state, player.distance, best, t, starCount, lives);
    pipeline.render(scene, camera, hud.scene, hud.cam);
    if (veilUp) { framesDrawn++; liftVeil(); }

    camera.position.x = cx; camera.position.y = cy;
  }
});
