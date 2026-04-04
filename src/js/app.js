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
const piano = new PianoEngine();
const mic   = new MicEngine(ae);
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
  buildWavebar();
  buildPresets();
  wireControls();
  wireTransport();
  wireViewToggles();
  wireIO();
  wireHamburger();
  wireDrawer();
  wirePiano();
  wireMic();
  wireSoundFactory();
  wireSynth();
  wireSpectrumResize();

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
      // Sync wavebar
      document.querySelectorAll('.wavebar-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.wave === w.id));
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

  // Sync waveform buttons (left panel + wavebar)
  document.querySelectorAll('.waveform-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.wave === se.wave);
  });
  document.querySelectorAll('.wavebar-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.wave === se.wave);
  });

  // Sync drawer duplicate sliders
  const drFreq = $('dr-freq'); if (drFreq) { drFreq.value = Math.log10(se.freq); $('dr-val-freq').textContent = valFreq.textContent; }
  const drAmp  = $('dr-amp');  if (drAmp)  { drAmp.value  = se.amp;             $('dr-val-amp').textContent  = se.amp.toFixed(2); }
  const drFm   = $('dr-fm');   if (drFm)   { drFm.value   = se.fmDepth;         $('dr-val-fm').textContent   = se.fmDepth.toFixed(0)+' Hz'; }
  const drAm   = $('dr-am');   if (drAm)   { drAm.value   = se.amDepth;         $('dr-val-am').textContent   = se.amDepth.toFixed(2); }
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
  $('btn-trig').addEventListener('click', (e) => {
    if (!renderer) return;
    renderer.triggerEnabled = !renderer.triggerEnabled;
    e.currentTarget.classList.toggle('active', renderer.triggerEnabled);
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
function wireSpectrumResize() {
  // Set initial size once
  canvas2d.width  = canvas2d.offsetWidth  || 200;
  canvas2d.height = canvas2d.offsetHeight || 60;
  // Resize only when the element actually changes size (not every frame)
  const ro = new ResizeObserver(() => {
    canvas2d.width  = canvas2d.offsetWidth  || 200;
    canvas2d.height = canvas2d.offsetHeight || 60;
  });
  ro.observe(canvas2d);
}

function drawSpectrum(freqData) {
  const W = canvas2d.width;
  const H = canvas2d.height;
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

  // Get audio data — prefer real analyser data whenever mic is live or audio playing
  const liveAudio = ae.playing || mic.monitoring;
  const waveData = liveAudio ? ae.getTimeDomainData() : _makeWaveFromSE();
  const freqData = liveAudio ? ae.getFrequencyData()  : new Uint8Array(512);

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

/* ═══════════════════════════════════════════════
   WAVEFORM SCROLL BAR (at top)
═══════════════════════════════════════════════ */
function buildWavebar() {
  const waves = [
    { id:'sine',     label:'∿ Sine' },
    { id:'square',   label:'⊓ Square' },
    { id:'triangle', label:'△ Triangle' },
    { id:'sawtooth', label:'⊿ Sawtooth' },
    { id:'noise',    label:'⋯ Noise' },
    { id:'harmonics',label:'∽ Harmonics' },
    { id:'chirp',    label:'↗ Chirp' },
  ];
  const scroll = $('wavebar-scroll');
  scroll.innerHTML = '';
  waves.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'wavebar-btn' + (w.id === se.wave ? ' active' : '');
    btn.textContent = w.label;
    btn.dataset.wave = w.id;
    btn.addEventListener('click', () => {
      se.wave = w.id;
      scroll.querySelectorAll('.wavebar-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Sync the left-panel waveform buttons too
      document.querySelectorAll('.waveform-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.wave === w.id));
      if (ae.playing) { ae.stop(); ae.start(); }
    });
    scroll.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════
   HAMBURGER MENU
═══════════════════════════════════════════════ */
function wireHamburger() {
  const btn  = $('hamburger-btn');
  const menu = $('hamburger-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.classList.remove('open');
    }
  });

  // Master volume in hamburger
  const slVol = $('sl-master-vol');
  const valVol = $('val-master-vol');
  if (slVol) {
    slVol.addEventListener('input', () => {
      ae.masterVolume = parseFloat(slVol.value);
      if (ae.masterGain) ae.masterGain.gain.value = ae.masterVolume;
      valVol.textContent = ae.masterVolume.toFixed(2);
      // Sync drawer volume slider too
      const drVol = $('dr-vol');
      const drValVol = $('dr-val-vol');
      if (drVol) { drVol.value = ae.masterVolume; drValVol.textContent = ae.masterVolume.toFixed(2); }
    });
  }

  // PWA install prompt
  let _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    const installBtn = $('btn-pwa-install');
    if (installBtn) installBtn.style.display = '';
  });
  const installBtn = $('btn-pwa-install');
  if (installBtn) {
    installBtn.style.display = 'none';
    installBtn.addEventListener('click', () => {
      if (_deferredPrompt) { _deferredPrompt.prompt(); _deferredPrompt = null; }
      else { se.log('Open in Chrome, Edge, or Samsung Browser → "Add to Home Screen"', 'info'); }
    });
  }
}

/* ═══════════════════════════════════════════════
   SWIPE-UP DRAWER
═══════════════════════════════════════════════ */
function wireDrawer() {
  const drawer  = $('swipe-drawer');
  const handle  = $('drawer-handle');
  const titleTxt = $('drawer-title-txt');
  const canvasWrap = $('canvas-wrap');

  function openDrawer() {
    drawer.classList.add('open');
    titleTxt.textContent = '⬇ SWIPE DOWN · HIDE CONTROLS';
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    titleTxt.textContent = '⬆ SWIPE UP · MORE CONTROLS';
  }
  function toggleDrawer() {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  }

  handle.addEventListener('click', toggleDrawer);
  handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggleDrawer(); });

  $('btn-drawer').addEventListener('click', toggleDrawer);

  // Swipe-up gesture on canvas wrap
  let _sy = 0, _sx = 0;
  canvasWrap.addEventListener('touchstart', (e) => {
    _sy = e.touches[0].clientY;
    _sx = e.touches[0].clientX;
  }, { passive: true });
  canvasWrap.addEventListener('touchend', (e) => {
    const dy = _sy - e.changedTouches[0].clientY;
    const dx = Math.abs(e.changedTouches[0].clientX - _sx);
    if (dy > 80 && dx < 60) openDrawer();
  }, { passive: true });

  // Drawer: duplicate sliders that mirror the left-panel sliders
  const map = [
    { dr: 'dr-freq',    drVal: 'dr-val-freq',
      fn: (v) => {
        const hz = Math.pow(10, v);
        se.freq = hz;
        $('sl-freq').value = v;
        $('val-freq').textContent = hz < 1000 ? hz.toFixed(1)+' Hz' : (hz/1000).toFixed(2)+' kHz';
        $('num-freq').value = hz.toFixed(1);
        ae.updateParams();
        return hz < 1000 ? hz.toFixed(1)+' Hz' : (hz/1000).toFixed(2)+' kHz';
      }
    },
    { dr: 'dr-amp',  drVal: 'dr-val-amp',
      fn: (v) => { se.amp = parseFloat(v); $('sl-amp').value = v; $('val-amp').textContent = se.amp.toFixed(2); ae.updateParams(); return se.amp.toFixed(2); }
    },
    { dr: 'dr-fm',   drVal: 'dr-val-fm',
      fn: (v) => { se.fmDepth = parseFloat(v); $('sl-fm').value = v; $('val-fm').textContent = se.fmDepth.toFixed(0)+' Hz'; ae.updateParams(); return se.fmDepth.toFixed(0)+' Hz'; }
    },
    { dr: 'dr-am',   drVal: 'dr-val-am',
      fn: (v) => { se.amDepth = parseFloat(v); $('sl-am').value = v; $('val-am').textContent = se.amDepth.toFixed(2); ae.updateParams(); return se.amDepth.toFixed(2); }
    },
  ];
  map.forEach(({ dr, drVal, fn }) => {
    const el = $(dr);
    const vl = $(drVal);
    if (!el) return;
    el.addEventListener('input', () => { vl.textContent = fn(el.value); });
  });

  // Volume slider in drawer → master gain
  const drVol = $('dr-vol');
  const drValVol = $('dr-val-vol');
  drVol.addEventListener('input', () => {
    ae.masterVolume = parseFloat(drVol.value);
    if (ae.masterGain) ae.masterGain.gain.value = ae.masterVolume;
    drValVol.textContent = ae.masterVolume.toFixed(2);
    const slMV = $('sl-master-vol');
    const valMV = $('val-master-vol');
    if (slMV) { slMV.value = ae.masterVolume; valMV.textContent = ae.masterVolume.toFixed(2); }
  });

  // Y Gain slider → renderer amplitude scale
  const drYGain = $('dr-ygain');
  const drValYGain = $('dr-val-ygain');
  if (drYGain) {
    drYGain.addEventListener('input', () => {
      const v = parseFloat(drYGain.value);
      if (renderer) renderer.setYScale(v);
      drValYGain.textContent = v.toFixed(1);
    });
  }

  // Time Zoom slider → renderer visible window
  const drTimeZoom = $('dr-timezoom');
  const drValTimeZoom = $('dr-val-timezoom');
  if (drTimeZoom) {
    drTimeZoom.addEventListener('input', () => {
      const v = parseFloat(drTimeZoom.value);
      if (renderer) renderer.setTimeZoom(v);
      drValTimeZoom.textContent = Math.round(v * 100) + '%';
    });
  }
}

