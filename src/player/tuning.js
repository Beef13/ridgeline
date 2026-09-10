/**
 * Every number that decides how the game feels, in one place. These are the
 * only numbers worth arguing about right now.
 */
export const feel = {
  // --- the run ---
  startSpeed:     7.0,    // units/sec at the whistle
  maxSpeed:      17.0,
  speedRamp:      0.16,   // units/sec gained per second alive
  duckSpeedMul:   0.92,   // ducking costs a little ground, so it isn't free

  // --- air ---
  gravity:      -34,
  fallGravity:  -56,      // heavier once falling: the biggest single feel lever
  maxFall:      -30,
  jumpVelocity:  12.2,
  doubleJumpVel: 10.4,    // slightly weaker, so the second jump is a save not a upgrade
  jumpCutoff:    0.45,    // on release, remaining rise is scaled by this. Once.
  duckDrop:    -26,       // holding down in the air slams you back to the ground
  airJumps:      1,       // extra jumps after leaving the ground

  // --- forgiveness (invisible when right, infuriating when missing) ---
  coyoteTime:    0.09,
  jumpBuffer:    0.12,
  groundSnap:    0.38,    // stick to the surface over crests instead of launching

  // --- hitbox ---
  standW: 0.62, standH: 1.62,
  duckW:  0.86, duckH:  0.82,

  // --- spawning ---
  reactionTime:  0.62,    // minimum seconds of warning between obstacles
  spawnAhead:   34,       // how far in front of the player obstacles appear
  difficultyAt: 900,      // distance at which spacing reaches its tightest

  // --- presentation ---
  poseFps:      12,       // 60 reads as low-poly 3D; 12 reads as a sprite
  // Must stay under half the view width (VIEW_H * aspect / 2 \u2248 4.1) or the
  // runner walks off the left edge of the screen entirely.
  camBehind:     2.4,     // how far left of centre the runner sits
  camLerpY:      5,

  // --- touch ---
  // How much of the bottom of the screen ducks. The rest jumps, on contact.
  duckZone:      0.34
};
