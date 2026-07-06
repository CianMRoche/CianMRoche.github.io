// Caustica: main.js

import { Renderer }                            from './renderer.js';
import { precomputeDistances,
         computeCriticalCurves,
         angDiamDist,
         angDiamDistBetween,
         traceRay }                            from './lens.js';

// ── ID generator ──────────────────────────────────────────────────────────────
let _nextId = 1;
function uid() { return _nextId++; }

// ── Type colors: lens = blue/cyan, source = amber ────────────────────────────
function typeColorHex(type) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (type === 'lens')   return dark ? '#7bbfcc' : '#4a7fc8';
  if (type === 'hybrid') return dark ? '#b09ac8' : '#9b7dd4';
  if (type === 'empty')  return dark ? '#484f58' : '#d1d5db';
  return dark ? '#fbbf24' : '#f59e0b';
}

function planeEffectiveType(plane) {
  const hasLens = plane.objects.some(o => o.type === 'lens');
  const hasSrc  = plane.objects.some(o => o.type === 'source');
  if (hasLens && hasSrc) return 'hybrid';
  if (hasLens) return 'lens';
  if (hasSrc)  return 'source';
  return 'empty';
}

// Hybrid objects: a lens + source sharing a hybridId, treated as one in the UI.
function hybridPartner(plane, obj) {
  return obj.hybridId ? plane.objects.find(o => o.hybridId === obj.hybridId && o.id !== obj.id) : null;
}
// Returns the lens half of a hybrid pair (or the object itself if not hybrid).
function hybridLensHalf(plane, obj) {
  if (!obj.hybridId) return obj;
  return plane.objects.find(o => o.hybridId === obj.hybridId && o.type === 'lens') ?? obj;
}

// Per-hybrid panel expansion state; reset when a different hybrid is selected.
let _hybridExpanded   = { lens: false, src: false };
let _lastHybridId     = null;
let _settingsExpanded = { general: false, cmap: false, contours: false, crit: false, ps: false };
let _progExpanded     = false;

// Invert a 6-digit hex colour (#rrggbb → complement).
function invertHexColor(hex) {
  if (!hex || hex.length < 7) return hex;
  return '#' + [1,3,5].map(i =>
    (255 - parseInt(hex.slice(i, i+2), 16)).toString(16).padStart(2,'0')
  ).join('');
}

// ── Curve colors: not white, not the lens/source type colors ──────────────────
// Critical curves: hot pink; Caustics: lime green.
const CRIT_COLOR = 'rgba(248, 113, 196, 0.95)';
const CAUS_COLOR = 'rgba(134, 239, 172, 0.95)';

// ── App state ─────────────────────────────────────────────────────────────────
// Scalar view/visual settings that round-trip through the YAML config. Centralised
// so that loadConfigFromYaml() can fall back to these exact defaults for any field
// that is absent from the file (backwards compatibility with older configs).
const CONFIG_DEFAULTS = {
  fov:                4.0,
  zMax:               3.0,
  vizMode:            0,      // 0=surface brightness, 1=κ, 2=γ, 3=|μ|, 4=signed μ, 5=|α|, 6=φ (Fermat)
  showCritCurves:     false,
  showCaustics:       false,
  showMarkers:        true,
  showLegend:         true,
  showColorbar:       true,
  showRuler:          false,  // ruler tool + its measurement lines visible (off by default)
  critGridN:          512,
  psGridStep:         0.02,   // arcsec — point source grid spacing
  critZs:             null,   // null = auto (highest-z source plane)
  fermatUseSourcePos: false,  // when true, use lastFermatSource for Fermat β_s and source plane
  contourSpacing:     1.0,    // Fermat contour spacing multiplier (interval = 0.002·fov²·this)
};

const state = {
  ...CONFIG_DEFAULTS,
  planes:          [],
  selectedPlaneId: null,
  selectedObjId:   null,
  addMode:         'lens',   // 'lens' | 'source' | 'hybrid': global tool state
  rulerActive:     false,    // ruler is the active pointer tool on the image panel (transient)
  rulers:          [],       // committed measurements, each { x0, y0, x1, y1 } in arcsec (session-only)
  rulerDraft:      null,     // in-progress ruler drag { x0, y0, x1, y1 } or null (transient)
  // Per-viz-mode colour mapping: { scale, param, min, max }. scale: 0=linear 1=sqrt
  // 2=power 3=asinh 4=log. Modes: 0=surface brightness, 1=κ, 2=γ, 3=|μ|, 5=|α|.
  vizScale:        null,     // initialised from DEFAULT_VIZ_SCALE below
  dist:            null,
  lastFermatSource:null,     // { cx, cy, planeId } of last selected source object
  saddlePhis:      [],       // φ values at Type-II saddle points; kept in sync for restore calls
};

// Default colour-mapping per viz mode (chosen to reproduce the original hardcoded look).
// scale: 0=linear 1=sqrt 2=power 3=asinh 4=log ; param = γ (power) or a (asinh).
// palette: 0=default 1=viridis 2=inferno 3=plasma 4=turbo 5=grayscale (ignored for mode 0).
const DEFAULT_VIZ_SCALE = {
  0: { scale: 1, param: 0.5, min: 0, max: 1,   palette: 0 },  // surface brightness (sqrt)
  1: { scale: 0, param: 0.5, min: 0, max: 2,   palette: 0 },  // convergence κ
  2: { scale: 0, param: 0.5, min: 0, max: 0.5, palette: 0 },  // shear γ
  3: { scale: 4, param: 0.5, min: 1, max: 30,  palette: 0 },  // magnification |μ| (log)
  5: { scale: 0, param: 0.5, min: 0, max: 2,   palette: 0 },  // deflection |α| (arcsec)
};
const VIZ_PALETTE_NAMES = ['Default', 'Viridis', 'Inferno', 'Plasma', 'Turbo', 'Grayscale'];
// Colour-bar CSS gradients per palette. Index 0 is theme-dependent (see _updateColorbar).
const VIZ_PALETTE_CSS = [
  null, // 0 = default (theme-based)
  'linear-gradient(to right,#440154,#414487,#2a788e,#22a884,#7ad151,#fde725)', // viridis
  'linear-gradient(to right,#000004,#420a68,#932667,#dd513a,#fca50a,#fcffa4)', // inferno
  'linear-gradient(to right,#0d0887,#6a00a8,#b12a90,#e16462,#fca636,#f0f921)', // plasma
  'linear-gradient(to right,#30123b,#4669f2,#1ae4b6,#a4fc3c,#fb7e21,#7a0403)', // turbo
  'linear-gradient(to right,#000000,#ffffff)',                                 // grayscale
];
function _cloneVizScaleDefaults() {
  const o = {};
  for (const k in DEFAULT_VIZ_SCALE) o[k] = { ...DEFAULT_VIZ_SCALE[k] };
  return o;
}
// The viz modes that use the colour-mapping warp (Fermat φ=6 uses contours, not this).
function vizModeHasScale(m) { return m === 0 || m === 1 || m === 2 || m === 3 || m === 5; }
// Settings { scale, param, min, max } for a given mode (defaults if unset).
function vizScaleFor(mode) {
  return (state.vizScale && state.vizScale[mode]) || DEFAULT_VIZ_SCALE[mode] || DEFAULT_VIZ_SCALE[0];
}
state.vizScale = _cloneVizScaleDefaults();

// A sensible increment for a numeric limit, scaled to its magnitude (≈ 1/20 of the
// leading power of ten) — used for both the spinner step and drag-to-scrub sensitivity.
function _numStep(v) {
  const a = Math.abs(v);
  if (!isFinite(a) || a === 0) return 0.01;
  return Math.pow(10, Math.floor(Math.log10(a))) / 20;
}

// Make a number <input> draggable: click-drag left/right scrubs the value (step scaled
// to its magnitude), clamped to [lo,hi]; a <2px move is treated as a click so typing and
// the spinner still work. onChange(v) receives each new value.
function _attachScrub(inp, { lo = -Infinity, hi = Infinity, onChange }) {
  if (!inp) return;
  inp.classList.add('sl-scrub');
  let dragging = false, moved = false, startX = 0, startVal = 0, step = 0.01;
  inp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    startVal = parseFloat(inp.value) || 0;
    step = _numStep(startVal || 1);
    startX = e.clientX; dragging = true; moved = false;
    inp.setPointerCapture(e.pointerId);
  });
  inp.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) > 2) moved = true;
    if (!moved) return;
    const dec = Math.max(0, -Math.floor(Math.log10(step)) + 1);
    const v = parseFloat(Math.min(hi, Math.max(lo, startVal + (e.clientX - startX) * step)).toFixed(dec));
    inp.value = v;
    onChange(v);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { inp.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  inp.addEventListener('pointerup', end);
  inp.addEventListener('pointercancel', end);
}

// Explanation for the Colour Map section's ⓘ button — depends on the active mode/scale.
function cmapInfoHtml(mode) {
  const vs = vizScaleFor(mode);
  const limits = mode === 0
    ? `<b>Black / White</b>: image brightness mapped to the darkest and brightest output. Values below Black clip to the background; values above White saturate.`
    : `<b>Min / Max</b>: the data values mapped to the two ends of the color bar. Values outside this range are clamped.`;
  const scaleDesc = {
    0: `<b>Linear</b>: color varies in direct proportion to the value.`,
    1: `<b>Square root</b>: stretches low values and compresses high ones, revealing faint structure.`,
    2: `<b>Power law</b>: color ∝ (normalized value)<sup>γ</sup>. γ&lt;1 brightens low values; γ&gt;1 emphasizes high values.`,
    3: `<b>Asinh</b>: inverse-hyperbolic-sine stretch — linear near the bottom, logarithmic at the top. Softening <b>a</b> sets where it bends. The standard stretch for astronomical images.`,
    4: `<b>Log</b>: logarithmic mapping, best for large dynamic range (e.g. magnification). Requires Min &gt; 0.`,
  }[vs.scale] ?? '';
  return `${limits}<br><br>${scaleDesc}<br><br><span style="color:var(--muted)">Tip: drag left/right across a value to scrub it, or type a number directly.</span>`;
}

// Explanation for the Fermat Potential section's ⓘ button (arrival-time mode).
function contourInfoHtml() {
  return `<b>Use last selected source</b>: pins the arrival-time surface and image markers to the ` +
    `position and redshift of the most recently selected source, so the contours reflect the source ` +
    `actually being lensed. When off, the source sits at the coordinate origin.<br><br>` +
    `<b>Spacing</b>: scales the arrival-time interval between iso-φ contour lines. ` +
    `The interval is 0.002·fov² (arcsec²) at spacing 1; larger values draw fewer, more widely ` +
    `spaced contours, smaller values pack them more densely. Spacing tracks the field of view, so ` +
    `the contour density stays similar as you zoom.<br><br>` +
    `The contour through each Type II (saddle) image is always drawn thicker and brighter, whatever ` +
    `the spacing.<br><br><span style="color:var(--muted)">Tip: drag left/right to scrub, or type a number directly.</span>`;
}

// Draw a type-specific marker shape centred at (px, py) with circumradius r.
// type: 'lens' = upward triangle, 'source' = downward triangle, 'hybrid' = diamond.
const _S3 = Math.sqrt(3);
function drawShapeMarker(ctx, type, px, py, r) {
  ctx.beginPath();
  if (type === 'lens') {
    ctx.moveTo(px,               py - r);
    ctx.lineTo(px + r * _S3 / 2, py + r / 2);
    ctx.lineTo(px - r * _S3 / 2, py + r / 2);
  } else if (type === 'source') {
    ctx.moveTo(px,               py + r);
    ctx.lineTo(px + r * _S3 / 2, py - r / 2);
    ctx.lineTo(px - r * _S3 / 2, py - r / 2);
  } else {
    ctx.moveTo(px,     py - r);
    ctx.lineTo(px + r, py);
    ctx.lineTo(px,     py + r);
    ctx.lineTo(px - r, py);
  }
  ctx.closePath();
}

// ── Point source image finder ─────────────────────────────────────────────────

function findPointSourceImages(srcObj, srcPlane) {
  // Two-stage approach matching lenstronomy:
  // 1. Coarse grid → starting guesses via sign-change topology
  // 2. Newton-Raphson refinement → exact image positions
  // NR is stable because it either converges to a real image or diverges
  // (which we detect and discard). Near caustics, multiple starting guesses
  // converge to the same image, handled by deduplication.
  if (!state.dist) return [];
  const sorted = [...state.planes].sort((a, b) => a.z - b.z);
  const tIdx   = sorted.findIndex(p => p.id === srcPlane.id);
  if (tIdx < 0) return [];

  const { cx: scx, cy: scy } = srcObj;

  // F(θ) = β(θ) − source: the function whose zeros are image positions.
  function evalF(x, y) {
    const [bx, by] = traceRay(x, y, sorted, state.dist, tIdx);
    return [bx - scx, by - scy];
  }

  // ── Stage 1: coarse sign-change grid for starting guesses ──────────────
  // Fixed grid step from settings — independent of FOV so positions don't shift on zoom.
  const step = state.psGridStep ?? 0.005;
  const RANGE = Math.max(state.fov * 1.1, 3.0);
  const N    = Math.ceil(RANGE / step) + 1;
  const half = RANGE / 2;

  const Fx = new Float32Array(N * N);
  const Fy = new Float32Array(N * N);
  const D2 = new Float32Array(N * N);
  const GX = new Float32Array(N * N);
  const GY = new Float32Array(N * N);

  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iy * N + ix;
      GX[i] = -half + ix * step;
      GY[i] = -half + iy * step;
      const [fx, fy] = evalF(GX[i], GY[i]);
      Fx[i] = fx; Fy[i] = fy;
      D2[i] = fx*fx + fy*fy;
    }
  }

  const M   = N - 1;
  const hit = new Uint8Array(M * M);
  for (let iy = 0; iy < M; iy++) {
    for (let ix = 0; ix < M; ix++) {
      const a = iy*N+ix, b = iy*N+ix+1, c = (iy+1)*N+ix, d = (iy+1)*N+ix+1;
      const xc = Fx[a]*Fx[b]<0 || Fx[a]*Fx[c]<0 || Fx[b]*Fx[d]<0 || Fx[c]*Fx[d]<0
              || !Fx[a] || !Fx[b] || !Fx[c] || !Fx[d];
      if (!xc) continue;
      const yc = Fy[a]*Fy[b]<0 || Fy[a]*Fy[c]<0 || Fy[b]*Fy[d]<0 || Fy[c]*Fy[d]<0
              || !Fy[a] || !Fy[b] || !Fy[c] || !Fy[d];
      if (yc) hit[iy*M+ix] = 1;
    }
  }

  // One starting guess per connected component (best grid corner per component).
  const label = new Int32Array(M * M).fill(-1);
  const starts = [];
  for (let s = 0; s < M * M; s++) {
    if (!hit[s] || label[s] >= 0) continue;
    const comp = starts.length;
    let bestD = Infinity, bestI = -1;
    const stack = [s];
    label[s] = comp;
    while (stack.length) {
      const cur = stack.pop();
      const cy = Math.floor(cur / M), cx = cur % M;
      for (const [dy, dx] of [[0,0],[0,1],[1,0],[1,1]]) {
        const pi = (cy+dy)*N+(cx+dx);
        if (D2[pi] < bestD) { bestD = D2[pi]; bestI = pi; }
      }
      for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const ny = cy+dy, nx = cx+dx;
        if (ny<0||ny>=M||nx<0||nx>=M) continue;
        const nc = ny*M+nx;
        if (!hit[nc] || label[nc] >= 0) continue;
        label[nc] = comp; stack.push(nc);
      }
    }
    if (bestI >= 0) starts.push([GX[bestI], GY[bestI]]);
  }

  // ── Stage 2: Newton-Raphson with backtracking line search ──────────────
  const h       = 1e-4;          // fixed finite-difference step (arcsec)
  const maxIter = 60;
  const convTol = 1e-14;         // |F|² convergence (sub-nano-arcsec)
  const diverge = state.fov * 3;
  const images  = [];

  for (const [x0, y0] of starts) {
    let x = x0, y = y0, ok = false;
    for (let iter = 0; iter < maxIter; iter++) {
      const [fx, fy] = evalF(x, y);
      const f2 = fx*fx + fy*fy;
      if (f2 < convTol) { ok = true; break; }

      // Numerical Jacobian via central differences.
      const [fxR, fyR] = evalF(x+h, y);
      const [fxL, fyL] = evalF(x-h, y);
      const [fxU, fyU] = evalF(x, y+h);
      const [fxD, fyD] = evalF(x, y-h);
      const Axx = (fxR-fxL)/(2*h), Axy = (fxU-fxD)/(2*h);
      const Ayx = (fyR-fyL)/(2*h), Ayy = (fyU-fyD)/(2*h);
      const det = Axx*Ayy - Axy*Ayx;
      if (Math.abs(det) < 1e-14) break; // on or very near critical curve

      const dx = (-fx*Ayy + fy*Axy) / det;
      const dy = ( fx*Ayx - fy*Axx) / det;

      // Backtracking line search: halve step until |F| decreases.
      let alpha = 1.0;
      for (let ls = 0; ls < 10; ls++) {
        const xn = x + alpha*dx, yn = y + alpha*dy;
        const [fn_x, fn_y] = evalF(xn, yn);
        if (fn_x*fn_x + fn_y*fn_y < f2) { x = xn; y = yn; break; }
        alpha *= 0.5;
      }
      if (Math.abs(x) > diverge || Math.abs(y) > diverge) break;
    }
    if (!ok) continue;

    // Deduplicate: discard if another solution is within 1e-7 arcsec.
    if (images.some(([ix, iy]) => (ix-x)**2+(iy-y)**2 < 1e-14)) continue;
    images.push([x, y]);
  }

  return images;
}

// ── Config YAML ───────────────────────────────────────────────────────────────

function configToYaml() {
  let y = `fov: ${state.fov}\nzMax: ${state.zMax}\n`;
  y += `vizMode: ${state.vizMode}\n`;
  // Per-mode colour mapping: "scale param min max palette".
  for (const m of [0, 1, 2, 3, 5]) {
    const v = vizScaleFor(m);
    y += `vizScale${m}: ${v.scale} ${v.param} ${v.min} ${v.max} ${v.palette ?? 0}\n`;
  }
  y += `showCritCurves: ${state.showCritCurves}\nshowCaustics: ${state.showCaustics}\n`;
  y += `showMarkers: ${state.showMarkers}\nshowLegend: ${state.showLegend}\nshowColorbar: ${state.showColorbar}\n`;
  y += `showRuler: ${state.showRuler}\n`;
  y += `critGridN: ${state.critGridN}\npsGridStep: ${state.psGridStep}\n`;
  y += `critZs: ${state.critZs === null ? 'null' : state.critZs}\n`;
  y += `contourSpacing: ${state.contourSpacing}\n`;
  y += `fermatUseSourcePos: ${state.fermatUseSourcePos}\n`;
  if (state.lastFermatSource) {
    const fsp = state.planes.find(p => p.id === state.lastFermatSource.planeId);
    if (fsp) {
      y += `fermatBetaX: ${+state.lastFermatSource.cx.toFixed(6)}\n`;
      y += `fermatBetaY: ${+state.lastFermatSource.cy.toFixed(6)}\n`;
      y += `fermatSrcPlaneZ: ${fsp.z.toFixed(4)}\n`;
    }
  }
  y += `planes:\n`;
  for (const plane of state.planes) {
    y += `  - z: ${plane.z.toFixed(3)}\n    objects:\n`;
    for (const obj of plane.objects) {
      y += `      - type: ${obj.type}\n`;
      y += `        model: ${obj.model}\n`;
      y += `        cx: ${+obj.cx.toFixed(5)}\n`;
      y += `        cy: ${+obj.cy.toFixed(5)}\n`;
      y += `        hidden: ${obj.hidden}\n`;
      y += `        showShape: ${obj.showShape === true}\n`;
      if (obj.hybridId) y += `        hybridId: '${obj.hybridId}'\n`;
      y += `        params:\n`;
      for (const [k, v] of Object.entries(obj.params)) {
        if (typeof v === 'string')       y += `          ${k}: '${v.replace(/'/g, "''")}'\n`;
        else if (typeof v === 'number')  y += `          ${k}: ${+v.toFixed(6)}\n`;
        else if (typeof v === 'boolean') y += `          ${k}: ${v}\n`;
      }
    }
  }
  return y;
}

function parseYamlConfig(yaml) {
  const lines = yaml.split('\n');
  const cfg = { planes: [] };
  let plane = null, obj = null, inParams = false;

  function parseVal(s) {
    s = s.trim();
    if (s === 'true')  return true;
    if (s === 'false') return false;
    if (s === 'null')  return null;
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))
      return s.slice(1,-1).replace(/''/g, "'");
    const n = Number(s);
    return (s !== '' && !isNaN(n)) ? n : s;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    if (indent === 0) {
      const [k, ...rest] = trimmed.split(':');
      const val = rest.join(':').trim();
      if (val !== '') cfg[k.trim()] = parseVal(val);
      // blank value (e.g. 'planes:') means a block key: leave existing array intact
    } else if (indent === 2 && trimmed.startsWith('- z:')) {
      plane = { z: parseVal(trimmed.slice(4)), objects: [] };
      cfg.planes.push(plane); obj = null; inParams = false;
    } else if (indent === 6 && trimmed.startsWith('- type:')) {
      obj = { type: trimmed.slice(7).trim(), params: {}, showShape: false };
      plane?.objects.push(obj); inParams = false;
    } else if (indent === 8 && obj) {
      const colon = trimmed.indexOf(':');
      if (colon < 0) continue;
      const k = trimmed.slice(0, colon).trim();
      const v = trimmed.slice(colon + 1).trim();
      if (k === 'params') { inParams = true; }
      else { if (v !== '') obj[k] = parseVal(v); inParams = false; }
    } else if (indent === 10 && inParams && obj) {
      const colon = trimmed.indexOf(':');
      if (colon >= 0) obj.params[trimmed.slice(0,colon).trim()] = parseVal(trimmed.slice(colon+1));
    }
  }
  return cfg;
}

function saveConfig() {
  downloadBlob(new Blob([configToYaml()], { type: 'text/yaml' }), 'caustica-config.yaml');
}

// Example scenes shipped with the site. GitHub Pages can't list a directory, so
// the manifest is explicit; files live in /images/caustica-presets/.
const PRESET_BASE = '/images/caustica-presets/';
const PRESETS = [
  { file: 'single-sie.yaml',    name: 'SIE lens + Point Source' },
  { file: 'compound-lens.yaml', name: 'Double Lens + Uniform Source' },
  { file: 'two-plane.yaml',     name: 'Two lens planes (multiplane)' },
  { file: 'fermat-demo.yaml',   name: 'Fermat surface demo' },
  { file: 'zigzag.yaml',        name: 'ZigZag Lens' },
];

// Name of the preset last loaded from the dropdown, so the box keeps showing it.
let _selectedPreset = '';

// Fetch a preset YAML by filename and load it through the normal config path.
function loadPreset(file) {
  if (!PRESETS.some(p => p.file === file)) return; // only load known files
  fetch(PRESET_BASE + file)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(yaml => { _selectedPreset = file; loadConfigFromYaml(yaml); }) // loadConfig re-renders the sidebar
    .catch(err => { alert('Failed to load preset: ' + err.message); console.error(err); renderSidebar(); });
}