/* ═══════════════════════════════════════════════
   PIANO KEYBOARD
═══════════════════════════════════════════════ */
let _pianoOctave = 4;

const _WHITE_NOTES = ['C','D','E','F','G','A','B'];
const _BLACK_DEFS  = [
  { note:'C#', afterWhite:0 },
  { note:'D#', afterWhite:1 },
  { note:'F#', afterWhite:3 },
  { note:'G#', afterWhite:4 },
  { note:'A#', afterWhite:5 },
];

function _noteFreq(note, octave) {
  const notes12 = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const semis = (octave - 4) * 12 + notes12.indexOf(note) - 9; // semitones from A4
  return 440 * Math.pow(2, semis / 12);
}

function _buildPianoKeys(baseOct) {
  const kb = $('piano-keyboard');
  kb.innerHTML = '';

  const nWhite = 14; // 2 octaves × 7
  const wPct   = 100 / nWhite;

  // White keys
  for (let octOff = 0; octOff <= 1; octOff++) {
    const oct = baseOct + octOff;
    _WHITE_NOTES.forEach((note, ni) => {
      const idx = octOff * 7 + ni;
      const btn = document.createElement('button');
      btn.className = 'piano-white-key';
      btn.style.cssText = `position:absolute;left:${idx*wPct}%;width:${wPct}%;height:100%;`;
      const freq = _noteFreq(note, oct);
      btn.dataset.noteId = note + oct;
      btn.dataset.freq   = freq.toFixed(3);
      const lbl = document.createElement('span');
      lbl.className   = 'piano-key-label';
      lbl.textContent = (ni === 0) ? note + oct : note;
      btn.appendChild(lbl);
      kb.appendChild(btn);
    });
  }

  // Black keys
  for (let octOff = 0; octOff <= 1; octOff++) {
    const oct = baseOct + octOff;
    _BLACK_DEFS.forEach(bk => {
      const whiteIdx = octOff * 7 + bk.afterWhite;
      const btn = document.createElement('button');
      btn.className = 'piano-black-key';
      const leftPct  = (whiteIdx + 0.64) * wPct;
      const widthPct = wPct * 0.58;
      btn.style.cssText = `left:${leftPct}%;width:${widthPct}%;`;
      const freq = _noteFreq(bk.note, oct);
      btn.dataset.noteId = bk.note + oct;
      btn.dataset.freq   = freq.toFixed(3);
      kb.appendChild(btn);
    });
  }
}

