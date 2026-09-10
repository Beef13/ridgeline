/**
 * The two mute buttons under the screen.
 *
 * They are deliberately not one control. Muting the music and muting the game
 * are different wishes — plenty of people want the flute off and still want to
 * hear the thud when they hit a crate — so the music button owns only the
 * track and the speaker button owns everything, the music included.
 *
 * That nesting is the only subtlety here: with all sound muted the music
 * button still shows whatever the player last chose for the music, because it
 * is a separate preference that should survive un-muting. Overwriting it would
 * mean a player who muted everything for a phone call comes back to music they
 * had switched off an hour earlier.
 */
export function mountAudioToggles(music, sfx) {
  const bind = (id, isOff, set) => {
    const btn = document.getElementById(id);
    if (!btn) return () => {};
    const on = btn.querySelector('[data-on]');
    const off = btn.querySelector('[data-off]');
    const paint = () => {
      const muted = isOff();
      btn.classList.toggle('off', muted);
      btn.setAttribute('aria-pressed', String(muted));
      if (on) on.hidden = muted;
      if (off) off.hidden = !muted;
    };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      set(!isOff());
      paint();
    });
    paint();
    return paint;
  };

  const paintMusic = bind('m-music',
    () => music.muted,
    (v) => { if (v !== music.muted) music.toggleMute(); });

  const paintAll = bind('m-all',
    () => music.master,
    (v) => { music.setMaster(v); sfx.setMuted(v); });

  // the master choice is remembered across visits, so the effects bus has to
  // be told about it at boot as well as on a press
  sfx.setMuted(music.master);

  return () => { paintMusic(); paintAll(); };
}