function loadConfigFromYaml(yaml) {
  try {
    const cfg = parseYamlConfig(yaml);
    // Any scalar setting absent from the file falls back to its default, so older
    // configs (and hand-written partial ones) load to a well-defined visual state.
    state.fov  = (isFinite(cfg.fov)  && cfg.fov  > 0) ? cfg.fov  : CONFIG_DEFAULTS.fov;
    state.zMax = (isFinite(cfg.zMax) && cfg.zMax > 0) ? cfg.zMax : CONFIG_DEFAULTS.zMax;
    // Clear pasted textures before replacing planes
    for (const p of state.planes)
      p.objects.filter(o => o.model === 'pastedimage').forEach(o => renderer?.clearPastedTexture(o.id));
    const VALID_TYPES  = new Set(['lens', 'source']);
    const VALID_MODELS = new Set(['pointmass','sie','nie','epl','nfw','shear','convergence','deflection','gaussian','exponential','point','pointsource','pastedimage']);
    const COLOR_RE     = /^#[0-9a-fA-F]{6}$/;
    state.planes = (cfg.planes || []).map(p => ({
      id: uid(), z: isFinite(p.z) ? +p.z : 0,
      objects: (p.objects || []).map(o => {
        const type  = VALID_TYPES.has(o.type)   ? o.type  : 'lens';
        const model = VALID_MODELS.has(o.model) ? o.model : (type === 'lens' ? 'sie' : 'gaussian');
        // Sanitize params: numbers only except color (must be #rrggbb)
        const rawParams = o.params ?? {};
        const params = {};
        for (const [k, v] of Object.entries(rawParams)) {
          if (k === 'color') params[k] = COLOR_RE.test(v) ? v : '#ffffff';
          else if (typeof v === 'number' && isFinite(v)) params[k] = v;
          else if (typeof v === 'boolean') params[k] = v;
        }
        return {
          id: uid(), type, model,
          cx:       isFinite(o.cx) ? Math.max(-50, Math.min(50, +o.cx)) : 0,
          cy:       isFinite(o.cy) ? Math.max(-50, Math.min(50, +o.cy)) : 0,
          hidden:   o.hidden === true,
          showShape: o.showShape === true,
          ...(typeof o.hybridId === 'string' && /^[a-z0-9-]+$/.test(o.hybridId) ? { hybridId: o.hybridId } : {}),
          params: Object.keys(params).length ? params : defaultParams(model),
        };
      })
    }));
    state.planes.sort((a, b) => a.z - b.z);
    state.selectedPlaneId = state.planes[0]?.id ?? null;
    state.selectedObjId   = state.planes[0]?.objects[0]?.id ?? null;
    state.vizMode = (typeof cfg.vizMode === 'number') ? cfg.vizMode : CONFIG_DEFAULTS.vizMode;
    // Per-mode colour mapping: "scale param min max" strings.
    state.vizScale = _cloneVizScaleDefaults();
    for (const m of [0, 1, 2, 3, 5]) {
      const raw = cfg[`vizScale${m}`];
      if (typeof raw === 'string') {
        const [scale, param, min, max, palette] = raw.trim().split(/\s+/).map(Number);
        if ([scale, param, min, max].every(isFinite))
          state.vizScale[m] = { scale, param, min, max, palette: isFinite(palette) ? palette : 0 };
      }
    }
    // Back-compat: old configs stored a single surface-brightness tone map.
    if (cfg.toneMap !== undefined && cfg.vizScale0 === undefined) {
      const s0 = state.vizScale[0];
      if (typeof cfg.toneMap === 'number') s0.scale = cfg.toneMap;
      if (isFinite(cfg.toneMapPower) && cfg.toneMap === 2) s0.param = cfg.toneMapPower;
      if (isFinite(cfg.toneMapAsinh) && cfg.toneMap === 3) s0.param = cfg.toneMapAsinh;
    }
    // Boolean overlays: present → use the value, absent → default.
    const _bool = (v, d) => (typeof v === 'boolean') ? v : d;
    state.showCritCurves = _bool(cfg.showCritCurves, CONFIG_DEFAULTS.showCritCurves);
    state.showCaustics   = _bool(cfg.showCaustics,   CONFIG_DEFAULTS.showCaustics);
    state.showMarkers    = _bool(cfg.showMarkers,    CONFIG_DEFAULTS.showMarkers);
    state.showLegend     = _bool(cfg.showLegend,     CONFIG_DEFAULTS.showLegend);
    state.showColorbar   = _bool(cfg.showColorbar,   CONFIG_DEFAULTS.showColorbar);
    state.showRuler      = _bool(cfg.showRuler,      CONFIG_DEFAULTS.showRuler);
    state.fermatUseSourcePos = _bool(cfg.fermatUseSourcePos, CONFIG_DEFAULTS.fermatUseSourcePos);
    // Numeric settings, validated against their allowed choices where applicable.
    state.critGridN     = [256, 512, 1024, 2048].includes(cfg.critGridN) ? cfg.critGridN : CONFIG_DEFAULTS.critGridN;
    state.psGridStep    = [0.1, 0.05, 0.02, 0.01, 0.005].includes(cfg.psGridStep) ? cfg.psGridStep : CONFIG_DEFAULTS.psGridStep;
    state.critZs        = (isFinite(cfg.critZs) && cfg.critZs > 0) ? cfg.critZs : CONFIG_DEFAULTS.critZs;
    state.contourSpacing = isFinite(cfg.contourSpacing) ? Math.max(0.05, cfg.contourSpacing) : CONFIG_DEFAULTS.contourSpacing;
    if (isFinite(cfg.fermatBetaX) && isFinite(cfg.fermatBetaY) && isFinite(cfg.fermatSrcPlaneZ)) {
      const fsp = state.planes.find(p => Math.abs(p.z - cfg.fermatSrcPlaneZ) < 1e-4);
      state.lastFermatSource = fsp ? { cx: cfg.fermatBetaX, cy: cfg.fermatBetaY, planeId: fsp.id } : null;
    } else {
      state.lastFermatSource = null;
    }
    const _vizSel = document.getElementById('sl-viz-mode');
    if (_vizSel) _vizSel.value = state.vizMode;
    glCanvas?.classList.toggle('sl-viz-active', state.vizMode !== 0);
    invalidateDistances();
    state.rulerActive = false; state.rulers = []; state.rulerDraft = null;  // measurements are not part of a config
    rebuildPlaneBoxes(); renderSidebar(); _updateColorbar(); updateRulerUI(); redraw();
  } catch (err) {
    alert('Failed to load config: ' + err.message);
    console.error(err);
  }
}

function defaultParams(model) {
  if (model === 'pointmass')   return { thetaE: 1.0 };
  if (model === 'sie')         return { b: 1.0, q: 0.75, phi: 0 };
  if (model === 'nie')         return { b: 1.0, q: 0.75, phi: 0, rc: 0.2 };
  if (model === 'epl')         return { b: 1.0, q: 0.75, phi: 0, gamma: 2.0 };
  if (model === 'nfw')         return { kappaS: 0.5, rS: 0.4 };
  if (model === 'shear')       return { gamma: 0.05, phi: 0 };
  if (model === 'convergence') return { kappa: 0.05 };
  if (model === 'deflection')  return { alpha: 0.1, phi: 0 };
  if (model === 'gaussian')    return { sigma: 0.06, q: 1.0,  phi: 0, amplitude: 1.0,  color: '#ffffff' };
  if (model === 'exponential') return { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20, color: '#ffffff' };
  if (model === 'point')       return { sigma: 0.08, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pointsource') return { sigma: 0.05, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pastedimage') return { sigma: 1.0, amplitude: 1.0 };
  return {};
}

function makeObject(type, model, cx = 0, cy = 0) {
  return { id: uid(), type, model, cx, cy, params: defaultParams(model), showShape: false, hidden: false };
}

