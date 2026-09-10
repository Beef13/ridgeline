/**
 * One-shot sound effects, on the Web Audio graph rather than <audio> elements.
 *
 * An <audio> element is the obvious choice and the wrong one here. Calling
 * play() on one returns a promise the browser fulfils when it gets round to
 * it — tens of milliseconds, variable, and worse on the first play of each
 * clip. On a game where the whole point is that the sound lands ON the
 * keypress, that reads as lag. Decoding every clip into an AudioBuffer up
 * front turns playback into "start a node now", which is scheduled against
 * the audio clock and costs nothing.
 *
 * The music stays on <audio>: it is long, it loops, and nobody can hear a
 * 40ms difference in when a flute comes in.
 */
const BASE = ((typeof import.meta.env !== 'undefined' && import.meta.env.BASE_URL) || '/') + 'audio/';

const CLIPS = { jump: 'jump.mp3', duck: 'duck.mp3', crash: 'crash.mp3' };

export class Sfx {
  constructor(volume = 0.75) {
    this.ctx = null;
    this.bus = null;
    this.buffers = Object.create(null);
    this.volume = volume;
    this.muted = false;
  }

  /**
   * Must be called from a real user gesture. A context created before one is
   * born suspended, and every sound played into it is silently dropped until
   * something resumes it — which looks exactly like broken audio.
   */
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // 'interactive' asks for the smallest output buffer the device will give,
    // which is the difference between ~5ms and ~50ms of output latency
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : this.volume;
    this.bus.connect(this.ctx.destination);
    this.load();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  async load() {
    await Promise.all(Object.entries(CLIPS).map(async ([name, file]) => {
      try {
        const res = await fetch(BASE + file);
        if (!res.ok) throw new Error(res.status + ' ' + file);
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        // a missing effect must never take the game down with it
        console.warn('[sfx] could not load', file, e.message || e);
      }
    }));
  }

  /** Fire and forget. Overlapping calls layer, which is what you want. */
  play(name, rate = 1) {
    const buf = this.buffers[name];
    if (!buf || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(this.bus);
    src.start();
  }

  setMuted(on) {
    this.muted = on;
    if (this.bus) this.bus.gain.value = on ? 0 : this.volume;
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus && !this.muted) this.bus.gain.value = v;
  }
}
