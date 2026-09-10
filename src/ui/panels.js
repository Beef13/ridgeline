import { mountPanel } from './panel.js';
import { pushLook, LOOK_GROUPS } from './look.js';
import { mountTuner } from './tuner.js';
import { copyDesign } from './capture.js';

/**
 * The live tuning panels — development only.
 *
 * main.js reaches this module through a dynamic import guarded by
 * `import.meta.env.DEV`, which is what lets the bundler drop the whole branch
 * from a release build: the panels, the DOM they build, and panel.js itself
 * never make it into the shipped bundle. A static import with an `if` around
 * the call would ship every byte of it and just never run.
 */
export function mountPanels({ pipeline, vistas, world, feel, view, music }) {
  const look$ = mountPanel({
    title: 'LOOK', side: 'left', hotkey: '1',
    onChange: () => pushLook(pipeline, vistas, world),
    groups: LOOK_GROUPS(),
    // the same button on both panels — one design, and you are never more than
    // one click from it whichever half you happen to be tuning
    extraButtons: [['COPY DESIGN', copyDesign]]
  });
  const feel$ = mountTuner(feel, view, music);
  return { look: look$, feel: feel$ };
}