function eyeIcon(hidden) {
  return hidden
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">
        <path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a18 18 0 015.06-5.94M9.9 4.24A9 9 0 0112 4c7 0 11 8 11 8a18 18 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
       </svg>`;
}

function addPlane(z) {
  const plane = { id: uid(), z, objects: [] };
  state.planes.push(plane);
  state.planes.sort((a, b) => a.z - b.z);
  invalidateDistances();
  return plane;
}

function removePlane(id) {
  state.planes = state.planes.filter(p => p.id !== id);
  if (state.selectedPlaneId === id) { state.selectedPlaneId = null; state.selectedObjId = null; }
  invalidateDistances();
}

function invalidateDistances() { state.dist = precomputeDistances(state.planes); }

function deleteSelectedObject() {
  const pl = selectedPlane();
  if (!pl) return;
  const toDelete = pl.objects.find(o => o.id === state.selectedObjId);
  if (!toDelete) return;
  // Delete hybrid partner too (both halves always travel together).
  const removeIds = new Set(pl.objects
    .filter(o => o.id === toDelete.id || (toDelete.hybridId && o.hybridId === toDelete.hybridId))
    .map(o => o.id));
  pl.objects.filter(o => removeIds.has(o.id) && o.model === 'pastedimage')
            .forEach(o => renderer?.clearPastedTexture(o.id));
  pl.objects = pl.objects.filter(o => !removeIds.has(o.id));
  state.selectedObjId = pl.objects[0]?.id ?? null;
  renderSidebar(); rebuildPlaneBoxes(); redraw();
}

function selectedPlane() { return state.planes.find(p => p.id === state.selectedPlaneId) ?? null; }
function selectedObj() {
  const pl = selectedPlane();
  return pl ? (pl.objects.find(o => o.id === state.selectedObjId) ?? null) : null;
}

// Pasted images are stored per-object on obj.pasteCanvas (HTMLCanvasElement|null).
let activeTab = 'settings'; // 'settings' | 'recording'

// ── DOM refs ──────────────────────────────────────────────────────────────────
let renderer = null, glCanvas = null, overlayCtx = null;
let axisCanvas = null, planesEl = null, sidebarEl = null;

function updatePlaneArrows() {
  const el = document.getElementById('sl-planes');
  const l  = document.getElementById('sl-planes-arrow-l');
  const r  = document.getElementById('sl-planes-arrow-r');
  if (!el || !l || !r) return;
  l.style.display = el.scrollLeft > 1 ? '' : 'none';
  r.style.display = el.scrollLeft < el.scrollWidth - el.clientWidth - 1 ? '' : 'none';
}
let _planeLevels      = new Map();  // plane.id → bump level, kept in sync with drawAxisCanvas
let _draggingPlaneId  = null;       // id of the plane currently being axis-dragged
let _arrowKeyStart    = 0;          // timestamp of the first keydown in the current arrow-key hold

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  buildDOM();

  try {
    renderer = new Renderer(glCanvas);
  } catch (err) {
    console.error('Caustica renderer init failed:', err);
    showRendererError(err.message);
  }

  loadDemoState();
  invalidateDistances();
  attachHandlers();
  rebuildPlaneBoxes();
  renderSidebar();

  requestAnimationFrame(() => { renderer?.resize(); redraw(); });

  new ResizeObserver(() => { renderer?.resize(); redraw(); })
    .observe(document.getElementById('sl-image-wrap'));

  new ResizeObserver(() => { drawAxisCanvas(); })
    .observe(document.getElementById('sl-axis-canvas'));

  // Redraw axis when crossing the mobile breakpoint (e.g. wide→narrow→wide).
  window.matchMedia('(max-width: 640px)').addEventListener('change', () => {
    setTimeout(drawAxisCanvas, 150);
  });
}

function applyThemeIcons(theme) {
  document.querySelectorAll('.icon-sun') .forEach(el => { el.style.display = theme === 'dark' ? 'block' : 'none'; });
  document.querySelectorAll('.icon-moon').forEach(el => { el.style.display = theme === 'dark' ? 'none'  : 'block'; });
}

// Flip dark/light and refresh everything theme-dependent (icons, colorbar, canvases).
function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
  applyThemeIcons(next);
  _updateColorbar();
  rebuildPlaneBoxes(); renderSidebar(); redraw();
}

function showRendererError(msg) {
  const wrap = document.getElementById('sl-image-wrap');
  if (!wrap) return;
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;font-size:13px;color:#f87171;text-align:center;background:#0d1117;flex-direction:column;gap:6px';
  const h = document.createElement('span');
  h.textContent = 'WebGL2 required.';
  const s = document.createElement('small');
  s.style.opacity = '0.7';
  s.textContent = msg;
  const hint = document.createElement('small');
  hint.style.opacity = '0.7';
  hint.textContent = 'Try enabling hardware acceleration in your browser’s settings.';
  div.appendChild(h); div.appendChild(s); div.appendChild(hint);
  wrap.innerHTML = '';
  wrap.appendChild(div);
}

function loadDemoState() {
  const lp = addPlane(0.5);
  const smallLens = { id: uid(), type: 'lens', model: 'sie', cx: 0.86, cy: 0.71, params: { b: 0.3, q: 0.75, phi: 0 }, showShape: false, hidden: false };
  lp.objects = [
    { id: uid(), type: 'lens', model: 'sie', cx: 0, cy: 0, params: { b: 2.3, q: 0.75, phi: 0 }, showShape: false, hidden: false },
    smallLens,
  ];
  const sp = addPlane(1.0);
  sp.objects = [{ id: uid(), type: 'source', model: 'exponential', cx: 0.3, cy: 0.1,
                  params: { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20 }, showShape: false, hidden: false }];
  // Pre-select the small off-axis lens so its params appear on load.
  state.selectedPlaneId = lp.id;
  state.selectedObjId   = smallLens.id;
}

// ── DOM ───────────────────────────────────────────────────────────────────────
function buildDOM() {
  document.getElementById('app').innerHTML = `
    <div class="app-inner">
      <div class="sl-topbar">
        <h1>Caustica</h1>
<a class="sl-demo-btn" href="/caustica-documentation/" target="_blank" rel="noopener">Docs</a>
        <button class="sl-demo-btn" id="sl-demo" title="Walk through a tour of the controls">Tour</button>
        <button class="sl-theme-btn" id="sl-theme" title="Toggle dark mode (D)" aria-label="Toggle dark mode">
          <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
      <div class="sl-body">
        <div class="sl-upper">
          <div class="sl-image-wrap" id="sl-image-wrap">
            <canvas id="sl-gl-canvas"></canvas>
            <canvas class="sl-overlay" id="sl-overlay"></canvas>
            <div class="sl-rec-dot" id="sl-rec-dot" style="display:none"></div>
            <div class="sl-viz-chip">
              <select id="sl-viz-mode">
                <option value="0">Lensed image</option>
                <option value="1">Convergence κ</option>
                <option value="2">Shear γ</option>
                <option value="3">Magnification |μ|</option>
                <option value="5">Deflection |α|</option>
                <option value="6">Fermat potential φ</option>
              </select>
            </div>
            <div class="sl-colorbar" id="sl-colorbar" style="display:none">
              <div class="sl-colorbar-bar" id="sl-colorbar-bar"></div>
              <div class="sl-colorbar-labels">
                <span id="sl-colorbar-min"></span>
                <span id="sl-colorbar-title"></span>
                <span id="sl-colorbar-max"></span>
              </div>
            </div>
            <div class="sl-ruler-tools" id="sl-ruler-tools" style="display:none">
              <button class="sl-ruler-btn" id="sl-ruler-btn" title="Ruler — measure angular distance">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1.5" y="5" width="13" height="6" rx="1"/>
                  <line x1="4.5"  y1="5" x2="4.5"  y2="8"/>
                  <line x1="8"    y1="5" x2="8"    y2="8.5"/>
                  <line x1="11.5" y1="5" x2="11.5" y2="8"/>
                </svg>
              </button>
              <button class="sl-ruler-clear" id="sl-ruler-clear" title="Clear measurements" style="display:none">×</button>
            </div>
          </div>
          <!-- Controls group: right-justified, right-grows -->
          <div class="sl-controls-col" id="sl-controls-col" data-mobile-tab="object">
            <div class="sl-mobile-tabs" id="sl-mobile-tabs">
              <button class="sl-mobile-tab-btn active" data-tab="object">Object</button>
              <button class="sl-mobile-tab-btn" data-tab="settings">Settings</button>
              <button class="sl-mobile-tab-btn" data-tab="recording">Recording</button>
            </div>
            <div class="sl-param-col">
              <div class="sl-tabs">
                <div class="sl-param-col-title">Object Controls</div>
              </div>
              <div id="sl-obj-panel"></div>
            </div>
            <div class="sl-sidebar">
              <div class="sl-tabs" id="sl-tabs">
                <button class="sl-tab-btn active" data-tab="settings">Settings</button>
                <button class="sl-tab-btn" data-tab="recording">Recording</button>
              </div>
              <div class="sl-tab-content" id="sl-tab-settings"></div>
              <div class="sl-tab-content" id="sl-tab-recording" style="display:none"></div>
            </div>
          </div><!-- end sl-controls-col -->
        </div>
        <div class="sl-plane-setup-bar" id="sl-plane-setup-bar">
          <button class="sl-plane-setup-btn" id="sl-plane-setup-btn">▲ Plane Setup</button>
        </div>
        <div class="sl-timeline" id="sl-timeline">
          <div class="sl-axis-wrap">
            <div class="sl-axis-label">redshift z →</div>
            <canvas class="sl-axis-canvas" id="sl-axis-canvas"></canvas>
          </div>
          <div class="sl-plane-toolbar" id="sl-plane-toolbar">
            <button class="sl-tool-btn active" data-mode="lens"   title="Add lens (1)"><span class="sl-tool-s">L</span><span class="sl-tool-l">Lens</span></button>
            <button class="sl-tool-btn"         data-mode="source" title="Add source (2)"><span class="sl-tool-s">S</span><span class="sl-tool-l">Source</span></button>
            <button class="sl-tool-btn"         data-mode="hybrid" title="Add hybrid (3)"><span class="sl-tool-s">H</span><span class="sl-tool-l">Hybrid</span></button>
            <div class="sl-tool-sep"></div>
            <button class="sl-tool-btn sl-tool-del" id="sl-tool-del-obj" title="Delete selected object"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="1.5" y1="4" x2="12.5" y2="4"/><path d="M4 4l.5 7h5l.5-7"/><path d="M5 4V3h4v1"/></svg></button>
          </div>
          <div class="sl-planes-wrap">
            <button class="sl-planes-arrow sl-planes-arrow-l" id="sl-planes-arrow-l" aria-label="Scroll planes left">‹</button>
            <div class="sl-planes" id="sl-planes"></div>
            <button class="sl-planes-arrow sl-planes-arrow-r" id="sl-planes-arrow-r" aria-label="Scroll planes right">›</button>
          </div>
        </div>
      </div>
    </div>`;

  glCanvas   = document.getElementById('sl-gl-canvas');
  axisCanvas = document.getElementById('sl-axis-canvas');
  planesEl   = document.getElementById('sl-planes');
  // sidebarEl no longer used: renderSidebar targets sl-params-col / sl-settings-col directly.
  overlayCtx = document.getElementById('sl-overlay').getContext('2d');
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function attachHandlers() {
  document.getElementById('sl-demo').addEventListener('click', startTour);
  document.getElementById('sl-theme').addEventListener('click', toggleTheme);
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');

  // Tab switching: static buttons, wired once.
  document.getElementById('sl-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.sl-tab-btn');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.sl-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    document.getElementById('sl-tab-settings').style.display  = activeTab === 'settings'  ? '' : 'none';
    document.getElementById('sl-tab-recording').style.display = activeTab === 'recording' ? '' : 'none';
  });

  // Mobile tab bar.
  document.getElementById('sl-mobile-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.sl-mobile-tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.sl-mobile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('sl-controls-col').dataset.mobileTab = tab;
    if (tab === 'settings' || tab === 'recording') {
      activeTab = tab;
      document.querySelectorAll('.sl-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.getElementById('sl-tab-settings').style.display  = tab === 'settings'  ? '' : 'none';
      document.getElementById('sl-tab-recording').style.display = tab === 'recording' ? '' : 'none';
    }
  });

  // Mobile plane setup toggle.
  document.getElementById('sl-plane-setup-btn').addEventListener('click', () => {
    const tl  = document.getElementById('sl-timeline');
    const bar = document.getElementById('sl-plane-setup-bar');
    const btn = document.getElementById('sl-plane-setup-btn');
    const open = tl.classList.toggle('plane-setup-open');
    btn.textContent = open ? '▼ Plane Setup' : '▲ Plane Setup';
    if (open) {
      // After drawer renders, float the pill to sit on top of it.
      setTimeout(() => {
        const h = tl.getBoundingClientRect().height;
        if (bar && h > 0) bar.style.bottom = `${h}px`;
        drawAxisCanvas();
      }, 50);
    } else {
      if (bar) bar.style.bottom = '';
    }
  });
  document.getElementById('sl-plane-setup-btn').textContent = '▲ Plane Setup';

  // Global plane toolbar: L / S / H mode + delete selected object.
  document.getElementById('sl-plane-toolbar').addEventListener('click', e => {
    const modeBtn = e.target.closest('.sl-tool-btn[data-mode]');
    if (modeBtn) {
      state.addMode = modeBtn.dataset.mode;
      document.querySelectorAll('.sl-tool-btn[data-mode]').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === state.addMode));
      return;
    }
    if (e.target.closest('#sl-tool-del-obj')) deleteSelectedObject();
  });

  // Mobile plane scroll arrows.
  document.getElementById('sl-planes')?.addEventListener('scroll', updatePlaneArrows);
  document.getElementById('sl-planes-arrow-l')?.addEventListener('click', () => {
    document.getElementById('sl-planes')?.scrollBy({ left: -162, behavior: 'smooth' });
  });
  document.getElementById('sl-planes-arrow-r')?.addEventListener('click', () => {
    document.getElementById('sl-planes')?.scrollBy({ left:  162, behavior: 'smooth' });
  });

  // Align the plane-setup tab with the canvas right edge (canvas is inside
  // .sl-body which has a scrollbar; fixed-positioned tab needs the extra offset).
  function _syncSetupBarRight() {
    const bar  = document.getElementById('sl-plane-setup-bar');
    const body = document.querySelector('.sl-body');
    if (!bar || !body || window.innerWidth > 640) return;
    const sw = body.offsetWidth - body.clientWidth; // scrollbar width
    bar.style.right = `${8 + sw}px`;
  }
  _syncSetupBarRight();
  window.addEventListener('resize', _syncSetupBarRight);

  const _VIZ_LABELS = { '0':'Lensed image','1':'Convergence κ','2':'Shear γ','3':'Magnification |μ|','5':'Deflection |α|','6':'Fermat potential φ' };
  const _VIZ_LABELS_SHORT = { '0':'[I] Lensed image','1':'[K] Convergence κ','2':'[G] Shear γ','3':'[M] Magnification |μ|','5':'[A] Deflection |α|','6':'[T] Fermat potential φ' };
  function _setVizOptionLabels(withShortcuts) {
    const sel = document.getElementById('sl-viz-mode');
    if (!sel) return;
    const map = withShortcuts ? _VIZ_LABELS_SHORT : _VIZ_LABELS;
    for (const opt of sel.options) if (map[opt.value]) opt.textContent = map[opt.value];
  }
  document.getElementById('sl-viz-mode')?.addEventListener('mousedown', () => _setVizOptionLabels(true));
  document.getElementById('sl-viz-mode')?.addEventListener('change', e => {
    _setVizOptionLabels(false);
    state.vizMode = parseInt(e.target.value, 10);
    glCanvas?.classList.toggle('sl-viz-active', state.vizMode !== 0);
    _updateColorbar(); renderSidebar(); redraw();
  });
  document.getElementById('sl-viz-mode')?.addEventListener('blur', () => _setVizOptionLabels(false));

  attachAxisHandlers();
  attachImageHandlers(document.getElementById('sl-image-wrap'));

  // Ruler tool: toggle activates the crosshair; the × clears all measurements.
  // Stop pointerdown from bubbling to the image-wrap so clicking these buttons
  // never starts an object drag or a stray ruler measurement.
  document.getElementById('sl-ruler-tools')?.addEventListener('pointerdown', e => e.stopPropagation());
  document.getElementById('sl-ruler-btn')?.addEventListener('click', () => {
    state.rulerActive = !state.rulerActive;
    if (!state.rulerActive) { state.rulers = []; state.rulerDraft = null; }  // toggling off clears
    updateRulerUI();
    const wrap = document.getElementById('sl-image-wrap');
    if (wrap) wrap.style.cursor = state.rulerActive ? 'crosshair' : '';
    drawOverlay();
  });
  document.getElementById('sl-ruler-clear')?.addEventListener('click', () => {
    state.rulers = []; state.rulerDraft = null;
    updateRulerUI(); drawOverlay();
  });
  updateRulerUI();

  // Paste image from clipboard: applies to the currently selected pastedimage object.
  document.addEventListener('paste', e => {
    const obj = selectedObj();
    if (!obj || obj.model !== 'pastedimage') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      _applyImageFile(item.getAsFile(), obj);
      break;
    }
  });

  // Global keyboard: Delete/Backspace removes selected object; Esc deselects.
  document.addEventListener('keydown', e => {
    const tag  = (document.activeElement?.tagName) || '';
    const type = (document.activeElement?.type)    || '';
    // Allow shortcuts when a range slider has focus (range inputs don't consume C/R/etc).
    if ((tag === 'INPUT' && type !== 'checkbox' && type !== 'range') || tag === 'TEXTAREA') return;
    // Arrow keys nudge the selected object; skip if any input has focus
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown') {
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const obj = selectedObj(), pl = selectedPlane();
      if (!obj || !pl) return;
      e.preventDefault();
      // Reset timer on the first press; use elapsed time to pick speed tier.
      if (!e.repeat) _arrowKeyStart = Date.now();
      const held = Date.now() - _arrowKeyStart;
      const nudge = held < 400 ? 0.01 : held < 1200 ? 0.04 : 0.12;
      if (e.key === 'ArrowLeft')  obj.cx -= nudge;
      if (e.key === 'ArrowRight') obj.cx += nudge;
      if (e.key === 'ArrowUp')    obj.cy += nudge;
      if (e.key === 'ArrowDown')  obj.cy -= nudge;
      const _kp = hybridPartner(pl, obj);
      if (_kp) { _kp.cx = obj.cx; _kp.cy = obj.cy; }
      if (!recState.progInitialPos) {
        const el = document.getElementById('sl-prog-init-val');
        if (el) el.innerHTML = `(${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)}) <span class="sl-muted-note">(current)</span>`;
      }
      redrawPlaneCanvas(pl);
      renderSidebar();
      redraw();
      return;
    }

    if (e.key === 'h' || e.key === 'H') {
      const obj = selectedObj(), pl = selectedPlane();
      if (!obj || !pl) return;
      const partner = hybridPartner(pl, obj);
      if (partner) {
        const newHidden = !(obj.hidden && partner.hidden);
        obj.hidden = newHidden; partner.hidden = newHidden;
      } else {
        obj.hidden = !obj.hidden;
      }
      renderSidebar(); redraw();
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      state.addMode = e.key === '1' ? 'lens' : e.key === '2' ? 'source' : 'hybrid';
      document.querySelectorAll('.sl-tool-btn[data-mode]').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === state.addMode));
      return;
    }
    if (e.key === 'o' || e.key === 'O') {
      const pl = selectedPlane();
      if (!pl) return;
      pl.objects.filter(o => o.model === 'pastedimage').forEach(o => renderer?.clearPastedTexture(o.id));
      pl.objects = [];
      state.selectedObjId = null;
      rebuildPlaneBoxes(); renderSidebar(); redraw();
      return;
    }
    if (e.key === 'x' || e.key === 'X') {
      const pl = selectedPlane();
      if (!pl) return;
      removePlane(pl.id); rebuildPlaneBoxes(); renderSidebar(); redraw();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      recState.active ? stopRecording() : startRecording();
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      const either = state.showCritCurves || state.showCaustics;
      state.showCritCurves = !either;
      state.showCaustics   = !either;
      renderSidebar(); redraw();
      return;
    }
    if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      toggleTheme();
      return;
    }
    // Visualization mode shortcuts: toggle on/off; pressing the same key again returns to image.
    const VIZ_KEYS = { k: 1, K: 1, g: 2, G: 2, m: 3, M: 3, a: 5, A: 5, i: 0, I: 0, t: 6, T: 6 };
    if (e.key in VIZ_KEYS) {
      const mode = VIZ_KEYS[e.key];
      state.vizMode = mode;
      const sel = document.getElementById('sl-viz-mode');
      if (sel) sel.value = state.vizMode;
      glCanvas?.classList.toggle('sl-viz-active', state.vizMode !== 0);
      _updateColorbar(); renderSidebar(); redraw();
      return;
    }
    if (e.key === 'Escape') {
      // Clear ruler measurements first if any exist; otherwise deselect.
      if (state.rulers.length || state.rulerDraft) {
        state.rulers = []; state.rulerDraft = null;
        updateRulerUI(); drawOverlay();
        return;
      }
      state.selectedObjId = null;
      renderSidebar(); rebuildPlaneBoxes(); redraw();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const pl = selectedPlane();
      if (!pl) return;
      deleteSelectedObject();
    }
  });
}

// ── Axis interaction ───────────────────────────────────────────────────────────
const AXIS_HIT_PX = 12;

function axisZToX(z, Wl) {
  const PAD = 12;
  return PAD + (z / state.zMax) * (Wl - 2 * PAD);
}
function axisXToZ(x, Wl) {
  const PAD = 12;
  return Math.max(0.01, Math.min(state.zMax, ((x - PAD) / (Wl - 2 * PAD)) * state.zMax));
}

// ── Image-panel drag ─────────────────────────────────────────────────────────
// Converts a pointer event on the image wrap to arcsec coordinates.
function imageWrapToArcsec(wrap, e) {
  const r = wrap.getBoundingClientRect();
  return {
    x:  ((e.clientX - r.left) / r.width  - 0.5) * state.fov,
    y: -((e.clientY - r.top)  / r.height - 0.5) * state.fov,
  };
}

// Hit-test all objects in all planes against an image-space pointer event.
function hitTestImage(wrap, e) {
  const pos = imageWrapToArcsec(wrap, e);
  const r   = wrap.getBoundingClientRect();
  // Convert pixel hit radius to arcsec, scaled up on mobile.
  const thresh = (hitRadius() * 1.5) / r.width * state.fov;
  const seenHybrids = new Set();
  for (const plane of state.planes) {
    for (const obj of plane.objects) {
      if (obj.hidden) continue;
      if (obj.hybridId) {
        if (seenHybrids.has(obj.hybridId)) continue;
        seenHybrids.add(obj.hybridId);
      }
      if (Math.hypot(obj.cx - pos.x, obj.cy - pos.y) < thresh)
        return { obj: hybridLensHalf(plane, obj), plane };
    }
  }
  return null;
}

// Sync the ruler tool's DOM chrome with state: container visibility (showRuler),
// active highlight on the toggle button, and the clear button (shown only when
// there are committed measurements).
function updateRulerUI() {
  const tools = document.getElementById('sl-ruler-tools');
  const btn   = document.getElementById('sl-ruler-btn');
  const clr   = document.getElementById('sl-ruler-clear');
  const wrap  = document.getElementById('sl-image-wrap');
  if (tools) tools.style.display = state.showRuler ? '' : 'none';
  if (btn)   btn.classList.toggle('active', state.rulerActive);
  if (clr)   clr.style.display = (state.showRuler && state.rulers.length > 0) ? '' : 'none';
  if (wrap)  wrap.classList.toggle('sl-ruler-visible', state.showRuler);
}

function attachImageHandlers(wrap) {
  let imgDrag   = null; // { obj, plane, startCx, startCy, startMx, startMy }
  let rulerDrag = null; // { x0, y0, x1, y1 } while dragging a ruler measurement

  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Ruler tool intercepts the pointer entirely: no object hit-test / selection / move.
    if (state.rulerActive && state.showRuler) {
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      const p = imageWrapToArcsec(wrap, e);
      rulerDrag = state.rulerDraft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      wrap.style.cursor = 'crosshair';
      drawOverlay();
      return;
    }
    const hit = hitTestImage(wrap, e);
    if (!hit) return;
    e.preventDefault();
    wrap.setPointerCapture(e.pointerId);
    const pos = imageWrapToArcsec(wrap, e);
    imgDrag = { obj: hit.obj, plane: hit.plane,
                startCx: hit.obj.cx, startCy: hit.obj.cy,
                startMx: pos.x,      startMy: pos.y };
    state.selectedPlaneId = hit.plane.id;
    state.selectedObjId   = hit.obj.id;
    wrap.style.cursor = 'grabbing';
    renderSidebar(); redraw();
  });

  wrap.addEventListener('pointermove', e => {
    if (rulerDrag) {
      e.preventDefault();
      const p = imageWrapToArcsec(wrap, e);
      rulerDrag.x1 = p.x; rulerDrag.y1 = p.y;
      drawOverlay();  // overlay only — the GL scene is unchanged by a ruler drag
      return;
    }
    if (!imgDrag) {
      // While the ruler tool is armed, keep the crosshair and never show the object grab cursor.
      if (state.rulerActive && state.showRuler) { wrap.style.cursor = 'crosshair'; return; }
      wrap.style.cursor = hitTestImage(wrap, e) ? 'grab' : '';
      return;
    }
    e.preventDefault();
    const pos = imageWrapToArcsec(wrap, e);
    imgDrag.obj.cx = imgDrag.startCx + (pos.x - imgDrag.startMx);
    imgDrag.obj.cy = imgDrag.startCy + (pos.y - imgDrag.startMy);
    const partner = hybridPartner(imgDrag.plane, imgDrag.obj);
    if (partner) { partner.cx = imgDrag.obj.cx; partner.cy = imgDrag.obj.cy; }
    const posEl = document.getElementById('sl-obj-pos');
    if (posEl) posEl.textContent = `Pos: (${imgDrag.obj.cx.toFixed(2)}, ${imgDrag.obj.cy.toFixed(2)})`;
    redrawPlaneCanvas(imgDrag.plane);
    redraw();
  });

  wrap.addEventListener('pointerup', e => {
    if (rulerDrag) {
      // Commit only a real drag; ignore near-zero-length taps.
      if (Math.hypot(rulerDrag.x1 - rulerDrag.x0, rulerDrag.y1 - rulerDrag.y0) >= state.fov * 0.01) {
        state.rulers.push({ ...rulerDrag });
      }
      rulerDrag = state.rulerDraft = null;
      wrap.style.cursor = 'crosshair';
      updateRulerUI(); drawOverlay();
      return;
    }
    if (!imgDrag) return;
    invalidateDistances();
    redraw();
    wrap.style.cursor = '';
    imgDrag = null;
  });

  wrap.addEventListener('pointercancel', () => {
    if (rulerDrag) { rulerDrag = state.rulerDraft = null; updateRulerUI(); drawOverlay(); }
  });
}

function attachAxisHandlers() {
  let dragPlane = null, didDrag = false;

  function nearestMarker(clientX, clientY) {
    const r   = axisCanvas.getBoundingClientRect();
    const mx  = clientX - r.left;
    const my  = clientY - r.top;
    const Wl  = r.width;
    const Hl  = r.height;
    const axisY = Hl * 0.55;
    const BUMP_STEP = 28;
    const HIT = 14;  // px radius around diamond centre
    let best = null, bestDist = Infinity;
    for (const p of state.planes) {
      const px  = axisZToX(p.z, Wl);
      const lv  = _planeLevels.get(p.id) || 0;
      const py  = axisY - 12 - lv * BUMP_STEP;  // diamond centre-ish
      const d   = Math.hypot(mx - px, my - py);
      if (d < HIT && d < bestDist) { bestDist = d; best = p; }
    }
    // Fallback: x-only hit near the axis tick (for when markers haven't been drawn yet)
    if (!best) {
      for (const p of state.planes) {
        const dx = Math.abs(axisZToX(p.z, Wl) - mx);
        if (dx < AXIS_HIT_PX && dx < bestDist) { bestDist = dx; best = p; }
      }
    }
    return best;
  }

  axisCanvas.addEventListener('pointermove', e => {
    if (dragPlane) {
      e.preventDefault();
      // Cursor locked to grabbing during drag.
      axisCanvas.style.cursor = 'grabbing';
      didDrag = true;
      const r = axisCanvas.getBoundingClientRect();
      const z = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      dragPlane.z = z;
      state.planes.sort((a, b) => a.z - b.z);
      invalidateDistances();
      rebuildPlaneBoxes(); drawAxisCanvas(); redraw();
      // Update z in the params panel without a full sidebar rebuild.
      if (dragPlane.id === state.selectedPlaneId) {
        const zEl = document.querySelector('#sl-obj-panel .sl-params-z');
        if (zEl) zEl.textContent = `z: ${z.toFixed(2)}`;
      }
    } else {
      axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
    }
  });

  axisCanvas.addEventListener('pointerleave', () => { axisCanvas.style.cursor = 'crosshair'; });

  axisCanvas.addEventListener('pointerdown', e => {
    if (dragPlane) return;  // never re-target while a drag is already active
    axisCanvas.setPointerCapture(e.pointerId);
    didDrag = false;
    dragPlane = nearestMarker(e.clientX, e.clientY);
    if (dragPlane) {
      _draggingPlaneId = dragPlane.id;
      axisCanvas.style.cursor = 'grabbing';
      state.selectedPlaneId = dragPlane.id;
      state.selectedObjId   = dragPlane.objects[0]?.id ?? null;
      renderSidebar();
    }
  });

  axisCanvas.addEventListener('pointerup', e => {
    if (!dragPlane && !didDrag) {
      const r    = axisCanvas.getBoundingClientRect();
      const z    = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      const pl = addPlane(z);
      state.selectedPlaneId = pl.id;
      state.selectedObjId   = pl.objects[0]?.id ?? null;
      rebuildPlaneBoxes(); renderSidebar(); redraw();
    }
    dragPlane = null;
    _draggingPlaneId = null;
    drawAxisCanvas();  // recalculate settled levels immediately on release
    axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
  });
}

// ── Plane boxes ───────────────────────────────────────────────────────────────
function rebuildPlaneBoxes() {
  planesEl.innerHTML = '';
  if (state.planes.length === 0) {
    planesEl.innerHTML = '<span class="sl-timeline-hint">Click the axis to add a lens or source plane</span>';
    return;
  }

  for (const plane of state.planes) {
    const effType = planeEffectiveType(plane);
    const box     = document.createElement('div');
    box.className   = 'sl-plane-box';
    box.dataset.id            = plane.id;
    box.dataset.effectiveType = effType;

    const hasPasted = plane.objects.some(o => o.model === 'pastedimage');
    box.innerHTML = `
      <div class="sl-plane-header">
        <span class="sl-plane-z">z = ${plane.z.toFixed(2)}</span>
        ${hasPasted ? `<button class="sl-plane-paste" title="Load image from file"><svg width="12" height="11" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3.5V10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4.5a1 1 0 0 0-1-1H7L5.5 2H2a1 1 0 0 0-1 1.5z"/></svg></button>` : ''}
        <button class="sl-plane-clear" title="Clear all objects">○</button>
        <button class="sl-plane-del" title="Delete plane">×</button>
      </div>
      <canvas class="sl-plane-canvas" width="148" height="148" style="width:148px;height:148px"></canvas>`;

    planesEl.appendChild(box);

    // Clear button removes all objects from this plane.
    // Image button: opens file picker for pasted-image objects.
    const pasteBtn = box.querySelector('.sl-plane-paste');
    if (pasteBtn) {
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
      box.appendChild(fi);
      fi.addEventListener('change', e => {
        const target = plane.objects.find(o => o.model === 'pastedimage');
        const file = e.target.files?.[0];
        if (file && target) { state.selectedPlaneId = plane.id; state.selectedObjId = target.id; _applyImageFile(file, target); }
        e.target.value = '';
      });
      pasteBtn.addEventListener('click', () => fi.click());
    }

    box.querySelector('.sl-plane-clear').addEventListener('click', () => {
      plane.objects.filter(o => o.model === 'pastedimage').forEach(o => renderer?.clearPastedTexture(o.id));
      plane.objects = [];
      if (state.selectedPlaneId === plane.id) state.selectedObjId = null;
      rebuildPlaneBoxes(); renderSidebar(); redraw();
    });

    // Delete.
    box.querySelector('.sl-plane-del').addEventListener('click', () => {
      removePlane(plane.id); rebuildPlaneBoxes(); renderSidebar(); redraw();
    });

    const cvs = box.querySelector('.sl-plane-canvas');
    attachPlaneCanvasHandlers(cvs, plane);
    drawPlaneCanvas(cvs, plane);
  }
  updatePlaneArrows();
}

// ── Plane canvas interaction ───────────────────────────────────────────────────
const HIT_R = 10; // px desktop
function hitRadius() { return window.innerWidth <= 640 ? 18 : HIT_R; }

function attachPlaneCanvasHandlers(canvas, plane) {
  // 'idle' | 'hit-pending' | 'dragging' | 'add-pending' | 'add-dragging'
  let istate  = 'idle';
  let hitObj  = null;
  let pStart  = null; // { cx, cy, mx, my } for dragging
  const DRAG_THRESH = 3; // px

  canvas.addEventListener('pointermove', e => {
    if (istate === 'idle') {
      canvas.style.cursor = hitTestPlane(plane, canvas, e) ? 'grab' : 'crosshair';
      return;
    }
    if (istate !== 'idle') e.preventDefault();
    const pos = canvasToArcsec(canvas, e);
    const dx  = pos.x - pStart.mx, dy = pos.y - pStart.my;
    const dpx = dx / state.fov * canvas.offsetWidth;

    if (istate === 'hit-pending' && Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      istate = 'dragging'; canvas.style.cursor = 'grabbing';
    }
    if (istate === 'add-pending' && Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      hitObj = _makeAddObjects(plane, pStart.mx, pStart.my);
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = hitObj.id;
      pStart.cx = pStart.mx; pStart.cy = pStart.my;
      istate = 'add-dragging'; canvas.style.cursor = 'grabbing';
      updatePlaneBoxColor(plane); renderSidebar();
    }
    if (istate === 'dragging' || istate === 'add-dragging') {
      hitObj.cx = pStart.cx + dx;
      hitObj.cy = pStart.cy + dy;
      // Move hybrid partner in sync.
      const _partner = hybridPartner(plane, hitObj);
      if (_partner) { _partner.cx = hitObj.cx; _partner.cy = hitObj.cy; }
      redrawPlaneCanvas(plane); redraw();
      // Keep the "Initial pos (current)" display in sync without a full sidebar rebuild.
      if (hitObj.id === state.selectedObjId) {
        const posEl = document.getElementById('sl-obj-pos');
        if (posEl) posEl.textContent = `Pos: (${hitObj.cx.toFixed(2)}, ${hitObj.cy.toFixed(2)})`;
      }
    }
  });

  canvas.addEventListener('pointerleave', () => { if (istate === 'idle') canvas.style.cursor = 'crosshair'; });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pos  = canvasToArcsec(canvas, e);
    hitObj     = hitTestPlane(plane, canvas, e);
    if (hitObj) {
      istate = 'hit-pending'; canvas.style.cursor = 'grab';
      pStart = { cx: hitObj.cx, cy: hitObj.cy, mx: pos.x, my: pos.y };
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = hitObj.id;
      renderSidebar(); redraw();
    } else {
      istate = 'add-pending';
      pStart = { mx: pos.x, my: pos.y };
    }
  });

  canvas.addEventListener('pointercancel', () => { istate = 'idle'; hitObj = null; canvas.style.cursor = 'crosshair'; });

  canvas.addEventListener('pointerup', e => {
    if (istate === 'add-pending') {
      const pos = canvasToArcsec(canvas, e);
      const obj = _makeAddObjects(plane, pos.x, pos.y);
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = obj.id;
      updatePlaneBoxColor(plane); redrawPlaneCanvas(plane); renderSidebar(); redraw();
    } else if (istate === 'dragging' || istate === 'add-dragging') {
      invalidateDistances(); redraw();
    }
    istate = 'idle'; hitObj = null;
    canvas.style.cursor = hitTestPlane(plane, canvas, e) ? 'grab' : 'crosshair';
  });
}

function _applyImageFile(file, obj) {
  if (!file || !obj || obj.model !== 'pastedimage') return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const cvs = document.createElement('canvas');
    cvs.width  = img.naturalWidth  || img.width;
    cvs.height = img.naturalHeight || img.height;
    cvs.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    obj.pasteCanvas = cvs;
    renderer?.setPastedTexture(obj.id, cvs);
    rebuildPlaneBoxes(); renderSidebar(); redraw();
  };
  img.src = url;
}

function updatePlaneBoxColor(plane) {
  const box = planesEl.querySelector(`.sl-plane-box[data-id="${plane.id}"]`);
  if (box) box.dataset.effectiveType = planeEffectiveType(plane);
}

function canvasToArcsec(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return {
    x:  (e.clientX - r.left) / r.width  * state.fov - state.fov / 2,
    y: -((e.clientY - r.top) / r.height * state.fov - state.fov / 2),
  };
}

// Create one or two objects based on the global add mode (state.addMode).
// Returns the primary object to track as hitObj (lens half for hybrid).
function _makeAddObjects(plane, cx, cy) {
  if (state.addMode === 'hybrid') {
    const hybridId = uid();
    const lensObj = Object.assign(makeObject('lens',   'sie',      cx, cy), { hybridId });
    const srcObj  = Object.assign(makeObject('source', 'gaussian', cx, cy), { hybridId });
    plane.objects.push(lensObj, srcObj);
    return lensObj;
  } else if (state.addMode === 'source') {
    const obj = makeObject('source', 'gaussian', cx, cy);
    plane.objects.push(obj);
    return obj;
  } else {
    const obj = makeObject('lens', 'sie', cx, cy);
    plane.objects.push(obj);
    return obj;
  }
}

function hitTestPlane(plane, canvas, e) {
  const r = canvas.getBoundingClientRect();
  const seenHybrids = new Set();
  for (const obj of plane.objects) {
    // Test each hybrid pair only once, at the lens half's position.
    if (obj.hybridId) {
      if (seenHybrids.has(obj.hybridId)) continue;
      seenHybrids.add(obj.hybridId);
    }
    const px = (obj.cx / state.fov + 0.5) * r.width;
    const py = (-obj.cy / state.fov + 0.5) * r.height;
    if (Math.hypot(e.clientX - r.left - px, e.clientY - r.top - py) < hitRadius())
      return hybridLensHalf(plane, obj);
  }
  return null;
}

function redrawPlaneCanvas(plane) {
  const cvs = planesEl.querySelector(`.sl-plane-canvas[data-id="${plane.id}"], .sl-plane-box[data-id="${plane.id}"] .sl-plane-canvas`);
  if (cvs) drawPlaneCanvas(cvs, plane);
}

function drawPlaneCanvas(canvas, plane) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth  || 148;
  const cssH = canvas.offsetHeight || 148;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cssW, H = cssH;
  const dark  = document.documentElement.getAttribute('data-theme') === 'dark';
  const color = typeColorHex(planeEffectiveType(plane));

  ctx.fillStyle = dark ? '#0d1117' : '#f9fafb';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(W/2,0); ctx.lineTo(W/2,H);
  ctx.moveTo(0,H/2); ctx.lineTo(W,H/2);
  ctx.stroke();

  // Draw pasted-image thumbnails behind their dots.
  for (const obj of plane.objects) {
    if (obj.model !== 'pastedimage') continue;
    if (obj.pasteCanvas) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(obj.pasteCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  const drawnHybrids = new Set();
  for (const obj of plane.objects) {
    // Hybrid pairs share a position: draw only once as a single purple dot.
    if (obj.hybridId) {
      if (drawnHybrids.has(obj.hybridId)) continue;
      drawnHybrids.add(obj.hybridId);
    }
    const px  = (obj.cx / state.fov + 0.5) * W;
    const py  = (-obj.cy / state.fov + 0.5) * H;
    // Selection: true if this obj or its hybrid partner is the selected object.
    const sel = plane.id === state.selectedPlaneId &&
      (obj.id === state.selectedObjId ||
       (obj.hybridId && plane.objects.some(o => o.hybridId === obj.hybridId && o.id === state.selectedObjId)));
    const isHidden = obj.hidden && (!obj.hybridId || plane.objects.every(o => o.hybridId !== obj.hybridId || o.id === obj.id || o.hidden));
    const dotType  = obj.hybridId ? 'hybrid' : obj.type;
    const rad = window.innerWidth <= 640 ? 10 : 6;
    const objCol = isHidden ? (dark ? '#555' : '#bbb') : typeColorHex(dotType);
    ctx.fillStyle = objCol;
    ctx.globalAlpha = isHidden ? 0.4 : (sel ? 1 : 0.7);
    drawShapeMarker(ctx, dotType, px, py, rad);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sel) {
      ctx.strokeStyle = isHidden ? (dark ? '#666' : '#aaa') : objCol;
      ctx.lineWidth = 1.5;
      drawShapeMarker(ctx, dotType, px, py, rad + 3.5);
      ctx.stroke();
    }
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const LENS_INFO = {
  sie: `<b>b</b>: deflection scale (arcsec), equal to 4πσ<sub>v</sub>²/c². Proportional to velocity dispersion squared; independent of distances. The Einstein ring appears at roughly b × (D<sub>LS</sub>/D<sub>S</sub>).<br>
        <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
        <b>φ</b>: position angle of the major axis (radians).`,
  nie: `Nonsingular Isothermal Ellipsoid: identical to SIE but with a finite core radius r<sub>c</sub> that removes the central singularity, producing a flat central surface density instead of a diverging cusp. Reduces exactly to SIE as r<sub>c</sub> → 0.<br><br>
        <b>b</b>: deflection scale (arcsec), same role as in SIE.<br>
        <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
        <b>φ</b>: position angle of the major axis (radians).<br>
        <b>r<sub>c</sub></b>: core radius (arcsec). Typical galaxy-scale values 0.05–0.5″. Larger values produce a more prominent flat core and reduce central magnification.`,
  pointmass: `<b>Strength</b>: mass scale in arcsec, equal to √(4GM / c² D<sub>L</sub>). For a fixed lens redshift D<sub>L</sub> is constant, so Strength is proportional to √M. The Einstein ring appears at Strength × √(D<sub>LS</sub> / D<sub>S</sub>).`,
  deflection: `Models the monopole contribution from a distant perturber outside the field of view: a uniform deflection of all rays by the same angle. This shifts caustics bodily without distorting them, unlike shear (which distorts) or convergence (which scales).<br><br>
              <b>α</b>: deflection amplitude (arcsec).<br>
              <b>φ</b>: deflection direction (radians).<br><br>
              The object position has no effect; the deflection is the same at every image-plane point.`,
  convergence: `Models a uniform mass sheet along the line of sight. The deflection is radial: α = κ·θ, always computed relative to the origin regardless of object position. Moving the marker only repositions the visual indicator.<br><br>
               <b>κ</b>: convergence (dimensionless). Positive values represent overdense structures; negative values underdense voids. Related to the mass sheet degeneracy; κ cannot be measured from image positions alone.`,
  shear: `Models an external tidal field (e.g. a nearby cluster or line-of-sight structure). The deflection is always computed relative to the coordinate origin, so the object's position has no effect on the lensing. Moving the marker only repositions the direction arrow.<br><br>
          <b>γ</b>: shear strength; typical galaxy-scale values are 0.01–0.2.<br>
          <b>φ</b>: position angle of the shear axis (radians).<br><br>
          <b>Note on the shear map:</b> the effective shear visible in the lensing-quantities view is γ × D<sub>ls</sub>/D<sub>s</sub>, where D<sub>ls</sub> is the angular diameter distance from this plane to the source redshift z<sub>s</sub> and D<sub>s</sub> is the observer-to-source distance. Setting γ = 0.5 will therefore show less than 0.5 in the map unless z<sub>l</sub> ≈ 0. The same weighting applies to convergence.`,
  epl: `<b>b</b>: deflection scale (arcsec), same role as in SIE.<br>
        <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
        <b>φ</b>: position angle of the major axis (radians).<br>
        <b>γ</b>: power-law slope. γ = 2 is isothermal (identical to SIE); γ &lt; 2 steepens the central density, γ &gt; 2 shallows it. Typical galaxies have γ ≈ 1.9–2.1.`,
};
const SOURCE_INFO = {
  gaussian: `<b>σ</b>: half-width at 1/e² of the Gaussian profile (arcsec).<br>
             <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
             <b>φ</b>: position angle of the major axis (radians).<br>
             <b>A</b>: peak surface brightness.`,
  exponential: `<b>σ</b>: exponential scale length (arcsec). Sérsic n = 1; more extended than Gaussian.<br>
                <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
                <b>φ</b>: position angle of the major axis (radians).<br>
                <b>A</b>: peak surface brightness.`,
  point: `<b>r</b>: radius of the uniform disc (arcsec). The edge is sharp.<br>
          <b>A</b>: surface brightness inside the disc.`,
  pointsource: `Idealised point source for quasar lensing. Image positions are found by solving the lens equation numerically; each is drawn as a circle of fixed angular size, unaffected by magnification or shear.<br><br>
                <b>Size</b>: angular radius of each image circle (arcsec).<br>
                <b>A</b>: brightness of the circles.`,
  pastedimage: `A user-supplied image mapped onto the source plane. Paste with Ctrl+V after selecting this object.<br><br>
                <b>Brightness</b>: overall amplitude multiplier.`,
};

function infoSection(id, html) {
  return `<details class="sl-info-details" id="${id}">
    <summary class="sl-info-btn">i</summary>
    <div class="sl-info-content">${html}</div>
  </details>`;
}

const SEL = s => `style="font-size:12px;padding:2px 6px;border:1px solid var(--hairline);border-radius:4px;background:var(--bg);color:var(--fg);cursor:pointer;${s||''}"`;

function renderSidebar() {
  const obj = selectedObj(), pl = selectedPlane();
  const ezs = effectiveCritZs();

  // ── Params panel (built first: used in settingsContent below) ──────────────
  let paramsPanel = '';
  if (obj && pl) {
    const partner = hybridPartner(pl, obj);
    const isHybrid = !!partner;

    // Reset expansion state when a different hybrid is selected.
    if (obj.hybridId !== _lastHybridId) {
      _hybridExpanded = { lens: false, src: false };
      _lastHybridId   = obj.hybridId ?? null;
    }

    if (isHybrid) {
      // ── Hybrid object: dual collapsible sections ──
      const lensObj = obj.type === 'lens' ? obj : partner;
      const srcObj  = obj.type === 'source' ? obj : partner;
      const bothHidden = lensObj.hidden && srcObj.hidden;
      const lensExp = _hybridExpanded.lens, srcExp = _hybridExpanded.src;

      const lensModelOpts = `
        <option value="sie"       ${lensObj.model==='sie'       ?'selected':''}>SIE (Isothermal, γ=2)</option>
        <option value="nie"       ${lensObj.model==='nie'       ?'selected':''}>NIE (Nonsingular isothermal)</option>
        <option value="epl"       ${lensObj.model==='epl'       ?'selected':''}>EPL (Power law)</option>
        <option value="pointmass" ${lensObj.model==='pointmass' ?'selected':''}>Point mass</option>
        <option value="shear"       ${lensObj.model==='shear'       ?'selected':''}>External shear</option>
        <option value="convergence" ${lensObj.model==='convergence' ?'selected':''}>External convergence</option>
        <option value="deflection"  ${lensObj.model==='deflection'  ?'selected':''}>Constant deflection</option>`;
      const srcModelOpts = `
        <option value="pointsource" ${srcObj.model==='pointsource' ?'selected':''}>Point source</option>
        <option value="gaussian"    ${srcObj.model==='gaussian'    ?'selected':''}>Gaussian</option>
        <option value="exponential" ${srcObj.model==='exponential' ?'selected':''}>Exponential</option>
        <option value="point"       ${srcObj.model==='point'       ?'selected':''}>Uniform circle</option>
        <option value="pastedimage" ${srcObj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;

      paramsPanel = `
        <div class="sl-panel">
          <div class="sl-params-meta-row">
            <span class="sl-params-z">z: ${pl.z.toFixed(2)}</span>
            <span class="sl-params-pos" id="sl-obj-pos">Pos: (${lensObj.cx.toFixed(2)}, ${lensObj.cy.toFixed(2)})</span>
            <button class="sl-obj-vis-btn${bothHidden ? ' sl-obj-hidden' : ''}" id="sl-toggle-vis" title="${bothHidden ? 'Show in image' : 'Hide from image'}">${eyeIcon(bothHidden)}</button>
            <button class="sl-delete-obj-btn" id="sl-delete-obj">Delete</button>
          </div>
          <div class="sl-hybrid-section">
            <div class="sl-hybrid-hdr" id="sl-hybrid-lens-hdr">
              <span class="sl-hybrid-arrow">${lensExp ? '▼' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Lens</span>
              ${infoSection('sl-param-info-lens', LENS_INFO[lensObj.model] ?? '')}
            </div>
            ${lensExp ? `<div class="sl-hybrid-body" data-hybrid-section="lens">
              <select class="sl-select" id="sl-model-select-lens">${lensModelOpts}</select>
              ${lensParamRows(lensObj)}
            </div>` : ''}
          </div>
          <div class="sl-hybrid-section">
            <div class="sl-hybrid-hdr" id="sl-hybrid-src-hdr">
              <span class="sl-hybrid-arrow">${srcExp ? '▼' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Source</span>
              ${infoSection('sl-param-info-src', SOURCE_INFO[srcObj.model] ?? '')}
            </div>
            ${srcExp ? `<div class="sl-hybrid-body" data-hybrid-section="src">
              <select class="sl-select" id="sl-model-select-src">${srcModelOpts}</select>
              ${sourceParamRows(srcObj)}
            </div>` : ''}
          </div>
        </div>`;
    } else {
      // ── Single-type object ──
      const isLens = obj.type === 'lens';
      const modelOptions = isLens
        ? `<option value="sie"       ${obj.model==='sie'       ?'selected':''}>SIE (Isothermal, γ=2)</option>
           <option value="nie"       ${obj.model==='nie'       ?'selected':''}>NIE (Nonsingular isothermal)</option>
           <option value="epl"       ${obj.model==='epl'       ?'selected':''}>EPL (Power law)</option>
           <option value="pointmass" ${obj.model==='pointmass' ?'selected':''}>Point mass</option>
           <option value="shear"       ${obj.model==='shear'       ?'selected':''}>External shear</option>
           <option value="convergence" ${obj.model==='convergence' ?'selected':''}>External convergence</option>
           <option value="deflection"  ${obj.model==='deflection'  ?'selected':''}>Constant deflection</option>`
        : `<option value="pointsource" ${obj.model==='pointsource' ?'selected':''}>Point source</option>
           <option value="gaussian"    ${obj.model==='gaussian'    ?'selected':''}>Gaussian</option>
           <option value="exponential" ${obj.model==='exponential' ?'selected':''}>Exponential</option>
           <option value="point"       ${obj.model==='point'       ?'selected':''}>Uniform circle</option>
           <option value="pastedimage" ${obj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;
      const infoHtml = isLens
        ? infoSection('sl-param-info', LENS_INFO[obj.model] ?? '')
        : infoSection('sl-param-info', SOURCE_INFO[obj.model] ?? '');
      paramsPanel = `
        <div class="sl-panel">
          <div class="sl-panel-title-row">
            <span class="sl-panel-title">Selected: ${isLens ? 'Lens' : 'Source'}</span>
            ${infoHtml}
          </div>
          <div class="sl-params-meta-row">
            <span class="sl-params-z">z: ${pl.z.toFixed(2)}</span>
            <span class="sl-params-pos" id="sl-obj-pos">Pos: (${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)})</span>
            <button class="sl-obj-vis-btn${obj.hidden ? ' sl-obj-hidden' : ''}" id="sl-toggle-vis" title="${obj.hidden ? 'Show in image' : 'Hide from image'}">${eyeIcon(obj.hidden)}</button>
            <button class="sl-delete-obj-btn" id="sl-delete-obj">Delete</button>
          </div>
          <select class="sl-select" id="sl-model-select">${modelOptions}</select>
          ${isLens ? lensParamRows(obj, true) : sourceParamRows(obj, true)}
        </div>`;
    }
  } else {
    paramsPanel = `<div class="sl-panel"><div class="sl-empty-msg">Click an object in a plane box to edit its parameters.</div></div>`;
  }

  // ── Settings tab ─────────────────────────────────────────────────────────────
  const _sg = _settingsExpanded;
  const settingsContent = `
    <div class="sl-panel">

      <div class="sl-hybrid-section">
        <button class="sl-hybrid-hdr" id="sl-settings-hdr-general">
          <span class="sl-hybrid-arrow">${_sg.general?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">General</span>
        </button>
        ${_sg.general ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <div class="sl-global-input">
            <label>FOV (″)</label>
            <input type="number" id="sl-fov" min="0.5" max="20" step="0.5" value="${state.fov}">
            <span class="sl-unit">"</span>
          </div>
          <div class="sl-global-input">
            <label>z<sub>s</sub></label>
            <input type="number" id="sl-crit-zs-gen" min="0.1" max="15" step="0.1" value="${ezs.toFixed(2)}">
          </div>
          <div class="sl-global-input">
            <label>z<sub>max</sub></label>
            <input type="number" id="sl-zmax" min="0.1" max="10" step="0.1" value="${state.zMax}">
          </div>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-markers" ${state.showMarkers?'checked':''}> Show positions</label>
            <label><input type="checkbox" id="sl-show-legend"  ${state.showLegend ?'checked':''}> Show legend</label>
            <label><input type="checkbox" id="sl-show-ruler"   ${state.showRuler ?'checked':''}> Show ruler</label>
          </div>
        </div>` : ''}
      </div>

      ${vizModeHasScale(state.vizMode) ? `
      <div class="sl-hybrid-section">
        <div class="sl-hybrid-hdr" id="sl-settings-hdr-cmap">
          <span class="sl-hybrid-arrow">${_sg.cmap?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">Color Map</span>
          ${_sg.cmap ? infoSection('sl-cmap-info', cmapInfoHtml(state.vizMode)) : ''}
        </div>
        ${_sg.cmap ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          ${state.vizMode !== 0 ? `<div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-colorbar" ${state.showColorbar?'checked':''}> Show colorbar</label>
          </div>` : ''}
          ${(() => {
            const vs = vizScaleFor(state.vizMode);
            const heading = { 0:'Brightness stretch', 1:'κ color scale', 2:'γ color scale',
                              3:'|μ| color scale', 5:'|α| color scale' }[state.vizMode];
            const minLbl = state.vizMode === 0 ? 'Black' : 'Min';
            const maxLbl = state.vizMode === 0 ? 'White' : 'Max';
            const paramRow = vs.scale === 2 ? `
          <div class="sl-global-input">
            <label>Power (γ)</label>
            <input type="range" id="sl-viz-param" min="0.1" max="2.0" step="0.05" value="${vs.param}">
            <span class="sl-tone-param-val">${vs.param.toFixed(2)}</span>
          </div>` : vs.scale === 3 ? `
          <div class="sl-global-input">
            <label>Softening (a)</label>
            <input type="range" id="sl-viz-param" min="0.5" max="20" step="0.5" value="${vs.param}">
            <span class="sl-tone-param-val">${vs.param.toFixed(1)}</span>
          </div>` : '';
            const paletteRow = state.vizMode === 0 ? '' : `
          <div class="sl-global-input">
            <label>Colormap</label>
            <select id="sl-viz-palette">
              ${VIZ_PALETTE_NAMES.map((n, i) => `<option value="${i}" ${(vs.palette??0)===i?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>`;
            return `
          <p style="font-size:11px;color:var(--muted);margin:0 0 6px">${heading}</p>${paletteRow}
          <div class="sl-global-input">
            <label>Scale</label>
            <select id="sl-viz-scale">
              <option value="0" ${vs.scale===0?'selected':''}>Linear</option>
              <option value="1" ${vs.scale===1?'selected':''}>Square root</option>
              <option value="4" ${vs.scale===4?'selected':''}>Log</option>
              <option value="2" ${vs.scale===2?'selected':''}>Power law</option>
              <option value="3" ${vs.scale===3?'selected':''}>Asinh</option>
            </select>
          </div>
          <div class="sl-global-input">
            <label>${minLbl}</label>
            <input type="number" class="sl-scrub" id="sl-viz-min" step="${_numStep(vs.min)}" value="${vs.min}">
          </div>
          <div class="sl-global-input">
            <label>${maxLbl}</label>
            <input type="number" class="sl-scrub" id="sl-viz-max" step="${_numStep(vs.max)}" value="${vs.max}">
          </div>${paramRow}
          <div style="margin-top:4px">
            <button id="sl-viz-reset" type="button" style="font-size:11px;background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;padding:0">Reset to defaults</button>
          </div>`;
          })()}
        </div>` : ''}
      </div>` : ''}

      ${state.vizMode === 6 ? `
      <div class="sl-hybrid-section">
        <div class="sl-hybrid-hdr" id="sl-settings-hdr-contours">
          <span class="sl-hybrid-arrow">${_sg.contours?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">Fermat Potential</span>
          ${_sg.contours ? infoSection('sl-contours-info', contourInfoHtml()) : ''}
        </div>
        ${_sg.contours ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-fermat-use-src" ${state.fermatUseSourcePos?'checked':''}> Use last selected source for the source position and redshift</label>
          </div>
          ${state.fermatUseSourcePos && state.lastFermatSource ? `
          <p style="font-size:11px;color:var(--muted);margin:3px 0 0">
            &beta; = (${state.lastFermatSource.cx.toFixed(3)}&Prime;, ${state.lastFermatSource.cy.toFixed(3)}&Prime;)
          </p>` : ''}
          <p style="font-size:11px;color:var(--muted);margin:10px 0 6px">Iso-arrival-time contour spacing</p>
          <div class="sl-global-input">
            <label>Spacing (&times;)</label>
            <input type="number" class="sl-scrub" id="sl-contour-spacing" min="0.05" step="${_numStep(state.contourSpacing)}" value="${state.contourSpacing}">
          </div>
          <div style="margin-top:4px">
            <button id="sl-contour-reset" type="button" style="font-size:11px;background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;padding:0">Reset to default</button>
          </div>
        </div>` : ''}
      </div>` : ''}

      <div class="sl-hybrid-section">
        <button class="sl-hybrid-hdr" id="sl-settings-hdr-crit">
          <span class="sl-hybrid-arrow">${_sg.crit?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">Critical Curves</span>
        </button>
        ${_sg.crit ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <p class="sl-perf-note" style="margin-bottom:6px">(Can be slow at high resolutions.)</p>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-crit" ${state.showCritCurves?'checked':''}> Critical curves</label>
            <label><input type="checkbox" id="sl-show-caus" ${state.showCaustics   ?'checked':''}> Caustics</label>
          </div>
          <div class="sl-global-input">
            <label>Resolution</label>
            <select id="sl-crit-res">
              <option value="256"  ${state.critGridN===256  ?'selected':''}>Low (256)</option>
              <option value="512"  ${state.critGridN===512  ?'selected':''}>Medium (512)</option>
              <option value="1024" ${state.critGridN===1024 ?'selected':''}>High (1024)</option>
              <option value="2048" ${state.critGridN===2048 ?'selected':''}>Very high (2048)</option>
            </select>
          </div>
        </div>` : ''}
      </div>

      <div class="sl-hybrid-section">
        <button class="sl-hybrid-hdr" id="sl-settings-hdr-ps">
          <span class="sl-hybrid-arrow">${_sg.ps?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">Point Source</span>
        </button>
        ${_sg.ps ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <div class="sl-global-input">
            <label>Grid spacing</label>
            <select id="sl-ps-grid">
              <option value="0.1"   ${state.psGridStep===0.1   ?'selected':''}>100 mas (fastest)</option>
              <option value="0.05"  ${state.psGridStep===0.05  ?'selected':''}>50 mas</option>
              <option value="0.02"  ${state.psGridStep===0.02  ?'selected':''}>20 mas</option>
              <option value="0.01"  ${state.psGridStep===0.01  ?'selected':''}>10 mas</option>
              <option value="0.005" ${state.psGridStep===0.005 ?'selected':''}>5 mas (slowest)</option>
            </select>
          </div>
        </div>` : ''}
      </div>

      <div class="sl-subsection-header" style="margin-top:8px">Configuration</div>
      <select class="sl-select" id="sl-preset-select" style="margin-top:8px" aria-label="Load a preset scene">
        <option value="" ${_selectedPreset ? '' : 'selected'}>Load a preset scene…</option>
        ${PRESETS.map(p => `<option value="${p.file}" ${_selectedPreset === p.file ? 'selected' : ''}>${p.name}</option>`).join('')}
      </select>
      <div class="sl-capture-row">
        <button class="sl-capture-btn" id="sl-save-config">↓ Save YAML</button>
        <button class="sl-capture-btn" id="sl-load-config">↑ Load YAML</button>
        <input type="file" id="sl-config-file" accept=".yaml,.yml" style="display:none">
      </div>
    </div>
    `;

  // Programmatic recording display values.
  const selObj = selectedObj(), selPl = selectedPlane();
  const zLine = (selObj && selPl)
    ? `${selPl.type === 'lens' ? 'Lens' : 'Source'} z:&nbsp;&nbsp;${selPl.z.toFixed(2)}`
    : null;
  const _staging  = selObj ? (recState.progStaging.get(selObj.id) || {}) : {};
  const initLabel = _staging.initialPos?.label
    ?? '<span style="color:var(--muted);font-style:italic">not set</span>';
  const finalLabel = _staging.finalPos?.label
    ?? '<span style="color:var(--muted);font-style:italic">not set</span>';

  const recordingPanel = `
    <div class="sl-panel">
      <p class="sl-perf-note" style="margin-bottom:10px">Critical curves are included in GIF recordings but hidden in WebM to keep frame timing accurate.</p>
      <div class="sl-panel-title-row">
        <span class="sl-panel-title">LIVE</span>
        ${infoSection('sl-rec-info', `
          <b>WebM</b>: fast, browser-native. Critical curves are hidden during programmatic recording to keep frame timing correct.<br><br>
          <b>GIF</b>: auto-looping, universally shareable. Slower to encode, 256 colors. GIF programmatic recording includes critical curves at full resolution.<br><br>
          <b>Programmatic:</b> select an object, set its initial and final positions, click Add to program. Repeat for each object. All listed objects animate simultaneously on Record.`)}
      </div>

      <div class="sl-rec-setting-row">
        <span class="sl-rec-setting-label">Format</span>
        <select id="sl-rec-format" class="sl-capture-fps">
          <option value="webm" ${!recState.useGif?'selected':''}>WebM</option>
          <option value="gif"  ${recState.useGif ?'selected':''}>GIF (slower)</option>
        </select>
      </div>
      <div class="sl-rec-setting-row">
        <span class="sl-rec-setting-label">Frame rate</span>
        <select id="sl-rec-fps" class="sl-capture-fps">
          <option value="5"  ${recState.fps===5  ?'selected':''}>5 fps</option>
          <option value="10" ${recState.fps===10 ?'selected':''}>10 fps</option>
          <option value="15" ${recState.fps===15 ?'selected':''}>15 fps</option>
          <option value="24" ${recState.fps===24 ?'selected':''}>24 fps</option>
          <option value="30" ${recState.fps===30 ?'selected':''}>30 fps</option>
        </select>
      </div>
      <div class="sl-capture-row" style="margin-top:8px">
        <button class="sl-capture-btn" id="sl-snapshot-btn"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px"><path d="M8 2v8M4 7l4 4 4-4"/><line x1="2" y1="14" x2="14" y2="14"/></svg>Save PNG</button>
        <button class="sl-capture-btn ${recState.active ? 'recording' : ''}" id="sl-rec-btn"
                title="Shortcut: R">${recState.active ? '■ Stop [R]' : '● Record [R]'}</button>
      </div>

      <div class="sl-hybrid-section" style="margin-top:8px">
        <button class="sl-hybrid-hdr" id="sl-prog-section-hdr">
          <span class="sl-hybrid-arrow">${_progExpanded?'▼':'▶'}</span>
          <span class="sl-panel-title" style="flex:1">Programmatic</span>
        </button>
        ${_progExpanded ? `<div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          ${zLine ? `<div class="sl-rec-prog-z" style="margin-bottom:4px">${zLine}</div>` : ''}
          <div class="sl-rec-prog-field">
            <span class="sl-rec-prog-key">Initial</span>
            <span class="sl-rec-prog-val" id="sl-prog-init-val">${initLabel}</span>
            <button class="sl-rec-mini-btn" id="sl-prog-set-init" title="Store current position as start">Set</button>
          </div>
          <div class="sl-rec-prog-field" style="margin-top:5px">
            <span class="sl-rec-prog-key">Final</span>
            <span class="sl-rec-prog-val">${finalLabel}</span>
            <button class="sl-rec-mini-btn" id="sl-prog-set-final" title="Store current position as end">Set</button>
          </div>
          <div class="sl-capture-row" style="margin-top:7px">
            <button class="sl-capture-btn" id="sl-prog-add"
                    ${!_staging.initialPos || !_staging.finalPos ? 'disabled' : ''}
                    title="Commit this object's path to the program list">Add to program ↓</button>
          </div>
          <div class="sl-prog-list" id="sl-prog-list">
            ${recState.progObjects.length === 0
              ? `<div class="sl-prog-empty">No objects added yet</div>`
              : recState.progObjects.map(e =>
                  `<div class="sl-prog-entry" data-id="${e.objId}">
                    <span class="sl-prog-entry-label">${e.label}</span>
                    <span class="sl-prog-entry-path">${e.initialPos ? `(${e.initialPos.cx.toFixed(2)},${e.initialPos.cy.toFixed(2)})` : 'current'} → (${e.finalPos.cx.toFixed(2)},${e.finalPos.cy.toFixed(2)})</span>
                    <button class="sl-rec-mini-btn sl-rec-mini-clear sl-prog-remove" data-id="${e.objId}">✕</button>
                  </div>`
                ).join('')
            }
          </div>
          <div class="sl-rec-prog-field" style="margin-top:8px">
            <span class="sl-rec-prog-key">Duration</span>
            <input type="number" id="sl-prog-duration" min="0.5" max="60" step="0.5" value="${recState.progDuration}"
                   class="sl-prog-dur-input">
            <span class="sl-muted-note">s</span>
          </div>
          <div class="sl-capture-row" style="margin-top:8px">
            <button class="sl-capture-btn" id="sl-prog-record"
                    ${recState.progObjects.length === 0 ? 'disabled' : ''}>● Record program</button>
            ${recState.progObjects.length > 0
              ? `<button class="sl-rec-mini-btn sl-rec-mini-clear" id="sl-prog-clear-all" title="Clear program list">Clear all</button>`
              : ''}
          </div>
        </div>` : ''}
      </div>
    </div>`;


  document.getElementById('sl-obj-panel').innerHTML     = paramsPanel;
  document.getElementById('sl-tab-settings').innerHTML  = settingsContent;
  document.getElementById('sl-tab-recording').innerHTML = recordingPanel;

  const _fovEl = document.getElementById('sl-fov');
  _fovEl?.addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { state.fov = v; redraw(); } });
  _attachScrub(_fovEl, { lo: 0.5, hi: 20, onChange: v => { state.fov = v; redraw(); } });
  const _zmaxEl = document.getElementById('sl-zmax');
  _zmaxEl?.addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { state.zMax = v; drawAxisCanvas(); } });
  _attachScrub(_zmaxEl, { lo: 0.1, hi: 10, onChange: v => { state.zMax = v; drawAxisCanvas(); } });
  document.getElementById('sl-prog-section-hdr')?.addEventListener('click',      () => { _progExpanded             = !_progExpanded;             renderSidebar(); });
  document.getElementById('sl-settings-hdr-general')?.addEventListener('click', () => { _settingsExpanded.general = !_settingsExpanded.general; renderSidebar(); });
  document.getElementById('sl-settings-hdr-cmap')?.addEventListener('click',    () => { _settingsExpanded.cmap    = !_settingsExpanded.cmap;    renderSidebar(); });
  document.getElementById('sl-settings-hdr-contours')?.addEventListener('click',() => { _settingsExpanded.contours= !_settingsExpanded.contours;renderSidebar(); });
  document.getElementById('sl-settings-hdr-crit')?.addEventListener('click',    () => { _settingsExpanded.crit    = !_settingsExpanded.crit;    renderSidebar(); });
  document.getElementById('sl-settings-hdr-ps')?.addEventListener('click',      () => { _settingsExpanded.ps      = !_settingsExpanded.ps;      renderSidebar(); });
  document.getElementById('sl-show-markers')?.addEventListener('change',e => { state.showMarkers = e.target.checked; redraw(); });
  document.getElementById('sl-show-legend')?.addEventListener('change', e => { state.showLegend  = e.target.checked; redraw(); });
  document.getElementById('sl-show-ruler')?.addEventListener('change', e => {
    state.showRuler = e.target.checked;
    if (!state.showRuler) state.rulerActive = false;  // hidden tool can't stay armed
    updateRulerUI();
    const wrap = document.getElementById('sl-image-wrap');
    if (wrap && !state.rulerActive) wrap.style.cursor = '';
    drawOverlay();
  });
  document.getElementById('sl-show-colorbar')?.addEventListener('change', e => { state.showColorbar = e.target.checked; _updateColorbar(); });
  document.getElementById('sl-viz-scale')?.addEventListener('change', e => {
    const vs = vizScaleFor(state.vizMode);
    vs.scale = parseInt(e.target.value, 10);
    // Give power/asinh a useful starting param when first selected.
    if (vs.scale === 2 && (vs.param < 0.1 || vs.param > 2.0)) vs.param = 0.5;
    if (vs.scale === 3 && vs.param < 0.5)                     vs.param = 5.0;
    renderSidebar(); _updateColorbar(); redraw();
  });
  document.getElementById('sl-viz-param')?.addEventListener('input', e => {
    const vs = vizScaleFor(state.vizMode);
    vs.param = parseFloat(e.target.value);
    const v = e.target.parentElement.querySelector('.sl-tone-param-val');
    if (v) v.textContent = vs.scale === 3 ? vs.param.toFixed(1) : vs.param.toFixed(2);
    redraw();
  });
  document.getElementById('sl-viz-palette')?.addEventListener('change', e => {
    vizScaleFor(state.vizMode).palette = parseInt(e.target.value, 10);
    _updateColorbar(); redraw();
  });
  // Min/Max limit inputs: type a value, use the (magnitude-aware) spinner, or drag
  // left/right across the field to scrub it smoothly.
  const _attachVizLimit = (id, key) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const apply = (v) => {
      if (!isFinite(v)) return;
      v = Math.max(0, v);
      inp.value = v;
      vizScaleFor(state.vizMode)[key] = v;
      _updateColorbar(); redraw();
    };
    inp.addEventListener('change', e => apply(parseFloat(e.target.value)));
    _attachScrub(inp, { lo: 0, onChange: apply });
  };
  _attachVizLimit('sl-viz-min', 'min');
  _attachVizLimit('sl-viz-max', 'max');
  // Keep the ⓘ popover from toggling the section it lives in.
  document.getElementById('sl-cmap-info')?.addEventListener('click', e => e.stopPropagation());
  document.getElementById('sl-viz-reset')?.addEventListener('click', () => {
    const d = DEFAULT_VIZ_SCALE[state.vizMode];
    if (d) state.vizScale[state.vizMode] = { ...d };
    renderSidebar(); _updateColorbar(); redraw();
  });
  // Contours section (Fermat mode): spacing scrub input, reset, info popover.
  document.getElementById('sl-contours-info')?.addEventListener('click', e => e.stopPropagation());
  const _csEl = document.getElementById('sl-contour-spacing');
  if (_csEl) {
    const applyCS = (v) => {
      if (!isFinite(v)) return;
      v = Math.max(0.05, v);
      _csEl.value = v;
      state.contourSpacing = v;
      redraw();
    };
    _csEl.addEventListener('change', e => applyCS(parseFloat(e.target.value)));
    _attachScrub(_csEl, { lo: 0.05, hi: 50, onChange: applyCS });
  }
  document.getElementById('sl-contour-reset')?.addEventListener('click', () => {
    state.contourSpacing = 1.0; renderSidebar(); redraw();
  });
  document.getElementById('sl-fermat-use-src')?.addEventListener('change', e => {
    state.fermatUseSourcePos = e.target.checked;
    renderSidebar(); redraw();
  });
  document.getElementById('sl-snapshot-btn')?.addEventListener('click', captureSnapshot);
  document.getElementById('sl-rec-btn')?.addEventListener('click', () => { recState.active ? stopRecording() : startRecording(); });
  document.getElementById('sl-rec-fps')?.addEventListener('change', e => { recState.fps = parseInt(e.target.value, 10); });
  document.getElementById('sl-rec-format')?.addEventListener('change', e => { recState.useGif = e.target.value === 'gif'; });
  document.getElementById('sl-prog-set-init')?.addEventListener('click', setProgInitialPosition);
  document.getElementById('sl-prog-set-final')?.addEventListener('click', setProgFinalPosition);
  document.getElementById('sl-prog-add')?.addEventListener('click', addToProgram);
  document.getElementById('sl-prog-clear-all')?.addEventListener('click', () => { recState.progObjects = []; renderSidebar(); });
  document.getElementById('sl-prog-duration')?.addEventListener('change', e => { recState.progDuration = parseFloat(e.target.value) || 3; });
  document.getElementById('sl-prog-record')?.addEventListener('click', startProgrammaticRecording);
  document.getElementById('sl-prog-list')?.querySelectorAll('.sl-prog-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromProgram(btn.dataset.id));
  });
  document.getElementById('sl-crit-res')?.addEventListener('change', e => { state.critGridN = parseInt(e.target.value, 10); redraw(); });
  document.getElementById('sl-ps-grid')?.addEventListener('change',  e => { state.psGridStep = parseFloat(e.target.value); redraw(); });
  document.getElementById('sl-crit-zs')?.addEventListener('change',     e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; redraw(); } });
  const _zsEl = document.getElementById('sl-crit-zs-gen');
  _zsEl?.addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; redraw(); } });
  _attachScrub(_zsEl, { lo: 0.1, hi: 15, onChange: v => { state.critZs = v; redraw(); } });
  document.getElementById('sl-show-crit')?.addEventListener('change', e => { state.showCritCurves = e.target.checked; redraw(); });
  document.getElementById('sl-show-caus')?.addEventListener('change', e => { state.showCaustics   = e.target.checked; redraw(); });
  document.getElementById('sl-save-config')?.addEventListener('click', saveConfig);
  document.getElementById('sl-load-config')?.addEventListener('click', () => {
    document.getElementById('sl-config-file')?.click();
  });
  document.getElementById('sl-config-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { _selectedPreset = ''; loadConfigFromYaml(ev.target.result); }; // custom file: clear preset label
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be loaded again
  });
  document.getElementById('sl-preset-select')?.addEventListener('change', e => {
    const file = e.target.value;
    if (file) loadPreset(file);
    else renderSidebar(); // placeholder re-chosen: restore the current label
  });

  if (obj && pl) {
    const partner = hybridPartner(pl, obj);
    const isHybrid = !!partner;
    const lensObj = isHybrid ? (obj.type === 'lens' ? obj : partner) : null;
    const srcObj  = isHybrid ? (obj.type === 'source' ? obj : partner) : null;

    document.getElementById('sl-toggle-vis')?.addEventListener('click', () => {
      if (isHybrid) {
        const newHidden = !(lensObj.hidden && srcObj.hidden);
        lensObj.hidden = newHidden; srcObj.hidden = newHidden;
      } else {
        obj.hidden = !obj.hidden;
      }
      renderSidebar(); redraw();
    });
    document.getElementById('sl-delete-obj')?.addEventListener('click', deleteSelectedObject);

    if (isHybrid) {
      // Hybrid: collapsible section toggles
      document.getElementById('sl-hybrid-lens-hdr')?.addEventListener('click', () => {
        _hybridExpanded.lens = !_hybridExpanded.lens; renderSidebar();
      });
      document.getElementById('sl-hybrid-src-hdr')?.addEventListener('click', () => {
        _hybridExpanded.src = !_hybridExpanded.src; renderSidebar();
      });
      // Keep the ⓘ popovers from toggling the section header they live in.
      document.getElementById('sl-param-info-lens')?.addEventListener('click', e => e.stopPropagation());
      document.getElementById('sl-param-info-src')?.addEventListener('click', e => e.stopPropagation());
      // Lens section model + params
      document.getElementById('sl-model-select-lens')?.addEventListener('change', e => {
        lensObj.model = e.target.value; lensObj.params = defaultParams(lensObj.model);
        rebuildPlaneBoxes(); renderSidebar(); redraw();
      });
      document.getElementById('sl-model-select-src')?.addEventListener('change', e => {
        srcObj.model = e.target.value; srcObj.params = defaultParams(srcObj.model);
        rebuildPlaneBoxes(); renderSidebar(); redraw();
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="lens"] input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          const _v = readSliderValue(inp);
          lensObj.params[inp.dataset.param] = _v;
          if (valEl) valEl.textContent = fmtP(_v);
          redraw();
        });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="src"] input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          const _v = readSliderValue(inp);
          srcObj.params[inp.dataset.param] = _v;
          if (valEl) valEl.textContent = fmtP(_v);
          redraw();
        });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="src"] input[type="color"][data-param-color]').forEach(inp => {
        inp.addEventListener('input', () => {
          const light = document.documentElement.getAttribute('data-theme') !== 'dark';
          srcObj.params.color = light ? invertHexColor(inp.value) : inp.value;
          redraw();
        });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="lens"] input[type="checkbox"]').forEach(inp => {
        inp.addEventListener('change', () => { lensObj.showShape = inp.checked; redraw(); });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="src"] input[type="checkbox"]').forEach(inp => {
        inp.addEventListener('change', () => { srcObj.showShape = inp.checked; redraw(); });
      });
    } else {
      document.getElementById('sl-show-shape')?.addEventListener('change', e => { obj.showShape = e.target.checked; redraw(); });
      document.getElementById('sl-attach-partner')?.addEventListener('click', () => attachPartner(obj, pl));
      document.getElementById('sl-model-select')?.addEventListener('change', e => {
        obj.model = e.target.value; obj.params = defaultParams(obj.model);
        rebuildPlaneBoxes(); renderSidebar(); redraw();
      });
      document.getElementById('sl-obj-panel').querySelectorAll('input[type="color"][data-param-color]').forEach(inp => {
        inp.addEventListener('input', () => {
          const light = document.documentElement.getAttribute('data-theme') !== 'dark';
          obj.params.color = light ? invertHexColor(inp.value) : inp.value;
          redraw();
        });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          const _v = readSliderValue(inp);
          obj.params[inp.dataset.param] = _v;
          if (valEl) valEl.textContent = fmtP(_v);
          redraw();
        });
      });
    }
  }
}

function fmtP(v) {
  const a = Math.abs(v);
  if (a === 0)    return '0';
  if (a < 0.005)  return v.toFixed(4);
  if (a < 0.05)   return v.toFixed(3);
  return v.toFixed(2);
}

// Read slider value, handling both linear and logarithmic sliders.
function readSliderValue(inp) {
  if (inp.dataset.logRange) {
    const [minV, maxV] = inp.dataset.logRange.split(',').map(Number);
    return minV * Math.pow(maxV / minV, parseFloat(inp.value) / 1000);
  }
  return parseFloat(inp.value);
}

function sliderRow(label, key, min, max, step, val) {
  return `<div class="sl-param-row">
    <span class="sl-param-label">${label}</span>
    <input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="sl-param-val">${fmtP(val)}</span>
  </div>`;
}

// Logarithmic slider: slider position 0–1000 maps to [minV, maxV] on a log scale.
function sliderRowLog(label, key, minV, maxV, val) {
  const clamped = Math.max(minV, Math.min(maxV, val));
  const pos = Math.round(Math.log(clamped / minV) / Math.log(maxV / minV) * 1000);
  return `<div class="sl-param-row">
    <span class="sl-param-label">${label}</span>
    <input type="range" data-param="${key}" data-log-range="${minV},${maxV}" min="0" max="1000" step="1" value="${pos}">
    <span class="sl-param-val">${fmtP(clamped)}</span>
  </div>`;
}

// "Show shape" only applies to objects with a drawable outline (all lenses and
// the analytic source profiles, but not point sources or pasted images).
function supportsShowShape(obj) {
  if (obj.type === 'lens') return true;
  return obj.model !== 'pointsource' && obj.model !== 'pastedimage';
}

// Footer row at the bottom of the Object Controls: the Show-shape toggle on the
// left and, for single (non-hybrid) objects, an Attach button on the right that
// converts the object into a hybrid by adding a co-located partner of the other type.
function objFooter(obj, showAttach) {
  const hasShape = supportsShowShape(obj);
  if (!hasShape && !showAttach) return '';
  const toggle = hasShape
    ? `<label class="sl-shape-toggle"><input type="checkbox" id="sl-show-shape" ${obj.showShape ? 'checked' : ''}> Show shape</label>`
    : '';
  const attach = showAttach
    ? `<button class="sl-attach-btn" id="sl-attach-partner" title="${obj.type === 'lens'
        ? 'Add a co-located source, turning this into a hybrid object'
        : 'Add a co-located lens, turning this into a hybrid object'}">${obj.type === 'lens' ? 'Attach source' : 'Attach lens'}</button>`
    : '';
  return `<div class="sl-obj-footer">${toggle}${attach}</div>`;
}

// Convert a single object into a hybrid by giving it a co-located partner of the
// opposite type, sharing a hybridId (mirrors the H add-tool).
function attachPartner(obj, plane) {
  if (!obj || !plane || obj.hybridId) return;
  const hybridId = uid();
  obj.hybridId = hybridId;
  const partnerType  = obj.type === 'lens' ? 'source' : 'lens';
  const partnerModel = partnerType === 'lens' ? 'sie' : 'gaussian';
  const partner = Object.assign(makeObject(partnerType, partnerModel, obj.cx, obj.cy), { hybridId });
  plane.objects.push(partner);
  state.selectedObjId = obj.id;
  // Open the newly-added partner's section so its controls are immediately visible.
  _lastHybridId   = hybridId;
  _hybridExpanded = { lens: partnerType === 'lens', src: partnerType === 'source' };
  updatePlaneBoxColor(plane); redrawPlaneCanvas(plane); renderSidebar(); redraw();
}

function lensParamRows(obj, showAttach) {
  const p = obj.params;
  if (obj.model === 'deflection')
    return sliderRowLog('α (")', 'alpha', 0.005, 5.0, p.alpha ?? 0.1)
         + sliderRow('φ (rad)', 'phi', 0, Math.PI * 2, 0.05, p.phi ?? 0)
         + objFooter(obj, showAttach)
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Uniform deflection of all rays. Models the monopole from a distant perturber. Object position has no effect.</p>';
  if (obj.model === 'convergence')
    return sliderRow('κ', 'kappa', -0.5, 0.5, 0.01, p.kappa ?? 0.05)
         + objFooter(obj, showAttach)
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Deflection is κ·θ relative to the coordinate origin. Object position has no effect on lensing.</p>';
  if (obj.model === 'shear')
    return sliderRowLog('γ', 'gamma', 0.001, 0.5, p.gamma ?? 0.05)
         + sliderRow   ('φ (rad)', 'phi', 0, Math.PI, 0.05, p.phi ?? 0)
         + objFooter(obj, showAttach)
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Deflection is always computed relative to the coordinate origin regardless of object position. Moving the marker only repositions the direction arrow.</p>';
  if (obj.model === 'pointmass')
    return sliderRowLog('Strength (")', 'thetaE', 0.01, 8.0, p.thetaE ?? 1)
         + objFooter(obj, showAttach);
  if (obj.model === 'sie')
    return sliderRowLog('b (")',   'b',   0.01, 8.0,   p.b   ?? 1)
         + sliderRow   ('q',       'q',   0.05, 1.0,   0.05, p.q   ?? 0.75)
         + sliderRow   ('φ (rad)', 'phi', 0,   Math.PI, 0.05, p.phi ?? 0)
         + objFooter(obj, showAttach);
  if (obj.model === 'nie')
    return sliderRowLog('b (")',    'b',   0.01, 8.0,   p.b   ?? 1)
         + sliderRow   ('q',        'q',   0.05, 1.0,   0.05, p.q   ?? 0.75)
         + sliderRow   ('φ (rad)',  'phi', 0,   Math.PI, 0.05, p.phi ?? 0)
         + sliderRowLog('r<sub>c</sub> (")', 'rc', 0.005, 2.0, p.rc ?? 0.2)
         + objFooter(obj, showAttach);
  if (obj.model === 'epl')
    return sliderRowLog('b (")',   'b',     0.01, 8.0,   p.b     ?? 1)
         + sliderRow   ('q',       'q',     0.05, 1.0,   0.05, p.q     ?? 0.75)
         + sliderRow   ('φ (rad)', 'phi',   0,   Math.PI, 0.05, p.phi   ?? 0)
         + sliderRow   ('γ',       'gamma', 0.5, 3.0,     0.05, p.gamma ?? 2.0)
         + objFooter(obj, showAttach)
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Fermat potential (T) uses the geometric term only for EPL: the potential has no closed form for the scaled-SIE approximation.</p>';
  if (obj.model === 'nfw')
    return sliderRowLog('κ<sub>s</sub>',     'kappaS', 0.01, 5.0, p.kappaS ?? 0.5)
         + sliderRowLog('r<sub>s</sub> (")', 'rS',     0.01, 5.0, p.rS     ?? 0.4)
         + objFooter(obj, showAttach);
  return '';
}

function sourceParamRows(obj, showAttach) {
  const p = obj.params;
  if (obj.model === 'pointsource') {
    const isLight = document.documentElement.getAttribute('data-theme') !== 'dark';
    const displayColor = isLight ? invertHexColor(p.color ?? '#ffffff') : (p.color ?? '#ffffff');
    return sliderRowLog('Size (″)', 'sigma', 0.002, 2.0, p.sigma ?? 0.05)
         + sliderRow('A', 'amplitude', 0.1, 3.0, 0.1, p.amplitude ?? 1.0)
         + `<div class="sl-param-row">
              <span class="sl-param-label">Color</span>
              <input type="color" data-param-color="1" value="${displayColor}" class="sl-color-input">
            </div>`
         + objFooter(obj, showAttach)
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Image positions are computed with a numerical refinement algorithm. Einstein rings do not appear for point sources: use a uniform circle source instead. Some highly demagnified images may not appear.</p>';
  }
  if (obj.model === 'point') {
    const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
    const storedColor = p.color ?? '#ffffff';
    const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
    return sliderRowLog('r (")', 'sigma', 0.002, 4.0, p.sigma ?? 0.08)
         + `<div class="sl-param-row">
              <span class="sl-param-label">Color</span>
              <input type="color" data-param-color="1" value="${displayColor}" class="sl-color-input">
            </div>`
         + objFooter(obj, showAttach);
  }

  if (obj.model === 'pastedimage') {
    const hint = obj.pasteCanvas ? '' :
      '<p style="font-size:11px;color:var(--muted);font-style:italic;margin-top:6px;grid-column:1/-1">Use the image button in the plane header to load an image, or Ctrl+V with this object selected</p>';
    return sliderRowLog('Scale', 'sigma', 0.05, 4.0, p.sigma ?? 1.0)
         + sliderRow('Brightness', 'amplitude', 0.1, 5.0, 0.1, p.amplitude ?? 1.0)
         + objFooter(obj, showAttach)
         + hint;
  }
  // In light mode the canvas is CSS-inverted, so show the complement in the
  // picker (what actually appears on screen) and invert back on store.
  const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
  const storedColor = p.color ?? '#ffffff';
  const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
  return sliderRowLog('σ (")',  'sigma',     0.002, 4.0,      p.sigma     ?? 0.06)
       + sliderRow   ('q',      'q',         0.05,  1.0, 0.05, p.q         ?? 1.0)
       + sliderRow   ('φ (rad)','phi',        0, Math.PI, 0.05, p.phi       ?? 0)
       + sliderRow   ('A',      'amplitude',  0.1,  5.0, 0.1,  p.amplitude ?? 1.0)
       + `<div class="sl-param-row">
            <span class="sl-param-label">Color</span>
            <input type="color" data-param-color="1" value="${displayColor}"
                   class="sl-color-input" title="Source light color">
          </div>`
       + objFooter(obj, showAttach);
}

// ── Axis canvas ───────────────────────────────────────────────────────────────
function drawAxisCanvas() {
  if (!axisCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r   = axisCanvas.getBoundingClientRect();
  // If the canvas is hidden (inside display:none timeline), don't resize or draw —
  // doing so would destroy the canvas dimensions and corrupt later renders.
  if (!r.width || !r.height) return;
  const W   = Math.round(r.width * dpr);
  const H   = Math.round(r.height * dpr);
  if (axisCanvas.width !== W || axisCanvas.height !== H) { axisCanvas.width = W; axisCanvas.height = H; }

  const ctx  = axisCanvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.clearRect(0, 0, W, H);
  ctx.save(); ctx.scale(dpr, dpr);

  const Wl = W/dpr, Hl = H/dpr;
  const PAD = 12, axisY = Hl * 0.55;
  const _mobAxis = window.innerWidth <= 640;
  const _textAlpha = _mobAxis ? 0.45 : 1.0;

  ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PAD, axisY); ctx.lineTo(Wl-PAD, axisY); ctx.stroke();

  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.globalAlpha = _textAlpha;
  for (const z of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].filter(z => z <= state.zMax)) {
    const x = axisZToX(z, Wl);
    ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, axisY-4); ctx.lineTo(x, axisY+4); ctx.stroke();
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.fillText(String(z), x, axisY + 15);
  }
  ctx.globalAlpha = 1;

  // Assign vertical levels so close markers bump up instead of overlapping.
  const BUMP_STEP = 28;   // px per level (taller bump for clear separation)
  const MIN_SEP   = 26;   // min px between markers on the same level
  // Assign levels to all non-dragged planes first, then pin the dragged plane
  // above everything so it never flips under a neighbour mid-drag.
  const sorted = [...state.planes]
    .filter(p => p.id !== _draggingPlaneId)
    .sort((a, b) => a.z - b.z);
  const planeLevel = new Map();
  const levelMaxX  = [];
  for (const plane of sorted) {
    const x = axisZToX(plane.z, Wl);
    let lv = 0;
    while (true) {
      if (levelMaxX[lv] === undefined || x - levelMaxX[lv] >= MIN_SEP) {
        levelMaxX[lv] = x; planeLevel.set(plane.id, lv); break;
      }
      lv++;
    }
  }
  if (_draggingPlaneId) {
    const topLevel = levelMaxX.length; // one above the current highest
    planeLevel.set(_draggingPlaneId, topLevel);
  }
  _planeLevels = planeLevel;  // share with hit-testing

  for (const plane of state.planes) {
    const x    = axisZToX(plane.z, Wl);
    const col  = typeColorHex(planeEffectiveType(plane));
    const sel  = plane.id === state.selectedPlaneId;
    const lv   = planeLevel.get(plane.id) || 0;
    const dy   = lv * BUMP_STEP;   // extra upward shift

    // Connecting line from axis up to diamond base when bumped
    ctx.strokeStyle = col;
    ctx.lineWidth   = sel ? 2 : 1.5;
    if (lv > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY - 6 - dy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Short axis tick
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY + 4); ctx.stroke();

    // Diamond
    ctx.fillStyle = col;
    const dTop = axisY - 18 - dy, dMid = axisY - 12 - dy, dBot = axisY - 6 - dy;
    ctx.beginPath();
    ctx.moveTo(x, dTop); ctx.lineTo(x+5, dMid); ctx.lineTo(x, dBot); ctx.lineTo(x-5, dMid);
    ctx.closePath(); ctx.fill();

    // z label above diamond
    ctx.font = '9.5px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(plane.z.toFixed(2), x, dTop - 3);

    // L/S tag below axis
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    const _eff = planeEffectiveType(plane);
    const _lbl = _eff === 'lens' ? 'L' : _eff === 'source' ? 'S' : _eff === 'hybrid' ? 'H' : '';
    if (_lbl) ctx.fillText(_lbl, x, axisY + 26);
  }

  ctx.font        = '10.5px system-ui, sans-serif';
  ctx.fillStyle   = dark ? '#8b949e' : '#6b7280';
  ctx.globalAlpha = _textAlpha;
  if (_mobAxis) {
    // On mobile the HTML label is hidden; draw both texts on one line in the canvas.
    const _ty = 13;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('redshift z →', PAD, _ty);
    ctx.textAlign    = 'right';
    ctx.fillText('(Click/tap to add a plane)', Wl - PAD, _ty);
  } else {
    // Desktop: centred hint at the bottom.
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Click to add a lens or source plane', Wl / 2, Hl - 4);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ── Critical curve helpers ─────────────────────────────────────────────────────

function effectiveCritZs() {
  if (state.critZs !== null) return state.critZs;
  const sources = state.planes.filter(p => { const t = planeEffectiveType(p); return t === 'source' || t === 'hybrid'; });
  return sources.length > 0 ? Math.max(...sources.map(p => p.z)) : 2.0;
}

// Compute critical curves for an arbitrary z_s (inserts a virtual source plane
// if no existing source plane sits at that redshift).
function computeCritCurvesForZs(planes, dist, zs, fovArcsec, gridN) {
  const sorted = [...planes].sort((a, b) => a.z - b.z);
  // Look for a source plane already at zs.
  let idx = sorted.findIndex(p => { const t = planeEffectiveType(p); return (t === 'source' || t === 'hybrid') && Math.abs(p.z - zs) < 0.005; });
  if (idx >= 0) return computeCriticalCurves(sorted, dist, idx, fovArcsec, gridN);
  // Insert a virtual (empty) source plane at zs and recompute distances.
  const vp       = { id: -1, z: zs, objects: [] };
  const augmented = [...sorted, vp].sort((a, b) => a.z - b.z);
  const augDist   = precomputeDistances(augmented);
  const augIdx    = augmented.indexOf(vp);
  return computeCriticalCurves(augmented, augDist, augIdx, fovArcsec, gridN);
}

// ── Overlay: critical curves, caustics, position markers, legend ──────────────

// CPU-side analytic lensing potential — mirrors GLSL lensPotential().
// posX, posY are absolute image-plane coordinates (arcsec).
function _lensPotentialJS(obj, posX, posY) {
  const EPS = 1e-12, SOFT = 0.001;
  const { model, params } = obj;
  const ux = posX - obj.cx, uy = posY - obj.cy;
  if (model === 'pointmass') {
    return (params.thetaE ?? 1) ** 2 * Math.log(Math.max(Math.sqrt(ux*ux + uy*uy), SOFT));
  }
  if (model === 'sie' || model === 'nie') {
    const b = params.b ?? 1, q = Math.max(params.q ?? 0.8, 0.001);
    const p = params.phi ?? 0, cp = Math.cos(p), sp = Math.sin(p);
    const xr =  cp*ux + sp*uy, yr = -sp*ux + cp*uy;
    const sqf = Math.sqrt(Math.max(1 - q*q, EPS));
    const s = model === 'nie' ? Math.max(params.rc ?? 0.2, SOFT) : SOFT;
    const r = Math.sqrt(q*q*(xr*xr + s*s) + yr*yr);
    const A = b * q / sqf;
    const n = 1 + sqf*yr / (r + q*q*s), d = Math.max(1 - sqf*yr / (r + q*q*s), EPS);
    // Euler (homogeneous) part + core correction; the latter makes ∇ψ = α for a
    // finite core radius s (vanishes as s→0). Mirrors renderer.js lensPotential().
    return A * (xr * Math.atan2(sqf*xr, r + s) + yr * 0.5 * Math.log(n / d))
         - 0.5 * b * q * s * Math.log((r + s) * (r + s) + sqf * sqf * xr * xr);
  }
  if (model === 'epl') return 0;
  if (model === 'shear') {
    const c2 = Math.cos(2*(params.phi ?? 0)), s2 = Math.sin(2*(params.phi ?? 0));
    return 0.5 * (params.gamma ?? 0.05) * ((posX*posX - posY*posY)*c2 + 2*posX*posY*s2);
  }
  if (model === 'convergence') return 0.5 * (params.kappa ?? 0.05) * (posX*posX + posY*posY);
  if (model === 'deflection') {
    return (params.alpha ?? 0.1) * (posX*Math.cos(params.phi ?? 0) + posY*Math.sin(params.phi ?? 0));
  }
  return 0;
}

// CPU-side effective lensing potential accumulated along the ray to srcIdx.
// Mirrors GLSL traceToPlaneWithPsi. Uses traceRay for intermediate positions.
function _computePsiEff(tx, ty, planes, dist, srcIdx) {
  const { D_obs, D_btwn, N } = dist;
  const Ds = D_obs[srcIdx];
  if (Ds < 1e-9) return 0;
  let psiEff = 0;
  for (let j = 0; j < srcIdx; j++) {
    if (!planes[j].objects.some(o => !o.hidden && o.type === 'lens')) continue;
    const Djs = D_btwn[j * N + srcIdx];
    if (Djs < 1e-9) continue;
    const wPsi = Djs / Ds;
    const [px, py] = traceRay(tx, ty, planes, dist, j);
    for (const obj of planes[j].objects) {
      if (obj.hidden || obj.type !== 'lens') continue;
      psiEff += wPsi * _lensPotentialJS(obj, px, py);
    }
  }
  return psiEff;
}

// Physically correct multiplane Fermat (arrival-time) surface φ(θ; β_s) at (tx, ty).
// Mirrors the GLSL fermatPotential() exactly — see that function for the full rationale.
// Comoving transverse coordinates η_j = χ_j·x_j; reduced node sequence over ONLY the
// lens planes (empty planes skipped → invariant to inserting/moving empty planes);
// source node pinned at β_s; normalised by K = χ_L·χ_s/(χ_s−χ_L).
function _computeFullFermat(tx, ty, planes, dist, srcIdx, betaX, betaY) {
  const { D_obs } = dist;
  const chi   = j => (1 + planes[j].z) * D_obs[j];
  const chi_s = chi(srcIdx);
  if (chi_s < 1e-9) return 0;

  const isLens = j => planes[j].objects.some(o => !o.hidden && o.type === 'lens');

  // Reduced comoving arrival-time surface: observer(χ=0,η=0) → lens planes → source(β_s).
  let prevChi = 0, prevEx = 0, prevEy = 0;
  let chi_L = -1, geoDelay = 0, psiEff = 0;
  for (let j = 0; j < srcIdx; j++) {
    if (!isLens(j)) continue;                       // skip empty planes
    const chi_j = chi(j);
    if (chi_j - prevChi < 1e-9) continue;
    if (chi_L < 0) chi_L = chi_j;
    const [px, py] = traceRay(tx, ty, planes, dist, j); // x_j (x_0 = θ since no prior deflection)
    const ex = chi_j * px, ey = chi_j * py;
    const dx = ex - prevEx, dy = ey - prevEy;
    geoDelay += 0.5 * (dx * dx + dy * dy) / (chi_j - prevChi);
    prevChi = chi_j; prevEx = ex; prevEy = ey;
    for (const obj of planes[j].objects) {
      if (obj.hidden || obj.type !== 'lens') continue;
      psiEff += chi_j * _lensPotentialJS(obj, px, py);
    }
  }
  // Final drift to the source plane, pinned at β_s.
  const esx = chi_s * betaX, esy = chi_s * betaY;
  const dsx = esx - prevEx, dsy = esy - prevEy;
  if (chi_s - prevChi > 1e-9) geoDelay += 0.5 * (dsx * dsx + dsy * dsy) / (chi_s - prevChi);

  let phi = geoDelay - psiEff;
  if (chi_L > 0 && chi_s - chi_L > 1e-9) phi /= (chi_L * chi_s / (chi_s - chi_L));
  else                                   phi /= chi_s;
  return phi;
}

// Find stationary points of the Fermat potential φ(θ; β_s) = ½|θ−β_s|² − ψ_eff(θ).
// These are the images of a source at β_s: ∇φ = β(θ) − β_s = 0.
// betaS defaults to [0,0] (source at origin).
// Returns array of { tx, ty, type, phiVal } where type 1=min, 2=saddle, 3=max.
function findStationaryPoints(planes, dist, srcIdx, fov, betaS = [0, 0], gridN = 56) {
  const step = fov / (gridN - 1);
  const half = fov / 2;
  const h = fov * 0.004;
  const [bsx, bsy] = betaS;

  const bxG = new Float32Array(gridN * gridN);
  const byG = new Float32Array(gridN * gridN);
  for (let iy = 0; iy < gridN; iy++) {
    for (let ix = 0; ix < gridN; ix++) {
      const [sx, sy] = traceRay(-half + ix*step, -half + iy*step, planes, dist, srcIdx);
      bxG[iy*gridN+ix] = sx;
      byG[iy*gridN+ix] = sy;
    }
  }

  // Collect cell centres where both (β_x − β_sx) and (β_y − β_sy) span zero
  const seeds = [];
  for (let iy = 0; iy < gridN-1; iy++) {
    for (let ix = 0; ix < gridN-1; ix++) {
      const b00x = bxG[iy*gridN+ix], b10x = bxG[iy*gridN+ix+1];
      const b01x = bxG[(iy+1)*gridN+ix], b11x = bxG[(iy+1)*gridN+ix+1];
      const b00y = byG[iy*gridN+ix], b10y = byG[iy*gridN+ix+1];
      const b01y = byG[(iy+1)*gridN+ix], b11y = byG[(iy+1)*gridN+ix+1];
      const xSpan = Math.min(b00x,b10x,b01x,b11x) < bsx && Math.max(b00x,b10x,b01x,b11x) > bsx;
      const ySpan = Math.min(b00y,b10y,b01y,b11y) < bsy && Math.max(b00y,b10y,b01y,b11y) > bsy;
      if (xSpan && ySpan) seeds.push([-half+(ix+0.5)*step, -half+(iy+0.5)*step]);
    }
  }

  const results = [];
  const maxStep = fov * 0.15;
  for (const [sx0, sy0] of seeds) {
    let tx = sx0, ty = sy0;
    let converged = false;
    for (let iter = 0; iter < 30; iter++) {
      const [bx, by] = traceRay(tx, ty, planes, dist, srcIdx);
      const fx = bx - bsx, fy = by - bsy;
      if (fx*fx + fy*fy < 1e-14) { converged = true; break; }
      const [bxhp, byhp] = traceRay(tx+h, ty,   planes, dist, srcIdx);
      const [bxhm, byhm] = traceRay(tx-h, ty,   planes, dist, srcIdx);
      const [bxvp, byvp] = traceRay(tx,   ty+h, planes, dist, srcIdx);
      const [bxvm, byvm] = traceRay(tx,   ty-h, planes, dist, srcIdx);
      const A11 = (bxhp - bxhm) / (2*h);
      const A12 = (bxvp - bxvm) / (2*h);
      const A21 = (byhp - byhm) / (2*h);
      const A22 = (byvp - byvm) / (2*h);
      const det = A11*A22 - A12*A21;
      if (Math.abs(det) < 1e-9) break;
      let dtx = (A22*fx - A12*fy) / det;
      let dty = (-A21*fx + A11*fy) / det;
      // Clamp step to prevent overshooting near critical curves (det → 0).
      const stepLen = Math.sqrt(dtx*dtx + dty*dty);
      if (stepLen > maxStep) { const s = maxStep / stepLen; dtx *= s; dty *= s; }
      tx -= dtx; ty -= dty;
      if (Math.abs(tx) > half*1.5 || Math.abs(ty) > half*1.5) break;
    }
    if (!converged) {
      const [bxf, byf] = traceRay(tx, ty, planes, dist, srcIdx);
      const fxf = bxf - bsx, fyf = byf - bsy;
      if (fxf*fxf + fyf*fyf < (h * 0.01)**2) converged = true;
    }
    if (!converged) continue;
    if (Math.abs(tx) > half || Math.abs(ty) > half) continue;
    if (results.some(r => (r.tx-tx)**2 + (r.ty-ty)**2 < (h*0.8)**2)) continue;

    // Classify by Jacobian at converged point
    const [bxhp, byhp] = traceRay(tx+h, ty, planes, dist, srcIdx);
    const [bxhm, byhm] = traceRay(tx-h, ty, planes, dist, srcIdx);
    const [bxvp, byvp] = traceRay(tx, ty+h, planes, dist, srcIdx);
    const [bxvm, byvm] = traceRay(tx, ty-h, planes, dist, srcIdx);
    const A11 = (bxhp - bxhm) / (2*h);
    const A12 = (bxvp - bxvm) / (2*h);
    const A21 = (byhp - byhm) / (2*h);
    const A22 = (byvp - byvm) / (2*h);
    const detJ  = A11*A22 - A12*A21;
    const kappa = 1 - 0.5*(A11 + A22);
    const type   = detJ < 0 ? 2 : (kappa > 1 ? 3 : 1);
    const dx = tx - bsx, dy = ty - bsy;
    const phiVal = _computeFullFermat(tx, ty, planes, dist, srcIdx, bsx, bsy);
    results.push({ tx, ty, type, phiVal });
  }
  return results;
}

function drawOverlay() {
  const overlay = document.getElementById('sl-overlay');
  const r   = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W   = Math.max(1, Math.round(r.width  * dpr));
  const H   = Math.max(1, Math.round(r.height * dpr));
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  overlayCtx.clearRect(0, 0, W, H);

  const hasLens     = state.planes.some(p => p.objects.some(o => o.type === 'lens'));
  const needCurve   = (state.showCritCurves || state.showCaustics) && state.dist && hasLens;
  const needEllipse      = state.planes.some(pl => pl.objects.some(o => o.showShape));
  const needPointSources = state.planes.some(pl => pl.objects.some(o => o.type === 'source' && o.model === 'pointsource' && !o.hidden));
  const needFermatPts = state.fermatPoints && state.fermatPoints.length > 0;
  const needRuler = state.showRuler && ((state.rulers && state.rulers.length) || state.rulerDraft);
  if (!needCurve && !state.showMarkers && !needEllipse && !needPointSources && !needFermatPts && !needRuler) return;

  const Wl = W/dpr, Hl = H/dpr;
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  function toPixel(ax, ay) {
    return [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  }

  // ── Point source image circles ─────────────────────────────────────────────────────
  for (const plane of state.planes) {
    for (const obj of plane.objects) {
      if (obj.type !== 'source' || obj.model !== 'pointsource' || obj.hidden) continue;
      const imagePositions = findPointSourceImages(obj, plane);
      const r_px = Math.max((obj.params.sigma ?? 0.05) / state.fov * Wl, 1.5);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const storedColor = obj.params.color ?? '#ffffff';
      const col = dark ? storedColor : invertHexColor(storedColor);
      overlayCtx.fillStyle = col;
      overlayCtx.globalAlpha = obj.params.amplitude ?? 1.0;
      for (const [tx, ty] of imagePositions) {
        const [px, py] = toPixel(tx, ty);
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, r_px, 0, Math.PI * 2);
        overlayCtx.fill();
      }
      overlayCtx.globalAlpha = 1;
    }
  }

  // ── 0. Shape ellipses / shear arrow (drawn first, behind markers) ────────────
  if (needEllipse) {
    overlayCtx.lineWidth   = 1.5;
    overlayCtx.globalAlpha = 0.6;
    overlayCtx.setLineDash([5, 4]);
    for (const plane of state.planes) {
      for (const obj of plane.objects) {
        if (!obj.showShape || obj.hidden) continue;
        const col = typeColorHex(obj.type);
        const p = obj.params;

        // Constant deflection: single-headed arrow showing direction and amplitude.
        if (obj.model === 'deflection') {
          const alpha = p.alpha ?? 0.1, phi = p.phi ?? 0;
          const [ox, oy] = toPixel(obj.cx, obj.cy);
          const len = Math.min(Wl, Hl) * Math.min(alpha / state.fov, 0.45);
          const cdx = Math.cos(phi) * len, cdy = -Math.sin(phi) * len;
          const hl = 10, ha = Math.PI / 6;
          const [ex, ey] = [ox + cdx, oy + cdy];
          const ang = Math.atan2(cdy, cdx);
          overlayCtx.strokeStyle = col;
          overlayCtx.setLineDash([]);
          overlayCtx.beginPath();
          overlayCtx.moveTo(ox, oy);
          overlayCtx.lineTo(ex, ey);
          overlayCtx.stroke();
          overlayCtx.beginPath();
          overlayCtx.moveTo(ex, ey);
          overlayCtx.lineTo(ex - hl * Math.cos(ang - ha), ey - hl * Math.sin(ang - ha));
          overlayCtx.moveTo(ex, ey);
          overlayCtx.lineTo(ex - hl * Math.cos(ang + ha), ey - hl * Math.sin(ang + ha));
          overlayCtx.stroke();
          overlayCtx.setLineDash([5, 4]);
          continue;
        }

        // External convergence: 4 radial arrows showing isotropic deflection.
        if (obj.model === 'convergence') {
          const kappa = p.kappa ?? 0.05;
          const [ox, oy] = toPixel(obj.cx, obj.cy);
          const len = Math.min(Wl, Hl) * Math.min(Math.abs(kappa), 0.5) * 1.2;
          const hl = 8, ha = Math.PI / 6;
          const sign = kappa >= 0 ? 1 : -1; // outward for κ>0, inward for κ<0
          overlayCtx.strokeStyle = col;
          overlayCtx.setLineDash([]);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
            const cdx = Math.cos(a) * len, cdy = -Math.sin(a) * len;
            const [ex, ey] = [ox + sign * cdx, oy + sign * cdy];
            overlayCtx.beginPath();
            overlayCtx.moveTo(ox, oy);
            overlayCtx.lineTo(ex, ey);
            overlayCtx.stroke();
            const ang = Math.atan2(sign * cdy, sign * cdx);
            overlayCtx.beginPath();
            overlayCtx.moveTo(ex, ey);
            overlayCtx.lineTo(ex - hl * Math.cos(ang - ha), ey - hl * Math.sin(ang - ha));
            overlayCtx.moveTo(ex, ey);
            overlayCtx.lineTo(ex - hl * Math.cos(ang + ha), ey - hl * Math.sin(ang + ha));
            overlayCtx.stroke();
          }
          overlayCtx.setLineDash([5, 4]);
          continue;
        }

        // External shear: double-headed arrow at the origin showing φ direction.
        if (obj.model === 'shear') {
          const phi = p.phi ?? 0;
          const [ox, oy] = toPixel(obj.cx, obj.cy);
          const len = Math.min(Wl, Hl) * Math.min(p.gamma ?? 0.05, 0.5) * 1.2;
          const cdx = Math.cos(phi) * len, cdy = -Math.sin(phi) * len; // canvas y flipped
          const hl = 10, ha = Math.PI / 6;
          overlayCtx.strokeStyle = col;
          overlayCtx.setLineDash([]);
          // Shaft
          overlayCtx.beginPath();
          overlayCtx.moveTo(ox - cdx, oy - cdy);
          overlayCtx.lineTo(ox + cdx, oy + cdy);
          overlayCtx.stroke();
          // Arrowheads at both ends
          for (const [ex, ey, a] of [
            [ox + cdx, oy + cdy, Math.atan2(cdy, cdx)],
            [ox - cdx, oy - cdy, Math.atan2(-cdy, -cdx)],
          ]) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(ex, ey);
            overlayCtx.lineTo(ex - hl * Math.cos(a - ha), ey - hl * Math.sin(a - ha));
            overlayCtx.moveTo(ex, ey);
            overlayCtx.lineTo(ex - hl * Math.cos(a + ha), ey - hl * Math.sin(a + ha));
            overlayCtx.stroke();
          }
          overlayCtx.setLineDash([5, 4]);
          continue;
        }

        const [px, py] = toPixel(obj.cx, obj.cy);
        let a_arc = 0, q = 1, phi = 0;
        if (obj.type === 'lens') {
          if      (obj.model === 'sie')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'nie')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'epl')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'pointmass') { a_arc = p.thetaE ?? 1; }
        } else if (obj.model === 'point') {
          a_arc = p.sigma ?? 0.08; q = 1; phi = 0;  // hard edge: draw at exact radius
        } else if (obj.model !== 'pastedimage' && obj.model !== 'pointsource') {
          a_arc = 2 * (p.sigma ?? 0.1); q = p.q ?? 1; phi = p.phi ?? 0;
        }
        if (a_arc <= 0) continue;
        const a_px = Math.max(a_arc / state.fov * Wl, 10);
        const b_px = Math.max(a_px * Math.max(q, 0.01), 3);
        overlayCtx.strokeStyle = col;
        overlayCtx.beginPath();
        overlayCtx.ellipse(px, py, a_px, b_px, -phi, 0, Math.PI * 2);
        overlayCtx.stroke();
      }
    }
    overlayCtx.setLineDash([]);
    overlayCtx.globalAlpha = 1;
  }

  // ── 1. Position markers: same style as the plane-view canvases ─────────────
  if (state.showMarkers) {
    const RAD = window.innerWidth <= 640 ? 10 : 6;
    const drawnHybrids = new Set();
    for (const plane of state.planes) {
      for (const obj of plane.objects) {
        if (obj.hybridId) {
          if (drawnHybrids.has(obj.hybridId)) continue;
          drawnHybrids.add(obj.hybridId);
        }
        const markerType = obj.hybridId ? 'hybrid' : obj.type;
        const col = typeColorHex(markerType);
        const [px, py] = toPixel(obj.cx, obj.cy);
        const sel = plane.id === state.selectedPlaneId &&
          (obj.id === state.selectedObjId ||
           (obj.hybridId && plane.objects.some(o => o.hybridId === obj.hybridId && o.id === state.selectedObjId)));
        overlayCtx.fillStyle   = col;
        overlayCtx.globalAlpha = sel ? 1 : 0.7;
        drawShapeMarker(overlayCtx, markerType, px, py, RAD);
        overlayCtx.fill();
        overlayCtx.globalAlpha = 1;
        if (sel) {
          overlayCtx.strokeStyle = col;
          overlayCtx.lineWidth   = 1.5;
          drawShapeMarker(overlayCtx, markerType, px, py, RAD + 3.5);
          overlayCtx.stroke();
        }
      }
    }
  }

  // ── 2. Critical curves / caustics ────────────────────────────────────────────
  let critSegs = [], causSegs = [];
  if (needCurve) {
    // Sample 30% wider than the display FOV so rings near the edge are found in
    // full rather than cut off at the grid boundary.  The display filter below
    // still clips what is actually drawn to the visible image area.
    const samplingFov = state.fov * 1.3;
    const res = computeCritCurvesForZs(
      state.planes, state.dist, effectiveCritZs(), samplingFov, state.critGridN
    );
    critSegs = res.critSegments;
    causSegs = res.causticSegments;

    overlayCtx.lineWidth = 1.3;
    function drawSegs(segs, color) {
      overlayCtx.strokeStyle = color;
      for (const [[x0,y0],[x1,y1]] of segs) {
        overlayCtx.beginPath();
        const [px0,py0] = toPixel(x0, y0), [px1,py1] = toPixel(x1, y1);
        overlayCtx.moveTo(px0, py0); overlayCtx.lineTo(px1, py1);
        overlayCtx.stroke();
      }
    }

    const _h = state.fov / 2;
    const MIN_CRIT_SEGS = 50;

    // Realness check uses the TOTAL segment count (before the display clip) so a
    // genuine ring near the edge: which has many segments in the wider sample but
    // few within the visible area: is not incorrectly suppressed.
    const isRealCurve = critSegs.length >= MIN_CRIT_SEGS;

    // Clip to the visible image area for display.
    const critFiltered = critSegs.filter(([[x0,y0],[x1,y1]]) =>
      (Math.abs(x0) <= _h && Math.abs(y0) <= _h) ||
      (Math.abs(x1) <= _h && Math.abs(y1) <= _h));
    const causFiltered = causSegs.filter(([[x0,y0],[x1,y1]]) =>
      Math.abs(x0) < _h*2.5 && Math.abs(y0) < _h*2.5 &&
      Math.abs(x1) < _h*2.5 && Math.abs(y1) < _h*2.5);

    if (isRealCurve) {
      if (state.showCritCurves) drawSegs(critFiltered, CRIT_COLOR);
      if (state.showCaustics)   drawSegs(causFiltered, CAUS_COLOR);
    }
  }

  // ── 3. Legend (top-left) ─────────────────────────────────────────────────────
  const legendItems = [];
  if (state.showCritCurves && hasLens) legendItems.push({ color: CRIT_COLOR, label: 'Critical curves', isLine: true });
  if (state.showCaustics   && hasLens) legendItems.push({ color: CAUS_COLOR, label: 'Caustics',        isLine: true });
  if (state.showMarkers) {
    const hasLensObj   = state.planes.some(p => p.objects.some(o => o.type === 'lens'   && !o.hybridId));
    const hasSrcObj    = state.planes.some(p => p.objects.some(o => o.type === 'source' && !o.hybridId));
    const hasHybridObj = state.planes.some(p => p.objects.some(o => o.hybridId));
    if (hasLensObj)   legendItems.push({ color: typeColorHex('lens'),   label: 'Lens',   isDot: true, markerType: 'lens'   });
    if (hasSrcObj)    legendItems.push({ color: typeColorHex('source'), label: 'Source', isDot: true, markerType: 'source' });
    if (hasHybridObj) legendItems.push({ color: typeColorHex('hybrid'), label: 'Hybrid', isDot: true, markerType: 'hybrid' });
  }

  if (state.showLegend && legendItems.length > 0) {
    const _mob  = window.innerWidth <= 640;
    const lx = 8, ly = 8;
    const lineH = _mob ? 20 : 28, padV = _mob ? 7 : 11, padH = _mob ? 10 : 14;
    const boxW  = _mob ? 150 : 220, boxH = legendItems.length * lineH + 2 * padV;
    const _dark = document.documentElement.getAttribute('data-theme') === 'dark';

    overlayCtx.font         = `${_mob ? 12 : 18}px system-ui, -apple-system, sans-serif`;
    overlayCtx.textBaseline = 'middle';
    overlayCtx.textAlign    = 'left';

    legendItems.forEach((item, i) => {
      const iy = ly + padV + i * lineH + lineH / 2;
      const ix = lx + padH;
      const iconW = _mob ? 16 : 25, dotR = _mob ? 5 : 7, textOff = _mob ? 22 : 33;
      if (item.isLine) {
        overlayCtx.strokeStyle = item.color; overlayCtx.lineWidth = _mob ? 2.5 : 3.5;
        overlayCtx.beginPath(); overlayCtx.moveTo(ix, iy); overlayCtx.lineTo(ix + iconW, iy); overlayCtx.stroke();
      } else if (item.isDot) {
        overlayCtx.fillStyle = item.color;
        drawShapeMarker(overlayCtx, item.markerType, ix + iconW / 2, iy, dotR);
        overlayCtx.fill();
      }
      overlayCtx.fillStyle = _dark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.75)';
      overlayCtx.fillText(item.label, ix + textOff, iy);
    });
  }

  // ── 4. Fermat potential stationary point markers + legend ─────────────────────
  // Type 1 = minimum (circle), Type 2 = saddle (diamond), Type 3 = maximum (triangle)
  if (state.vizMode === 6) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const typeColor = t => t === 2 ? '#FF6B35' : (t === 3 ? '#CC44FF' : (dark ? '#FFE600' : '#1144DD'));
    const typeLabel = t => t === 2 ? 'II' : (t === 3 ? 'III' : 'I');

    // ── secondary legend (bottom-right) ──────────────────────────────────────
    const legendTypes = [
      { type: 1, word: 'Type I'   },
      { type: 2, word: 'Type II'  },
      { type: 3, word: 'Type III' },
    ].filter(e => state.fermatPoints?.some(p => p.type === e.type));

    if (legendTypes.length > 0) {
      const _mob   = window.innerWidth <= 640;
      const fsize  = _mob ? 12 : 14;
      const lineH  = _mob ? 22 : 28;
      const padV   = _mob ?  6 : 8;
      const padH   = _mob ?  8 : 10;
      const r_leg  = _mob ?  7 : 9;
      const gap    = _mob ?  8 : 10; // gap between text and marker

      overlayCtx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
      const textW  = Math.max(...legendTypes.map(e => overlayCtx.measureText(e.word).width));
      const rowW   = textW + gap + r_leg * 2 + 2;
      const boxW   = padH * 2 + rowW;
      const boxH   = legendTypes.length * lineH + padV * 2;
      const bx     = Wl - boxW - 8;
      const by     = Hl - boxH - 8;

      overlayCtx.textBaseline = 'middle';
      overlayCtx.textAlign    = 'left';
      for (let i = 0; i < legendTypes.length; i++) {
        const { type, word } = legendTypes[i];
        const iy  = by + padV + i * lineH + lineH / 2;
        const col = typeColor(type);

        overlayCtx.fillStyle = dark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.75)';
        overlayCtx.fillText(word, bx + padH, iy);

        const mx = bx + padH + textW + gap + r_leg + 1;
        overlayCtx.strokeStyle = col;
        overlayCtx.fillStyle   = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
        overlayCtx.lineWidth   = 2.0;
        overlayCtx.setLineDash([]);
        if (type === 1) {
          overlayCtx.beginPath(); overlayCtx.arc(mx, iy, r_leg, 0, Math.PI*2);
          overlayCtx.fill(); overlayCtx.stroke();
        } else if (type === 2) {
          overlayCtx.beginPath();
          overlayCtx.moveTo(mx, iy - r_leg*1.3); overlayCtx.lineTo(mx + r_leg, iy);
          overlayCtx.lineTo(mx, iy + r_leg*1.3); overlayCtx.lineTo(mx - r_leg, iy);
          overlayCtx.closePath(); overlayCtx.fill(); overlayCtx.stroke();
        } else {
          overlayCtx.beginPath();
          overlayCtx.moveTo(mx,            iy - r_leg*1.3);
          overlayCtx.lineTo(mx + r_leg*1.1, iy + r_leg*0.8);
          overlayCtx.lineTo(mx - r_leg*1.1, iy + r_leg*0.8);
          overlayCtx.closePath(); overlayCtx.fill(); overlayCtx.stroke();
        }
        overlayCtx.fillStyle = col;
        overlayCtx.font = `bold ${Math.round(r_leg * 0.9)}px system-ui, sans-serif`;
        overlayCtx.textAlign = 'center';
        overlayCtx.fillText(typeLabel(type), mx, iy + 0.5);
        overlayCtx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
        overlayCtx.textAlign = 'left';
      }
    }
  }

  if (needFermatPts) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const r_m = Math.max(Wl, Hl) * 0.022; // marker radius ~2.2% of canvas
    const typeColor = t => t === 2 ? '#FF6B35' : (t === 3 ? '#CC44FF' : (dark ? '#FFE600' : '#1144DD'));
    const typeLabel = t => t === 2 ? 'II' : (t === 3 ? 'III' : 'I');

    for (const { tx, ty, type } of state.fermatPoints) {
      const [px, py] = toPixel(tx, ty);
      const col = typeColor(type);
      overlayCtx.strokeStyle = col;
      overlayCtx.fillStyle   = dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
      overlayCtx.lineWidth   = 2.2;
      overlayCtx.setLineDash([]);

      if (type === 1) {        // minimum: circle
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, r_m, 0, Math.PI * 2);
        overlayCtx.fill();
        overlayCtx.stroke();
      } else if (type === 2) { // saddle: diamond
        overlayCtx.beginPath();
        overlayCtx.moveTo(px,        py - r_m * 1.3);
        overlayCtx.lineTo(px + r_m,  py);
        overlayCtx.lineTo(px,        py + r_m * 1.3);
        overlayCtx.lineTo(px - r_m,  py);
        overlayCtx.closePath();
        overlayCtx.fill();
        overlayCtx.stroke();
      } else {                 // maximum: triangle
        overlayCtx.beginPath();
        overlayCtx.moveTo(px,               py - r_m * 1.3);
        overlayCtx.lineTo(px + r_m * 1.1,  py + r_m * 0.8);
        overlayCtx.lineTo(px - r_m * 1.1,  py + r_m * 0.8);
        overlayCtx.closePath();
        overlayCtx.fill();
        overlayCtx.stroke();
      }

      // Type label (I / II / III) centred inside the marker
      overlayCtx.fillStyle   = col;
      overlayCtx.font        = `bold ${Math.round(r_m * 0.95)}px system-ui, sans-serif`;
      overlayCtx.textAlign   = 'center';
      overlayCtx.textBaseline = 'middle';
      overlayCtx.fillText(typeLabel(type), px, py + 0.5);
    }
  }

  // ── 5. Ruler measurements (committed + live draft) ───────────────────────────
  if (needRuler) {
    const dark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const mainCol = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)';
    const haloCol = dark ? 'rgba(0,0,0,0.55)'       : 'rgba(255,255,255,0.7)';
    const pillBg  = dark ? 'rgba(0,0,0,0.7)'        : 'rgba(255,255,255,0.82)';
    const _mob    = window.innerWidth <= 640;
    const fsize   = _mob ? 12 : 14;
    const segs    = [...state.rulers, state.rulerDraft].filter(Boolean);

    overlayCtx.setLineDash([]);
    overlayCtx.lineCap = 'round';
    for (const seg of segs) {
      const [x0, y0] = toPixel(seg.x0, seg.y0);
      const [x1, y1] = toPixel(seg.x1, seg.y1);

      // Line: wide translucent halo underneath, then the crisp main stroke.
      overlayCtx.strokeStyle = haloCol; overlayCtx.lineWidth = 4;
      overlayCtx.beginPath(); overlayCtx.moveTo(x0, y0); overlayCtx.lineTo(x1, y1); overlayCtx.stroke();
      overlayCtx.strokeStyle = mainCol; overlayCtx.lineWidth = 1.6;
      overlayCtx.beginPath(); overlayCtx.moveTo(x0, y0); overlayCtx.lineTo(x1, y1); overlayCtx.stroke();

      // Endpoint dots.
      overlayCtx.fillStyle = mainCol;
      for (const [ex, ey] of [[x0, y0], [x1, y1]]) {
        overlayCtx.beginPath(); overlayCtx.arc(ex, ey, 3, 0, Math.PI * 2); overlayCtx.fill();
      }

      // Distance (arcsec) + position angle (CCW from +x, y-up), normalised to 0–360°.
      const dx = seg.x1 - seg.x0, dy = seg.y1 - seg.y0;
      const dist = Math.hypot(dx, dy);
      const ang  = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      const label = `${dist.toFixed(2)}″ · ${Math.round(ang)}°`;

      // Label pill near the midpoint, nudged perpendicular to the line, clamped on-screen.
      overlayCtx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      const tw = overlayCtx.measureText(label).width;
      const padX = 6, padY = 4, boxW = tw + padX * 2, boxH = fsize + padY * 2;
      const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
      const segLen = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / segLen, ny = (x1 - x0) / segLen; // unit normal
      const off = boxH / 2 + 6;
      let cx = midX + nx * off, cy = midY + ny * off;
      cx = Math.min(Wl - boxW / 2 - 2, Math.max(boxW / 2 + 2, cx));
      cy = Math.min(Hl - boxH / 2 - 2, Math.max(boxH / 2 + 2, cy));

      overlayCtx.fillStyle = pillBg;
      const bx = cx - boxW / 2, by = cy - boxH / 2, rr = 4;
      overlayCtx.beginPath();
      overlayCtx.moveTo(bx + rr, by);
      overlayCtx.arcTo(bx + boxW, by,        bx + boxW, by + boxH, rr);
      overlayCtx.arcTo(bx + boxW, by + boxH,  bx,        by + boxH, rr);
      overlayCtx.arcTo(bx,        by + boxH,  bx,        by,        rr);
      overlayCtx.arcTo(bx,        by,         bx + boxW, by,        rr);
      overlayCtx.closePath();
      overlayCtx.fill();
      overlayCtx.fillStyle = mainCol;
      overlayCtx.fillText(label, cx, cy + 0.5);
    }
  }

  overlayCtx.restore();
}