function wirePiano() {
  piano.init(ae);
  _buildPianoKeys(_pianoOctave);
  $('piano-oct-label').textContent = `Oct ${_pianoOctave}–${_pianoOctave+1}`;

  // Piano section collapse/expand toggle
  const btnPianoToggle = $('btn-piano-toggle');
  const pianoSection   = $('piano-section');
  let _pianoVisible = true;
  if (btnPianoToggle && pianoSection) {
    btnPianoToggle.addEventListener('click', () => {
      _pianoVisible = !_pianoVisible;
      pianoSection.style.display = _pianoVisible ? '' : 'none';
      btnPianoToggle.textContent = _pianoVisible ? '▼ HIDE' : '▶ SHOW';
    });
  }

  $('btn-oct-down').addEventListener('click', () => {
    if (_pianoOctave > 1) { _pianoOctave--; _buildPianoKeys(_pianoOctave); $('piano-oct-label').textContent = `Oct ${_pianoOctave}–${_pianoOctave+1}`; }
  });
  $('btn-oct-up').addEventListener('click', () => {
    if (_pianoOctave < 6) { _pianoOctave++; _buildPianoKeys(_pianoOctave); $('piano-oct-label').textContent = `Oct ${_pianoOctave}–${_pianoOctave+1}`; }
  });

  const kb = $('piano-keyboard');

  kb.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('[data-note-id]');
    if (!key) return;
    e.preventDefault();
    key.setPointerCapture(e.pointerId);
    key.classList.add('pressed');
    piano.noteOn(key.dataset.noteId, parseFloat(key.dataset.freq));
  });

  const _endNote = (e) => {
    const key = e.target.closest('[data-note-id]');
    if (!key || !key.classList.contains('pressed')) return;
    key.classList.remove('pressed');
    piano.noteOff(key.dataset.noteId);
  };
  kb.addEventListener('pointerup',     _endNote);
  kb.addEventListener('pointercancel', _endNote);
  kb.addEventListener('pointerleave',  _endNote);
}

