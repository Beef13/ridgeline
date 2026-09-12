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

const CLIPS = { jump: 'jump.mp3', duck: 'duck.mp3', crash: 'crash.mp3', bell: 'bell.mp3' };

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

  /**
   * The star collect, synthesised rather than sampled.
   *
   * Measured off the reference clip rather than designed from an idea of what
   * a collect sound is: it is not a bell with a click on the front. It is two
   * near-pure tones a fifth apart, played one after the other, with a soft
   * ten-millisecond attack and the whole thing over in 62 ms. No sample file,
   * which is one less thing to download on a phone and one less thing that can
   * arrive late.
   *
   * It goes into `this.bus`, NOT ctx.destination. Straight to the destination
   * is what the synthesis bench does because it has no mixer, and copying that
   * here would leave one sound in the game the mute button and the volume
   * slider could not touch — the loudest possible bug in a silenced game.
   */
  ping() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const at = ctx.currentTime;

    /* Blends toward tanh rather than steepening it, so drive 0 is exactly
       linear. A curve whose steepness is the control pins everything above
       about 0.3 long before the dial reaches the top. */
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024), k = 4, drive = 0.18;
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = x * (1 - drive) + (Math.tanh(x * k) / Math.tanh(k)) * drive;
    }
    shape.curve = curve;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4250; lp.Q.value = 0.5;
    const out = ctx.createGain(); out.gain.value = 0.10;
    shape.connect(lp); lp.connect(out); out.connect(this.bus);

    /* A sine with a trace of its 3rd. The reference measures 7% there and
       under 1% on every other harmonic, so this is very nearly a pure tone —
       nothing inharmonic, nothing bell-like. */
    const voice = (freq, env) => {
      for (const [mult, amp] of [[1, 1], [3, 0.070]]) {
        if (amp <= 0.0005) continue;
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = freq * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        env(g.gain, amp);
        o.connect(g); g.connect(shape);
        o.start(at); o.stop(at + 0.0620 + 0.02);
      }
    };

    // note one: soft rise, short plateau, fades away under note two
    voice(1230, (g, amp) => {
      g.linearRampToValueAtTime(amp, at + 0.0060);
      g.setValueAtTime(amp, at + 0.0120);
      g.exponentialRampToValueAtTime(0.0001, at + 0.0390);
    });

    /* Note two: enters quiet under the first, holds, swells, stops dead. The
       last ramp is the one addition to what was measured — the original ends
       at full level, and a discontinuity at full amplitude is a click on every
       speaker that is not a CRT. Two milliseconds is below the threshold of
       hearing it as a fade. */
    voice(1860, (g, amp) => {
      g.setValueAtTime(0.0001, at + 0.0500);
      g.linearRampToValueAtTime(amp * 0.0447, at + 0.0520);
      g.setValueAtTime(amp * 0.0447, at + 0.0540);
      g.linearRampToValueAtTime(amp, at + 0.0620);
      g.linearRampToValueAtTime(0.0001, at + 0.0620 + 0.002);
    });
  }

  /**
   * A new life: one note and its octave, trilled fourteen times over 812 ms.
   *
   * Measured off the reference rather than designed. The shape that matters is
   * the levels falling away pair by pair — held flat, the same sixteen notes
   * are an alarm; falling away, they are a flourish.
   *
   * Into `this.bus` like everything else, so mute and the volume slider reach
   * it. This is the longest sound in the game by a factor of ten, which makes
   * it the worst one to leave outside the mixer.
   */
  life() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const at = ctx.currentTime;

    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024), k = 4, drive = 0.15;
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = x * (1 - drive) + (Math.tanh(x * k) / Math.tanh(k)) * drive;
    }
    shape.curve = curve;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 12200; lp.Q.value = 0.6;
    const out = ctx.createGain(); out.gain.value = 0.40;
    shape.connect(lp); lp.connect(out); out.connect(this.bus);

    /* 2nd and 3rd almost level with the fundamental and little above the 4th.
       No stock oscillator shape does that, so the tone is built by hand. */
    const HARM = [1, 0.78, 0.78, 0.22];
    const SUM = HARM.reduce((a2, b2) => a2 + b2, 0);
    const LOW = 579, HIGH = 1158;
    const NOTE = 0.0580, STEP = 0.0580;
    const LEVEL = [1.000, 0.360, 0.198, 0.109, 0.060, 0.033, 0.018];
    const DROOP = 0.513;                    // across each note

    for (let i = 0; i < 14; i++) {
      const t0 = at + i * STEP, t1 = t0 + NOTE;
      const lvl = LEVEL[Math.floor(i / 2)] / SUM;
      const f = (i % 2 === 0) ? LOW : HIGH;
      for (let h = 0; h < HARM.length; h++) {
        if (HARM[h] <= 0.002) continue;
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * (h + 1);
        const g = ctx.createGain();
        const peak = Math.max(0.0001, lvl * HARM[h]);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.0005);
        g.gain.linearRampToValueAtTime(peak * DROOP, t1 - 0.003);
        // never a hard edge between two pitches: at this level it ticks
        g.gain.linearRampToValueAtTime(0.0001, t1);
        o.connect(g); g.connect(shape);
        o.start(t0); o.stop(t1 + 0.01);
      }
    }
  }

  /**
   * Landing on a bird: one tone rising 161 -> 322 Hz over 176 ms, then held
   * while it dies away.
   *
   * The RISE is the whole trick. A falling sweep over the same two pitches is
   * a thing being squashed; a rising one is a thing springing up, which is
   * what the player actually did — they bounced off it. Nothing about the
   * timbre carries that, only the direction.
   */
  stomp() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const at = ctx.currentTime;

    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024), k = 4, drive = 0.59;
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = x * (1 - drive) + (Math.tanh(x * k) / Math.tanh(k)) * drive;
    }
    shape.curve = curve;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 10000; lp.Q.value = 0.6;
    const out = ctx.createGain(); out.gain.value = 0.37;
    shape.connect(lp); lp.connect(out); out.connect(this.bus);

    /* The sweep is SAMPLED rather than handed to a ramp node, because
       setValueCurveAtTime is the only way to control the shape between the two
       pitches. Here it is ratio-linear — an even climb in pitch rather than in
       hertz, which is the slower-starting of the two and the one that sounds
       like a spring rather than a slide. */
    const FROM = 161, TO = 322, BLEND = 1.00;
    const N = 128, sweep = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      sweep[i] = (FROM + (TO - FROM) * u) * (1 - BLEND)
               + (FROM * Math.pow(TO / FROM, u)) * BLEND;
    }

    // mostly fundamental, 3rd above the 2nd — no stock waveform does that
    const HARM = [1, 0.11, 0.26, 0.08];
    const SUM = HARM.reduce((a2, b2) => a2 + b2, 0);
    const DUR = 0.6100, RISE = 0.1760;
    const TAIL = 1.627e-3;                  // level at the end

    for (let h = 0; h < HARM.length; h++) {
      if (HARM[h] <= 0.002) continue;
      const o = ctx.createOscillator(); o.type = 'sine';
      /* Every harmonic follows the same curve scaled up, which is what keeps
         it one voice — the node's own frequency is overridden the moment the
         curve starts, so it has to be baked into the curve itself. */
      const mine = new Float32Array(N);
      for (let i = 0; i < N; i++) mine[i] = sweep[i] * (h + 1);
      o.frequency.setValueAtTime(mine[0], at);
      o.frequency.setValueCurveAtTime(mine, at, RISE);
      const g = ctx.createGain();
      const peak = HARM[h] / SUM;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.0025);
      g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak * TAIL), at + DUR - 0.004);
      g.gain.linearRampToValueAtTime(0.0001, at + DUR);
      o.connect(g); g.connect(shape);
      o.start(at); o.stop(at + DUR + 0.01);
    }
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