// ── Main redraw ───────────────────────────────────────────────────────────────
let _raf = null;
// ── Colorbar ──────────────────────────────────────────────────────────────────
const _VIZ_SEQ_LIGHT = 'linear-gradient(to right,#fff,#FF8C00,#722388,#000)';
const _VIZ_SEQ_DARK  = 'linear-gradient(to right,#00000A,#5C005C,#E67200,#FFE600)';
// [title, value-suffix] — limits and scale come from state.vizScale.
const _VIZ_COLORBAR = {
  1: ['κ',   ''],
  2: ['γ',   ''],
  3: ['|μ|', ''],
  5: ['|α|', '″'],
};

// Format a colorbar limit compactly — at most 2 digits after the decimal point.
function _fmtLimit(v, suffix) {
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  const s = (a !== 0 && (a < 0.01 || a >= 1e5)) ? v.toExponential(2)
          : Number(v.toFixed(2)).toString();
  return s + suffix;
}

function _updateColorbar() {
  const bar   = document.getElementById('sl-colorbar');
  const strip = document.getElementById('sl-colorbar-bar');
  const minEl = document.getElementById('sl-colorbar-min');
  const maxEl = document.getElementById('sl-colorbar-max');
  const ttl   = document.getElementById('sl-colorbar-title');
  if (!bar) return;
  const info = _VIZ_COLORBAR[state.vizMode];
  if (!info || !state.showColorbar) { bar.style.display = 'none'; return; }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const vs   = vizScaleFor(state.vizMode);
  const pal  = vs.palette ?? 0;
  bar.style.display      = '';
  ttl.textContent        = info[0];
  minEl.textContent      = _fmtLimit(vs.min, info[1]);
  maxEl.textContent      = _fmtLimit(vs.max, info[1]);
  strip.style.background = VIZ_PALETTE_CSS[pal] || (dark ? _VIZ_SEQ_DARK : _VIZ_SEQ_LIGHT);
  // Standard palettes invert in light mode (see applyColormap); the Default palette
  // already has theme-specific gradients, so it needs no filter.
  strip.style.filter = (pal > 0 && !dark) ? 'invert(1)' : 'none';
}