/* ═══════════════════════════════════════════════
   MICROPHONE RECORDING
═══════════════════════════════════════════════ */
function wireMic() {
  const btnListen  = $('btn-mic-listen');
  const btnRec     = $('btn-mic-record-dr');
  const btnStop    = $('btn-mic-stop');
  const btnMicRec  = $('btn-mic-rec');    // bottom transport shortcut
  const status     = $('mic-status');
  const list       = $('mic-recordings-list');

  function refreshMicList() {
    list.innerHTML = '';
    mic.recordings.forEach((rec, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;';
      row.innerHTML = `<span style="flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rec.name}</span>`;
      const playBtn = document.createElement('button');
      playBtn.className = 'btn'; playBtn.textContent = '▶'; playBtn.style.padding = '2px 6px';
      playBtn.addEventListener('click', () => mic.playRecording(rec));
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn'; dlBtn.textContent = '⬇'; dlBtn.style.padding = '2px 6px';
      dlBtn.addEventListener('click', () => mic.downloadRecording(rec));
      row.appendChild(playBtn); row.appendChild(dlBtn);
      list.appendChild(row);
    });
  }

  btnListen.addEventListener('click', async () => {
    if (mic.monitoring) {
      mic.stopMonitor();
      btnListen.textContent = '🎤 LISTEN';
      btnListen.classList.remove('active');
      status.textContent = 'Mic off';
    } else {
      try {
        await mic.startMonitor();
        btnListen.textContent = '🔇 STOP LISTEN';
        btnListen.classList.add('active');
        status.textContent = '🟢 Monitoring mic…';
        se.log('Mic monitoring ON', 'info');
      } catch (err) {
        status.textContent = '⛔ ' + err.message;
        se.log('Mic error: ' + err.message, 'error');
      }
    }
  });

  /** Generate a timestamped name for a mic recording */
  function _micName() { return `Mic-${new Date().toLocaleTimeString()}`; }

  const _startRec = async () => {
    try {
      await mic.startRecording(_micName());
      btnRec.classList.add('active');
      btnRec.textContent = '⏹ STOP REC';
      btnMicRec.classList.add('active');
      btnMicRec.textContent = '🎤 STOP REC';
      status.textContent = '🔴 Recording…';
      se.log('Mic recording started', 'info');
      btnListen.textContent = '🔇 STOP LISTEN';
      btnListen.classList.add('active');
    } catch (err) {
      status.textContent = '⛔ ' + err.message;
      se.log('Mic error: ' + err.message, 'error');
    }
  };
  const _stopRec = () => {
    if (!mic.recording) return;
    const name = _micName();
    mic.stopRecording(name);
    btnRec.classList.remove('active');
    btnRec.textContent = '⏺ REC';
    btnMicRec.classList.remove('active');
    btnMicRec.textContent = '🎤 MIC REC';
    status.textContent = '✅ Saved. Tap ▶ to play.';
    se.log('Mic recording saved: ' + name, 'info');
    setTimeout(refreshMicList, 200);
  };

  btnRec.addEventListener('click', () => { mic.recording ? _stopRec() : _startRec(); });
  btnMicRec.addEventListener('click', () => { mic.recording ? _stopRec() : _startRec(); });

  btnStop.addEventListener('click', () => {
    _stopRec();
    if (mic.monitoring) {
      mic.stopMonitor();
      btnListen.textContent = '🎤 LISTEN';
      btnListen.classList.remove('active');
    }
    status.textContent = 'Mic stopped.';
  });
}

/* ═══════════════════════════════════════════════
   SOUND FACTORY
   — Dropdown of all presets/waves
   — Tracks usage in localStorage
   — Auto-pins after 11 uses; 📌 pins manually
═══════════════════════════════════════════════ */
const _SF_USAGE_KEY  = 'sfUsage';
const _SF_PINNED_KEY = 'sfPinned';
/* Auto-pin threshold: a sound that has been selected 11+ times is
   considered a "favourite" and earns its own quick-access button. */
const _SF_THRESHOLD  = 11;

