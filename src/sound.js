// Per-character sound effects.
//   0 = none
//   1 = teletype clack: layered sub-thump (~110 Hz sine) + filtered noise click
//   2 = movie text: short square-wave chirp (high-pitched UI typing tone)
//   3 = teletype line: ED1000 FSK tones (700 Hz = '1', 500 Hz = '0')
//       https://befinitiv.wordpress.com/2018/12/31/teletype-ed1000-signal-generation/

export const SOUND_OFF = 0;
export const SOUND_TELETYPE = 1;
export const SOUND_MOVIE = 2;
export const SOUND_FSK = 3;

export class Sound {
  constructor() {
    this.mode = SOUND_OFF;
    this.ctx = null;
    this.master = null;
    this._noise = null;
    this._fskEndTime = 0;
    this._sampleBuffer = null;
    this._sampleLoading = false;
    // Allow the FSK/clack timing to track the visual character pace.
    this.charDurationMs = 80;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== SOUND_OFF) this._ensureContext();
  }

  setCharDuration(ms) {
    this.charDurationMs = Math.max(8, ms);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  tick(ch) {
    if (this.mode === SOUND_OFF) return;
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (ch === ' ' || ch === '\n' || ch === '\t') return;
    const t = this.ctx.currentTime;
    if (this.mode === SOUND_TELETYPE) this._teletypeClack(t);
    else if (this.mode === SOUND_MOVIE) this._movieBeep(t);
    else if (this.mode === SOUND_FSK) this._fskTone(t, ch);
  }

  preview() {
    if (this.mode === SOUND_OFF || !this.ctx) return;
    const sample = 'TELETYPE';
    const t0 = this.ctx.currentTime;
    const step = this.mode === SOUND_FSK
      ? Math.min(0.16, this.charDurationMs / 1000)
      : 0.08;
    for (let i = 0; i < sample.length; i++) {
      const t = t0 + i * step;
      const ch = sample[i];
      if (this.mode === SOUND_TELETYPE) this._teletypeClack(t);
      else if (this.mode === SOUND_MOVIE) this._movieBeep(t);
      else if (this.mode === SOUND_FSK) this._fskTone(t, ch);
    }
  }

  _ensureContext() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
    }
    this.resume();
    this._loadSample();
  }

  _loadSample() {
    if (this._sampleBuffer || this._sampleLoading || !this.ctx) return;
    this._sampleLoading = true;
    fetch('teletype.mp3')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((buf) => this.ctx.decodeAudioData(buf))
      .then((audioBuf) => { this._sampleBuffer = audioBuf; })
      .catch((err) => { console.warn('teletype.mp3 load failed:', err); })
      .finally(() => { this._sampleLoading = false; });
  }

  _noiseBuffer() {
    if (!this._noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.1);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    return this._noise;
  }

  _teletypeClack(t) {
    if (this._sampleBuffer) return this._sampledClack(t);
    return this._synthClack(t);
  }

  _sampledClack(t) {
    const buf = this._sampleBuffer;
    const sliceDur = 0.05 + Math.random() * 0.05;       // 50-100ms
    const maxOffset = Math.max(0, buf.duration - sliceDur - 0.01);
    const offset = Math.random() * maxOffset;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.85, t + 0.004);
    env.gain.setValueAtTime(0.85, t + sliceDur - 0.012);
    env.gain.exponentialRampToValueAtTime(0.0008, t + sliceDur);
    src.connect(env); env.connect(this.master);
    src.start(t, offset, sliceDur + 0.05);
    src.stop(t + sliceDur + 0.05);
  }

  _synthClack(t) {
    // Layer 1: low-frequency thump (solenoid + platen)
    const thumpDur = 0.07;
    const thumpOsc = this.ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(140 + Math.random() * 30, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(70, t + thumpDur);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0, t);
    thumpGain.gain.linearRampToValueAtTime(0.55, t + 0.003);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + thumpDur);
    thumpOsc.connect(thumpGain); thumpGain.connect(this.master);
    thumpOsc.start(t); thumpOsc.stop(t + thumpDur + 0.01);

    // Layer 2: sharp typebar click (filtered noise burst)
    const clickDur = 0.025;
    const clickT = t + 0.004;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.playbackRate.value = 0.95 + Math.random() * 0.3;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 800;
    bp.Q.value = 8;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0, clickT);
    clickGain.gain.linearRampToValueAtTime(0.35, clickT + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0008, clickT + clickDur);
    src.connect(bp); bp.connect(clickGain); clickGain.connect(this.master);
    src.start(clickT); src.stop(clickT + clickDur + 0.01);
  }

  _movieBeep(t) {
    const duration = 0.028;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1700 + Math.random() * 500;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env); env.connect(this.master);
    osc.start(t); osc.stop(t + duration + 0.02);
  }

  // ED1000 FSK: 700 Hz = '1', 500 Hz = '0'. We pseudo-encode each char as
  // start bit (0) + 5 data bits (lower 5 bits of charCode) + stop bit (1).
  // Total duration tracks charDurationMs (capped) so the audio stays in sync
  // with the visual teletype pace.
  _fskTone(t, ch) {
    // Avoid stacking overlapping FSK bursts when the visual delay is faster
    // than one symbol — drop the new tick if a previous one is still playing.
    if (t < this._fskEndTime) return;
    const total = Math.min(0.18, Math.max(0.04, this.charDurationMs / 1000));
    const bitDur = total / 7.5;
    const code = ch.charCodeAt(0);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // Start bit: 500 Hz
    osc.frequency.setValueAtTime(500, t);
    // 5 data bits: low 5 bits of charCode (LSB first)
    for (let i = 0; i < 5; i++) {
      const bit = (code >> i) & 1;
      osc.frequency.setValueAtTime(bit ? 700 : 500, t + (i + 1) * bitDur);
    }
    // Stop bit: 700 Hz, 1.5 bit times
    osc.frequency.setValueAtTime(700, t + 6 * bitDur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.005);
    env.gain.setValueAtTime(0.18, t + total - 0.008);
    env.gain.exponentialRampToValueAtTime(0.0005, t + total);
    osc.connect(env); env.connect(this.master);
    osc.start(t); osc.stop(t + total + 0.02);
    this._fskEndTime = t + total;
  }
}