// Colour stops for the active palette, matching what the shader / on-screen bar show
// (standard palettes invert in light mode, just like applyColormap and the CSS strip).
function _paletteStops(palette, dark) {
  const css = (palette > 0 && VIZ_PALETTE_CSS[palette]) || (dark ? _VIZ_SEQ_DARK : _VIZ_SEQ_LIGHT);
  let stops = css.match(/#[0-9a-fA-F]{3,6}/g) || ['#000000', '#ffffff'];
  // Standard palettes (palette > 0) use 6-digit hex and invert in light mode.
  if (palette > 0 && !dark) stops = stops.map(invertHexColor);
  return stops;
}

// The on-screen colour bar is a DOM element layered over the canvas, so it is not part
// of the captured pixels. For PNG/recording exports we draw a pixel-faithful copy onto
// the 2D composite. To stay identical to the live bar under any scaling, we MEASURE the
// live elements and map their screen rects into the canvas buffer, deriving sizes from
// the measured bar (the .sl-colorbar* CSS uses 10px units that match the bar height).
function _drawColorbarOnto(ctx, w, h) {
  const info = _VIZ_COLORBAR[state.vizMode];
  if (!info || !state.showColorbar || !glCanvas) return;
  const barEl = document.getElementById('sl-colorbar-bar');
  const minEl = document.getElementById('sl-colorbar-min');
  if (!barEl) return;
  const cr = glCanvas.getBoundingClientRect();
  const br = barEl.getBoundingClientRect();
  if (cr.width < 1 || cr.height < 1 || br.width < 1) return;

  const vs     = vizScaleFor(state.vizMode);
  const dark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const stops  = _paletteStops(vs.palette ?? 0, dark);
  const fgSoft = dark ? '#c9d1d9' : '#4b5563';        // --fg-soft (dark / light)

  // Map screen coordinates → canvas-buffer pixels (handles dpr and any CSS transform).
  const sx = w / cr.width, sy = h / cr.height;
  const barX = (br.left - cr.left) * sx;
  const barY = (br.top  - cr.top ) * sy;
  const barW = br.width  * sx;
  const barH = br.height * sy;
  const unit = barH / 10;                              // buffer px per CSS px
  const gap  = 3 * unit, fs = 10 * unit, tfs = 10.5 * unit, rad = 2 * unit;
  // Label row top: use the live label position when available, else CSS margin-top:3.
  const mr = minEl?.getBoundingClientRect();
  const labelsY = (mr && mr.height) ? (mr.top - cr.top) * sy : barY + barH + gap;

  ctx.save();
  ctx.globalAlpha = 0.88;                              // .sl-colorbar opacity

  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  const n = Math.max(stops.length - 1, 1);
  stops.forEach((c, i) => grad.addColorStop(i / n, c));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(barX, barY, barW, barH, rad);
  else               ctx.rect(barX, barY, barW, barH);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, unit);
  ctx.strokeStyle = 'rgba(128,128,128,0.3)';
  ctx.stroke();

  ctx.fillStyle    = fgSoft;
  ctx.textBaseline = 'top';
  ctx.font = `${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';   ctx.fillText(_fmtLimit(vs.min, info[1]), barX, labelsY);
  ctx.textAlign = 'right';  ctx.fillText(_fmtLimit(vs.max, info[1]), barX + barW, labelsY);
  ctx.font = `600 ${tfs}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText(info[0], barX + barW / 2, labelsY);
  ctx.restore();
}

