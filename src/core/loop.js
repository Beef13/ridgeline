/**
 * Fixed-step simulation with a render every frame. Physics must not vary with
 * framerate or the jump height changes on a faster monitor.
 */
export function startLoop({ fixed = 1 / 120, maxFrame = 0.1, step, render }) {
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(maxFrame, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= fixed) { step(fixed); acc -= fixed; }
    render(dt, now / 1000);
  }
  requestAnimationFrame(frame);
}