function _sfGetUsage()  { try { return JSON.parse(localStorage.getItem(_SF_USAGE_KEY)  || '{}'); } catch { return {}; } }
function _sfGetPinned() { try { return JSON.parse(localStorage.getItem(_SF_PINNED_KEY) || '[]'); } catch { return []; } }

function _sfIncrUsage(name) {
  const u = _sfGetUsage();
  u[name] = (u[name] || 0) + 1;
  localStorage.setItem(_SF_USAGE_KEY, JSON.stringify(u));
  return u[name];
}
function _sfPin(name) {
  const p = _sfGetPinned();
  if (!p.includes(name)) { p.push(name); localStorage.setItem(_SF_PINNED_KEY, JSON.stringify(p)); }
}
function _sfUnpin(name) {
  const p = _sfGetPinned().filter(n => n !== name);
  localStorage.setItem(_SF_PINNED_KEY, JSON.stringify(p));
}

function _sfApply(name) {
  const p = PRESETS[name];
  if (!p) return;
  se.applyPreset(name);
  if (p.binaural) {
    ae.stop(); ae.startBinaural(p.freq, p.binaural);
    $('badge-play').style.display = 'inline-block';
  } else if (ae.playing || ae.binauralMode) {
    ae.stop(); ae.start();
  }
  syncControls();
  const count = _sfIncrUsage(name);
  se.log(`Sound: ${name} (used ${count}×)`, 'info');
  if (count >= _SF_THRESHOLD) { _sfPin(name); _sfRenderPinned(); }
}

function _sfRenderPinned() {
  const container = $('pinned-sounds');
  if (!container) return;
  const pinned = _sfGetPinned();
  container.innerHTML = '';
  pinned.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'pinned-btn';
    btn.title = name;
    const shortName = name.split('(')[0].trim();
    btn.innerHTML = `<span>${shortName}</span>`;
    const x = document.createElement('button');
    x.className = 'unpin'; x.textContent = '✕'; x.title = 'Unpin';
    x.addEventListener('click', (e) => { e.stopPropagation(); _sfUnpin(name); _sfRenderPinned(); });
    btn.appendChild(x);
    btn.addEventListener('click', (e) => { if (e.target !== x) _sfApply(name); });
    container.appendChild(btn);
  });
}

function wireSoundFactory() {
  const dropdown = $('sound-dropdown');
  const btnApply = $('btn-apply-sound');
  const btnPin   = $('btn-pin-sound');

  // Populate dropdown with all preset names
  Object.keys(PRESETS).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.split('(')[0].trim();
    opt.title = name;
    dropdown.appendChild(opt);
  });

  btnApply.addEventListener('click', () => {
    if (dropdown.value) _sfApply(dropdown.value);
  });

  btnPin.addEventListener('click', () => {
    if (dropdown.value) { _sfPin(dropdown.value); _sfRenderPinned(); se.log(`Pinned: ${dropdown.value}`, 'info'); }
  });

  _sfRenderPinned();
}

/* ═══════════════════════════════════════════════
   SYNTHESIZER ADSR (affects piano)
═══════════════════════════════════════════════ */
function wireSynth() {
  const pairs = [
    { id:'dr-attack',  val:'dr-val-attack',  key:'attack',  fmt: v => v.toFixed(3)+'s' },
    { id:'dr-decay',   val:'dr-val-decay',   key:'decay',   fmt: v => v.toFixed(3)+'s' },
    { id:'dr-sustain', val:'dr-val-sustain', key:'sustain', fmt: v => v.toFixed(2) },
    { id:'dr-release', val:'dr-val-release', key:'release', fmt: v => v.toFixed(2)+'s' },
  ];
  pairs.forEach(({ id, val, key, fmt }) => {
    const el = $(id), vl = $(val);
    if (!el) return;
    el.addEventListener('input', () => {
      se.synth[key] = parseFloat(el.value);
      vl.textContent = fmt(se.synth[key]);
    });
  });

  // Filter
  const filterType = $('dr-filter-type');
  const filterRow  = $('dr-filter-row');
  const filterFreqEl = $('dr-filter-freq');
  const filterFreqVal = $('dr-val-filter-freq');

  filterType.addEventListener('change', () => {
    se.synth.filterType = filterType.value;
    filterRow.style.display = filterType.value !== 'none' ? 'flex' : 'none';
  });
  if (filterFreqEl) {
    filterFreqEl.addEventListener('input', () => {
      const hz = parseFloat(filterFreqEl.value);
      se.synth.filterFreq = hz;
      filterFreqVal.textContent = hz >= 1000 ? (hz/1000).toFixed(1)+'kHz' : hz.toFixed(0)+'Hz';
    });
  }
}

/* ── Kick off ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