// Returns { planes, dist, vizSrcIdx } — augmented with a virtual source plane at
// effectiveCritZs() when no real plane sits exactly there, so the z_s setting
// actually affects κ/γ/μ/|α| maps (same pattern as computeCritCurvesForZs).
// Extends vizPlanesAndIdx to also return fermatBeta, routing through the source
// position when the Fermat-use-source checkbox is enabled.
function vizArgs(sortedPlanes) {
  if (state.vizMode === 6 && state.fermatUseSourcePos && state.lastFermatSource) {
    const sp = sortedPlanes.find(p => p.id === state.lastFermatSource.planeId);
    if (sp) {
      return {
        planes:      sortedPlanes,
        dist:        state.dist,
        vizSrcIdx:   sortedPlanes.indexOf(sp),
        fermatBeta:  [state.lastFermatSource.cx, state.lastFermatSource.cy],
      };
    }
  }
  const { planes, dist, vizSrcIdx } = vizPlanesAndIdx(sortedPlanes);
  return { planes, dist, vizSrcIdx, fermatBeta: [0, 0] };
}

function vizPlanesAndIdx(sortedPlanes) {
  const zs = effectiveCritZs();
  const exact = sortedPlanes.find(p => Math.abs(p.z - zs) < 1e-6);
  if (exact) {
    const idx = sortedPlanes.indexOf(exact);
    return { planes: sortedPlanes, dist: state.dist, vizSrcIdx: idx };
  }
  const vp       = { id: -1, z: zs, objects: [] };
  const augmented = [...sortedPlanes, vp].sort((a, b) => a.z - b.z);
  const augDist   = precomputeDistances(augmented);
  const augIdx    = augmented.indexOf(vp);
  return { planes: augmented, dist: augDist, vizSrcIdx: augIdx };
}

