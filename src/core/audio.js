/**
 * Background music with a seamless loop.
 *
 * `<audio loop>` is not good enough here: the track ends with a fade-out, so
 * looping it plays a fade to silence and then jumps back to a mid-level start,
 * audibly, every time round. MP3 also carries encoder padding at both ends, so
 * even a track without a fade gets a small gap.
 *
 * Two elements instead: the second is brought in over the first and crossfaded,
 * starting BEFORE the outro so the fade-out is never heard. Cheap in memory too
 * — decoding 7.5 minutes into a Web Audio buffer would cost well over 100 MB.
 */
export const MUSIC = {
  src: ((typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/') + 'audio/ethnic-flute-ambient.mp3',
  loopTail: 18,     // seconds from the end at which to bring the next copy in
  crossfade: 6,     // seconds to blend over
  volume: 0.55,
  duckOnDeath: 0.45 // multiplier while the run-over screen is up
};

const KEY = 'ridgeline.audio';

export class Music {
  constructor(cfg = MUSIC) {
    this.cfg = cfg;
    this.volume = cfg.volume;
    this.muted = false;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) { this.volume = saved.volume ?? this.volume; this.muted = !!saved.muted; }
    } catch (e) { /* private mode; defaults are fine */ }

    this.els = [0, 1].map(() => {
      const a = new Audio(cfg.src);
      a.preload = 'auto';
      a.loop = false;             // we handle looping; the built-in one gaps
      a.volume = 0;
      a.hidden = true;
      // Attached rather than detached: some mobile browsers stall preload on
      // an element that is not in the document, and it makes the pair visible
      // to tooling.
      document.body.appendChild(a);
      return a;
    });
    this.cur = 0;
    this.fading = false;
    this.fadeT = 0;
    this.started = false;
    this.duck = 1;

    addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.toggleMute(); });
    // Nothing should keep playing into a tab the player has left.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.els.forEach((a) => a.pause());
      else if (this.started) this.els[this.cur].play().catch(() => {});
    });
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ volume: this.volume, muted: this.muted })); }
    catch (e) { /* ignore */ }
  }

  setVolume(v) { this.volume = v; this.save(); }
  toggleMute() { this.muted = !this.muted; this.save(); }
  setDuck(on) { this.duck = on ? this.cfg.duckOnDeath : 1; }

  /** Must be called from a user gesture — browsers refuse audio before one. */
  start() {
    if (this.started) return;
    this.started = true;
    const a = this.els[0];
    a.currentTime = 0;
    a.play().catch((e) => console.warn('[audio] blocked:', e.message));
  }

  target() { return this.muted ? 0 : this.volume * this.duck; }

  /** Call once per frame. */
  update(dt) {
    if (!this.started) return;
    const { crossfade, loopTail } = this.cfg;
    const a = this.els[this.cur], b = this.els[1 - this.cur];

    if (!this.fading) {
      a.volume = Math.min(1, Math.max(0, this.target()));
      const dur = a.duration;
      if (dur && a.currentTime >= dur - loopTail) {
        // Bring the next copy in before the outro starts, and drop the outro.
        b.currentTime = 0;
        b.volume = 0;
        b.play().catch(() => {});
        this.fading = true;
        this.fadeT = 0;
      }
      return;
    }

    this.fadeT = Math.min(1, this.fadeT + dt / crossfade);
    const t = this.target();
    // equal-power, so the sum stays level through the blend instead of dipping
    a.volume = Math.min(1, Math.max(0, Math.cos(this.fadeT * Math.PI / 2) * t));
    b.volume = Math.min(1, Math.max(0, Math.sin(this.fadeT * Math.PI / 2) * t));

    if (this.fadeT >= 1) {
      a.pause();
      this.cur = 1 - this.cur;
      this.fading = false;
    }
  }
}
