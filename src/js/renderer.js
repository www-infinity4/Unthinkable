/**
 * 3D Oscilloscope RF Generator
 * Three.js 3D Renderer
 * ─────────────────────────────────────────────
 * Renders an animated 3D waveform tube,
 * a 3D waterfall signal trail in XYZ space,
 * frequency-domain bars, and grid.
 */

'use strict';

class OscilloscopeRenderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.width   = canvas.clientWidth  || 800;
    this.height  = canvas.clientHeight || 600;

    /* ── Three.js scene ── */
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(60, this.width / this.height, 0.01, 1000);
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050510, 1);

    /* ── Lighting ── */
    const ambient = new THREE.AmbientLight(0x111133, 2);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x00ffe7, 1.5);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xff00cc, 0.8);
    dirLight2.position.set(-3, -2, -1);
    this.scene.add(dirLight2);

    /* ── Orbit controls (manual) ── */
    this._isDragging = false;
    this._lastMouse  = { x: 0, y: 0 };
    this._spherical  = { theta: 0.3, phi: 0.5, radius: 5.5 };
    this._targetSpherical = { ...this._spherical };
    this._autoRotate = true;
    this._autoRotateSpeed = 0.003;
    this._setupControls();

    /* ── Grid ── */
    this._buildGrid();

    /* ── Waveform line (X=time, Y=amplitude, Z=0) ── */
    this.WAVE_POINTS = 512;
    this.wavePositions = new Float32Array(this.WAVE_POINTS * 3);
    this.waveColors    = new Float32Array(this.WAVE_POINTS * 3);
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(this.wavePositions, 3));
    waveGeo.setAttribute('color',    new THREE.BufferAttribute(this.waveColors, 3));
    const waveMat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
    this.waveLine = new THREE.Line(waveGeo, waveMat);
    this.waveLine.frustumCulled = false;
    this.scene.add(this.waveLine);

    /* ── 3D waterfall trail (waveform history scrolling in -Z) ── */
    this.TRAIL_COLS   = 64;   // samples per row
    this.TRAIL_ROWS   = 32;   // time-depth rows (history depth)
    this.TRAIL_POINTS = this.TRAIL_COLS * this.TRAIL_ROWS; // 2048
    this._rowData  = new Float32Array(this.TRAIL_ROWS * this.TRAIL_COLS); // amplitude storage
    this._rowHead  = 0;  // index of newest row in _rowData
    this.trailPos   = new Float32Array(this.TRAIL_POINTS * 3);
    this.trailColor = new Float32Array(this.TRAIL_POINTS * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    trailGeo.setAttribute('color',    new THREE.BufferAttribute(this.trailColor, 3));
    const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1.5, transparent: true, opacity: 0.85 });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
    this.trailLine.frustumCulled = false;
    this.scene.add(this.trailLine);

    /* ── Frequency bars ── */
    this.FREQ_BARS = 64;
    this.freqBars  = [];
    this._buildFreqBars();

    /* ── Signal annotation spheres ── */
    this.annotations = [];

    /* ── Reusable color scratch to avoid per-frame GC ── */
    this._tmpColor = new THREE.Color();
    this._tc = [0, 0, 0];

    /* ── State ── */
    this.showTrail  = true;
    this.showBars   = true;
    this.showWave   = true;
    this.colorMode  = 'spectrum'; // 'spectrum' | 'solid' | 'phase'
    this.primaryColor = new THREE.Color(0x00ffe7);
    this.triggerEnabled = false;  // zero-crossing trigger for stable display
    this.yScale     = 1.5;        // amplitude display gain
    this.timeZoom   = 1.0;        // fraction of buffer shown (0.25–1)

    /* ── Resize observer ── */
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(canvas.parentElement);
  }

  /* ── Grid ──────────────────────────────────────── */
  _buildGrid() {
    const grid = new THREE.GridHelper(8, 20, 0x111133, 0x111133);
    grid.position.y = -1.5;
    this.scene.add(grid);

    // Axis helpers (subtle)
    const axesMat = new THREE.LineBasicMaterial({ color: 0x1a1a3a });
    const addAxis = (from, to) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...from), new THREE.Vector3(...to),
      ]);
      this.scene.add(new THREE.Line(geo, axesMat));
    };
    addAxis([-4,0,0],[4,0,0]);
    addAxis([0,-2,0],[0,2,0]);
    addAxis([0,0,-4],[0,0,4]);
  }

  /* ── Frequency Bars ────────────────────────────── */
  _buildFreqBars() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x00ffe7 });
    for (let i = 0; i < this.FREQ_BARS; i++) {
      const geo = new THREE.BoxGeometry(0.06, 1, 0.06);
      const mesh = new THREE.Mesh(geo, mat.clone());
      const x = (i / this.FREQ_BARS) * 6 - 3;
      mesh.position.set(x, -1.5, -2);
      mesh.scale.y = 0.01;
      this.scene.add(mesh);
      this.freqBars.push(mesh);
    }
  }

  /* ── Controls ──────────────────────────────────── */
  _setupControls() {
    const el = this.canvas;
    el.addEventListener('mousedown', (e) => {
      this._isDragging = true;
      this._lastMouse  = { x: e.clientX, y: e.clientY };
      this._autoRotate = false;
    });
    el.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastMouse.x;
      const dy = e.clientY - this._lastMouse.y;
      this._targetSpherical.theta -= dx * 0.01;
      this._targetSpherical.phi    = Math.max(0.1, Math.min(Math.PI - 0.1,
        this._targetSpherical.phi + dy * 0.01));
      this._lastMouse = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('mouseup',   () => { this._isDragging = false; });
    el.addEventListener('mouseleave',() => { this._isDragging = false; });
    el.addEventListener('wheel', (e) => {
      this._targetSpherical.radius = Math.max(1.5, Math.min(20,
        this._targetSpherical.radius + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });

    // Touch support
    let lastTouch = null;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._isDragging = true;
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._autoRotate = false;
      }
    });
    el.addEventListener('touchmove', (e) => {
      if (!this._isDragging || !lastTouch) return;
      const dx = e.touches[0].clientX - lastTouch.x;
      const dy = e.touches[0].clientY - lastTouch.y;
      this._targetSpherical.theta -= dx * 0.01;
      this._targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        this._targetSpherical.phi + dy * 0.01));
      lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', () => { this._isDragging = false; lastTouch = null; });
  }

  _onResize() {
    const w = this.canvas.parentElement.clientWidth;
    const h = this.canvas.parentElement.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ── Color helpers ─────────────────────────────── */
  _spectrumColor(t, out) {
    // Rainbow spectrum — reuse _tmpColor to avoid per-call GC
    this._tmpColor.setHSL(((t * 300 + 180) % 360) / 360, 1, 0.6);
    out[0] = this._tmpColor.r; out[1] = this._tmpColor.g; out[2] = this._tmpColor.b;
  }

  _phaseColor(v, out) {
    this._tmpColor.setHSL(0.5 + v * 0.3, 1, 0.5 + Math.abs(v) * 0.3);
    out[0] = this._tmpColor.r; out[1] = this._tmpColor.g; out[2] = this._tmpColor.b;
  }

  /* ── Main update ───────────────────────────────── */
  update(waveData, freqData, signalEngine, now) {
    const N      = this.WAVE_POINTS;
    const bufLen = waveData.length;

    // ── Trigger: find first positive zero-crossing for stable display
    let triggerOffset = 0;
    if (this.triggerEnabled) {
      const searchLen = Math.floor(bufLen * Math.min(this.timeZoom, 1) * 0.5);
      const searchStart = Math.floor(bufLen * 0.1);
      const searchEnd   = searchStart + searchLen;
      for (let i = searchStart; i < searchEnd - 1; i++) {
        const v0 = waveData[i]   / 128.0 - 1.0;
        const v1 = waveData[i+1] / 128.0 - 1.0;
        if (v0 <= 0 && v1 > 0) { triggerOffset = i; break; }
      }
    }

    // ── Waveform line (X=time, Y=amplitude, Z=0)
    if (this.showWave) {
      const visibleSamples = Math.floor(bufLen * this.timeZoom);
      const cb = this._tc;
      for (let i = 0; i < N; i++) {
        const srcRaw = Math.floor(i / N * visibleSamples) + triggerOffset;
        const src = Math.min(srcRaw, bufLen - 1);
        const v   = (waveData[src] / 128.0) - 1.0;
        const x   = (i / (N - 1)) * 6 - 3;
        const y   = v * this.yScale;
        this.wavePositions[i*3]   = x;
        this.wavePositions[i*3+1] = y;
        this.wavePositions[i*3+2] = 0;
        if (this.colorMode === 'spectrum') this._spectrumColor(i / N, cb);
        else if (this.colorMode === 'phase') this._phaseColor(v, cb);
        else { cb[0] = this.primaryColor.r; cb[1] = this.primaryColor.g; cb[2] = this.primaryColor.b; }
        this.waveColors[i*3] = cb[0]; this.waveColors[i*3+1] = cb[1]; this.waveColors[i*3+2] = cb[2];
      }
      this.waveLine.geometry.attributes.position.needsUpdate = true;
      this.waveLine.geometry.attributes.color.needsUpdate    = true;
    }
    this.waveLine.visible = this.showWave;

    // ── 3D waterfall trail (waveform history scrolling in -Z)
    if (this.showTrail) {
      const COLS = this.TRAIL_COLS;
      const ROWS = this.TRAIL_ROWS;

      // Advance ring-buffer head and write newest waveform row
      this._rowHead = (this._rowHead + 1) % ROWS;
      const rowOff = this._rowHead * COLS;
      for (let c = 0; c < COLS; c++) {
        const src = Math.floor(c / COLS * bufLen);
        this._rowData[rowOff + c] = (waveData[src] / 128.0) - 1.0;
      }

      // Rebuild trail geometry in snake (boustrophedon) pattern
      // Even rows L→R, odd rows R→L — no diagonal jump artefacts at edges
      const Z_STEP = 0.13;
      const cb = this._tc;
      let pi = 0;
      for (let r = 0; r < ROWS; r++) {
        const dataRow = (this._rowHead - r + ROWS) % ROWS;
        const dOff    = dataRow * COLS;
        const z       = -r * Z_STEP;
        const forward = (r % 2 === 0);
        const fade    = Math.pow(1.0 - r / ROWS, 1.5);

        for (let c = 0; c < COLS; c++) {
          const col = forward ? c : (COLS - 1 - c);
          const amp = this._rowData[dOff + col];
          const x   = (col / (COLS - 1)) * 4 - 2;   // -2 to +2
          const y   = amp * this.yScale;

          this.trailPos[pi*3]     = x;
          this.trailPos[pi*3 + 1] = y;
          this.trailPos[pi*3 + 2] = z;

          if (this.colorMode === 'phase') this._phaseColor(amp, cb);
          else this._spectrumColor(col / COLS, cb);
          this.trailColor[pi*3]     = cb[0] * fade;
          this.trailColor[pi*3 + 1] = cb[1] * fade;
          this.trailColor[pi*3 + 2] = cb[2] * fade;

          pi++;
        }
      }

      this.trailLine.geometry.attributes.position.needsUpdate = true;
      this.trailLine.geometry.attributes.color.needsUpdate    = true;
    }
    this.trailLine.visible = this.showTrail;

    // ── Frequency bars
    if (this.showBars && freqData) {
      for (let i = 0; i < this.FREQ_BARS; i++) {
        const src = Math.floor(i / this.FREQ_BARS * freqData.length);
        const v   = freqData[src] / 255;
        const bar = this.freqBars[i];
        bar.scale.y = Math.max(0.01, v * 3);
        bar.position.y = -1.5 + bar.scale.y * 0.5;
        const h = 180 + i / this.FREQ_BARS * 180;
        bar.material.color.setHSL(h / 360, 1, 0.55);
      }
    }
    if (this.freqBars[0]) this.freqBars[0].parent.visible = this.showBars;
    this.freqBars.forEach(b => b.visible = this.showBars);

    // ── Camera
    if (this._autoRotate) {
      this._targetSpherical.theta += this._autoRotateSpeed;
    }
    this._spherical.theta  += (this._targetSpherical.theta  - this._spherical.theta)  * 0.08;
    this._spherical.phi    += (this._targetSpherical.phi    - this._spherical.phi)    * 0.08;
    this._spherical.radius += (this._targetSpherical.radius - this._spherical.radius) * 0.08;

    const { theta, phi, radius } = this._spherical;
    this.camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  /** Add a glowing sphere annotation at current signal position */
  addAnnotation(label, color = 0xffe600) {
    const geo  = new THREE.SphereGeometry(0.08, 16, 16);
    const mat  = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    // Place at head of trail
    mesh.position.set(
      this.trailPos[0], this.trailPos[1], this.trailPos[2]);
    this.scene.add(mesh);
    this.annotations.push({ mesh, label, created: Date.now() });
    // Auto-remove after 8 seconds
    setTimeout(() => {
      this.scene.remove(mesh);
      this.annotations = this.annotations.filter(a => a.mesh !== mesh);
    }, 8000);
  }

  setColorMode(mode) { this.colorMode = mode; }
  toggleAutoRotate()  { this._autoRotate = !this._autoRotate; }
  setAutoRotate(v)    { this._autoRotate = v; }
  setTrigger(v)       { this.triggerEnabled = v; }
  setYScale(v)        { this.yScale = v; }
  setTimeZoom(v)      { this.timeZoom = Math.max(0.1, Math.min(1, v)); }
  resetCamera()       {
    this._targetSpherical = { theta: 0.3, phi: 0.5, radius: 5.5 };
    this._autoRotate = true;
  }

  dispose() {
    this._resizeObserver.disconnect();
    this.renderer.dispose();
  }
}

window.OscilloscopeRenderer = OscilloscopeRenderer;