// The { scale, param, min, max } warp passed to the renderer for a given viz mode.
// Fermat (6) has no colour warp, so fall back to surface-brightness settings.
function activeVizSettings(mode = state.vizMode) {
  // Return a copy (never mutate the stored vizScale) augmented with the Fermat
  // contour spacing; the shader ignores contourSpacing outside Fermat mode.
  const vs = vizScaleFor(vizModeHasScale(mode) ? mode : 0);
  return { ...vs, contourSpacing: state.contourSpacing };
}

function redraw() {
  if (_raf) return;
  _raf = requestAnimationFrame(() => { _raf = null; _doRedraw(); });
}

function _doRedraw() {
  if (!renderer || !state.dist) return;
  const sorted = [...state.planes].sort((a, b) => a.z - b.z);
  const isDark  = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;

  // Keep lastFermatSource synced with the actual source object's current position.
  // Priority: (1) explicitly selected source, (2) hybrid partner of selected lens,
  // (3) source object referenced by planeId (self-heals if source moved without selection).
  const _so = selectedObj(), _sp = selectedPlane();
  if (_so && _sp) {
    if (_so.type === 'source') {
      state.lastFermatSource = { cx: _so.cx, cy: _so.cy, planeId: _sp.id, objId: _so.id };
    } else {
      const _hp = hybridPartner(_sp, _so);
      if (_hp && _hp.type === 'source') {
        state.lastFermatSource = { cx: _hp.cx, cy: _hp.cy, planeId: _sp.id, objId: _hp.id };
      }
    }
  }
  // Always keep cx/cy in sync with the referenced source object even when not selected,
  // so moves via any path (hybrid drag, programmatic animation) are reflected immediately.
  if (state.lastFermatSource) {
    const _fsp = state.planes.find(p => p.id === state.lastFermatSource.planeId);
    const _fso = (_fsp?.objects.find(o => o.id === state.lastFermatSource.objId && o.type === 'source'))
              ?? _fsp?.objects.find(o => o.type === 'source');
    if (_fso) { state.lastFermatSource.cx = _fso.cx; state.lastFermatSource.cy = _fso.cy; }
  }

  if (state.vizMode !== 0) {
    const { planes, dist, vizSrcIdx, fermatBeta } = vizArgs(sorted);
    let saddlePhis = [];
    if (state.vizMode === 6) {
      state.fermatPoints = findStationaryPoints(planes, dist, vizSrcIdx, state.fov, fermatBeta);
      saddlePhis = state.fermatPoints.filter(p => p.type === 2).map(p => p.phiVal);
      state.saddlePhis = saddlePhis;
    } else {
      state.fermatPoints = null;
      state.saddlePhis = [];
    }
    renderer.setScene(planes, dist, state.fov, activeVizSettings(), state.vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta);
  } else {
    renderer.setScene(sorted, state.dist, state.fov, activeVizSettings(0), 0, 0, isDark, [], [0, 0]);
    state.fermatPoints = null;
    state.saddlePhis = [];
  }
  for (const plane of state.planes) redrawPlaneCanvas(plane);
  drawAxisCanvas();
  drawOverlay();
}

// ── Capture & recording ───────────────────────────────────────────────────────

