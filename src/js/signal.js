/**
 * 3D Oscilloscope RF Generator
 * Core signal-processing engine
 * ─────────────────────────────────────────────
 * Waveforms, modulation, recording, autopilot,
 * and Web Audio API integration.
 */

'use strict';

/* ═══════════════════════════════════════════════
   WAVEFORM GENERATORS
═══════════════════════════════════════════════ */
const Waveforms = {
  sine:     (t) => Math.sin(t),
  square:   (t) => Math.sign(Math.sin(t)),
  triangle: (t) => (2 / Math.PI) * Math.asin(Math.sin(t)),
  sawtooth: (t) => (t % (2 * Math.PI)) / Math.PI - 1,
  noise:    ()  => Math.random() * 2 - 1,
  pulse:    (t, duty = 0.3) => (t % (2 * Math.PI)) / (2 * Math.PI) < duty ? 1 : -1,
  chirp:    (t, k = 0.05) => Math.sin(t + k * t * t),
  harmonics:(t, n = 4) => {
    let s = 0;
    for (let i = 1; i <= n; i++) s += Math.sin(i * t) / i;
    return s / Math.log(n + 1);
  },
};

/* ═══════════════════════════════════════════════
   SIGNAL PRESETS (frequencies in Hz, mood/use)
═══════════════════════════════════════════════ */
const PRESETS = {
  /* Solfeggio frequencies */
  'UT 396 Hz (Liberation)':    { freq: 396,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  'RE 417 Hz (Change)':        { freq: 417,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  'MI 528 Hz (DNA Repair)':    { freq: 528,  wave: 'sine',     amp: 0.7, fm: 0,    am: 0 },
  'FA 639 Hz (Connection)':    { freq: 639,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  'SOL 741 Hz (Expression)':   { freq: 741,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  'LA 852 Hz (Intuition)':     { freq: 852,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  'SI 963 Hz (Awakening)':     { freq: 963,  wave: 'sine',     amp: 0.6, fm: 0,    am: 0 },
  /* Binaural beats */
  'Delta 2 Hz (Deep Sleep)':   { freq: 200,  wave: 'sine',     amp: 0.5, fm: 0,    am: 0, binaural: 2 },
  'Theta 6 Hz (Meditation)':   { freq: 200,  wave: 'sine',     amp: 0.5, fm: 0,    am: 0, binaural: 6 },
  'Alpha 10 Hz (Relax)':       { freq: 200,  wave: 'sine',     amp: 0.5, fm: 0,    am: 0, binaural: 10 },
  'Beta 20 Hz (Focus)':        { freq: 200,  wave: 'sine',     amp: 0.5, fm: 0,    am: 0, binaural: 20 },
  'Gamma 40 Hz (Insight)':     { freq: 200,  wave: 'sine',     amp: 0.5, fm: 0,    am: 0, binaural: 40 },
  /* Musical notes */
  'A4 440 Hz':                 { freq: 440,  wave: 'sine',     amp: 0.7, fm: 0,    am: 0 },
  'C4 261 Hz':                 { freq: 261.6,wave: 'sine',     amp: 0.7, fm: 0,    am: 0 },
  'G4 392 Hz':                 { freq: 392,  wave: 'sine',     amp: 0.7, fm: 0,    am: 0 },
  /* RF-style / utility */
  'RF Sweep':                  { freq: 1000, wave: 'chirp',    amp: 0.5, fm: 200,  am: 0 },
  'AM Radio Demo':             { freq: 500,  wave: 'sine',     amp: 0.8, fm: 0,    am: 50 },
  'FM Radio Demo':             { freq: 500,  wave: 'sine',     amp: 0.8, fm: 100,  am: 0 },
  'White Noise':               { freq: 440,  wave: 'noise',    amp: 0.4, fm: 0,    am: 0 },
  'Harmonics Stack':           { freq: 110,  wave: 'harmonics',amp: 0.7, fm: 0,    am: 0 },
  'Square Bass':               { freq: 80,   wave: 'square',   amp: 0.5, fm: 0,    am: 0 },
  'Sawtooth Lead':             { freq: 330,  wave: 'sawtooth', amp: 0.5, fm: 0,    am: 0 },
};

/* ═══════════════════════════════════════════════
   AUTOPILOT SEQUENCES
═══════════════════════════════════════════════ */
const AUTOPILOT_SEQUENCES = [
  ['UT 396 Hz (Liberation)', 'RE 417 Hz (Change)', 'MI 528 Hz (DNA Repair)', 'FA 639 Hz (Connection)'],
  ['Alpha 10 Hz (Relax)', 'Theta 6 Hz (Meditation)', 'Delta 2 Hz (Deep Sleep)'],
  ['C4 261 Hz', 'G4 392 Hz', 'A4 440 Hz', 'G4 392 Hz', 'C4 261 Hz'],
  ['RF Sweep', 'AM Radio Demo', 'FM Radio Demo', 'White Noise', 'Harmonics Stack'],
  ['Beta 20 Hz (Focus)', 'Gamma 40 Hz (Insight)', 'LA 852 Hz (Intuition)', 'SI 963 Hz (Awakening)'],
];

/* ═══════════════════════════════════════════════
   SIGNAL ENGINE
═══════════════════════════════════════════════ */
class SignalEngine {
  constructor() {
    this.freq      = 440;
    this.amp       = 0.7;
    this.wave      = 'sine';
    this.fmDepth   = 0;        // FM modulation depth (Hz)
    this.amDepth   = 0;        // AM modulation depth (0-1)
    this.modFreq   = 5;        // Modulation frequency (Hz)
    this.phase     = 0;
    this.time      = 0;
    this.sampleRate= 44100;

    this.recording = false;
    this.recordedFrames = [];  // { t, sample }
    this.savedSignals   = [];  // [{name, frames, meta}]

    this.autopilot = false;
    this.autoSeqIdx= 0;
    this.autoPresetIdx = 0;
    this.autoTimer = 0;
    this.autoDuration = 4000; // ms per preset

    this.messageLog = [];

    this._lastAutoTime = 0;
  }

  /** Compute one sample for the given absolute time (seconds) */
  sample(t) {
    const twoPi = 2 * Math.PI;
    // FM modulation
    const fmOffset = this.fmDepth > 0
      ? this.fmDepth * Math.sin(twoPi * this.modFreq * t)
      : 0;
    const instFreq = this.freq + fmOffset;
    // Phase accumulator
    const phase = twoPi * instFreq * t;
    // Waveform
    const fn = Waveforms[this.wave] || Waveforms.sine;
    let s = fn(phase);
    // AM modulation
    if (this.amDepth > 0) {
      const amEnv = 1 + this.amDepth * Math.sin(twoPi * this.modFreq * t);
      s *= amEnv / (1 + this.amDepth);
    }
    // Amplitude
    s *= this.amp;
    return s;
  }

  /** Get a buffer of N samples from current time */
  getBuffer(n) {
    const dt = 1 / this.sampleRate;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      buf[i] = this.sample(this.time + i * dt);
    }
    this.time += n * dt;
    return buf;
  }

  /** Apply a preset by name */
  applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    this.freq    = p.freq;
    this.amp     = p.amp;
    this.wave    = p.wave;
    this.fmDepth = p.fm  || 0;
    this.amDepth = p.am  || 0;
    this.log(`Preset: ${name}`, 'info');
  }

  /** Start recording */
  startRecording() {
    this.recordedFrames = [];
    this.recording = true;
    this.log('Recording started', 'info');
  }

  /** Stop recording, save with a name */
  stopRecording(name) {
    this.recording = false;
    const meta = {
      freq: this.freq, amp: this.amp, wave: this.wave,
      fmDepth: this.fmDepth, amDepth: this.amDepth,
      modFreq: this.modFreq,
    };
    this.savedSignals.push({
      name: name || `Signal-${this.savedSignals.length + 1}`,
      frames: [...this.recordedFrames],
      meta,
      ts: Date.now(),
    });
    this.log(`Saved "${name}" (${this.recordedFrames.length} samples)`, 'info');
    this.recordedFrames = [];
    return this.savedSignals[this.savedSignals.length - 1];
  }

  /** Feed a sample into recording buffer */
  recordSample(s) {
    if (this.recording) this.recordedFrames.push(s);
  }

  /** Export all saved signals as JSON */
  exportJSON() {
    return JSON.stringify({ version: 1, signals: this.savedSignals }, null, 2);
  }

  /** Import saved signals from JSON */
  importJSON(json) {
    try {
      const obj = JSON.parse(json);
      this.savedSignals.push(...(obj.signals || []));
      this.log(`Imported ${obj.signals.length} signal(s)`, 'info');
    } catch (e) {
      this.log('Import failed: invalid JSON', 'error');
    }
  }

  /** Autopilot tick — call each animation frame with elapsed ms */
  autopilotTick(dt) {
    if (!this.autopilot) return;
    this.autoTimer += dt;
    if (this.autoTimer >= this.autoDuration) {
      this.autoTimer = 0;
      this.autoPresetIdx++;
      const seqIdx = this.autoSeqIdx % AUTOPILOT_SEQUENCES.length;
      const seq    = AUTOPILOT_SEQUENCES[seqIdx];
      if (this.autoPresetIdx >= seq.length) {
        this.autoPresetIdx = 0;
        this.autoSeqIdx    = (this.autoSeqIdx + 1) % AUTOPILOT_SEQUENCES.length;
      }
      const name = AUTOPILOT_SEQUENCES[this.autoSeqIdx % AUTOPILOT_SEQUENCES.length][this.autoPresetIdx];
      this.applyPreset(name);
    }
  }

  log(msg, level = 'info') {
    this.messageLog.unshift({ msg, level, ts: new Date().toLocaleTimeString() });
    if (this.messageLog.length > 100) this.messageLog.pop();
  }
}

/* ═══════════════════════════════════════════════
   WEB AUDIO ENGINE
═══════════════════════════════════════════════ */
class AudioEngine {
  constructor(signalEngine) {
    this.se  = signalEngine;
    this.ctx = null;
    this.osc = null;
    this.gainNode  = null;
    this.amOsc     = null;
    this.amGain    = null;
    this.fmOsc     = null;
    this.fmGain    = null;
    this.analyser  = null;
    this.playing   = false;
    this.binauralL = null;
    this.binauralR = null;
    this.binauralMode = false;
    this.binauralDiff = 10;
  }

  _init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.connect(this.ctx.destination);
  }

  _waveTypeFor(wave) {
    const map = { sine:'sine', square:'square', triangle:'triangle', sawtooth:'sawtooth' };
    return map[wave] || 'sine';
  }

  /** Start audio playback */
  start() {
    this._init();
    if (this.playing) this.stop();
    const se = this.se;
    const ctx = this.ctx;

    if (se.wave === 'noise') {
      this._startNoise();
      return;
    }

    // Main oscillator
    this.osc = ctx.createOscillator();
    this.gainNode = ctx.createGain();
    this.osc.type = this._waveTypeFor(se.wave);
    this.osc.frequency.value = se.freq;
    this.gainNode.gain.value = se.amp;

    // FM modulation
    if (se.fmDepth > 0) {
      this.fmOsc  = ctx.createOscillator();
      this.fmGain = ctx.createGain();
      this.fmOsc.frequency.value = se.modFreq;
      this.fmGain.gain.value     = se.fmDepth;
      this.fmOsc.connect(this.fmGain);
      this.fmGain.connect(this.osc.frequency);
      this.fmOsc.start();
    }

    // AM modulation
    if (se.amDepth > 0) {
      this.amOsc  = ctx.createOscillator();
      this.amGain = ctx.createGain();
      this.amOsc.frequency.value = se.modFreq;
      this.amGain.gain.value     = se.amDepth;
      this.amOsc.connect(this.amGain);
      this.amGain.connect(this.gainNode.gain);
      this.amOsc.start();
    }

    this.osc.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.osc.start();
    this.playing = true;
  }

  _startNoise() {
    const ctx = this.ctx;
    const bufSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    this.noiseSource = ctx.createBufferSource();
    this.noiseSource.buffer = buf;
    this.noiseSource.loop   = true;
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.se.amp * 0.3;
    this.noiseSource.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.noiseSource.start();
    this.playing = true;
  }

  /** Start binaural beat mode */
  startBinaural(baseFreq, diffHz) {
    this._init();
    if (this.playing) this.stop();
    const ctx = this.ctx;
    const merger = ctx.createChannelMerger(2);
    merger.connect(this.analyser);

    this.binauralL = ctx.createOscillator();
    this.binauralR = ctx.createOscillator();
    const gL = ctx.createGain(), gR = ctx.createGain();
    gL.gain.value = gR.gain.value = this.se.amp;

    this.binauralL.frequency.value = baseFreq;
    this.binauralR.frequency.value = baseFreq + diffHz;

    this.binauralL.connect(gL); gL.connect(merger, 0, 0);
    this.binauralR.connect(gR); gR.connect(merger, 0, 1);

    this.binauralL.start(); this.binauralR.start();
    this.binauralMode = true;
    this.playing = true;
  }

  stop() {
    const safe = (n) => { try { if (n) n.stop(); } catch(e){} };
    safe(this.osc);
    safe(this.fmOsc);
    safe(this.amOsc);
    safe(this.noiseSource);
    safe(this.binauralL);
    safe(this.binauralR);
    this.osc = this.fmOsc = this.amOsc = null;
    this.noiseSource = null;
    this.binauralL = this.binauralR = null;
    this.binauralMode = false;
    this.playing = false;
  }

  /** Update live oscillator params without restarting */
  updateParams() {
    if (!this.playing || !this.osc) return;
    const se = this.se;
    this.osc.frequency.value = se.freq;
    if (this.gainNode) this.gainNode.gain.value = se.amp;
    if (this.fmGain)   this.fmGain.gain.value  = se.fmDepth;
    if (this.fmOsc)    this.fmOsc.frequency.value = se.modFreq;
    if (this.amGain)   this.amGain.gain.value  = se.amDepth;
    if (this.amOsc)    this.amOsc.frequency.value = se.modFreq;
  }

  getTimeDomainData() {
    if (!this.analyser) return new Uint8Array(2048);
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    return buf;
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(1024);
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    return buf;
  }
}

/* ═══════════════════════════════════════════════
   EXPORTS
═══════════════════════════════════════════════ */
window.SignalEngine = SignalEngine;
window.AudioEngine  = AudioEngine;
window.Waveforms    = Waveforms;
window.PRESETS      = PRESETS;
window.AUTOPILOT_SEQUENCES = AUTOPILOT_SEQUENCES;
