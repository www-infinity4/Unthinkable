/**
 * 3D Oscilloscope RF Generator
 * UI Controller + Main Loop
 * ─────────────────────────────────────────────
 * Wires together the signal engine, audio engine,
 * 3D renderer, and all panel controls.
 */

'use strict';

(function () {

/* ═══════════════════════════════════════════════
   INSTANTIATION
═══════════════════════════════════════════════ */
const se   = new SignalEngine();
const ae   = new AudioEngine(se);
let renderer = null;

/* ═══════════════════════════════════════════════
   ELEMENT REFS
═══════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const canvas2d   = $('spectrum-canvas');
const ctx2d      = canvas2d.getContext('2d');

/* ── Header badges ── */
const badgeRec  = $('badge-rec');
const badgePlay = $('badge-play');
const badgeAuto = $('badge-auto');

/* ── Left panel ── */
const slFreq    = $('sl-freq');
const valFreq   = $('val-freq');
const numFreq   = $('num-freq');
const slAmp     = $('sl-amp');
const valAmp    = $('val-amp');
const slFm      = $('sl-fm');
const valFm     = $('val-fm');
const slAm      = $('sl-am');
const valAm     = $('val-am');
const slModFreq = $('sl-modfreq');
const valModFreq= $('val-modfreq');

/* ── HUD ── */
const hudFreq   = $('hud-freq');
const hudWave   = $('hud-wave');
const hudAmp    = $('hud-amp');
const hudFm     = $('hud-fm');

/* ── Right panel ── */
const sigList   = $('signal-list');
const msgLog    = $('msg-log');
const recordName= $('record-name');

/* ── Bottom transport ── */
const btnPlay   = $('btn-play');
const btnStop   = $('btn-stop');
const btnRecord = $('btn-record');
const btnAutopilot = $('btn-autopilot');
const btnReset  = $('btn-reset-cam');

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
function init() {
  const threeCanvas = $('three-canvas');
  renderer = new OscilloscopeRenderer(threeCanvas);

  buildWaveButtons();
  buildPresets();
  wireControls();
  wireTransport();
  wireViewToggles();
  wireIO();

  se.log('3D Oscilloscope ready', 'info');
  se.log('Click ▶ PLAY to start audio', 'info');
  se.log('Drag the 3D view to rotate', 'info');
  renderLoop();
}

/* ═══════════════════════════════════════════════
   WAVEFORM BUTTONS
═══════════════════════════════════════════════ */
function buildWaveButtons() {
  const waves = [
    { id:'sine',     sym:'∿' },
    { id:'square',   sym:'⊓' },
    { id:'triangle', sym:'△' },
    { id:'sawtooth', sym:'⊿' },
    { id:'noise',    sym:'⋯' },
    { id:'harmonics',sym:'∽' },
    { id:'chirp',    sym:'↗' },
  ];
  const wrap = $('wave-btns');
  waves.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'btn waveform-btn';
    btn.title     = w.id;
    btn.textContent = w.sym;
    btn.dataset.wave = w.id;
    if (w.id === se.wave) btn.classList.add('active');
    btn.addEventListener('click', () => {
      se.wave = w.id;
      wrap.querySelectorAll('.waveform-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (ae.playing) { ae.stop(); ae.start(); }
    });
    wrap.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════
   PRESET BUTTONS
═══════════════════════════════════════════════ */
function buildPresets() {
  const grid = $('preset-grid');
  Object.keys(PRESETS).forEach(name => {
    const btn = document.createElement('button');
    btn.className   = 'preset-btn';
    btn.textContent = name.split('(')[0].trim();
    btn.title       = name;
    btn.addEventListener('click', () => {
      se.applyPreset(name);
      // Check for binaural
      const p = PRESETS[name];
      if (p.binaural) {
        ae.stop();
        ae.startBinaural(p.freq, p.binaural);
        badgePlay.style.display = 'inline-block';
      } else if (ae.playing || ae.binauralMode) {
        ae.stop();
        ae.start();
      }
      syncControls();
      grid.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Annotate the 3D view
      if (renderer) renderer.addAnnotation(name);
    });
    grid.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════
   CONTROLS WIRING
═══════════════════════════════════════════════ */
function wireControls() {
  // Frequency slider (log scale 10 Hz – 20 kHz)
  slFreq.addEventListener('input', () => {
    const v = Math.pow(10, parseFloat(slFreq.value));
    se.freq = v;
    valFreq.textContent = v < 1000 ? v.toFixed(1) + ' Hz' : (v/1000).toFixed(2) + ' kHz';
    numFreq.value = v.toFixed(1);
    ae.updateParams();
  });
  numFreq.addEventListener('change', () => {
    const v = parseFloat(numFreq.value) || 440;
    se.freq = v;
    slFreq.value = Math.log10(v);
    valFreq.textContent = v < 1000 ? v.toFixed(1) + ' Hz' : (v/1000).toFixed(2) + ' kHz';
    ae.updateParams();
  });

  slAmp.addEventListener('input', () => {
    se.amp = parseFloat(slAmp.value);
    valAmp.textContent = se.amp.toFixed(2);
    ae.updateParams();
  });

  slFm.addEventListener('input', () => {
    se.fmDepth = parseFloat(slFm.value);
    valFm.textContent = se.fmDepth.toFixed(0) + ' Hz';
    ae.updateParams();
  });

  slAm.addEventListener('input', () => {
    se.amDepth = parseFloat(slAm.value);
    valAm.textContent = se.amDepth.toFixed(2);
    ae.updateParams();
  });

  slModFreq.addEventListener('input', () => {
    se.modFreq = parseFloat(slModFreq.value);
    valModFreq.textContent = se.modFreq.toFixed(1) + ' Hz';
    ae.updateParams();
  });

  syncControls();
}

function syncControls() {
  slFreq.value = Math.log10(se.freq);
  numFreq.value = se.freq.toFixed(1);
  valFreq.textContent = se.freq < 1000 ? se.freq.toFixed(1) + ' Hz' : (se.freq/1000).toFixed(2) + ' kHz';
  slAmp.value   = se.amp;   valAmp.textContent   = se.amp.toFixed(2);
  slFm.value    = se.fmDepth; valFm.textContent  = se.fmDepth.toFixed(0) + ' Hz';
  slAm.value    = se.amDepth; valAm.textContent  = se.amDepth.toFixed(2);
  slModFreq.value = se.modFreq; valModFreq.textContent = se.modFreq.toFixed(1) + ' Hz';

  // Sync waveform button
  document.querySelectorAll('.waveform-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.wave === se.wave);
  });
}

/* ═══════════════════════════════════════════════
   TRANSPORT
═══════════════════════════════════════════════ */
function wireTransport() {
  btnPlay.addEventListener('click', () => {
    ae.start();
    badgePlay.style.display = 'inline-block';
    se.log('Playing', 'info');
  });

  btnStop.addEventListener('click', () => {
    ae.stop();
    badgePlay.style.display = 'none';
    se.log('Stopped', 'info');
  });

  btnRecord.addEventListener('click', () => {
    if (!se.recording) {
      se.startRecording();
      btnRecord.classList.add('active');
      btnRecord.textContent = '⏺ STOP REC';
      badgeRec.style.display = 'inline-block';
    } else {
      const name = recordName.value.trim() || `Signal-${se.savedSignals.length + 1}`;
      se.stopRecording(name);
      btnRecord.classList.remove('active');
      btnRecord.textContent = '⏺ RECORD';
      badgeRec.style.display = 'none';
      refreshSignalList();
    }
  });

  btnAutopilot.addEventListener('click', () => {
    se.autopilot = !se.autopilot;
    btnAutopilot.classList.toggle('active', se.autopilot);
    badgeAuto.style.display = se.autopilot ? 'inline-block' : 'none';
    if (se.autopilot && !ae.playing) { ae.start(); badgePlay.style.display = 'inline-block'; }
    se.log(se.autopilot ? 'Autopilot ON' : 'Autopilot OFF', 'info');
  });

  btnReset.addEventListener('click', () => { if (renderer) renderer.resetCamera(); });

  // Autopilot duration selector
  $('auto-duration').addEventListener('change', (e) => {
    se.autoDuration = parseInt(e.target.value, 10);
  });
}

/* ═══════════════════════════════════════════════
   VIEW TOGGLES
═══════════════════════════════════════════════ */
function wireViewToggles() {
  $('toggle-wave').addEventListener('click', (e) => {
    if (!renderer) return;
    renderer.showWave = !renderer.showWave;
    e.currentTarget.classList.toggle('active', renderer.showWave);
  });
  $('toggle-trail').addEventListener('click', (e) => {
    if (!renderer) return;
    renderer.showTrail = !renderer.showTrail;
    e.currentTarget.classList.toggle('active', renderer.showTrail);
  });
  $('toggle-bars').addEventListener('click', (e) => {
    if (!renderer) return;
    renderer.showBars = !renderer.showBars;
    e.currentTarget.classList.toggle('active', renderer.showBars);
  });
  $('toggle-rotate').addEventListener('click', (e) => {
    if (!renderer) return;
    renderer.toggleAutoRotate();
    e.currentTarget.classList.toggle('active', renderer._autoRotate);
  });
  $('color-mode').addEventListener('change', (e) => {
    if (!renderer) return;
    renderer.setColorMode(e.target.value);
  });
}

/* ═══════════════════════════════════════════════
   I/O: EXPORT / IMPORT
═══════════════════════════════════════════════ */
function wireIO() {
  $('btn-export').addEventListener('click', () => {
    const json = se.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'oscilloscope-signals.json'; a.click();
    URL.revokeObjectURL(url);
    se.log('Exported signals JSON', 'info');
  });

  $('btn-import').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        se.importJSON(ev.target.result);
        refreshSignalList();
      };
      reader.readAsText(file);
    });
    inp.click();
  });

  $('btn-clear-signals').addEventListener('click', () => {
    se.savedSignals = [];
    refreshSignalList();
    se.log('Cleared all saved signals', 'warn');
  });

  $('btn-annotate').addEventListener('click', () => {
    const label = $('annotate-label').value.trim() || 'Mark';
    if (renderer) renderer.addAnnotation(label, 0xffe600);
    se.log(`Annotation: ${label}`, 'info');
  });
}

/* ═══════════════════════════════════════════════
   SIGNAL LIST
═══════════════════════════════════════════════ */
function refreshSignalList() {
  sigList.innerHTML = '';
  se.savedSignals.forEach((sig) => {
    const row = document.createElement('div');
    row.className = 'signal-item';
    row.innerHTML = `
      <span class="sig-name">${sig.name}</span>
      <span class="sig-time">${new Date(sig.ts).toLocaleTimeString()}</span>
      <button class="sig-del" title="Delete">✕</button>
    `;
    row.querySelector('.sig-del').addEventListener('click', (e) => {
      e.stopPropagation();
      se.savedSignals = se.savedSignals.filter(s => s !== sig);
      refreshSignalList();
    });
    row.addEventListener('click', () => {
      // Re-apply meta to signal engine
      const m = sig.meta;
      Object.assign(se, m);
      syncControls();
      se.log(`Loaded: ${sig.name}`, 'info');
    });
    sigList.appendChild(row);
  });
}

/* ═══════════════════════════════════════════════
   MESSAGE LOG
═══════════════════════════════════════════════ */
function refreshMsgLog() {
  msgLog.innerHTML = '';
  se.messageLog.slice(0, 20).forEach(m => {
    const el = document.createElement('div');
    el.className = `msg-entry ${m.level}`;
    el.textContent = `[${m.ts}] ${m.msg}`;
    msgLog.appendChild(el);
  });
}

/* ═══════════════════════════════════════════════
   2D SPECTRUM CANVAS
═══════════════════════════════════════════════ */
function drawSpectrum(freqData) {
  const W = canvas2d.width  = canvas2d.offsetWidth;
  const H = canvas2d.height = canvas2d.offsetHeight;
  ctx2d.clearRect(0, 0, W, H);
  ctx2d.fillStyle = '#050510';
  ctx2d.fillRect(0, 0, W, H);

  const barW = W / freqData.length;
  for (let i = 0; i < freqData.length; i++) {
    const v = freqData[i] / 255;
    const h = v * H;
    const hue = 180 + (i / freqData.length) * 180;
    ctx2d.fillStyle = `hsl(${hue},100%,55%)`;
    ctx2d.fillRect(i * barW, H - h, barW - 0.5, h);
  }
}

/* ═══════════════════════════════════════════════
   MAIN RENDER LOOP
═══════════════════════════════════════════════ */
let lastTime = performance.now();

function renderLoop() {
  requestAnimationFrame(renderLoop);

  const now = performance.now();
  const dt  = now - lastTime;
  lastTime  = now;

  // Autopilot tick
  if (se.autopilot) {
    se.autopilotTick(dt);
    syncControls();
  }

  // Recording tick
  if (se.recording && ae.playing) {
    const waveRaw = ae.getTimeDomainData();
    for (let i = 0; i < waveRaw.length; i += 4) {
      se.recordSample(waveRaw[i] / 128.0 - 1.0);
    }
  }

  // Get audio data
  const waveData = ae.playing ? ae.getTimeDomainData() : _makeWaveFromSE();
  const freqData = ae.playing ? ae.getFrequencyData()  : new Uint8Array(512);

  // Update 3D
  if (renderer) renderer.update(waveData, freqData, se, now);

  // Update 2D spectrum
  drawSpectrum(freqData.slice(0, 128));

  // Update HUD
  hudFreq.textContent = se.freq < 1000 ? se.freq.toFixed(1) + ' Hz' : (se.freq/1000).toFixed(3) + ' kHz';
  hudWave.textContent = se.wave;
  hudAmp.textContent  = se.amp.toFixed(2);
  hudFm.textContent   = se.fmDepth > 0 ? `FM ${se.fmDepth}Hz` : se.amDepth > 0 ? `AM ${se.amDepth.toFixed(2)}` : '---';

  // Refresh message log every 30 frames
  if (Math.round(now / 33) % 30 === 0) refreshMsgLog();
}

/** Synthesise waveform from signal engine when audio isn't playing */
function _makeWaveFromSE() {
  const N   = 512;
  const buf = new Uint8Array(N);
  const dt  = 1 / 44100;
  const t0  = performance.now() / 1000;
  for (let i = 0; i < N; i++) {
    const v = se.sample(t0 + i * dt);
    buf[i]  = Math.round((v + 1) * 127.5);
  }
  return buf;
}

/* ── Kick off ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