// Composite the WebGL canvas (always in surface brightness mode) + overlay.
// Composite the GL canvas + overlay (markers/curves/legend) into a flat 2D canvas,
// reflecting whatever is currently on screen. UI chrome (the viz-mode chip, colorbar,
// sidebar) lives in separate DOM elements and is intentionally NOT included.
function buildCompositeCanvas() {
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  const off = document.createElement('canvas');
  off.width  = gl.width;
  off.height = gl.height;
  const ctx  = off.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  // Match on-screen appearance: in light mode only the lensed-image view is
  // CSS-inverted (viz maps carry their own theming), so invert here only for mode 0.
  if (state.vizMode === 0 && document.documentElement.getAttribute('data-theme') !== 'dark') {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(ov, 0, 0);
  _drawColorbarOnto(ctx, off.width, off.height);
  return off;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// PNG snapshot.
function captureSnapshot() {
  // Ensure the frame is fully drawn first.
  if (renderer && state.dist) {
    const isDark  = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;
    const sorted  = [...state.planes].sort((a, b) => a.z - b.z);
    if (state.vizMode !== 0) {
      const { planes, dist, vizSrcIdx, fermatBeta } = vizArgs(sorted);
      renderer.setScene(planes, dist, state.fov, activeVizSettings(), state.vizMode, vizSrcIdx, isDark, state.saddlePhis ?? [], fermatBeta);
    } else {
      renderer.setScene(sorted, state.dist, state.fov, activeVizSettings(0), 0, 0, isDark);
    }
    drawOverlay();
  }
  buildCompositeCanvas().toBlob(blob => downloadBlob(blob, 'caustica.png'), 'image/png');
}

function setProgInitialPosition() {
  const obj = selectedObj();
  if (!obj) return;
  const s = recState.progStaging.get(obj.id) || {};
  recState.progStaging.set(obj.id, { ...s, initialPos: { cx: obj.cx, cy: obj.cy, label: `(${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)})` } });
  renderSidebar();
}

function setProgFinalPosition() {
  const obj = selectedObj();
  if (!obj) return;
  const s = recState.progStaging.get(obj.id) || {};
  recState.progStaging.set(obj.id, { ...s, finalPos: { cx: obj.cx, cy: obj.cy, label: `(${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)})` } });
  renderSidebar();
}

// Commit the current staging area (selected object + initial/final) to the program list.
function addToProgram() {
  const obj = selectedObj(), pl = selectedPlane();
  const staging = recState.progStaging.get(obj.id) || {};
  if (!staging.initialPos || !staging.finalPos) return;
  // Replace any existing entry for this object so duplicates never accumulate.
  recState.progObjects = recState.progObjects.filter(e => e.objId !== obj.id);
  recState.progObjects.push({
    objId:      obj.id,
    planeId:    pl.id,
    initialPos: { cx: staging.initialPos.cx, cy: staging.initialPos.cy },
    finalPos:   { cx: staging.finalPos.cx,   cy: staging.finalPos.cy   },
    label:      `${obj.type === 'lens' ? 'Lens' : 'Source'} z=${pl.z.toFixed(2)} (${obj.model})`,
  });
  // Clear this object's staging after committing.
  recState.progStaging.delete(obj.id);
  renderSidebar();
}

function removeFromProgram(objId) {
  const id = Number(objId);
  recState.progObjects = recState.progObjects.filter(e => e.objId !== id);
  renderSidebar();
}

// Animate all committed objects simultaneously from their initial to final positions.
// For GIF frames are timestamped in metadata so slow computation doesn't affect
// playback speed; for WebM critical curves are suppressed to maintain real-time pacing.
function startProgrammaticRecording() {
  if (recState.active || recState.progObjects.length === 0) return;

  const fps          = recState.fps;
  const totalFrames  = Math.max(2, Math.round(recState.progDuration * fps));
  const frameDelayMs = 1000 / fps;

  // Build per-object animation data: resolve start positions now.
  const animations = recState.progObjects.map(entry => {
    const pl  = state.planes.find(p => p.id === entry.planeId);
    const obj = pl?.objects.find(o => o.id === entry.objId);
    if (!obj) return null;
    return {
      obj, plane: pl,
      startCx: entry.initialPos.cx,
      startCy: entry.initialPos.cy,
      endCx:   entry.finalPos.cx,
      endCy:   entry.finalPos.cy,
    };
  }).filter(Boolean);

  if (animations.length === 0) return;

  const lc    = document.createElement('canvas');
  lc.width    = glCanvas.width  || 512;
  lc.height   = glCanvas.height || 512;
  recState.liveCanvas = lc;
  recState.active     = true;
  recState.chunks     = [];
  updateRecordingIndicator();

  let frame = 0;

  const doFrame = () => {
    if (!recState.active && frame < totalFrames) {
      // Cancelled: restore all start positions.
      for (const a of animations) { a.obj.cx = a.startCx; a.obj.cy = a.startCy; }
      invalidateDistances(); redraw();
      return;
    }
    const t = totalFrames === 1 ? 1 : frame / (totalFrames - 1);
    for (const a of animations) {
      a.obj.cx = a.startCx + (a.endCx - a.startCx) * t;
      a.obj.cy = a.startCy + (a.endCy - a.startCy) * t;
      const _ap = hybridPartner(a.plane, a.obj);
      if (_ap) { _ap.cx = a.obj.cx; _ap.cy = a.obj.cy; }
    }

    // Force a synchronous render.
    // GIF: frames are timestamped in metadata so slow computation doesn't
    //      affect playback speed: critical curves render correctly.
    // WebM: captureStream samples at real time; slow computation causes frame
    //       duplication, so critical curves/caustics are suppressed for WebM.
    if (renderer && state.dist) {
      const isDark   = document.documentElement.getAttribute('data-theme') === 'dark' ? 1 : 0;
      const sorted   = [...state.planes].sort((a, b) => a.z - b.z);
      if (state.vizMode !== 0) {
        const { planes, dist, vizSrcIdx, fermatBeta } = vizArgs(sorted);
        let saddlePhis = state.saddlePhis ?? [];
        if (state.vizMode === 6) {
          state.fermatPoints = findStationaryPoints(planes, dist, vizSrcIdx, state.fov, fermatBeta);
          saddlePhis = state.fermatPoints.filter(p => p.type === 2).map(p => p.phiVal);
          state.saddlePhis = saddlePhis;
        }
        renderer.setScene(planes, dist, state.fov, activeVizSettings(), state.vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta);
      } else {
        renderer.setScene(sorted, state.dist, state.fov, activeVizSettings(0), 0, 0, isDark);
      }
      const savedCrit = state.showCritCurves, savedCaus = state.showCaustics;
      if (!recState.useGif) { state.showCritCurves = false; state.showCaustics = false; }
      drawOverlay();
      state.showCritCurves = savedCrit; state.showCaustics = savedCaus;
    }
    for (const plane of state.planes) redrawPlaneCanvas(plane);
    _compositeToLive();

    if (recState.useGif) recState.gifObj?.addFrame(lc, { copy: true, delay: frameDelayMs });

    frame++;
    if (frame < totalFrames) {
      // GIF: go as fast as possible; WebM: pace to real time.
      setTimeout(doFrame, recState.useGif ? 0 : frameDelayMs);
    } else {
      // All frames done: finalize.
      recState.active = false;
      updateRecordingIndicator();
      clearTimeout(recState.autoStopTimer);
      recState.autoStopTimer = null;
      if (recState.useGif) {
        recState.gifObj?.render();
      } else {
        recState.recorder?.stop();
      }
    }
  };

  if (recState.useGif) {
    const _run = () => {
      const gif = new GIF({ workers: 2, quality: 10, workerScript: 'gif.worker.js',
                            width: lc.width, height: lc.height });
      recState.gifObj = gif;
      gif.on('finished', blob => downloadBlob(blob, 'caustica-prog.gif'));
      doFrame();
    };
    if (!window.GIF) {
      _loadGifJs(_run);
    } else { _run(); }
  } else {
    const stream   = lc.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recState.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) recState.chunks.push(e.data); };
    recorder.onstop = () => {
      downloadBlob(new Blob(recState.chunks, { type: 'video/webm' }), 'caustica-prog.webm');
      recState.chunks = [];
    };
    recorder.start(200);
    _compositeToLive();
    doFrame();
  }
}

// ── Video / GIF recording ─────────────────────────────────────────────────────

const recState = {
  active:    false,
  fps:       15,
  useGif:    false,
  maxSecs:   30,
  recorder:  null,
  chunks:    [],
  gifObj:    null,
  liveCanvas: null,
  rafId:     null,
  frameInterval: null,
  autoStopTimer: null,
  // Per-object staging: Map<objId, { initialPos, finalPos }>: each object keeps its own values
  progStaging:    new Map(),
  // Committed keyframes that will animate simultaneously
  progObjects:    [],    // [{ objId, planeId, initialPos:{cx,cy}, finalPos:{cx,cy}, label }]
  progDuration:   3.0,
};

function updateRecordingIndicator() {
  const dot = document.getElementById('sl-rec-dot');
  if (dot) dot.style.display = recState.active ? '' : 'none';
  const btn = document.getElementById('sl-rec-btn');
  if (btn) {
    btn.textContent = recState.active ? '■ Stop [R]' : '● Record [R]';
    btn.classList.toggle('recording', recState.active);
  }
}

function startRecording() {
  if (recState.active) return;
  const fps = recState.fps;

  // Create the live composite canvas once.
  const gl = glCanvas;
  const lc = document.createElement('canvas');
  lc.width  = gl.width  || 512;
  lc.height = gl.height || 512;
  recState.liveCanvas = lc;
  recState.active     = true;
  recState.chunks     = [];
  // Hard cap: auto-stop after maxSecs regardless of user action.
  recState.autoStopTimer = setTimeout(stopRecording, recState.maxSecs * 1000);
  updateRecordingIndicator();

  if (recState.useGif) {
    _startGifRecording(fps, lc);
  } else {
    _startWebMRecording(fps, lc);
  }
}

function stopRecording() {
  if (!recState.active) return;
  recState.active = false;
  clearTimeout(recState.autoStopTimer);
  cancelAnimationFrame(recState.rafId);
  clearInterval(recState.frameInterval);
  recState.rafId = null;
  recState.frameInterval = null;
  recState.autoStopTimer = null;
  updateRecordingIndicator();

  if (recState.useGif) {
    recState.gifObj?.render();
  } else {
    recState.recorder?.stop();
  }
}

function _compositeToLive() {
  if (!recState.liveCanvas) return;
  const lc  = recState.liveCanvas;
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  if (lc.width !== gl.width || lc.height !== gl.height) {
    lc.width  = gl.width;
    lc.height = gl.height;
  }
  const ctx = lc.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  // Only the lensed-image view is CSS-inverted in light mode (see buildCompositeCanvas).
  if (state.vizMode === 0 && document.documentElement.getAttribute('data-theme') !== 'dark') {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lc.width, lc.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(ov, 0, 0);
  _drawColorbarOnto(ctx, lc.width, lc.height);
}

function _startWebMRecording(fps, liveCanvas) {
  // Drive the live canvas at the chosen FPS.
  const ms = 1000 / fps;
  recState.frameInterval = setInterval(() => {
    if (!recState.active) return;
    _compositeToLive();
  }, ms);

  const stream   = liveCanvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  recState.recorder = recorder;

  recorder.ondataavailable = e => { if (e.data.size > 0) recState.chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recState.chunks, { type: 'video/webm' });
    downloadBlob(blob, 'caustica.webm');
    recState.chunks = [];
  };
  recorder.start(200); // collect data every 200ms
  // First composite immediately so the stream isn't blank.
  _compositeToLive();
}

function _loadGifJs(cb) {
  if (document.querySelector('script[data-gifjs]')) {
    // already injected but not yet loaded: wait
    document.querySelector('script[data-gifjs]').addEventListener('load', cb);
    return;
  }
  const script = document.createElement('script');
  script.src = 'gif.js';
  script.dataset.gifjs = '1';
  script.onload = cb;
  script.onerror = () => console.error('Caustica: could not load gif.js');
  document.head.appendChild(script);
}

function _startGifRecording(fps, liveCanvas) {
  if (!window.GIF) {
    _loadGifJs(() => _initGifEncoder(fps, liveCanvas));
  } else {
    _initGifEncoder(fps, liveCanvas);
  }
}

function _initGifEncoder(fps, liveCanvas) {
  /* global GIF */
  const gif = new GIF({
    workers: 2,
    quality: 10,
    workerScript: 'gif.worker.js',   // same-origin: no CSP issues
  });
  recState.gifObj = gif;

  gif.on('finished', blob => downloadBlob(blob, 'caustica.gif'));

  const delay = Math.round(1000 / fps);
  recState.frameInterval = setInterval(() => {
    if (!recState.active) return;
    _compositeToLive();
    gif.addFrame(liveCanvas, { copy: true, delay });
  }, delay);

  _compositeToLive();
}

// ── Tour / tutorial ───────────────────────────────────────────────────────────

// Mobile helpers: open/close the plane setup drawer and switch mobile tabs.
function _tourOpenPlaneSetup() {
  if (window.innerWidth > 640) return;
  const tl  = document.getElementById('sl-timeline');
  const bar = document.getElementById('sl-plane-setup-bar');
  const btn = document.getElementById('sl-plane-setup-btn');
  tl.classList.add('plane-setup-open');
  if (btn) btn.textContent = '▼';
  setTimeout(() => {
    const h = tl.getBoundingClientRect().height;
    if (bar && h > 0) bar.style.bottom = `${h + 8}px`;
    drawAxisCanvas();
  }, 50);
}
function _tourClosePlaneSetup() {
  if (window.innerWidth > 640) return;
  const tl  = document.getElementById('sl-timeline');
  const bar = document.getElementById('sl-plane-setup-bar');
  const btn = document.getElementById('sl-plane-setup-btn');
  tl.classList.remove('plane-setup-open');
  if (btn) btn.textContent = '▲';
  if (bar) bar.style.bottom = '';
}
function _tourSetMobileTab(tab) {
  if (window.innerWidth > 640) return;
  const col = document.getElementById('sl-controls-col');
  if (!col) return;
  col.dataset.mobileTab = tab;
  document.querySelectorAll('.sl-mobile-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'settings' || tab === 'recording') {
    activeTab = tab;
    document.getElementById('sl-tab-settings').style.display  = tab === 'settings'  ? '' : 'none';
    document.getElementById('sl-tab-recording').style.display = tab === 'recording' ? '' : 'none';
  }
}

const TOUR_STEPS = [
  {
    target: '.sl-axis-wrap',
    onEnter: _tourOpenPlaneSetup,
    arrow: 'above',
    label: 'Redshift timeline',
    text: 'The redshift axis represents the line of sight from z = 0 (observer) to distant galaxies. Click or tap the axis to place a new plane at that redshift; drag existing markers to reposition them.',
  },
  {
    target: '.sl-planes',
    onEnter: _tourOpenPlaneSetup,
    arrow: 'above',
    label: 'Plane viewer',
    text: 'Each plane appears here as a canvas panel showing a projected view of that redshift slice. Click to select an object, drag to move it. The <b>○</b> button (or press <kbd>O</kbd>) clears all objects from the selected plane. The <b>×</b> button (or press <kbd>X</kbd>) deletes the plane entirely.',
  },
  {
    target: '#sl-plane-toolbar',
    onEnter: _tourOpenPlaneSetup,
    arrow: 'right',
    label: 'Add toolbar',
    text: 'Select what clicking in a plane creates: <b>Lens</b> (deflects light), <b>Source</b> (emits light), or <b>Hybrid</b> (both at once as a purple dot). Press <kbd>1</kbd>, <kbd>2</kbd>, or <kbd>3</kbd> to switch modes. The trash button deletes the selected object.',
  },
  {
    target: '#sl-obj-panel',
    mobileTarget: '#sl-obj-panel',
    onEnter: () => { _tourClosePlaneSetup(); _tourSetMobileTab('object'); },
    arrow: 'left',
    label: 'Object Controls',
    text: 'When an object is selected, its parameters appear here. Choose a profile from the dropdown — lens types include SIE, EPL, point mass, external shear, external convergence, and constant deflection; source types include Gaussian, exponential, uniform circle, point source, and pasted image. The <b>ⓘ</b> button shows parameter descriptions for the chosen model. Press <kbd>H</kbd> to hide or show the selected object.',
  },
  {
    target: '#sl-image-wrap',
    onEnter: _tourClosePlaneSetup,
    arrow: 'right',
    label: 'Lensed image',
    text: 'This panel shows what an observer at z = 0 would see. Light from source objects is bent by all intervening lenses using full multiplane gravitational lensing. Drag objects directly here or in the plane panels; the image updates in real time.',
  },
  {
    target: '#sl-viz-mode',
    onEnter: () => {
      _tourClosePlaneSetup();
      state.vizMode = 6;
      const sel = document.getElementById('sl-viz-mode');
      if (sel) sel.value = 6;
      glCanvas?.classList.toggle('sl-viz-active', true);
      _updateColorbar(); renderSidebar(); redraw();
    },
    arrow: 'below',
    label: 'Lensing quantities',
    text: 'The <b>quantity dropdown</b> maps lensing quantities across the field of view — convergence κ, shear γ, magnification |μ|, deflection |α|, and the <b>Fermat potential φ</b> shown now. Contour lines trace the arrival-time surface; stationary points are the images of a source at the origin, classified as minimum (○), saddle (◇), or maximum (△) by their Jacobian type. The highlighted contour passes through the saddle image. Press <kbd>I</kbd> to return to the lensed image at any time.',
  },
  {
    target: '.sl-tab-btn[data-tab="settings"]',
    mobileTarget: '.sl-mobile-tab-btn[data-tab="settings"]',
    onEnter: () => {
      _tourClosePlaneSetup(); _tourSetMobileTab('settings');
      state.vizMode = 0;
      const sel = document.getElementById('sl-viz-mode');
      if (sel) sel.value = 0;
      glCanvas?.classList.toggle('sl-viz-active', false);
      _updateColorbar(); renderSidebar(); redraw();
    },
    arrow: 'left',
    label: 'Settings',
    text: 'The <b>Settings tab</b> controls field of view, maximum redshift, and tone mapping. The Critical Curves section overlays contours where image count changes (press <kbd>C</kbd>). The Resolution dropdown controls curve detail.',
  },
  {
    target: '.sl-tab-btn[data-tab="recording"]',
    mobileTarget: '.sl-mobile-tab-btn[data-tab="recording"]',
    onEnter: () => { _tourClosePlaneSetup(); _tourSetMobileTab('recording'); },
    arrow: 'left',
    label: 'Recording',
    text: 'The <b>Recording tab</b> has two modes. <b>Live</b> captures whatever you do: press Record, interact, press Stop, then download as WebM or GIF. <b>Programmatic</b> animates a selected object between two positions; set start, set end, then press Record Program.',
  },
  {
    target: null,
    onEnter: _tourClosePlaneSetup,
    arrow: null,
    label: 'Ready to explore',
    text: 'That\'s the full tour! Click the redshift axis to add planes, pick a tool, click in a plane to add objects, and watch the lensed image update live.',
    final: true,
  },
];

function _tourClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const tour = {
  active: false, step: 0,
  backdrop: null, spotlight: null, tooltip: null, quitBtn: null,
};

function _tourKeyHandler(e) {
  if (!tour.active) return;
  if (e.key === 'Enter') { e.preventDefault(); tourNext(); }
  if (e.key === 'Escape') { endTour(); }
}

function startTour() {
  if (tour.active) return;
  tour.active = true;
  tour.step   = 0;

  tour.backdrop  = document.createElement('div');
  tour.backdrop.className = 'tutorial-backdrop';
  tour.spotlight = document.createElement('div');
  tour.spotlight.className = 'tutorial-spotlight';
  tour.tooltip   = document.createElement('div');
  tour.tooltip.className = 'tutorial-tooltip';
  document.body.appendChild(tour.backdrop);
  document.body.appendChild(tour.spotlight);
  document.body.appendChild(tour.tooltip);

  window.addEventListener('resize', repositionTour);
  document.addEventListener('keydown', _tourKeyHandler);
  showTourStep();
}

function _tourTargetSel(s) {
  const mob = window.innerWidth <= 640;
  return (mob && s.mobileTarget) ? s.mobileTarget : s.target;
}

function showTourStep() {
  const s = TOUR_STEPS[tour.step];
  if (!s) { endTour(); return; }
  tour.tooltip.style.visibility = 'hidden'; // hide until positioned
  if (s.onEnter) {
    s.onEnter();
    setTimeout(_renderTourStep, 120); // let layout settle after drawer/tab changes
  } else {
    _renderTourStep();
  }
}

function _renderTourStep() {
  const s = TOUR_STEPS[tour.step];
  if (!s || !tour.active) return;

  const sel = _tourTargetSel(s);
  let targetRect = null;
  if (sel) {
    const el = document.querySelector(sel);
    if (el) targetRect = el.getBoundingClientRect();
  }

  if (targetRect && targetRect.width > 0) {
    tour.spotlight.classList.remove('no-target');
    const pad = 6;
    Object.assign(tour.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top  - pad}px`,
      width:  `${targetRect.width  + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  } else {
    tour.spotlight.classList.add('no-target');
    Object.assign(tour.spotlight.style, { left: '50%', top: '50%', width: '0', height: '0' });
  }

  const isFinal = !!s.final;
  tour.tooltip.innerHTML = `
    <div class="tt-arrow"></div>
    <div class="tt-step">Step ${tour.step + 1} / ${TOUR_STEPS.length} · ${s.label || ''}</div>
    <div class="tt-body">${s.text}</div>
    <div class="tt-actions">
      <button class="tt-skip" id="tt-skip">${isFinal ? 'Close' : 'Skip'}</button>
      <button class="primary tt-next" id="tt-next">${isFinal ? 'Finish' : 'Next →'}</button>
    </div>`;
  document.getElementById('tt-next').addEventListener('click', tourNext);
  document.getElementById('tt-skip').addEventListener('click', endTour);

  positionTourTooltip(targetRect, s.arrow);
  tour.tooltip.style.visibility = '';
}

function repositionTour() {
  if (!tour.active) return;
  const s = TOUR_STEPS[tour.step];
  if (!s) return;
  const sel = _tourTargetSel(s);
  let targetRect = null;
  if (sel) {
    const el = document.querySelector(sel);
    if (el) targetRect = el.getBoundingClientRect();
  }
  if (targetRect && targetRect.width > 0) {
    const pad = 6;
    Object.assign(tour.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top  - pad}px`,
      width:  `${targetRect.width  + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  }
  positionTourTooltip(targetRect, s.arrow);
}

function positionTourTooltip(targetRect, preferred) {
  const tt = tour.tooltip;
  tt.classList.remove('above', 'below', 'left', 'right');
  tt.style.visibility = 'hidden';
  tt.style.left = '0px'; tt.style.top = '0px';
  const ttRect = tt.getBoundingClientRect();
  const ttW = ttRect.width, ttH = ttRect.height;
  const margin = 22;
  let left, top, side = null;

  if (!targetRect || targetRect.width === 0) {
    left = (window.innerWidth  - ttW) / 2;
    top  = (window.innerHeight - ttH) / 2;
  } else {
    const cx = targetRect.left + targetRect.width  / 2;
    const cy = targetRect.top  + targetRect.height / 2;
    const space = {
      below: window.innerHeight - targetRect.bottom,
      above: targetRect.top,
      right: window.innerWidth  - targetRect.right,
      left:  targetRect.left,
    };
    const need = { below: ttH + margin, above: ttH + margin, right: ttW + margin, left: ttW + margin };
    const sides = ['below', 'above', 'right', 'left'];
    let chosen = preferred && space[preferred] >= need[preferred]
      ? preferred
      : sides.slice().sort((a, b) => space[b] - space[a])[0];
    side = chosen;
    switch (chosen) {
      case 'below': top  = targetRect.bottom + margin; left = cx - ttW / 2; break;
      case 'above': top  = targetRect.top - ttH - margin; left = cx - ttW / 2; break;
      case 'right': left = targetRect.right + margin;  top  = cy - ttH / 2; break;
      case 'left':  left = targetRect.left  - ttW - margin; top = cy - ttH / 2; break;
    }
  }
  const VP = 12;
  // Ensure upper bound is never less than lower bound (happens when tooltip
  // is wider/taller than the viewport minus padding).
  left = _tourClamp(left, VP, Math.max(VP, window.innerWidth  - ttW - VP));
  top  = _tourClamp(top,  VP, Math.max(VP, window.innerHeight - ttH - VP));
  tt.style.left = `${left}px`;
  tt.style.top  = `${top}px`;
  if (side) tt.classList.add(side);

  const arrow = tt.querySelector('.tt-arrow');
  if (arrow && targetRect && side) {
    const cx = targetRect.left + targetRect.width  / 2;
    const cy = targetRect.top  + targetRect.height / 2;
    if (side === 'below' || side === 'above') {
      arrow.style.left = `${_tourClamp(cx - left, 14, ttW - 14) - 6}px`;
      arrow.style.top  = '';
    } else {
      arrow.style.top  = `${_tourClamp(cy - top,  14, ttH - 14) - 6}px`;
      arrow.style.left = '';
    }
  } else if (arrow) {
    arrow.style.display = 'none';
  }
  tt.style.visibility = '';
}

function tourNext() {
  tour.step++;
  if (tour.step >= TOUR_STEPS.length) { endTour(); return; }
  showTourStep();
}

function endTour() {
  if (!tour.active) return;
  tour.active = false;
  _tourClosePlaneSetup();
  window.removeEventListener('resize', repositionTour);
  document.removeEventListener('keydown', _tourKeyHandler);
  tour.backdrop?.remove();  tour.spotlight?.remove();  tour.tooltip?.remove();
  tour.backdrop = tour.spotlight = tour.tooltip = null;
}
