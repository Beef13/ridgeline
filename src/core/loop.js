/**
 * Fixed-step simulation with a rationed render. Physics must not vary with
 * framerate or the jump height changes on a faster monitor.
 */
export function startLoop({ fixed = 1 / 120, maxFrame = 0.1, step, render, maxFps = 60 }) {
  /* `last` is set by the FIRST frame, not here.
     Seeding it from the clock at startup charges the simulation for however
     long the browser took to deliver that first frame — a gap that is real
     time but not GAME time, and one that varies with load, so the same run
     starts a few steps ahead or behind for no reason the player caused. It is
     clamped by maxFrame so it was never catastrophic, just silently
     non-deterministic, which is worse to debug. A frame with no predecessor
     has no delta. */
  let last = 0, acc = 0, lastDraw = 0;

  /* A 120Hz laptop offers twice as many frames as this game has anything new
     to show, and every one costs the full scene, the palette pass and the tube
     pass. So the DRAWING is rationed. The simulation is not: it keeps its own
     fixed 120Hz step, so jump arcs and collisions are identical either way.

     Drawing every n-th frame, rather than whenever enough time has passed.
     A time gate sounds simpler and paces badly: frames only arrive on the
     display's own boundaries, so on a 144Hz screen a 16.67ms gate is missed by
     every second frame and satisfied by every third — a steady 48fps, WORSE
     than not capping at all. Choosing a whole-number divisor of the refresh
     rate instead gives an even cadence and never lands under the target:
     120Hz halves to 60, 144Hz halves to 72, 240Hz quarters to 60. */
  const period = maxFps ? 1000 / maxFps : 0;
  let gap = 0;            // smoothed frame interval
  let n = 1;              // draw every n-th frame
  let i = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;                 // first frame: no delta, nothing to step
    const raw = now - last;
    const dt = Math.min(maxFrame, raw / 1000);
    last = now;
    acc += dt;
    while (acc >= fixed) { step(fixed); acc -= fixed; }

    if (period) {
      /* Smoothed, because a single long frame — a texture upload, a GC pause —
         must not be mistaken for a slower display and halve the frame rate for
         everyone. Ignore anything wild while measuring. */
      if (raw > 1 && raw < 100) gap = gap ? gap + (raw - gap) * 0.1 : raw;
      /* FLOOR, not round. Rounding 165Hz (2.75 frames per period) up to 3
         gives 55fps — under the target it is supposed to be enforcing, and
         the whole point is never to end up slower than asked. Flooring lands
         on 2, i.e. 82.5fps: at or above the target, always. The epsilon is
         for the exact multiples, where 4.0 can arrive as 3.9999 and drop a
         240Hz screen to 80fps for no reason. */
      if (gap) n = Math.max(1, Math.min(6, Math.floor(period / gap + 0.05)));
      if (++i % n) return;
    }

    // the delta since the last DRAW, not since the last frame, or anything
    // animating on render time runs slow the moment frames are skipped
    const rdt = lastDraw ? Math.min(maxFrame, (now - lastDraw) / 1000) : dt;
    lastDraw = now;
    render(rdt, now / 1000);
  }
  requestAnimationFrame(frame);
}
