import { mountPanel } from './panel.js';
import { copyDesign } from './capture.js';

const FEEL_SPEC = (feel, view) => [
  ['The run', feel, [['startSpeed', 3, 20, 0.1], ['maxSpeed', 6, 34, 0.5], ['speedRamp', 0, 1, 0.01]]],
  ['Air', feel, [
    ['gravity', -90, -8, 1], ['fallGravity', -160, -8, 1], ['maxFall', -70, -5, 1],
    ['jumpVelocity', 4, 24, 0.1], ['doubleJumpVel', 0, 22, 0.1],
    ['jumpCutoff', 0.05, 1, 0.01], ['duckDrop', -70, -4, 1], ['airJumps', 0, 3, 1]
  ]],
  ['Forgiveness', feel, [
    ['coyoteTime', 0, 0.3, 0.005], ['jumpBuffer', 0, 0.3, 0.005], ['groundSnap', 0, 1.2, 0.02]
  ]],
  ['Hitbox', feel, [
    ['standW', 0.2, 1.6, 0.02], ['standH', 0.6, 2.4, 0.02],
    ['duckW', 0.2, 1.8, 0.02], ['duckH', 0.4, 1.6, 0.02]
  ]],
  ['Spawning', feel, [
    ['reactionTime', 0.2, 1.6, 0.02], ['spawnAhead', 16, 60, 1], ['difficultyAt', 200, 3000, 50]
  ]],
  ['Camera', feel, [['camBehind', -2, 4, 0.1], ['camLerpY', 1, 20, 0.5], ['poseFps', 4, 60, 1]]],
  ['Touch', feel, [['touchHold', 0.05, 0.4, 0.01]]],
  ['View', view, [['fov', 7, 46, 1]]]
];

export function mountTuner(feel, view, music) {
  const audio = { volume: music ? music.volume : 0.55 };
  const groups = FEEL_SPEC(feel, view);
  if (music) groups.push(['Audio  (M mutes)', audio, [['volume', 0, 1, 0.02]]]);
  return mountPanel({
    title: 'FEEL', side: 'right', hotkey: '`',
    groups,
    onChange: (k) => { if (k === 'volume' && music) music.setVolume(audio.volume); },
    extraButtons: [['COPY DESIGN', copyDesign]]
  });
}
