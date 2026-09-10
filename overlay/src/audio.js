// Fully synthesised — no asset files. Splash, slot spin, jackpot.

class SynthAudio {
  constructor() {
    this.muted = false;
    this.ctx = null;
  }

  resume() {
    if (this.muted) return;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      } catch {
        return;
      }
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  _now() {
    return this.ctx.currentTime;
  }

  _gain(peak, t0, attack, release) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
    g.connect(this.master || this.ctx.destination);
    return g;
  }

  _blip(t, freq, peak, dur, type = 'square', lpHz) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = this._gain(peak, t, 0.004, dur);
    if (lpHz) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lpHz;
      o.connect(lp).connect(g);
    } else {
      o.connect(g);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  splash(tier = 1) {
    if (this.muted || !this.ctx) return;
    const t0 = this._now();
    const dur = 0.5;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200 + tier * 400, t0);
    lp.frequency.exponentialRampToValueAtTime(300, t0 + dur);
    const g = this._gain(0.35, t0, 0.01, dur);
    src.connect(lp).connect(g);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // one tick of the name "spinning" — call per shuffle frame
  slotTick() {
    if (this.muted || !this.ctx) return;
    this._blip(this._now(), 1300 + Math.random() * 700, 0.028, 0.03, 'square');
  }

  // the name lands — coin ching + rising arpeggio, bigger for higher levels (1..5)
  jackpot(level = 1) {
    if (this.muted || !this.ctx) return;
    const t0 = this._now() + 0.02;
    const L = Math.max(1, Math.min(5, level));

    // bright coin ching
    this._blip(t0, 2300, 0.13, 0.16, 'triangle');
    this._blip(t0 + 0.05, 3100, 0.1, 0.14, 'triangle');

    // rising run
    const steps = 3 + L;
    for (let i = 0; i < steps; i++) {
      this._blip(t0 + 0.07 + i * 0.065, 340 * Math.pow(2, i / 3.5), 0.08, 0.16, 'square', 3200);
    }

    // triumphant chord for the big ones
    if (L >= 4) {
      const root = 262;
      [1, 1.26, 1.5, 2].forEach((r, i) =>
        this._blip(t0 + 0.4 + i * 0.02, root * r, 0.09, 0.6, 'triangle'),
      );
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t0);
      o.frequency.exponentialRampToValueAtTime(45, t0 + 0.45);
      const g = this._gain(0.32, t0, 0.01, 0.5);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + 0.6);
    }
  }
}

export const audio = new SynthAudio();
