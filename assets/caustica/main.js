// Caustica: main.js

import { Renderer, MAX_OBJECTS, MAX_PLANES }   from './renderer.js';
import { precomputeDistances,
         computeCriticalCurves,
         computeDiscImageOutlines,
         traceSourceGrid,
         chainSegments,
         smoothPolylines,
         angDiamDist,
         angDiamDistBetween,
         deflectEPL,
         setCosmology,
         getCosmology,
         fermatDiffToDays,
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

// Internal object clipboard for copy/paste (Cmd/Ctrl+C then Cmd/Ctrl+V). Separate
// from the system clipboard so it never clashes with the pasted-image workflow.
let _objClipboard     = null;
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

// ── Line-art mode palettes ────────────────────────────────────────────────────
// Flat, minimal schemes for the vector "Line art" View mode. Each maps the scene's
// roles to colors: background, the lensed-image fill/stroke (uniform-disc outlines),
// critical curves, caustics, and point-source dots. These are fixed looks chosen for
// their own sake (NOT tied to the site's light/dark theme); the dropdown order below
// is the order shown to the user. Colors are drawn on the (non-CSS-inverted) overlay,
// so they render as authored in either site theme.
const LINE_ART_PALETTES = {
  ink:           { name: 'Ink',             bg: '#0a0a0a', imageFill: '#ebebeb', imageStroke: '#ffffff', critical: '#ffffff', caustic: '#9aa0a6', pointImage: '#ffffff' },
  ink_inv:       { name: 'Ink (inv.)',      bg: '#ffffff', imageFill: '#141414', imageStroke: '#000000', critical: '#000000', caustic: '#9aa0a6', pointImage: '#000000' },
  crimson:       { name: 'Crimson',         bg: '#ffffff', imageFill: '#e11d3c', imageStroke: '#8a0f22', critical: '#1a1a1a', caustic: '#f2a6b0', pointImage: '#c8142f' },
  crimson_inv:   { name: 'Crimson (inv.)',  bg: '#c8102e', imageFill: '#ffffff', imageStroke: '#ffffff', critical: '#ffffff', caustic: '#141414', pointImage: '#ffffff' },
  blueprint:     { name: 'Blueprint',       bg: '#0d2847', imageFill: '#cbe8ff', imageStroke: '#ffffff', critical: '#8fd0ff', caustic: '#b8ecc9', pointImage: '#eaf6ff' },
  blueprint_inv: { name: 'Blueprint (inv.)',bg: '#dcecfb', imageFill: '#2461a6', imageStroke: '#123f74', critical: '#0f3a68', caustic: '#2f7d57', pointImage: '#2461a6' },
  espresso:      { name: 'Espresso',        bg: '#f2d7b8', imageFill: '#3a1c05', imageStroke: '#1e0e00', critical: '#6b2e00', caustic: '#5b2036', pointImage: '#1e0e00' },
  mint:          { name: 'Mint',            bg: '#ffffff', imageFill: '#22c9ad', imageStroke: '#0e8f79', critical: '#141414', caustic: '#8a9199', pointImage: '#0e8f79' },
  noir:          { name: 'Noir',            bg: '#0a0a0a', imageFill: '#f5f5f5', imageStroke: '#ffffff', critical: '#ff5ca8', caustic: '#57c7ff', pointImage: '#ffffff' },
};
// The customisable color roles (order = the picker layout + config serialisation order).
const LINE_ART_ROLES = [
  ['bg',          'Background'],
  ['imageFill',   'Image fill'],
  ['imageStroke', 'Image line'],
  ['critical',    'Critical'],
  ['caustic',     'Caustic'],
  ['pointImage',  'Point img'],
];
// Copy just the color fields of a named palette (dropping the display name).
function paletteColors(key) {
  const p = LINE_ART_PALETTES[key] ?? LINE_ART_PALETTES.ink;
  const out = {};
  for (const [role] of LINE_ART_ROLES) out[role] = p[role];
  return out;
}
// Resolved line-art colors: the live set the user sees, seeded from the chosen palette
// (state.lineArtPalette) and then editable per-role via the View-tab color pickers
// (stored in state.lineArtColors).
function lineArtPalette() { return state.lineArtColors ?? paletteColors(state.lineArtPalette); }

// Point-source image grid: number of sample points across the field. This is a
// fixed count (not an absolute arcsec spacing) so the cost stays bounded as the
// FOV grows to cluster scale. PS_GRID_MAX is a hard backstop on that count.
const PS_GRID_MAX = 1200;
const PS_GRID_OPTIONS = [150, 300, 600, 1200];

// Overlay-redraw time (ms) above which the orange performance warning appears.
// Hysteresis (0.6×) prevents the badge flickering on borderline frames.
const PERF_WARN_MS = 120;
let _perfWarnOn = false;
let _perfWarnDismissed = false;  // user closed the warning; stay hidden for the rest of the session

function reportPerf(ms) {
  const badge = document.getElementById('sl-perf-warn');
  if (!badge) return;
  if (_perfWarnDismissed) { badge.style.display = 'none'; return; }
  if      (!_perfWarnOn && ms > PERF_WARN_MS)       _perfWarnOn = true;
  else if ( _perfWarnOn && ms < PERF_WARN_MS * 0.6) _perfWarnOn = false;
  if (_perfWarnOn) {
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
    const pop = document.getElementById('sl-perf-pop');
    if (pop) pop.style.display = 'none';
  }
}

// Objects beyond the shader's per-type cap (some number of lenses and the same
// number of sources) are silently dropped from the GPU render — they still
// appear in the sidebar and as overlay markers, but contribute no light/mass.
// Show a badge whenever the visible count exceeds the cap so the drop isn't
// invisible. The cap is whatever the renderer actually built with (usually
// MAX_OBJECTS, less on a constrained GPU). The × dismisses it for the session,
// exactly like the performance warning.
let _capWarnDismissed = false;   // user closed the warning; stay hidden for the rest of the session
function reportObjectCap() {
  const badge = document.getElementById('sl-cap-warn');
  if (!badge) return;
  const pop = document.getElementById('sl-cap-pop');
  if (_capWarnDismissed) {
    badge.style.display = 'none';
    if (pop) pop.style.display = 'none';
    return;
  }
  const cap = renderer?.maxObjects ?? MAX_OBJECTS;
  let nLens = 0, nSrc = 0;
  for (const pl of state.planes)
    for (const o of pl.objects) {
      if (o.hidden) continue;
      if (o.type === 'lens')        nLens++;
      else if (o.type === 'source') nSrc++;
    }
  const overL = Math.max(0, nLens - cap);
  const overS = Math.max(0, nSrc - cap);
  const overP = Math.max(0, state.planes.length - MAX_PLANES);
  const over  = overL + overS + overP;
  if (over === 0) {
    badge.style.display = 'none';
    if (pop) pop.style.display = 'none';
    return;
  }
  const label = document.getElementById('sl-cap-warn-label');
  if (label) {
    const bits = [];
    if (overL + overS) bits.push(`${overL + overS} object${overL + overS > 1 ? 's' : ''}`);
    if (overP)         bits.push(`${overP} plane${overP > 1 ? 's' : ''}`);
    label.textContent = `${bits.join(' + ')} not shown`;
  }
  const detail = document.getElementById('sl-cap-pop-detail');
  if (detail) {
    const parts = [];
    if (overL) parts.push(`<b>${overL}</b> lens${overL > 1 ? 'es' : ''}`);
    if (overS) parts.push(`<b>${overS}</b> source${overS > 1 ? 's' : ''}`);
    let html = '';
    if (overL + overS) {
      html +=
        `The image can display at most <b>${cap}</b> lenses and <b>${cap}</b> sources. ` +
        `${parts.join(' and ')} beyond that limit ${overL + overS > 1 ? 'are' : 'is'} not rendered — ` +
        `they still appear in the object list and as markers, but add no light or lensing. ` +
        `Hide or delete objects to bring the count under the limit.`;
    }
    if (overP) {
      html += `${html ? '<br><br>' : ''}` +
        `The image can include at most <b>${MAX_PLANES}</b> planes (sorted by redshift). ` +
        `The <b>${overP}</b> most distant plane${overP > 1 ? 's are' : ' is'} not rendered — ` +
        `${overP > 1 ? 'their' : 'its'} objects add no light or lensing. ` +
        `Delete planes to bring the count under the limit.`;
    }
    detail.innerHTML = html;
  }
  badge.style.display = '';
}

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
  showRuler:          false,  // ruler tool + its measurement lines (off by default; View toggle or the L key enables it)
  critGridN:          512,
  psGridN:            300,    // point-source grid: sample points across the field
  renderScale:        'auto', // GL canvas DPR mode: 'auto' (cap 2×) | '1x' | 'native'
  showScaleBar:       true,   // dynamic angular scale bar at the bottom of the image
  critZs:             null,   // null = auto (highest-z source plane)
  fermatUseSourcePos: false,  // when true, use lastFermatSource for Fermat β_s and source plane
  contourSpacing:     1.0,    // Fermat contour spacing multiplier (interval = 0.002·fov²·this)
  contourScale:       0,      // Fermat contour scale: 0=linear, 1=asinh (compress steep skirt)
  H0:                 70,     // Hubble constant (km/s/Mpc); flat ΛCDM
  Omega_m:            0.3,    // matter density; Omega_L = 1 − Omega_m
  showTimeDelays:     false,  // annotate point-source images with relative time delays (days)
  lineArt:            false,  // vector "Line art" render mode (flat palette, no raster)
  lineArtPalette:     'ink',  // key into LINE_ART_PALETTES
  lineArtFill:        true,   // fill lensed-image outlines (vs stroke only)
  lineArtSmooth:      true,   // curvature-aware Chaikin smoothing of the vector curves
};

const state = {
  ...CONFIG_DEFAULTS,
  planes:          [],
  selectedPlaneId: null,
  selectedObjId:   null,
  addMode:         'select', // plane-viewer tool: 'select' | 'lens' | 'source' | 'hybrid'
  rulerActive:     false,    // ruler is the active pointer tool on the image panel (transient)
  rulers:          [],       // committed measurements, each { id, x0, y0, x1, y1 } in arcsec (session-only)
  rulerDraft:      null,     // in-progress ruler drag { x0, y0, x1, y1 } or null (transient)
  hideOverlays:    false,    // View-tab master switch: hide every overlay for a clean plot (transient)
  selectedRulerId: null,     // id of the ruler currently selected for edit/delete (transient)
  // Per-viz-mode colour mapping: { scale, param, min, max }. scale: 0=linear 1=sqrt
  // 2=power 3=asinh 4=log. Modes: 0=surface brightness, 1=κ, 2=γ, 3=|μ|, 5=|α|.
  vizScale:        null,     // initialised from DEFAULT_VIZ_SCALE below
  dist:            null,
  lastFermatSource:null,     // { cx, cy, planeId } of last selected source object
  saddlePhis:      [],       // φ values at Type-II saddle points; kept in sync for restore calls
  // Live line-art colors: seeded from the chosen palette, editable per-role via the
  // View-tab color pickers. Picking a palette resets these to that palette's colors.
  lineArtColors:   paletteColors(CONFIG_DEFAULTS.lineArtPalette),
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
  let dragging = false, moved = false, startX = 0, startY = 0, startVal = 0, step = 0.01, startSig = null;
  inp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    startVal = parseFloat(inp.value) || 0;
    step = _numStep(startVal || 1);
    startSig = _sceneSig();
    startX = e.clientX; startY = e.clientY; dragging = true; moved = false;
    beginAction();
    inp.setPointerCapture(e.pointerId);
  });
  inp.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (!moved) {
      const dx = Math.abs(e.clientX - startX), dy = Math.abs(e.clientY - startY);
      // On touch, a mostly-vertical start means the user is scrolling, not
      // scrubbing: abandon the drag so the browser can pan (touch-action:
      // pan-y on .sl-scrub permits vertical panning only).
      if (e.pointerType !== 'mouse' && dy > dx && dy > 2) {
        dragging = false;
        _history.pending = null; _history.pendingSig = null;
        startSig = null;
        try { inp.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      if (dx <= 2) return;
      moved = true;
    }
    const dec = Math.max(0, -Math.floor(Math.log10(step)) + 1);
    const v = parseFloat(Math.min(hi, Math.max(lo, startVal + (e.clientX - startX) * step)).toFixed(dec));
    inp.value = v;
    onChange(v);
  });
  // Some browsers ignore touch-action on form controls and claim any touch drag
  // as a scroll, firing pointercancel and killing the scrub. Consuming touchmove
  // for horizontally-dominant drags keeps the pointer stream alive; vertical
  // drags are left alone so scrolling still works.
  inp.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    if (moved || (t && Math.abs(t.clientX - startX) >= Math.abs(t.clientY - startY))) e.preventDefault();
  }, { passive: false });
  // A drag that starts on selected text (e.g. after a double-click highlighted
  // the number) becomes a native text drag-and-drop, which pointercancels the
  // scrub and leaves the selection in place, so every retry dies the same way.
  // Blocking dragstart keeps the pointer stream alive; the first value write
  // then collapses the selection.
  inp.addEventListener('dragstart', e => e.preventDefault());
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved && startSig !== null && _sceneSig() !== startSig) commitAction();
    else { _history.pending = null; _history.pendingSig = null; }
    startSig = null;
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
  // Grid density is a fixed number of points ACROSS the field, not an absolute
  // arcsec spacing, so the O(N²) cost cannot blow up as the FOV grows to cluster
  // scale. Hard-capped at PS_GRID_MAX as a backstop against pathological configs.
  // (Final image positions come from Newton-Raphson refinement, so they don't
  // shift with grid density — only the completeness of faint-image detection does.)
  const RANGE = Math.max(state.fov * 1.1, 3.0);
  const N     = Math.min(Math.max(Math.round(state.psGridN ?? 300), 32), PS_GRID_MAX);
  const step  = RANGE / (N - 1);
  const half  = RANGE / 2;

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
  y += `showScaleBar: ${state.showScaleBar}\n`;
  y += `showRuler: ${state.showRuler}\n`;
  y += `critGridN: ${state.critGridN}\npsGridN: ${state.psGridN}\n`;
  y += `renderScale: ${state.renderScale}\n`;
  y += `critZs: ${state.critZs === null ? 'null' : state.critZs}\n`;
  y += `contourSpacing: ${state.contourSpacing}\n`;
  y += `contourScale: ${state.contourScale === 1 ? 'asinh' : 'linear'}\n`;
  y += `H0: ${state.H0}\nOmega_m: ${state.Omega_m}\n`;
  y += `showTimeDelays: ${state.showTimeDelays}\n`;
  y += `lineArt: ${state.lineArt}\n`;
  y += `lineArtPalette: ${state.lineArtPalette}\n`;
  y += `lineArtColors: ${LINE_ART_ROLES.map(([r]) => state.lineArtColors[r]).join(' ')}\n`;
  y += `lineArtFill: ${state.lineArtFill}\n`;
  y += `lineArtSmooth: ${state.lineArtSmooth}\n`;
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
  { file: 'butterfly_caustic.yaml', name: 'Butterfly Caustic' },
  { file: 'group.yaml',         name: 'Galaxy group (wide field)' },
];

// Name of the preset last loaded from the dropdown, so the box keeps showing it.
let _selectedPreset = '';

// Fetch a preset YAML by filename and load it through the normal config path.
// A failure is retried once with the HTTP caches bypassed (cache:'reload' skips the
// browser cache; the throwaway query param skips the CDN cache): a response cached
// mid-deploy (e.g. a 404) otherwise keeps a preset broken on that device until the
// cache entry expires, even though the file on the server is fine.
function loadPreset(file) {
  if (!PRESETS.some(p => p.file === file)) return; // only load known files
  const get = bust => fetch(PRESET_BASE + file + (bust ? `?r=${Date.now()}` : ''),
                            bust ? { cache: 'reload' } : {})
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
  get(false)
    .catch(() => get(true))
    .then(yaml => { _selectedPreset = file; loadConfigFromYaml(yaml); updatePresetSelect(); })
    .catch(err => {
      alert(`Failed to load preset ${PRESET_BASE + file}: ${err.message}. ` +
            'Check your connection and try again.');
      console.error(err); renderSidebar();
    });
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
    const VALID_MODELS = new Set(['pointmass','sie','nie','epl','shear','convergence','deflection','gaussian','exponential','point','pointsource','pastedimage']);
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
        // Legacy configs stored the point-mass strength as thetaE; it is a
        // deflection scale, not an Einstein radius, so it is now called b.
        if (model === 'pointmass' && params.thetaE !== undefined) {
          if (params.b === undefined) params.b = params.thetaE;
          delete params.thetaE;
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
    // Freeze pasted-image angular size for legacy configs that predate angSize, so
    // they too stay fixed under FOV zoom (state.fov was set from cfg above).
    for (const _pl of state.planes)
      for (const _o of _pl.objects)
        if (_o.model === 'pastedimage' && !(_o.params.angSize > 0)) _o.params.angSize = state.fov;
    // Prefer a pure (non-hybrid) source as the initial selection. A hybrid lens is a
    // poor default focus, and selecting it would hijack the Fermat β_s through its
    // partner source (see _doRedraw). Fall back to the first object when none exists.
    let _selPlane = state.planes[0] ?? null;
    let _selObj   = _selPlane?.objects[0] ?? null;
    for (const _pl of state.planes) {
      const _src = _pl.objects.find(o => o.type === 'source' && !o.hybridId);
      if (_src) { _selPlane = _pl; _selObj = _src; break; }
    }
    state.selectedPlaneId = _selPlane?.id ?? null;
    state.selectedObjId   = _selObj?.id ?? null;
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
    state.showScaleBar    = _bool(cfg.showScaleBar,    CONFIG_DEFAULTS.showScaleBar);
    state.showRuler      = _bool(cfg.showRuler, CONFIG_DEFAULTS.showRuler);
    state.fermatUseSourcePos = _bool(cfg.fermatUseSourcePos, CONFIG_DEFAULTS.fermatUseSourcePos);
    // Numeric settings, validated against their allowed choices where applicable.
    state.critGridN     = [256, 512, 1024, 2048].includes(cfg.critGridN) ? cfg.critGridN : CONFIG_DEFAULTS.critGridN;
    state.renderScale   = ['auto', '1x', 'native'].includes(cfg.renderScale) ? cfg.renderScale : CONFIG_DEFAULTS.renderScale;
    if (PS_GRID_OPTIONS.includes(cfg.psGridN)) {
      state.psGridN = cfg.psGridN;
    } else if (isFinite(cfg.psGridStep) && cfg.psGridStep > 0) {
      // Legacy configs stored an absolute grid spacing (arcsec). Map to a point count.
      const s = cfg.psGridStep;
      state.psGridN = s >= 0.075 ? 150 : s >= 0.015 ? 300 : s >= 0.0075 ? 600 : 1200;
    } else {
      state.psGridN = CONFIG_DEFAULTS.psGridN;
    }
    state.critZs        = (isFinite(cfg.critZs) && cfg.critZs > 0) ? cfg.critZs : CONFIG_DEFAULTS.critZs;
    state.contourSpacing = isFinite(cfg.contourSpacing) ? Math.max(0.05, cfg.contourSpacing) : CONFIG_DEFAULTS.contourSpacing;
    state.contourScale = (cfg.contourScale === 'asinh' || cfg.contourScale === 1) ? 1 : 0;
    // Cosmology (flat ΛCDM): apply before invalidateDistances() below so the distance
    // matrix is built with the loaded values.
    state.H0      = (isFinite(cfg.H0) && cfg.H0 > 0) ? cfg.H0 : CONFIG_DEFAULTS.H0;
    state.Omega_m = (isFinite(cfg.Omega_m) && cfg.Omega_m >= 0 && cfg.Omega_m <= 1) ? cfg.Omega_m : CONFIG_DEFAULTS.Omega_m;
    setCosmology({ H0: state.H0, Omega_m: state.Omega_m });
    state.showTimeDelays = _bool(cfg.showTimeDelays, CONFIG_DEFAULTS.showTimeDelays);
    state.lineArt        = _bool(cfg.lineArt,        CONFIG_DEFAULTS.lineArt);
    state.lineArtPalette = LINE_ART_PALETTES[cfg.lineArtPalette] ? cfg.lineArtPalette : CONFIG_DEFAULTS.lineArtPalette;
    // Per-role color overrides: seed from the chosen palette, then apply any saved
    // custom colors (space-separated hex in LINE_ART_ROLES order; bad/missing → palette).
    state.lineArtColors  = paletteColors(state.lineArtPalette);
    if (typeof cfg.lineArtColors === 'string') {
      const cols = cfg.lineArtColors.trim().split(/\s+/);
      LINE_ART_ROLES.forEach(([role], i) => { if (COLOR_RE.test(cols[i])) state.lineArtColors[role] = cols[i]; });
    }
    state.lineArtFill    = _bool(cfg.lineArtFill,    CONFIG_DEFAULTS.lineArtFill);
    state.lineArtSmooth  = _bool(cfg.lineArtSmooth,  CONFIG_DEFAULTS.lineArtSmooth);
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
    resetHistory();  // a freshly loaded scene is a new document; don't undo into the previous one
    renderPlaneCard(); renderSidebar(); _updateColorbar(); updateRulerUI(); updateCanvasTools();
    setFov(state.fov);                      // sync the zoom readout + View input
    applyRenderScale(state.renderScale);    // push DPR mode into the renderer
    updatePresetSelect();
    redraw();
  } catch (err) {
    alert('Failed to load config: ' + err.message);
    console.error(err);
  }
}

function defaultParams(model) {
  if (model === 'pointmass')   return { b: 1.0 };
  if (model === 'sie')         return { b: 1.0, q: 0.75, phi: 0 };
  if (model === 'nie')         return { b: 1.0, q: 0.75, phi: 0, rc: 0.2 };
  if (model === 'epl')         return { b: 1.0, q: 0.75, phi: 0, gamma: 2.0 };
  if (model === 'shear')       return { gamma: 0.05, phi: 0 };
  if (model === 'convergence') return { kappa: 0.05 };
  if (model === 'deflection')  return { alpha: 0.1, phi: 0 };
  if (model === 'gaussian')    return { sigma: 0.06, q: 1.0,  phi: 0, amplitude: 1.0,  color: '#ffffff' };
  if (model === 'exponential') return { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20, color: '#ffffff' };
  if (model === 'point')       return { sigma: 0.08, q: 1.0, phi: 0, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pointsource') return { sigma: 0.05, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pastedimage') return { sigma: 1.0, amplitude: 1.0, angSize: 0 };
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

function trashIcon() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
       </svg>`;
}

// Per-part show/hide + delete controls for one half of a hybrid object.
// kind: 'lens' | 'src'. Rendered inside the section header, so their click
// handlers must stopPropagation to avoid toggling the section's expansion.
function hybridPartControls(part, kind) {
  const label = kind === 'lens' ? 'lens' : 'source';
  return `<button type="button" class="sl-hybrid-part-btn${part.hidden ? ' sl-obj-hidden' : ''}" id="sl-part-vis-${kind}" title="${part.hidden ? 'Show' : 'Hide'} ${label}">${eyeIcon(part.hidden)}</button>
    <button type="button" class="sl-hybrid-part-btn sl-hybrid-part-del" id="sl-part-del-${kind}" title="Delete ${label} (keeps the other)">${trashIcon()}</button>`;
}

// Brief transient message centered over the image stage; auto-dismisses. Reuses a
// single element so rapid calls just refresh the text and restart the timer.
let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('sl-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sl-toast';
    el.className = 'sl-toast';
    (document.querySelector('.sl-stage') || document.body).appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('sl-toast-show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('sl-toast-show'), 2200);
}

function addPlane(z) {
  // Hard cap: the shader renders at most MAX_PLANES, so refuse to create beyond it
  // rather than silently dropping the excess from the image (see showToast feedback
  // in the interactive callers). Returns null when the scene is already full.
  if (state.planes.length >= MAX_PLANES) return null;
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

// ── Time-delay eligibility ──────────────────────────────────────────────────
// Relative image time delays are annotated whenever there is at least one lens plane.
// They are computed from the full multiplane arrival-time surface (_computeFullFermat),
// so they are correct for one OR several lens planes: the physical delay is
// Δt = Δφ_raw/c and the normalisation constant K cancels (see _fermatDtDist). For a
// single lens plane K equals the time-delay distance D_Δt = (1+z_L)D_L D_S/D_LS exactly.
// Counts distinct lens REDSHIFTS so lenses stacked on separate UI planes at the same z
// count once; this drives display copy but availability only needs one lens plane.
function lensPlaneCount() {
  const zs = new Set();
  for (const p of state.planes)
    if (p.objects.some(o => !o.hidden && o.type === 'lens')) zs.add(Math.round(p.z / 1e-4));
  return zs.size;
}
function timeDelaysAvailable() { return lensPlaneCount() >= 1; }
// Redshift of the first (lowest-z) plane holding a visible lens; null if none. state.planes
// is kept sorted by z, so find() returns the nearest lens plane to the observer.
function firstLensPlaneZ() {
  const p = state.planes.find(pl => pl.objects.some(o => !o.hidden && o.type === 'lens'));
  return p ? p.z : null;
}

// ── Undo / redo (scene edits only: planes, objects, params — not view settings) ──
// Memento approach: snapshot the scene before a change, restore it on undo. The
// snapshot reuses the deep-clone shape from copySelectedObject; pasted-image
// canvases are kept by reference so images survive undo/redo. View settings (FOV,
// viz mode, colour mapping, overlays) are deliberately excluded.
const _history = { undo: [], redo: [], MAX: 80, pending: null, pendingSig: null };

function _sceneSnapshot() {
  return {
    planes: state.planes.map(p => ({
      id: p.id, z: p.z,
      objects: p.objects.map(o => ({ ...o, params: { ...o.params } })),
    })),
    selPlaneId: state.selectedPlaneId,
    selObjId:   state.selectedObjId,
  };
}
// Signature of just the undoable content (structure, positions, params) — excludes
// view settings, selection and ids — used to decide whether anything really changed.
function _sceneSig() {
  return JSON.stringify(state.planes.map(p =>
    [p.z, p.objects.map(o => [o.type, o.model, o.cx, o.cy, o.hidden, o.showShape, o.hybridId ?? '', o.params])]));
}
function _pushUndo(snap) {
  _history.undo.push(snap);
  if (_history.undo.length > _history.MAX) _history.undo.shift();
  _history.redo.length = 0;
  updateUndoRedoButtons();
}
// Discrete edit: call immediately BEFORE mutating (keyboard / paste / async paths).
// Clears any open gesture snapshot so it can't later record a stale baseline.
function record() {
  _history.pending = null; _history.pendingSig = null;
  _pushUndo(_sceneSnapshot());
}
// Gesture: snapshot at the start, commit once at the end if the scene changed.
// beginAction is idempotent so continuous events (a drag, a slider) share one snapshot.
function beginAction() {
  if (_history.pending) return;
  _history.pending    = _sceneSnapshot();
  _history.pendingSig = _sceneSig();
}
// Commit fires on pointerup, click AND change, because different controls mutate at
// different moments (drags/sliders before pointerup; buttons on click; selects/
// checkboxes/colours on change — all after pointerup). On a no-op we deliberately
// KEEP the pending snapshot so a later click/change in the same interaction can still
// record it; the scene is unchanged meanwhile, so the held snapshot stays valid.
function commitAction() {
  if (!_history.pending) return;
  if (_sceneSig() !== _history.pendingSig) {
    _pushUndo(_history.pending);
    _history.pending = null; _history.pendingSig = null;
  }
}
function resetHistory() {
  _history.undo.length = 0; _history.redo.length = 0;
  _history.pending = null; _history.pendingSig = null;
  updateUndoRedoButtons();
}
// Attach gesture boundaries to a persistent container: begin before its inner
// handlers mutate (capture), commit after (bubble). Any pointer-driven scene edit
// inside `el` becomes exactly one undo step; non-edits (selection, ruler) are no-ops.
function _attachHistoryBoundary(el) {
  if (!el) return;
  el.addEventListener('pointerdown', beginAction, true);  // capture: before inner handlers mutate
  el.addEventListener('focusin', beginAction);             // keyboard-focused sliders/inputs
  el.addEventListener('pointerup', commitAction);          // drags & sliders
  el.addEventListener('pointercancel', commitAction);
  el.addEventListener('click', commitAction);              // buttons (fire after pointerup)
  el.addEventListener('change', commitAction);             // selects, checkboxes, colours
}
function _applyHistorySnapshot(snap) {
  _history.pending = null; _history.pendingSig = null;  // discard any open gesture snapshot
  const keep = new Set(snap.planes.flatMap(p => p.objects.map(o => o.id)));
  // Drop GPU textures for pasted images that won't exist after the restore.
  for (const p of state.planes)
    for (const o of p.objects)
      if (o.model === 'pastedimage' && !keep.has(o.id)) renderer?.clearPastedTexture(o.id);
  state.planes = snap.planes.map(p => ({
    id: p.id, z: p.z,
    objects: p.objects.map(o => ({ ...o, params: { ...o.params } })),
  }));
  state.selectedPlaneId = state.planes.some(p => p.id === snap.selPlaneId)
    ? snap.selPlaneId : (state.planes[0]?.id ?? null);
  const selPlane = state.planes.find(p => p.id === state.selectedPlaneId);
  state.selectedObjId = selPlane?.objects.some(o => o.id === snap.selObjId)
    ? snap.selObjId : (selPlane?.objects[0]?.id ?? null);
  // Re-register pasted textures from the preserved canvases.
  for (const p of state.planes)
    for (const o of p.objects)
      if (o.model === 'pastedimage' && o.pasteCanvas) renderer?.setPastedTexture(o.id, o.pasteCanvas);
  invalidateDistances();
  renderPlaneCard(); renderSidebar(); redraw();
  updateUndoRedoButtons();
}
function undo() {
  if (!_history.undo.length) return;
  _history.redo.push(_sceneSnapshot());
  _applyHistorySnapshot(_history.undo.pop());
}
function redo() {
  if (!_history.redo.length) return;
  _history.undo.push(_sceneSnapshot());
  _applyHistorySnapshot(_history.redo.pop());
}
function updateUndoRedoButtons() {
  const u = document.getElementById('sl-undo'), r = document.getElementById('sl-redo');
  if (u) u.disabled = _history.undo.length === 0;
  if (r) r.disabled = _history.redo.length === 0;
}

function deleteSelectedObject() {
  const pl = selectedPlane();
  if (!pl) return;
  const toDelete = pl.objects.find(o => o.id === state.selectedObjId);
  if (!toDelete) return;
  record();
  // Delete hybrid partner too (both halves always travel together).
  const removeIds = new Set(pl.objects
    .filter(o => o.id === toDelete.id || (toDelete.hybridId && o.hybridId === toDelete.hybridId))
    .map(o => o.id));
  pl.objects.filter(o => removeIds.has(o.id) && o.model === 'pastedimage')
            .forEach(o => renderer?.clearPastedTexture(o.id));
  pl.objects = pl.objects.filter(o => !removeIds.has(o.id));
  state.selectedObjId = pl.objects[0]?.id ?? null;
  renderSidebar(); renderPlaneCard(); redraw();
}

// Delete one half of a hybrid object, leaving its partner as a standalone
// (non-hybrid) object. The partner keeps its params and position.
function deleteHybridPart(plane, partId) {
  const part = plane.objects.find(o => o.id === partId);
  if (!part) return;
  record();  // its buttons stopPropagation, so the container boundary can't see this click
  const partner = hybridPartner(plane, part);
  if (part.model === 'pastedimage') renderer?.clearPastedTexture(part.id);
  plane.objects = plane.objects.filter(o => o.id !== partId);
  if (partner) { delete partner.hybridId; state.selectedObjId = partner.id; }
  else         { state.selectedObjId = plane.objects[0]?.id ?? null; }
  renderSidebar(); renderPlaneCard(); redraw();
}

// Copy the selected object (and its hybrid partner, if any) into the internal
// clipboard. Returns true if something was copied.
function copySelectedObject() {
  const pl = selectedPlane(), obj = selectedObj();
  if (!pl || !obj) return false;
  const partner = hybridPartner(pl, obj);
  const group = partner ? [obj, partner] : [obj];
  _objClipboard = {
    planeId:  pl.id,
    isHybrid: !!partner,
    objects:  group.map(o => ({
      type: o.type, model: o.model, cx: o.cx, cy: o.cy,
      params: { ...o.params }, showShape: o.showShape, hidden: o.hidden,
      pasteCanvas: o.pasteCanvas || null,   // pastedimage: preserve the image
    })),
  };
  return true;
}

// Paste the copied object(s) into the currently selected plane (falling back to the
// plane they were copied from) at the same position, with fresh ids (and a fresh
// shared hybridId if it was a hybrid). Selects the new object.
function pasteCopiedObject() {
  if (!_objClipboard) return false;
  const pl = selectedPlane() ?? state.planes.find(p => p.id === _objClipboard.planeId);
  if (!pl) return false;
  record();
  const newHybridId = _objClipboard.isHybrid ? uid() : null;
  let firstId = null;
  for (const spec of _objClipboard.objects) {
    const o = {
      id: uid(), type: spec.type, model: spec.model, cx: spec.cx, cy: spec.cy,
      params: { ...spec.params }, showShape: spec.showShape, hidden: spec.hidden,
    };
    if (newHybridId) o.hybridId = newHybridId;
    pl.objects.push(o);
    // A pasted image is stored per-object id, so register a texture for the copy.
    if (spec.model === 'pastedimage' && spec.pasteCanvas) {
      o.pasteCanvas = spec.pasteCanvas;
      renderer?.setPastedTexture(o.id, spec.pasteCanvas);
    }
    if (!firstId) firstId = o.id;
  }
  state.selectedPlaneId = pl.id;
  state.selectedObjId   = firstId;
  clearRulerSelectionForObject();  // one selection at a time
  renderPlaneCard(); renderSidebar(); redraw();
  return true;
}

function selectedPlane() { return state.planes.find(p => p.id === state.selectedPlaneId) ?? null; }
function selectedObj() {
  const pl = selectedPlane();
  return pl ? (pl.objects.find(o => o.id === state.selectedObjId) ?? null) : null;
}

// Pasted images are stored per-object on obj.pasteCanvas (HTMLCanvasElement|null).
let activeTab = 'scene'; // 'scene' | 'view' | 'data' | 'export'

// ── DOM refs ──────────────────────────────────────────────────────────────────
let renderer = null, glCanvas = null, overlayCtx = null;
let axisCanvas = null;
let _planeLevels      = new Map();  // plane.id → bump level, kept in sync with drawAxisCanvas
let _axisBaselineY    = 0;          // axis line y (CSS px); set by drawAxisCanvas, read by nearestMarker
let _axisBumpStep     = 28;         // per-level marker bump (CSS px); adaptive on mobile
let _draggingPlaneId  = null;       // id of the plane currently being axis-dragged
let _arrowKeyStart    = 0;          // timestamp of the first keydown in the current arrow-key hold

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init)

function init() {
  buildDOM();

  try {
    renderer = new Renderer(glCanvas);
  } catch (err) {
    console.error('Caustica renderer init failed:', err);
    showRendererError(err.message);
  }

  loadDemoState();
  setCosmology({ H0: state.H0, Omega_m: state.Omega_m });  // sync lens.js with state defaults
  invalidateDistances();
  attachHandlers();
  renderPlaneCard();
  renderSidebar();
  updateCanvasTools();  // highlight the initial (select) viewer tool
  resetHistory();  // the initial demo scene is the baseline, not an undoable edit
  _initTourNudge();

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
  renderPlaneCard(); renderSidebar(); redraw();
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
        <div class="sl-undo-group">
          <button class="sl-undo-btn" id="sl-undo" title="Undo (⌘/Ctrl+Z)" aria-label="Undo" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>
            </svg>
          </button>
          <button class="sl-undo-btn" id="sl-redo" title="Redo (⌘/Ctrl+Shift+Z)" aria-label="Redo" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M15 14 20 9l-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/>
            </svg>
          </button>
        </div>
        <div class="sl-file-group" id="sl-file-group">
          <select class="sl-select sl-topbar-preset" id="sl-preset-select" aria-label="Load a preset scene">
            <option value="" selected>Presets…</option>
            ${PRESETS.map(p => `<option value="${p.file}">${p.name}</option>`).join('')}
          </select>
          <button class="sl-demo-btn sl-topbar-overflow" id="sl-save-config" title="Download the current scene as a YAML file">↓ Save</button>
          <button class="sl-demo-btn sl-topbar-overflow" id="sl-load-config" title="Load a scene from a YAML file">↑ Load</button>
          <input type="file" id="sl-config-file" accept=".yaml,.yml" style="display:none">
        </div>
<a class="sl-demo-btn sl-topbar-overflow" href="/caustica-documentation/" target="_blank" rel="noopener">Docs</a>
        <button class="sl-demo-btn sl-topbar-overflow" id="sl-demo" title="Walk through a tour of the controls">Tour</button>
        <button class="sl-demo-btn sl-topbar-overflow" id="sl-kbd-btn" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
        <button class="sl-theme-btn" id="sl-theme" title="Toggle dark mode (D)" aria-label="Toggle dark mode">
          <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
        <!-- Mobile-only overflow menu: keeps the top bar to one row (undo/redo +
             presets stay visible; everything else moves into this dropdown). -->
        <button class="sl-menu-btn" id="sl-menu-btn" aria-label="More options" aria-haspopup="true" aria-expanded="false" title="More">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
        <div class="sl-topbar-menu" id="sl-topbar-menu" role="menu" hidden>
          <button class="sl-menu-item" role="menuitem" data-fwd="sl-save-config">Save config</button>
          <button class="sl-menu-item" role="menuitem" data-fwd="sl-load-config">Load config</button>
          <a class="sl-menu-item" role="menuitem" href="/caustica-documentation/" target="_blank" rel="noopener">Docs</a>
          <button class="sl-menu-item" role="menuitem" data-fwd="sl-demo">Tour</button>
          <button class="sl-menu-item" role="menuitem" data-fwd="sl-kbd-btn">Keyboard shortcuts</button>
        </div>
      </div>
      <div class="sl-body" data-tab="scene">
        <div class="sl-stage" id="sl-stage">
          <div class="sl-image-wrap" id="sl-image-wrap">
            <canvas id="sl-gl-canvas"></canvas>
            <canvas class="sl-overlay" id="sl-overlay"></canvas>
            <div class="sl-rec-dot" id="sl-rec-dot" style="display:none"></div>
            <button class="sl-perf-warn" id="sl-perf-warn" style="display:none"
                    title="This scene is slow to redraw. Click for options." aria-label="Performance warning">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 4.5 L21 19.5 L3 19.5 Z"/>
                <line x1="12" y1="10" x2="12" y2="14"/>
                <line x1="12" y1="16.6" x2="12" y2="16.6"/>
              </svg>
            </button>
            <div class="sl-perf-pop" id="sl-perf-pop" style="display:none">
              <button class="sl-perf-pop-close" id="sl-perf-dismiss" title="Don't show this warning again this session" aria-label="Dismiss warning">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <line x1="4.5" y1="4.5" x2="11.5" y2="11.5"/>
                  <line x1="11.5" y1="4.5" x2="4.5" y2="11.5"/>
                </svg>
              </button>
              <b style="color:#e8912e">⚠ Slow redraw</b><br>
              If you would like to reduce the time to draw new frames, try the following:<br><br>
              • Turn off critical curves or lower the <b>Critical curves</b> resolution (Settings)<br>
              • If a point source is present, lower the <b>Point source</b> grid density (Settings)<br>
              • Lower the <b>Render scale</b> (Settings)<br>
              • Reduce the number of objects<br>
              • Reduce the field of view
            </div>
            <button class="sl-cap-warn" id="sl-cap-warn" style="display:none"
                    title="Some objects exceed the display limit. Click for details." aria-label="Object display-limit warning">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 4.5 L21 19.5 L3 19.5 Z"/>
                <line x1="12" y1="10" x2="12" y2="14"/>
                <line x1="12" y1="16.6" x2="12" y2="16.6"/>
              </svg>
              <span class="sl-cap-warn-label" id="sl-cap-warn-label">objects not shown</span>
            </button>
            <div class="sl-cap-pop" id="sl-cap-pop" style="display:none">
              <button class="sl-perf-pop-close" id="sl-cap-dismiss" title="Don't show this warning again this session" aria-label="Dismiss warning">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <line x1="4.5" y1="4.5" x2="11.5" y2="11.5"/>
                  <line x1="11.5" y1="4.5" x2="4.5" y2="11.5"/>
                </svg>
              </button>
              <b style="color:#e8912e">⚠ Display limit reached</b><br>
              <span id="sl-cap-pop-detail"></span>
            </div>
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
            <div class="sl-overlay-chips" id="sl-overlay-chips">
              <button data-flag="showCritCurves" title="Critical curves (C)" aria-label="Toggle critical curves" aria-pressed="false">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/></svg>
              </button>
              <button data-flag="showCaustics" title="Caustics (C)" aria-label="Toggle caustics" aria-pressed="false">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5 C 9 6.5, 9.5 7, 13.5 8 C 9.5 9, 9 9.5, 8 13.5 C 7 9.5, 6.5 9, 2.5 8 C 6.5 7, 7 6.5, 8 2.5 Z"/></svg>
              </button>
              <button data-flag="showMarkers" title="Position markers" aria-label="Toggle position markers" aria-pressed="false">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5 L13 12.5 H3 Z"/></svg>
              </button>
              <button data-flag="showColorbar" title="Colorbar" aria-label="Toggle colorbar" aria-pressed="false">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="6" width="12" height="4.5" rx="1"/><line x1="6" y1="6" x2="6" y2="10.5"/><line x1="10" y1="6" x2="10" y2="10.5"/></svg>
              </button>
            </div>
            <div class="sl-zs-chip" id="sl-zs-chip" style="display:none"></div>
            <div class="sl-colorbar" id="sl-colorbar" style="display:none">
              <div class="sl-colorbar-bar" id="sl-colorbar-bar"></div>
              <div class="sl-colorbar-labels">
                <span id="sl-colorbar-min"></span>
                <span id="sl-colorbar-title"></span>
                <span id="sl-colorbar-max"></span>
              </div>
            </div>
            <div class="sl-ruler-tools" id="sl-ruler-tools" style="display:none">
              <button class="sl-ruler-btn" id="sl-ruler-btn" title="Ruler: measure distance/angle (L)">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1.5" y="5" width="13" height="6" rx="1"/>
                  <line x1="4.5"  y1="5" x2="4.5"  y2="8"/>
                  <line x1="8"    y1="5" x2="8"    y2="8.5"/>
                  <line x1="11.5" y1="5" x2="11.5" y2="8"/>
                </svg>
              </button>
              <!-- Clear-all comes before delete so its horizontal position stays
                   fixed whether or not a ruler is selected (delete appears/disappears
                   at the far right instead of shifting clear-all over). -->
              <button class="sl-ruler-clear" id="sl-ruler-clear" title="Clear all measurements" style="display:none">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="4.5" y1="4.5" x2="11.5" y2="11.5"/>
                  <line x1="11.5" y1="4.5" x2="4.5" y2="11.5"/>
                </svg>
              </button>
              <button class="sl-ruler-del" id="sl-ruler-del" title="Delete selected measurement (Backspace)" style="display:none">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="3" y1="4.5" x2="13" y2="4.5"/>
                  <path d="M4.5 4.5 L5.1 13 a1 1 0 0 0 1 .9 H9.4 a1 1 0 0 0 1 -.9 L11.5 4.5"/>
                  <path d="M6.3 4.5 V3.3 a0.9 0.9 0 0 1 .9 -.9 H8.8 a0.9 0.9 0 0 1 .9 .9 V4.5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="sl-timeline" id="sl-timeline">
          <div class="sl-axis-wrap">
            <div class="sl-axis-label">redshift z →</div>
            <canvas class="sl-axis-canvas" id="sl-axis-canvas"></canvas>
            <div class="sl-zmax-ctl">
              <label for="sl-zmax">z<sub>max</sub></label>
              <input type="number" id="sl-zmax" min="0.1" max="10" step="0.1">
            </div>
          </div>
          <div class="sl-timeline-caption" id="sl-timeline-caption">
            <span>redshift z →</span>
            <span>Tap to add a plane</span>
          </div>
        </div>
        <div class="sl-rail" id="sl-rail">
          <div class="sl-rail-tabs" id="sl-rail-tabs">
            <button class="sl-rail-tab-btn sl-mobile-only-tab" data-tab="object">Object</button>
            <button class="sl-rail-tab-btn active" data-tab="scene"><span class="sl-tablabel-obj">Object</span><span class="sl-tablabel-scene">Scene</span></button>
            <button class="sl-rail-tab-btn" data-tab="view">View</button>
            <button class="sl-rail-tab-btn" data-tab="export">Export</button>
            <button class="sl-rail-tab-btn sl-tab-gear" data-tab="quality" title="Settings" aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
          </div>
          <div class="sl-tab-content active" id="sl-tab-scene">
            <div id="sl-obj-panel"></div>
          </div>
          <div class="sl-tab-content" id="sl-tab-view"></div>
          <div class="sl-tab-content" id="sl-tab-export"></div>
          <div class="sl-tab-content" id="sl-tab-quality"></div>
          <!-- Plane viewer: a direct child of the rail (not a tab), so on desktop
               it stays pinned below whichever tab is open. On mobile it is shown
               only under the Scene tab (see the responsive rules). -->
          <div class="sl-plane-card" id="sl-plane-card" data-effective-type="empty">
              <div class="sl-plane-body" id="sl-plane-body">
                <div class="sl-plane-tools" id="sl-plane-tools">
                  <button class="sl-ctool-btn" data-tool="lens"   title="Add lens — click this panel to place (1). Click again to stop adding." aria-label="Add lens tool">L</button>
                  <button class="sl-ctool-btn" data-tool="source" title="Add source — click this panel to place (2). Click again to stop adding." aria-label="Add source tool">S</button>
                  <button class="sl-ctool-btn" data-tool="hybrid" title="Add hybrid — click this panel to place (3). Click again to stop adding." aria-label="Add hybrid tool">H</button>
                  <button class="sl-ctool-del" id="sl-card-del-obj" title="Delete selected object" aria-label="Delete selected object"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1.5" y1="4" x2="12.5" y2="4"/><path d="M4 4l.5 7h5l.5-7"/><path d="M5 4V3h4v1"/></svg></button>
                </div>
                <div class="sl-plane-spacer" aria-hidden="true"></div>
                <div class="sl-plane-viewgroup" id="sl-plane-viewgroup">
                  <button class="sl-plane-arrow" id="sl-plane-prev" title="Select the previous plane (lower z)" aria-label="Select previous plane">‹</button>
                  <canvas class="sl-plane-canvas" id="sl-plane-canvas"></canvas>
                  <button class="sl-plane-arrow" id="sl-plane-next" title="Select the next plane (higher z)" aria-label="Select next plane">›</button>
                </div>
                <div class="sl-plane-spacer" aria-hidden="true"></div>
                <div class="sl-plane-side" id="sl-plane-side">
                  <label class="sl-plane-z"><span class="sl-plane-z-label sl-plane-z-label-full">Redshift:</span><span class="sl-plane-z-label sl-plane-z-label-compact">z</span><input type="number" class="sl-plane-z-input" id="sl-plane-z-input" min="0.01" step="0.01" aria-label="Plane redshift"></label>
                  <button class="sl-plane-paste" id="sl-plane-paste" title="Load image from file" style="display:none"><svg width="12" height="11" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3.5V10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4.5a1 1 0 0 0-1-1H7L5.5 2H2a1 1 0 0 0-1 1.5z"/></svg> <span class="sl-plane-btn-label">Image</span></button>
                  <div class="sl-plane-side-bottom">
                    <div class="sl-plane-side-label">Plane:</div>
                    <button class="sl-plane-clear" id="sl-plane-clear" title="Clear all objects on this plane (O)"><span class="sl-pglyph">○</span> <span class="sl-plane-btn-label">Clear</span></button>
                    <button class="sl-plane-del" id="sl-plane-del" title="Delete plane (X)"><span class="sl-pglyph sl-pglyph-x">×</span> <span class="sl-plane-btn-label">Delete</span></button>
                  </div>
                </div>
              </div>
              <div class="sl-plane-empty" id="sl-plane-empty" style="display:none">Click the redshift timeline to add a plane, or click a marker to select one.</div>
          </div>
        </div>
      </div>
      <div class="sl-rotate-overlay" id="sl-rotate-overlay" role="alert">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="7" y="3" width="10" height="18" rx="2" transform="rotate(90 12 12)"/>
          <path d="M4 6 A 9 9 0 0 1 10 2.4" />
          <path d="M10 2.4 L 7.6 2.2 M10 2.4 L 8.9 4.6" />
        </svg>
        <p>This window is too short for Caustica.<br>Rotate your device upright, or make the window taller.</p>
      </div>
    </div>`;

  glCanvas   = document.getElementById('sl-gl-canvas');
  axisCanvas = document.getElementById('sl-axis-canvas');
  overlayCtx = document.getElementById('sl-overlay').getContext('2d');

  // Hidden file input for the plane card's "load image" button (pasted-image objects).
  const planeFile = document.createElement('input');
  planeFile.type = 'file'; planeFile.accept = 'image/*'; planeFile.style.display = 'none';
  planeFile.id = 'sl-plane-file';
  document.getElementById('sl-plane-card').appendChild(planeFile);
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function attachHandlers() {
  document.getElementById('sl-demo').addEventListener('click', startTour);
  document.getElementById('sl-theme').addEventListener('click', toggleTheme);
  document.getElementById('sl-kbd-btn').addEventListener('click', toggleKbdOverlay);
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');

  // Rail tab bar (Scene / View / Export / Quality) — one tab system for desktop and mobile.
  document.getElementById('sl-rail-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.sl-rail-tab-btn');
    if (btn) setRailTab(btn.dataset.tab);
  });

  // Topbar file cluster: presets + YAML save/load (static DOM, wired once).
  document.getElementById('sl-save-config').addEventListener('click', saveConfig);
  document.getElementById('sl-load-config').addEventListener('click', () => {
    document.getElementById('sl-config-file')?.click();
  });
  document.getElementById('sl-config-file').addEventListener('change', e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { _selectedPreset = ''; loadConfigFromYaml(ev.target.result); updatePresetSelect(); };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be loaded again
  });
  document.getElementById('sl-preset-select').addEventListener('change', e => {
    // Drop focus so subsequent keystrokes hit the app shortcuts, not the
    // select's native type-ahead (which would silently load another preset).
    e.target.blur();
    const file = e.target.value;
    if (file) loadPreset(file);
    else updatePresetSelect(); // placeholder re-chosen: restore the current label
  });

  // Mobile overflow menu (⋯): a dropdown for the topbar items that don't fit on
  // one phone row. Each item forwards its click to the real (hidden) control, so
  // there is no duplicated logic and the desktop bar is untouched.
  const _menuBtn  = document.getElementById('sl-menu-btn');
  const _menuPop  = document.getElementById('sl-topbar-menu');
  const _closeMenu = () => { _menuPop.hidden = true; _menuBtn.setAttribute('aria-expanded', 'false'); };
  const _openMenu  = () => { _menuPop.hidden = false; _menuBtn.setAttribute('aria-expanded', 'true'); };
  _menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    _menuPop.hidden ? _openMenu() : _closeMenu();
  });
  _menuPop.addEventListener('click', e => {
    const item = e.target.closest('.sl-menu-item');
    if (!item) return;
    const fwd = item.dataset.fwd;
    if (fwd) document.getElementById(fwd)?.click(); // Docs is a plain link, no fwd
    _closeMenu();
  });
  // Dismiss on an outside tap or Escape.
  document.addEventListener('click', e => {
    if (!_menuPop.hidden && !_menuPop.contains(e.target) && !_menuBtn.contains(e.target)) _closeMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !_menuPop.hidden) _closeMenu(); });

  // Plane-viewer tool column (select / add-lens / add-source / add-hybrid),
  // plus delete-selected-object. The chosen tool decides what a click on the
  // viewer canvas does: select only picks/drags, L/S/H place that type.
  document.getElementById('sl-plane-tools').addEventListener('click', e => {
    const btn = e.target.closest('.sl-ctool-btn');
    if (btn) { setCanvasTool(btn.dataset.tool); return; }
    if (e.target.closest('#sl-card-del-obj')) deleteSelectedObject();
  });

  // Plane card: static header controls + the (single, persistent) plane canvas.
  const _zIn = document.getElementById('sl-plane-z-input');
  const _applyPlaneZ = v => {
    const pl = selectedPlane();
    if (!pl || !isFinite(v)) return;
    pl.z = Math.max(0.01, Math.min(state.zMax, Math.round(v * 100) / 100));
    state.planes.sort((a, b) => a.z - b.z);
    invalidateDistances();
    drawAxisCanvas(); renderPlaneCard(); redraw();
    const zEl = document.querySelector('#sl-obj-panel .sl-params-z');
    if (zEl && selectedPlane()) zEl.textContent = `z: ${selectedPlane().z.toFixed(2)}`;
    updateThetaEReadout();
  };
  _zIn.addEventListener('change', e => { record(); _applyPlaneZ(parseFloat(e.target.value)); });
  _attachScrub(_zIn, { lo: 0.01, hi: 15, onChange: _applyPlaneZ });
  document.getElementById('sl-plane-clear').addEventListener('click', () => {
    const pl = selectedPlane(); if (!pl) return;
    record();
    pl.objects.filter(o => o.model === 'pastedimage').forEach(o => renderer?.clearPastedTexture(o.id));
    pl.objects = [];
    state.selectedObjId = null;
    renderPlaneCard(); renderSidebar(); redraw();
  });
  document.getElementById('sl-plane-del').addEventListener('click', () => {
    const pl = selectedPlane(); if (!pl) return;
    removePlane(pl.id); renderPlaneCard(); renderSidebar(); redraw();
  });
  document.getElementById('sl-plane-paste').addEventListener('click', () => {
    document.getElementById('sl-plane-file')?.click();
  });
  document.getElementById('sl-plane-prev').addEventListener('click', () => selectPlaneOffset(-1));
  document.getElementById('sl-plane-next').addEventListener('click', () => selectPlaneOffset(1));
  document.getElementById('sl-plane-file').addEventListener('change', e => {
    const pl = selectedPlane();
    const target = pl?.objects.find(o => o.model === 'pastedimage');
    const file = e.target.files?.[0];
    if (file && target) { state.selectedObjId = target.id; _applyImageFile(file, target); }
    e.target.value = '';
  });
  attachPlaneCardHandlers(document.getElementById('sl-plane-canvas'));

  // Timeline z_max control (static DOM, wired once).
  const _zmaxEl = document.getElementById('sl-zmax');
  _zmaxEl.value = state.zMax;
  _zmaxEl.addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { state.zMax = v; drawAxisCanvas(); } });
  _attachScrub(_zmaxEl, { lo: 0.1, hi: 10, onChange: v => { state.zMax = v; drawAxisCanvas(); } });

  // Overlay chips: quick canvas-side toggles for the same state as the View tab.
  document.getElementById('sl-overlay-chips').addEventListener('click', e => {
    const btn = e.target.closest('button[data-flag]');
    if (!btn) return;
    const flag = btn.dataset.flag;
    state[flag] = !state[flag];
    if (flag === 'showColorbar') _updateColorbar();
    updateOverlayChips();
    if (activeTab === 'view') renderSidebar();
    redraw();
  });

  // Zoom cluster + wheel + pinch.
  attachZoomHandlers(document.getElementById('sl-image-wrap'));

  const _VIZ_LABELS ={ '0':'Lensed image','1':'Convergence κ','2':'Shear γ','3':'Magnification |μ|','5':'Deflection |α|','6':'Fermat potential φ' };
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
    e.target.blur();  // keep letter shortcuts (K/G/M/A/I/T) from hitting the select's type-ahead
    setVizMode(parseInt(e.target.value, 10));
  });
  document.getElementById('sl-viz-mode')?.addEventListener('blur', () => _setVizOptionLabels(false));

  attachAxisHandlers();
  attachImageHandlers(document.getElementById('sl-image-wrap'));

  // Performance warning badge (bottom-right of image). Lives in the persistent
  // #app markup, so wire it once here rather than in the per-render handler block.
  const _perfBtn = document.getElementById('sl-perf-warn');
  const _perfPop = document.getElementById('sl-perf-pop');
  _perfBtn?.addEventListener('pointerdown', e => e.stopPropagation()); // don't start an object drag
  _perfBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (_perfPop) _perfPop.style.display = _perfPop.style.display === 'none' ? '' : 'none';
  });
  // The × dismisses the warning for the rest of the session: hide the badge and
  // popover now, and reportPerf() will keep them hidden regardless of frame time.
  document.getElementById('sl-perf-dismiss')?.addEventListener('click', e => {
    e.stopPropagation();
    _perfWarnDismissed = true;
    _perfWarnOn = false;
    if (_perfPop) _perfPop.style.display = 'none';
    if (_perfBtn) _perfBtn.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (_perfPop && _perfPop.style.display !== 'none' &&
        !_perfPop.contains(e.target) && e.target !== _perfBtn) {
      _perfPop.style.display = 'none';
    }
  });

  // Object display-limit warning (top-left of image). Badge is shown/hidden by
  // reportObjectCap() based on live count; clicking it toggles the explanation.
  const _capBtn = document.getElementById('sl-cap-warn');
  const _capPop = document.getElementById('sl-cap-pop');
  _capBtn?.addEventListener('pointerdown', e => e.stopPropagation()); // don't start an object drag
  _capBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (_capPop) _capPop.style.display = _capPop.style.display === 'none' ? '' : 'none';
  });
  // The × dismisses the warning for the rest of the session: hide the badge and
  // popover now, and reportObjectCap() will keep them hidden regardless of count.
  document.getElementById('sl-cap-dismiss')?.addEventListener('click', e => {
    e.stopPropagation();
    _capWarnDismissed = true;
    if (_capPop) _capPop.style.display = 'none';
    if (_capBtn) _capBtn.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (_capPop && _capPop.style.display !== 'none' &&
        !_capPop.contains(e.target) && e.target !== _capBtn && !_capBtn?.contains(e.target)) {
      _capPop.style.display = 'none';
    }
  });

  // Ruler tool: toggle activates the crosshair; the × clears all measurements.
  // Handle the tap on the button's own pointerdown and stopPropagation, so the
  // image-wrap beneath never sees it. This is essential on touch: while the ruler
  // is armed, if the wrap sees the pointerdown it calls setPointerCapture and
  // steals the pointer, so the follow-up pointerup/click lands on the wrap and
  // the button never fires — which is why the ruler couldn't be toggled off on
  // mobile. Firing on pointerdown also sidesteps the unreliable synthesized
  // click. Works identically for mouse and touch.
  const _onTap = (id, fn) => {
    const el = document.getElementById(id);
    el?.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  };
  _onTap('sl-ruler-btn', toggleRulerTool);
  _onTap('sl-ruler-del', deleteSelectedRuler);
  _onTap('sl-ruler-clear', () => {
    state.rulers = []; state.rulerDraft = null; state.selectedRulerId = null;
    updateRulerUI(); drawOverlay();
  });
  updateRulerUI();

  // Paste handler, two cases (image-paste takes priority so it never breaks):
  //  1. A pastedimage object is selected AND the clipboard holds an image → load it.
  //  2. Otherwise, paste a copy of the internally-copied object (Cmd/Ctrl+C).
  document.addEventListener('paste', e => {
    const obj = selectedObj();
    if (obj && obj.model === 'pastedimage') {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) { _applyImageFile(item.getAsFile(), obj); return; }
        }
      }
    }
    // Object paste — but don't hijack a normal text paste into a focused field.
    const tag = document.activeElement?.tagName || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (_objClipboard) { e.preventDefault(); pasteCopiedObject(); }
  });

  // ── Undo / redo wiring ────────────────────────────────────────────────────
  // Gesture boundaries on the persistent containers: any pointer-driven scene
  // edit inside them becomes one undo step; selection/ruler interactions produce
  // no entry (the scene signature is unchanged).
  _attachHistoryBoundary(document.getElementById('sl-image-wrap'));
  _attachHistoryBoundary(document.getElementById('sl-axis-canvas'));
  _attachHistoryBoundary(document.getElementById('sl-planes'));
  _attachHistoryBoundary(document.getElementById('sl-obj-panel'));
  // Arrow-key nudge: beginAction() fired on the first keydown; commit on release.
  document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown') commitAction();
  });

  // Arrow keys on a focused linear slider nudge by one count of the last digit its
  // readout shows, not by the step attribute (which stays as the drag quantum).
  // Sliders whose readout has fixed decimals declare them via data-disp-dec; the
  // rest show fmtP(value). Log-position sliders (data-log-range) keep the native
  // step — their 1/1000-of-range position unit already scales with magnitude.
  // Dispatching input+change mirrors the events a native nudge fires, so value
  // listeners and the focusin/change undo boundaries behave identically.
  document.addEventListener('keydown', e => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.type !== 'range' || inp.dataset.logRange) return;
    const dir = (e.key === 'ArrowRight' || e.key === 'ArrowUp')   ?  1
              : (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const v   = parseFloat(inp.value);
    const dec = inp.dataset.dispDec !== undefined ? +inp.dataset.dispDec : _fmtPDecimals(v);
    const inc = 10 ** -dec;
    // Snap onto the readout's grid (an off-grid value from a loaded config moves
    // to the adjacent grid point), then clear float dust and clamp to the range.
    let nv = +(Math.round((v + dir * inc) / inc) * inc).toFixed(6);
    nv = Math.min(parseFloat(inp.max), Math.max(parseFloat(inp.min), nv));
    inp.value = String(nv);
    inp.dispatchEvent(new Event('input',  { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Drag/click quantisation for the same sliders. Their markup uses step="any"
  // because a numeric step would snap fine keyboard-nudged values back onto its
  // grid on every assignment and re-render; the coarse drag feel is preserved by
  // snapping trusted (pointer/native) edits to the declared drag step here, in
  // the capture phase so the value listeners below only ever see snapped values.
  // Synthetic events (the arrow-key nudge above) are untrusted and pass through.
  document.addEventListener('input', e => {
    const inp = e.target;
    if (!e.isTrusted || !(inp instanceof HTMLInputElement) || inp.type !== 'range') return;
    const s = parseFloat(inp.dataset.dragStep || '');
    if (!isFinite(s) || s <= 0) return;
    const min = parseFloat(inp.min);
    const v   = parseFloat(inp.value);
    const snapped = Math.min(parseFloat(inp.max), +(min + Math.round((v - min) / s) * s).toFixed(6));
    if (snapped !== v) inp.value = String(snapped);
  }, true);
  document.getElementById('sl-undo')?.addEventListener('click', undo);
  document.getElementById('sl-redo')?.addEventListener('click', redo);
  updateUndoRedoButtons();

  // Global keyboard: Delete/Backspace removes selected object; Esc deselects.
  document.addEventListener('keydown', e => {
    const tag  = (document.activeElement?.tagName) || '';
    const type = (document.activeElement?.type)    || '';
    // Allow shortcuts when a range slider has focus (range inputs don't consume C/R/etc).
    if ((tag === 'INPUT' && type !== 'checkbox' && type !== 'range') || tag === 'TEXTAREA') return;

    // Cmd/Ctrl+C copies the selected object (whole hybrid if applicable). The
    // matching paste is handled in the 'paste' event so it coexists with the
    // pasted-image workflow. Plain 'c' (no modifier) still toggles critical curves.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      if (selectedObj()) { e.preventDefault(); copySelectedObject(); }
      return;
    }

    // Undo / redo (scene edits). Placed after the input guard above, so while a
    // text field is focused the browser's own text undo still applies.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); redo(); return;
    }

    // Arrow keys nudge the selected object; skip if any input has focus
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown') {
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const obj = selectedObj(), pl = selectedPlane();
      if (!obj || !pl) return;
      e.preventDefault();
      // Reset timer on the first press; use elapsed time to pick speed tier.
      // Snapshot once at the start of a nudge; commitAction() on keyup groups the
      // whole hold (with acceleration) into a single undo step.
      if (!e.repeat) { _arrowKeyStart = Date.now(); beginAction(); }
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
      record();
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
      setCanvasTool(e.key === '1' ? 'lens' : e.key === '2' ? 'source' : 'hybrid');
      return;
    }
    if (e.key === 'o' || e.key === 'O') {
      const pl = selectedPlane();
      if (!pl) return;
      record();
      pl.objects.filter(o => o.model === 'pastedimage').forEach(o => renderer?.clearPastedTexture(o.id));
      pl.objects = [];
      state.selectedObjId = null;
      renderPlaneCard(); renderSidebar(); redraw();
      return;
    }
    if (e.key === 'x' || e.key === 'X') {
      const pl = selectedPlane();
      if (!pl) return;
      record();
      removePlane(pl.id); renderPlaneCard(); renderSidebar(); redraw();
      return;
    }
    if ((e.key === '[' || e.key === ']') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      selectPlaneOffset(e.key === '[' ? -1 : 1);  // previous / next plane along the z-sorted list
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      recState.active ? stopRecording() : startRecording();
      return;
    }
    if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      toggleRulerTool();  // arm/disarm the ruler tool (r is taken by recording)
      return;
    }
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
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
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      toggleKbdOverlay();
      return;
    }
    // Visualization mode shortcuts: toggle on/off; pressing the same key again returns to image.
    const VIZ_KEYS = { k: 1, K: 1, g: 2, G: 2, m: 3, M: 3, a: 5, A: 5, i: 0, I: 0, t: 6, T: 6 };
    if (e.key in VIZ_KEYS) {
      setVizMode(VIZ_KEYS[e.key]);
      return;
    }
    if (e.key === 'Escape') {
      // 1. Deselect a selected ruler. 2. Else disarm the ruler tool if armed
      // (measurements stay; clear them with the buttons). 3. Else return the
      // plane-viewer tool to select. 4. Else deselect object.
      if (state.selectedRulerId) {
        state.selectedRulerId = null;
        updateRulerUI(); drawOverlay();
        return;
      }
      if (state.rulerActive) {
        toggleRulerTool();  // rulerActive is true here, so this turns it off
        return;
      }
      if (state.addMode !== 'select') {
        setCanvasTool('select');
        return;
      }
      state.selectedObjId = null;
      renderSidebar(); renderPlaneCard(); redraw();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // A selected ruler takes priority over the selected object.
      if (state.selectedRulerId) { deleteSelectedRuler(); return; }
      const pl = selectedPlane();
      if (!pl) return;
      deleteSelectedObject();
    }
  });
}

// ── Plane-viewer tools (no-tool / add-lens / add-source / add-hybrid) ─────────
// The chosen tool decides what a click on the VIEWER canvas does: with no tool
// active ('select') clicks only pick and drag objects; L/S/H place an object of
// that type on an empty-space click. There is no explicit select button — the
// L/S/H buttons toggle, so clicking the active tool (or Esc) returns to the
// no-tool state where clicks/taps never create an object. The main image is
// always selection-only; objects there can be dragged but never created.
function setCanvasTool(tool) {
  // Clicking the already-active creation tool toggles it back off (no-tool).
  state.addMode = (tool === state.addMode && tool !== 'select') ? 'select' : tool;
  updateCanvasTools();
}

function updateCanvasTools() {
  document.querySelectorAll('.sl-ctool-btn[data-tool]').forEach(b => {
    b.classList.toggle('active', state.addMode === b.dataset.tool);
  });
}

// Select the previous/next plane along the z-sorted list (plane-viewer arrows,
// the [ / ] keyboard shortcuts, and the mobile swipe gesture).
function selectPlaneOffset(dir) {
  if (!state.planes.length) return;
  const idx = state.planes.findIndex(p => p.id === state.selectedPlaneId);
  const ni  = idx < 0 ? (dir > 0 ? 0 : state.planes.length - 1)
                      : Math.min(state.planes.length - 1, Math.max(0, idx + dir));
  const pl  = state.planes[ni];
  if (!pl || pl.id === state.selectedPlaneId) return;
  state.selectedPlaneId = pl.id;
  state.selectedObjId   = pl.objects[0]?.id ?? null;
  clearRulerSelectionForObject();
  renderPlaneCard(); renderSidebar(); drawAxisCanvas(); redraw();
}

// ── Rail tabs ─────────────────────────────────────────────────────────────────
// One tab system for desktop and mobile. Sets the active rail tab, shows its
// content container, and stamps .sl-body[data-tab] (the mobile/short-height CSS
// gates the timeline on that attribute).
function setRailTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.sl-rail-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  // The mobile-only Object tab shares the Scene container; the mobile CSS gates
  // which of its children (object panel vs plane viewer) is visible via data-tab.
  const container = tab === 'object' ? 'scene' : tab;
  for (const t of ['scene', 'view', 'export', 'quality'])
    document.getElementById(`sl-tab-${t}`)?.classList.toggle('active', t === container);
  const body = document.querySelector('.sl-body');
  if (body) body.dataset.tab = tab;
  renderSidebar();
  // Hidden canvases can't measure themselves; redraw once the tab reveals them.
  if (container === 'scene') requestAnimationFrame(() => { drawAxisCanvas(); renderPlaneCard(); });
}

// ── Quality tab ───────────────────────────────────────────────────────────────
function renderQualityPanel() {
  const pop = document.getElementById('sl-tab-quality');
  if (!pop) return;
  pop.innerHTML = `
    <div class="sl-panel">
    <div class="sl-panel-title" style="margin-bottom:6px">Cosmology</div>
    <p class="sl-perf-note" style="margin-bottom:8px">Flat &Lambda;CDM (&Omega;<sub>&Lambda;</sub> = 1 &minus; &Omega;<sub>m</sub>). H<sub>0</sub> sets the absolute distance scale, so it rescales time delays; &Omega;<sub>m</sub> also shifts the distance ratios that set the effective convergence, shear, and critical curves.</p>
    <div class="sl-cosmo-row">
      <label><span class="sl-cosmo-name">H<sub>0</sub></span><span class="sl-cosmo-unit">km/s/Mpc</span><b id="sl-h0-val">${(+state.H0).toFixed(0)}</b></label>
      <input type="range" id="sl-h0" min="50" max="100" step="0.5" value="${state.H0}">
    </div>
    <div class="sl-cosmo-row">
      <label><span class="sl-cosmo-name">&Omega;<sub>m</sub></span><b id="sl-om-val">${(+state.Omega_m).toFixed(2)}</b></label>
      <input type="range" id="sl-om" min="0.05" max="0.6" step="0.01" value="${state.Omega_m}">
    </div>
    <div style="text-align:right;margin-bottom:2px">
      <button class="sl-demo-btn" id="sl-cosmo-reset">Reset (70, 0.3)</button>
    </div>

    <div class="sl-panel-title" style="margin:14px 0 6px">Quality &amp; performance</div>
    <p class="sl-perf-note" style="margin-bottom:8px">These trade accuracy or sharpness against redraw speed.</p>
    <div class="sl-global-input">
      <label>Critical curves</label>
      <select id="sl-crit-res">
        <option value="256"  ${state.critGridN===256  ?'selected':''}>Low (256)</option>
        <option value="512"  ${state.critGridN===512  ?'selected':''}>Medium (512)</option>
        <option value="1024" ${state.critGridN===1024 ?'selected':''}>High (1024)</option>
        <option value="2048" ${state.critGridN===2048 ?'selected':''}>Very high (2048)</option>
      </select>
    </div>
    <div class="sl-global-input">
      <label>Point source</label>
      <select id="sl-ps-grid">
        <option value="150"  ${state.psGridN===150  ?'selected':''}>Coarse (150, fastest)</option>
        <option value="300"  ${state.psGridN===300  ?'selected':''}>Medium (300)</option>
        <option value="600"  ${state.psGridN===600  ?'selected':''}>Fine (600)</option>
        <option value="1200" ${state.psGridN===1200 ?'selected':''}>Very fine (1200, slowest)</option>
      </select>
    </div>
    <div class="sl-global-input">
      <label>Render scale</label>
      <select id="sl-render-scale">
        <option value="auto"   ${state.renderScale==='auto'  ?'selected':''}>Auto (max 2×)</option>
        <option value="1x"     ${state.renderScale==='1x'    ?'selected':''}>1× (fastest)</option>
        <option value="native" ${state.renderScale==='native'?'selected':''}>Native (sharpest)</option>
      </select>
    </div>
    </div>`;
  document.getElementById('sl-crit-res')?.addEventListener('change', e => { state.critGridN = parseInt(e.target.value, 10); redraw(); });
  document.getElementById('sl-ps-grid')?.addEventListener('change',  e => { state.psGridN = parseInt(e.target.value, 10); redraw(); });
  document.getElementById('sl-render-scale')?.addEventListener('change', e => { applyRenderScale(e.target.value); });

  const h0El = document.getElementById('sl-h0');
  const omEl = document.getElementById('sl-om');
  h0El?.addEventListener('input', e => {
    state.H0 = parseFloat(e.target.value);
    document.getElementById('sl-h0-val').textContent = state.H0.toFixed(0);
    applyCosmology();
  });
  omEl?.addEventListener('input', e => {
    state.Omega_m = parseFloat(e.target.value);
    document.getElementById('sl-om-val').textContent = state.Omega_m.toFixed(2);
    applyCosmology();
  });
  document.getElementById('sl-cosmo-reset')?.addEventListener('click', () => {
    state.H0 = CONFIG_DEFAULTS.H0; state.Omega_m = CONFIG_DEFAULTS.Omega_m;
    if (h0El) h0El.value = state.H0;
    if (omEl) omEl.value = state.Omega_m;
    document.getElementById('sl-h0-val').textContent = state.H0.toFixed(0);
    document.getElementById('sl-om-val').textContent = state.Omega_m.toFixed(2);
    applyCosmology();
  });
}

// Push the current cosmology into lens.js and recompute everything distance-dependent
// (distance matrix → critical curves, effective κ/γ maps, time delays) via redraw().
// Global setting, so (like FOV) it is not part of the scene undo history.
function applyCosmology() {
  setCosmology({ H0: state.H0, Omega_m: state.Omega_m });
  invalidateDistances();
  updateThetaEReadout();
  redraw();
}

// Push the render-scale mode into the renderer and re-derive the canvas size.
function applyRenderScale(mode) {
  if (!['auto', '1x', 'native'].includes(mode)) mode = 'auto';
  state.renderScale = mode;
  if (renderer) { renderer.dprMode = mode; renderer.resize(); }
  redraw();
}

// Sync the topbar preset dropdown with _selectedPreset (static DOM, options fixed).
function updatePresetSelect() {
  const sel = document.getElementById('sl-preset-select');
  if (sel) sel.value = _selectedPreset || '';
}

// Sync the canvas overlay chips (pressed state) with the state flags they mirror.
function updateOverlayChips() {
  document.querySelectorAll('#sl-overlay-chips button[data-flag]').forEach(btn => {
    const on = !!state[btn.dataset.flag];
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// Reference-plane chip under the viz dropdown: shows which source redshift the
// quantity maps and critical curves refer to. Hidden in plain lensed-image view
// with no curves shown.
function updateZsChip() {
  const chip = document.getElementById('sl-zs-chip');
  if (!chip) return;
  const relevant = state.vizMode !== 0 || state.showCritCurves || state.showCaustics;
  const hasPlane = state.planes.length > 0;
  if (!relevant || !hasPlane || state.hideOverlays) { chip.style.display = 'none'; return; }
  const auto = state.critZs === null;
  chip.style.display = '';
  chip.textContent = `zₛ = ${effectiveCritZs().toFixed(2)}${auto ? ' (auto)' : ''}`;
}

// Set the visualization mode and sync the dropdown, colorbar, and canvas class.
// Single entry point shared by the dropdown, the I/K/G/M/A/T keys, the tour,
// and the mobile image swipe.
function setVizMode(mode) {
  state.vizMode = mode;
  const sel = document.getElementById('sl-viz-mode');
  if (sel) sel.value = mode;
  glCanvas?.classList.toggle('sl-viz-active', mode !== 0);
  _updateColorbar(); renderSidebar(); redraw();
}

// Step to the previous/next visualization mode, wrapping around. The order
// matches the on-canvas dropdown (image, κ, γ, |μ|, |α|, Fermat φ).
const VIZ_CYCLE = [0, 1, 2, 3, 5, 6];
function cycleVizMode(dir) {
  const i = VIZ_CYCLE.indexOf(state.vizMode);
  setVizMode(VIZ_CYCLE[((i < 0 ? 0 : i) + dir + VIZ_CYCLE.length) % VIZ_CYCLE.length]);
}

// ── Zoom: cluster buttons, wheel, and two-finger pinch ───────────────────────
const FOV_MIN = 0.5, FOV_MAX = 300;

// Single entry point for every FOV change; keeps the View-tab input in sync
// (the on-canvas scale bar redraws with the overlay). redraw() coalesces
// to one frame internally.
function setFov(v) {
  if (!isFinite(v)) return;
  state.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, v));
  const inp = document.getElementById('sl-fov');
  if (inp && document.activeElement !== inp) inp.value = +state.fov.toFixed(2);
  redraw();
}

function attachZoomHandlers(wrap) {
  // Wheel: scroll up zooms in (narrower FOV). Center-anchored — the view is
  // always centred on the optical axis (the shader has no pan).
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    setFov(state.fov * Math.pow(1.0015, e.deltaY));
  }, { passive: false });

  // Pinch: while two pointers are down on the image, spreading them zooms in.
  // attachImageHandlers checks _pinch to abort object/ruler drags mid-gesture.
  wrap.addEventListener('pointerdown', e => {
    _pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_pinchPtrs.size === 2) {
      const [a, b] = [..._pinchPtrs.values()];
      _pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), fov0: state.fov };
    }
  });
  wrap.addEventListener('pointermove', e => {
    if (!_pinchPtrs.has(e.pointerId)) return;
    _pinchPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_pinch && _pinchPtrs.size === 2) {
      const [a, b] = [..._pinchPtrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 8) setFov(_pinch.fov0 * _pinch.d0 / d);
    }
  });
  const endPinch = e => {
    _pinchPtrs.delete(e.pointerId);
    if (_pinchPtrs.size < 2) _pinch = null;
  };
  wrap.addEventListener('pointerup', endPinch);
  wrap.addEventListener('pointercancel', endPinch);
}
let _pinch = null;                 // { d0, fov0 } while a two-finger pinch is active
const _pinchPtrs = new Map();      // pointerId → last client position on the image wrap

// ── Keyboard-shortcut overlay (the "?" button) ────────────────────────────────
const SHORTCUTS = [
  ['1 / 2 / 3', 'Toggle the Lens / Source / Hybrid tool (click the plane viewer to place)'],
  ['C', 'Toggle critical curves and caustics'],
  ['I', 'Show lensed image (exit any quantity map)'],
  ['K / G / M / A', 'Convergence κ / Shear γ / Magnification |μ| / Deflection |α| map'],
  ['T', 'Fermat potential φ contour map'],
  ['H', 'Hide / show the selected object'],
  ['O', 'Clear all objects from the selected plane'],
  ['X', 'Delete the selected plane'],
  ['[ / ]', 'Select the previous / next plane'],
  ['R', 'Start / stop live recording'],
  ['L', 'Toggle ruler mode'],
  ['D', 'Toggle dark / light theme'],
  ['?', 'Show this shortcut reference'],
  ['⌘/Ctrl + C / V', 'Copy the selected object / paste a duplicate'],
  ['⌘/Ctrl + Z / ⇧Z', 'Undo / redo the last scene edit'],
  ['↑ ↓ ← →', 'Nudge the selected object (hold to accelerate)'],
  ['Delete / Backspace', 'Delete the selected object or ruler measurement'],
  ['Escape', 'Deselect ruler → disarm ruler → clear the active plane tool → deselect object'],
];
let _kbdOverlay = null;

function toggleKbdOverlay() {
  if (_kbdOverlay) { _kbdOverlay.remove(); _kbdOverlay = null; return; }
  const ov = document.createElement('div');
  ov.className = 'sl-kbd-overlay';
  ov.innerHTML = `
    <div class="sl-kbd-panel" role="dialog" aria-label="Keyboard shortcuts">
      <div class="sl-kbd-hdr">
        <span>Keyboard shortcuts</span>
        <button class="sl-kbd-close" aria-label="Close">×</button>
      </div>
      <table class="sl-kbd-table">
        ${SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}
      </table>
    </div>`;
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('.sl-kbd-close')) toggleKbdOverlay();
  });
  document.body.appendChild(ov);
  _kbdOverlay = ov;
  const onEsc = e => {
    if (e.key === 'Escape' && _kbdOverlay) {
      e.stopPropagation(); toggleKbdOverlay();
      document.removeEventListener('keydown', onEsc, true);
    }
  };
  document.addEventListener('keydown', onEsc, true);
}

// ── Einstein-radius readout ───────────────────────────────────────────────────
// θE for a lens object against the reference source redshift, with w = D_ls/D_s:
// point mass θE = b·√w; SIE/NIE (and EPL at γ' = 2) θE = b·w; EPL at general
// slope θE = b·w^{1/(γ'−1)} (from the circular deflection |α̂| = b^{γ'−1}R^{2−γ'}).
// All are the circular (q = 1) values; a modest overestimate of the effective
// radius for flattened lenses. External shear/convergence/deflection have no
// Einstein radius (returns null). Returns 0 when the reference source is not
// behind the lens (or at the γ' = 1 degeneracy, a uniform-κ sheet with no ring).
function computeThetaE(obj, plane, zs) {
  if (obj.type !== 'lens') return null;
  const model = obj.model;
  if (!['pointmass', 'sie', 'nie', 'epl'].includes(model)) return null;
  if (!(zs > plane.z)) return 0;
  const Ds  = angDiamDist(zs);
  const Dls = angDiamDistBetween(plane.z, zs);
  if (!(Ds > 0) || !(Dls > 0)) return 0;
  const ratio = Dls / Ds;
  const b = obj.params.b ?? 1;
  if (model === 'pointmass') return b * Math.sqrt(ratio);
  if (model === 'epl') {
    const g = obj.params.gamma ?? 2;
    if (Math.abs(g - 1) < 1e-6) return 0;
    return b * Math.pow(ratio, 1 / (g - 1));
  }
  return b * ratio;
}

// Inner HTML for the θE readout line, or null for lens models with no Einstein
// radius. Uses the same reference source redshift as the critical curves and
// quantity maps (View tab z_s ref; auto = highest-z source plane).
function _thetaEHtml(lensObj, pl) {
  const zs = effectiveCritZs();
  const th = computeThetaE(lensObj, pl, zs);
  if (th === null) return null;
  const val = th > 0 ? `${+th.toPrecision(3)}″` : '—';
  return `θ<sub>E</sub> = ${val} &nbsp;at&nbsp; z<sub>s</sub> = ${zs.toFixed(2)}${state.critZs === null ? ' (auto)' : ''}`;
}

// Read-only Einstein-radius line at the bottom of the lens parameter rows (below
// the Show shape / Attach footer), styled like the z / Pos meta text.
function thetaERow(obj) {
  const pl = selectedPlane();
  if (!pl) return '';
  const html = _thetaEHtml(obj, pl);
  if (html === null) return '';
  return `<div class="sl-thetae-row" id="sl-thetae-row" title="Einstein radius this lens alone would have for a source at the reference redshift (View tab). Circular-equivalent value derived from b and the lens-source distance ratio; — means the reference source is not behind the lens.">${html}</div>`;
}

// Refresh the θE readout in place (no panel rebuild), so it stays live during
// slider drags, plane-z scrubs, z_s-ref scrubs, and cosmology changes.
function updateThetaEReadout() {
  const el = document.getElementById('sl-thetae-row');
  if (!el) return;
  const pl = selectedPlane(), obj = selectedObj();
  if (!pl || !obj) return;
  const lens = obj.type === 'lens' ? obj : hybridPartner(pl, obj);
  if (!lens || lens.type !== 'lens') return;
  const html = _thetaEHtml(lens, pl);
  if (html !== null) el.innerHTML = html;
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
// The SELECTED plane is tested first, so where objects from different planes
// overlap on the image, a click always picks the selected plane's object.
function hitTestImage(wrap, e) {
  const pos = imageWrapToArcsec(wrap, e);
  const r   = wrap.getBoundingClientRect();
  // Convert pixel hit radius to arcsec, scaled up on mobile.
  const thresh = (hitRadius() * 1.5) / r.width * state.fov;
  const seenHybrids = new Set();
  const selPl   = selectedPlane();
  const ordered = selPl ? [selPl, ...state.planes.filter(p => p !== selPl)] : state.planes;
  for (const plane of ordered) {
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
  const del   = document.getElementById('sl-ruler-del');
  // Drop a stale selection if that ruler no longer exists.
  if (state.selectedRulerId && !state.rulers.some(r => r.id === state.selectedRulerId))
    state.selectedRulerId = null;
  if (tools) tools.style.display = state.showRuler ? '' : 'none';
  if (btn)   btn.classList.toggle('active', state.rulerActive);
  if (del)   del.style.display = (state.showRuler && state.selectedRulerId) ? '' : 'none';
  if (clr)   clr.style.display = (state.showRuler && state.rulers.length > 0) ? '' : 'none';
}

// Delete the currently selected ruler measurement. Returns true if one was removed.
function deleteSelectedRuler() {
  if (!state.selectedRulerId) return false;
  state.rulers = state.rulers.filter(r => r.id !== state.selectedRulerId);
  state.selectedRulerId = null;
  updateRulerUI(); drawOverlay();
  return true;
}

// Single-selection: selecting a ruler overtakes any object selection (and vice
// versa), so only one thing is ever selected at a time.
function selectRulerExclusive(id) {
  const hadObj = state.selectedObjId != null;
  state.selectedRulerId = id;
  state.selectedObjId   = null;
  updateRulerUI();
  if (hadObj) renderSidebar();  // refresh the object panel to "nothing selected"
  redraw();                     // plane-box highlights + overlay (ruler highlight + marker rings)
}

// Clear a ruler selection because an object is being selected. Callers already
// re-render the sidebar / redraw, so this only updates the ruler tool chrome.
function clearRulerSelectionForObject() {
  if (!state.selectedRulerId) return;
  state.selectedRulerId = null;
  updateRulerUI();
}

// Arm/disarm the ruler drawing tool. Shared by the toolbar button and the "L"
// shortcut. Enables the tool if it was hidden; keeps committed measurements.
function toggleRulerTool() {
  const wasHidden = !state.showRuler;
  if (wasHidden) state.showRuler = true;
  state.rulerActive = !state.rulerActive;
  state.rulerDraft  = null;   // cancel any in-progress draw; measurements persist
  updateRulerUI();
  if (wasHidden) renderSidebar();  // sync the "Show ruler" checkbox
  const wrap = document.getElementById('sl-image-wrap');
  if (wrap) wrap.style.cursor = state.rulerActive ? 'crosshair' : '';
  drawOverlay();
}

// Point-to-segment distance (arcsec), used for ruler line hit-testing.
function pointSegDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// Hit-test committed rulers against a pointer event. Endpoints win over the line
// so an endpoint near the line can still be grabbed. Returns { ruler, mode, end }.
function hitTestRuler(wrap, e) {
  if (!state.rulers.length) return null;
  const p = imageWrapToArcsec(wrap, e);
  const asPerPx = state.fov / wrap.getBoundingClientRect().width; // square canvas
  const END_HIT  = 10 * asPerPx;
  const LINE_HIT = 7  * asPerPx;
  let best = null, bestD = Infinity;
  for (let i = state.rulers.length - 1; i >= 0; i--) {   // topmost (last drawn) first
    const r = state.rulers[i];
    const d0 = Math.hypot(p.x - r.x0, p.y - r.y0);
    const d1 = Math.hypot(p.x - r.x1, p.y - r.y1);
    if (d0 <= END_HIT && d0 < bestD) { best = { ruler: r, mode: 'endpoint', end: 0 }; bestD = d0; }
    if (d1 <= END_HIT && d1 < bestD) { best = { ruler: r, mode: 'endpoint', end: 1 }; bestD = d1; }
  }
  if (best) return best;
  for (let i = state.rulers.length - 1; i >= 0; i--) {
    const r = state.rulers[i];
    const d = pointSegDist(p.x, p.y, r.x0, r.y0, r.x1, r.y1);
    if (d <= LINE_HIT && d < bestD) { best = { ruler: r, mode: 'line', end: -1 }; bestD = d; }
  }
  return best;
}

function attachImageHandlers(wrap) {
  let imgDrag   = null; // { obj, plane, startCx, startCy, startMx, startMy }
  let rulerDrag = null; // { x0, y0, x1, y1 } while dragging a NEW ruler measurement
  let rulerEdit = null; // { ruler, mode, end, sx0.. , px, py } while editing an existing one
  // Touch swipe on empty image space cycles the visualization mode (mirrors the
  // plane viewer's swipe-to-switch-planes). { id, x0, y0, dir } from pointerdown;
  // dir is set to 'x' once horizontal movement dominates, and the whole gesture
  // is abandoned on a vertical start so the page scroll (touch-action: pan-y)
  // stays free. Same thresholds as the plane-viewer swipe.
  let vizSwipe = null;
  const SWIPE_SLOP = 10; // px — movement beyond this decides swipe vs scroll
  const SWIPE_MIN  = 36; // px — horizontal travel needed to switch modes

  // On narrow screens the wrap uses touch-action: pan-y so a vertical swipe on
  // the image scrolls the page. Gestures the app owns must opt out of that
  // scrolling here, at touchstart: a second finger (pinch zoom), a touch on an
  // object (drag), a touch on a ruler (edit), or an armed ruler (draw).
  wrap.addEventListener('touchstart', e => {
    if (e.target !== wrap &&
        !(e.target.id === 'sl-gl-canvas' || e.target.classList?.contains('sl-overlay'))) return;
    if (e.touches.length >= 2) { e.preventDefault(); return; }
    const t    = e.touches[0];
    const fake = { clientX: t.clientX, clientY: t.clientY };
    if ((state.showRuler && (state.rulerActive || hitTestRuler(wrap, fake))) ||
        hitTestImage(wrap, fake)) e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('pointerdown', e => {
    // Taps on the ruler toolbar are handled by its own buttons; never let one
    // fall through to start a measurement or object drag on the image beneath.
    // (Replaces the toolbar's old pointerdown stopPropagation, which interfered
    // with reliable tap handling on touch devices.)
    // Ignore presses that start on ANY on-canvas chrome (view chips, dropdown,
    // badges, ruler buttons): only the canvases themselves interact.
    if (e.target !== wrap &&
        !(e.target.id === 'sl-gl-canvas' || e.target.classList?.contains('sl-overlay'))) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // A second finger starts a pinch zoom: cancel any one-finger gesture in flight.
    if (_pinchPtrs.size >= 2) {
      imgDrag = null;
      rulerDrag = state.rulerDraft = null;
      rulerEdit = null;
      vizSwipe = null;
      return;
    }

    // 1. Edit an existing ruler (drag an endpoint or the whole line). Available
    //    whenever measurements are shown, and takes priority over drawing / objects.
    if (state.showRuler) {
      const rh = hitTestRuler(wrap, e);
      if (rh) {
        e.preventDefault();
        wrap.setPointerCapture(e.pointerId);
        const p = imageWrapToArcsec(wrap, e);
        rulerEdit = { ruler: rh.ruler, mode: rh.mode, end: rh.end,
                      sx0: rh.ruler.x0, sy0: rh.ruler.y0, sx1: rh.ruler.x1, sy1: rh.ruler.y1,
                      px: p.x, py: p.y };
        wrap.style.cursor = rh.mode === 'endpoint' ? 'grabbing' : 'move';
        selectRulerExclusive(rh.ruler.id);  // selecting a ruler deselects any object
        return;
      }
    }

    // 2. Draw a new ruler when the tool is armed. Clicking empty space also clears
    //    any current ruler selection.
    if (state.rulerActive && state.showRuler) {
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      if (state.selectedRulerId) { state.selectedRulerId = null; updateRulerUI(); }
      const p = imageWrapToArcsec(wrap, e);
      rulerDrag = state.rulerDraft = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      wrap.style.cursor = 'crosshair';
      drawOverlay();
      return;
    }

    // 3. Otherwise: deselect any ruler, then hit-test / drag objects. The main
    //    image never creates objects (creation lives in the plane viewer), so
    //    empty-space presses and pinches are always safe here.
    if (state.selectedRulerId) { state.selectedRulerId = null; updateRulerUI(); drawOverlay(); }
    const hit = hitTestImage(wrap, e);
    if (!hit) {
      // Empty space: on touch this may become a horizontal swipe that cycles the
      // visualization mode (committed on release). No preventDefault, so a
      // vertical drag still scrolls the page.
      if (e.pointerType === 'touch' || e.pointerType === 'pen')
        vizSwipe = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dir: null };
      return;
    }
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
    if (_pinch) { vizSwipe = null; return; }  // two-finger zoom in progress — suppress drags
    if (vizSwipe && vizSwipe.dir === null && e.pointerId === vizSwipe.id) {
      const dx = Math.abs(e.clientX - vizSwipe.x0), dy = Math.abs(e.clientY - vizSwipe.y0);
      if      (dx > SWIPE_SLOP && dx > dy)  vizSwipe.dir = 'x';
      else if (dy > SWIPE_SLOP && dy >= dx) vizSwipe = null;  // vertical: it's a page scroll
    }
    if (rulerEdit) {
      e.preventDefault();
      const p = imageWrapToArcsec(wrap, e), r = rulerEdit.ruler;
      if (rulerEdit.mode === 'endpoint') {
        if (rulerEdit.end === 0) { r.x0 = p.x; r.y0 = p.y; }
        else                     { r.x1 = p.x; r.y1 = p.y; }
      } else {
        const dx = p.x - rulerEdit.px, dy = p.y - rulerEdit.py;
        r.x0 = rulerEdit.sx0 + dx; r.y0 = rulerEdit.sy0 + dy;
        r.x1 = rulerEdit.sx1 + dx; r.y1 = rulerEdit.sy1 + dy;
      }
      drawOverlay();  // overlay only — the GL scene is unchanged by a ruler edit
      return;
    }
    if (rulerDrag) {
      e.preventDefault();
      const p = imageWrapToArcsec(wrap, e);
      rulerDrag.x1 = p.x; rulerDrag.y1 = p.y;
      drawOverlay();  // overlay only — the GL scene is unchanged by a ruler drag
      return;
    }
    if (!imgDrag) {
      // Hovering an existing ruler shows a move/grab cursor (it's editable).
      if (state.showRuler) {
        const rh = hitTestRuler(wrap, e);
        if (rh) { wrap.style.cursor = rh.mode === 'endpoint' ? 'grab' : 'move'; return; }
      }
      // While the ruler tool is armed, keep the crosshair and never show the object grab cursor.
      if (state.rulerActive && state.showRuler) { wrap.style.cursor = 'crosshair'; return; }
      wrap.style.cursor = hitTestImage(wrap, e) ? 'grab' : '';
      return;
    }
    e.preventDefault();
    const pos = imageWrapToArcsec(wrap, e);
    if (!imgDrag.historyRecorded) {
      record();
      imgDrag.historyRecorded = true;
    }
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
    if (vizSwipe && e.pointerId === vizSwipe.id) {
      const dx = e.clientX - vizSwipe.x0, dy = e.clientY - vizSwipe.y0;
      const commit = vizSwipe.dir === 'x' && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy);
      vizSwipe = null;
      // Swipe left → next mode, right → previous (same sense as the plane swipe).
      if (commit) { cycleVizMode(dx < 0 ? 1 : -1); return; }
    }
    if (rulerEdit) {
      rulerEdit = null;
      wrap.style.cursor = (state.rulerActive && state.showRuler) ? 'crosshair' : '';
      updateRulerUI(); drawOverlay();
      return;
    }
    if (rulerDrag) {
      // Commit only a real drag; ignore near-zero-length taps.
      let newId = null;
      if (Math.hypot(rulerDrag.x1 - rulerDrag.x0, rulerDrag.y1 - rulerDrag.y0) >= state.fov * 0.01) {
        newId = uid();
        state.rulers.push({ id: newId, ...rulerDrag });
      }
      rulerDrag = state.rulerDraft = null;
      wrap.style.cursor = 'crosshair';
      if (newId) selectRulerExclusive(newId);      // new measurement becomes the selection
      else       { updateRulerUI(); drawOverlay(); }
      return;
    }
    if (!imgDrag) return;
    invalidateDistances();
    redraw();
    wrap.style.cursor = '';
    imgDrag = null;
  });

  wrap.addEventListener('pointercancel', () => {
    vizSwipe = null;  // browser claimed the gesture (e.g. a vertical page scroll)
    if (rulerEdit) { rulerEdit = null; drawOverlay(); }
    if (rulerDrag) { rulerDrag = state.rulerDraft = null; updateRulerUI(); drawOverlay(); }
  });
}

function attachAxisHandlers() {
  let dragPlane = null, tapStart = null;
  const TAP_SLOP = 10;  // px — a tap (down+up in ~same spot) adds a plane; a swipe scrolls the page

  function nearestMarker(clientX, clientY) {
    const r   = axisCanvas.getBoundingClientRect();
    const mx  = clientX - r.left;
    const my  = clientY - r.top;
    const Wl  = r.width;
    const Hl  = r.height;
    // Use the baseline + bump the last draw actually used (adaptive on mobile), so
    // the grab targets line up with the diamonds as drawn.
    const axisY = _axisBaselineY || Hl * 0.55;
    const BUMP_STEP = _axisBumpStep;
    const HIT = 14;  // px radius around diamond centre
    let best = null, bestDist = Infinity;
    for (const p of state.planes) {
      const px  = axisZToX(p.z, Wl);
      const lv  = _planeLevels.get(p.id) || 0;
      const py  = axisY - lv * BUMP_STEP;  // diamond centre (on the axis at level 0)
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
      const r = axisCanvas.getBoundingClientRect();
      const z = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      dragPlane.z = z;
      state.planes.sort((a, b) => a.z - b.z);
      invalidateDistances();
      renderPlaneCard(); drawAxisCanvas(); redraw();
      // Update z and θE in the params panel without a full sidebar rebuild.
      if (dragPlane.id === state.selectedPlaneId) {
        const zEl = document.querySelector('#sl-obj-panel .sl-params-z');
        if (zEl) zEl.textContent = `z: ${z.toFixed(2)}`;
        updateThetaEReadout();
      }
    } else {
      axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
    }
  });

  axisCanvas.addEventListener('pointerleave', () => { axisCanvas.style.cursor = 'crosshair'; });

  axisCanvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;  // only left-click adds/drags planes
    if (dragPlane) return;  // never re-target while a drag is already active
    dragPlane = nearestMarker(e.clientX, e.clientY);
    if (dragPlane) {
      // Started on a marker → drag it along z. Capture so the whole drag stays with us.
      axisCanvas.setPointerCapture(e.pointerId);
      _draggingPlaneId = dragPlane.id;
      axisCanvas.style.cursor = 'grabbing';
      state.selectedPlaneId = dragPlane.id;
      state.selectedObjId   = dragPlane.objects[0]?.id ?? null;
      renderSidebar();
    } else {
      // Started on empty axis → a tap adds a plane; a swipe just scrolls the page
      // (touch-action: pan-y). Don't capture, so vertical scrolling stays free.
      tapStart = { x: e.clientX, y: e.clientY };
    }
  });

  axisCanvas.addEventListener('pointerup', e => {
    // Tap on empty axis (down + up in ~the same spot) adds a plane; a swipe does not
    // (it scrolled the page instead).
    if (!dragPlane && tapStart &&
        Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) <= TAP_SLOP) {
      const r  = axisCanvas.getBoundingClientRect();
      const z  = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      const pl = addPlane(z);
      if (!pl) {
        showToast(`Limit reached: at most ${MAX_PLANES} planes.`);
      } else {
        state.selectedPlaneId = pl.id;
        state.selectedObjId   = pl.objects[0]?.id ?? null;
        renderPlaneCard(); renderSidebar(); redraw();
      }
    }
    dragPlane = null; tapStart = null;
    _draggingPlaneId = null;
    drawAxisCanvas();  // recalculate settled levels immediately on release
    axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
  });

  axisCanvas.addEventListener('pointercancel', () => {
    // Browser claimed the gesture for scrolling (pan-y) — reset without adding a plane.
    dragPlane = null; tapStart = null; _draggingPlaneId = null;
    axisCanvas.style.cursor = 'crosshair';
    drawAxisCanvas();
  });
}

// ── Selected-plane card (Scene tab) ───────────────────────────────────────────
// The old strip of per-plane boxes is now a single card showing the selected
// plane; the redshift axis is the surface for selecting, adding, and moving
// planes. The card skeleton is static DOM (buildDOM); this just refreshes it.
function renderPlaneCard() {
  const card  = document.getElementById('sl-plane-card');
  if (!card) return;
  const pl    = selectedPlane();
  const body  = document.getElementById('sl-plane-body');
  const empty = document.getElementById('sl-plane-empty');
  const cvs   = document.getElementById('sl-plane-canvas');
  if (!pl) {
    card.dataset.effectiveType = 'empty';
    if (body)  body.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (body)  body.style.display = '';
  if (empty) empty.style.display = 'none';
  // Prev/next plane arrows: grayed out at the ends of the z-sorted plane list.
  const idx  = state.planes.findIndex(p => p.id === pl.id);
  const prev = document.getElementById('sl-plane-prev');
  const next = document.getElementById('sl-plane-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx < 0 || idx >= state.planes.length - 1;
  card.dataset.effectiveType = planeEffectiveType(pl);
  const zIn = document.getElementById('sl-plane-z-input');
  if (zIn && document.activeElement !== zIn) zIn.value = pl.z.toFixed(2);
  const paste = document.getElementById('sl-plane-paste');
  if (paste) paste.style.display = pl.objects.some(o => o.model === 'pastedimage') ? '' : 'none';
  if (cvs) drawPlaneCanvas(cvs, pl);
}

// ── Plane canvas interaction ───────────────────────────────────────────────────
const HIT_R = 10; // px desktop
function hitRadius() { return window.innerWidth <= 640 ? 18 : HIT_R; }

function attachPlaneCardHandlers(canvas) {
  // 'idle' | 'hit-pending' | 'dragging' | 'add-pending' | 'add-dragging' | 'swiping'
  // The card always shows the selected plane; resolve it at pointerdown so one
  // persistent set of listeners serves every plane.
  let istate  = 'idle';
  let hitObj  = null;
  let plane   = null;
  let pStart  = null; // drag/tap start info
  // Empty-space cursor: crosshair while a creation tool is chosen, plain otherwise.
  const addCursor = () => state.addMode === 'select' ? 'default' : 'crosshair';
  const DRAG_THRESH = 3;  // px — object-drag / create-drag threshold (mouse)
  const SWIPE_SLOP  = 10; // px — touch: moving beyond this becomes a plane swipe
  const SWIPE_MIN   = 36; // px — horizontal travel needed to switch planes

  canvas.addEventListener('pointermove', e => {
    if (istate === 'idle') {
      const selPl = selectedPlane();
      canvas.style.cursor = selPl && hitTestPlane(selPl, canvas, e) ? 'grab' : addCursor();
      return;
    }
    e.preventDefault();
    if (!plane) return;

    // Touch swipe that began on empty space switches the selected plane
    // (committed on release); starting on an object still drags the object.
    if (istate === 'add-pending' && pStart.touch &&
        Math.abs(e.clientX - pStart.clientX) > SWIPE_SLOP) {
      istate = 'swiping';
    }
    if (istate === 'swiping') return;

    const pos = canvasToArcsec(canvas, e);
    const dx  = pos.x - pStart.mx, dy = pos.y - pStart.my;
    const dpx = dx / state.fov * canvas.offsetWidth;

    if (istate === 'hit-pending' && Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      istate = 'dragging'; canvas.style.cursor = 'grabbing';
    }
    // Mouse: dragging on empty space creates the object and places it under the
    // pointer, when a creation tool is chosen. (Touch empty-space drags are
    // plane swipes, handled above.)
    if (istate === 'add-pending' && !pStart.touch && state.addMode !== 'select' &&
        Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      hitObj = _makeAddObjects(plane, pStart.mx, pStart.my);
      state.selectedObjId   = hitObj.id;
      clearRulerSelectionForObject();  // one selection at a time
      pStart.cx = pStart.mx; pStart.cy = pStart.my;
      istate = 'add-dragging'; canvas.style.cursor = 'grabbing';
      renderPlaneCard(); renderSidebar();
    }
    if (istate === 'dragging' || istate === 'add-dragging') {
      if (!pStart.historyRecorded) {
        record();
        pStart.historyRecorded = true;
      }
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

  canvas.addEventListener('pointerleave', () => { if (istate === 'idle') canvas.style.cursor = addCursor(); });

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;  // only left-click creates/drags
    // A second finger (a pinch attempt) must never place an object: cancel
    // whatever gesture the first finger started.
    if (!e.isPrimary) { istate = 'idle'; hitObj = null; plane = null; return; }
    plane = selectedPlane();
    if (!plane) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const pos   = canvasToArcsec(canvas, e);
    hitObj      = hitTestPlane(plane, canvas, e);
    if (hitObj) {
      // Started on an existing object → drag it.
      istate = 'hit-pending'; canvas.style.cursor = 'grab';
      pStart = { cx: hitObj.cx, cy: hitObj.cy, mx: pos.x, my: pos.y, touch, historyRecorded: false };
      state.selectedObjId   = hitObj.id;
      clearRulerSelectionForObject();  // one selection at a time
      renderSidebar(); redraw();
    } else {
      // Started on empty space → with an L/S/H tool, a tap (down + up in ~same
      // spot) creates an object; with the select tool a tap only deselects. A
      // horizontal touch swipe switches planes either way.
      istate = 'add-pending';
      pStart = { mx: pos.x, my: pos.y, clientX: e.clientX, touch };
    }
  });

  canvas.addEventListener('pointercancel', () => { istate = 'idle'; hitObj = null; plane = null; canvas.style.cursor = addCursor(); });

  canvas.addEventListener('pointerup', e => {
    if (istate === 'swiping') {
      // Commit the plane switch: swipe left → next (higher z), right → previous.
      const dx = e.clientX - pStart.clientX;
      if (Math.abs(dx) >= SWIPE_MIN) selectPlaneOffset(dx < 0 ? 1 : -1);
    } else if (istate === 'add-pending' && plane) {
      if (state.addMode !== 'select') {
        // Down + up with little/no movement → a tap → create an object here.
        const pos = canvasToArcsec(canvas, e);
        const obj = _makeAddObjects(plane, pos.x, pos.y);
        state.selectedObjId   = obj.id;
        clearRulerSelectionForObject();  // one selection at a time
        renderPlaneCard(); renderSidebar(); redraw();
      } else if (state.selectedObjId) {
        // Select tool: a tap on empty space deselects.
        state.selectedObjId = null;
        renderPlaneCard(); renderSidebar(); redraw();
      }
    } else if (istate === 'dragging' || istate === 'add-dragging') {
      invalidateDistances(); redraw();
    }
    istate = 'idle'; hitObj = null; plane = null;
    const selPl = selectedPlane();
    canvas.style.cursor = selPl && hitTestPlane(selPl, canvas, e) ? 'grab' : addCursor();
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
    record();  // async load lands outside any pointer gesture, so snapshot here
    // Freeze the source's angular size at the current FOV so later zooming does not
    // rescale it (unlike analytic sources, whose size is an absolute arcsec param).
    obj.params.angSize = state.fov;
    obj.pasteCanvas = cvs;
    renderer?.setPastedTexture(obj.id, cvs);
    renderPlaneCard(); renderSidebar(); redraw();
  };
  img.src = url;
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
  // Only the selected plane is on screen (the plane card); others have no canvas.
  if (!plane || plane.id !== state.selectedPlaneId) return;
  const cvs = document.getElementById('sl-plane-canvas');
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
        <b>γ'</b>: radial mass-density slope (ρ ∝ r<sup>−γ'</sup>), written with a prime to distinguish it from the external-shear strength γ. γ' = 2 is isothermal (identical to SIE); γ' &lt; 2 shallows the central density, γ' &gt; 2 steepens it. Typical galaxies have γ' ≈ 1.9–2.1.`,
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
  point: `<b>r</b>: semi-major-axis radius of the uniform disc (arcsec). The edge is sharp.<br>
          <b>q</b>: axis ratio (1 = circular, lower = more elliptical).<br>
          <b>φ</b>: position angle of the major axis (radians).<br>
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
  renderScenePanel();
  if (activeTab === 'view')    renderViewPanel();
  if (activeTab === 'export')  renderExportPanel();
  if (activeTab === 'quality') renderQualityPanel();
  updateOverlayChips();
  updateZsChip();
}

// ── Scene tab: plane card + selected-object controls ──────────────────────────
function renderScenePanel() {
  renderPlaneCard();
  const obj = selectedObj(), pl = selectedPlane();

  // ── Params panel (selected object) ──────────────────────────────────────────
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
        <option value="sie"       ${lensObj.model==='sie'       ?'selected':''}>SIE (Isothermal, γ'=2)</option>
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
        <option value="point"       ${srcObj.model==='point'       ?'selected':''}>Uniform disc</option>
        <option value="pastedimage" ${srcObj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;

      paramsPanel = `
        <div class="sl-panel">
          <div class="sl-params-meta-row">
            <span class="sl-params-z">z: ${pl.z.toFixed(2)}</span>
            <span class="sl-params-pos" id="sl-obj-pos">Pos: (${lensObj.cx.toFixed(2)}, ${lensObj.cy.toFixed(2)})</span>
            <button class="sl-obj-vis-btn${bothHidden ? ' sl-obj-hidden' : ''}" id="sl-toggle-vis" title="${bothHidden ? 'Show in image' : 'Hide from image'}">${eyeIcon(bothHidden)}</button>
            <button class="sl-delete-obj-btn" id="sl-delete-obj" title="Delete object" aria-label="Delete object"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1.5" y1="4" x2="12.5" y2="4"/><path d="M4 4l.5 7h5l.5-7"/><path d="M5 4V3h4v1"/></svg></button>
          </div>
          <div class="sl-hybrid-section">
            <div class="sl-hybrid-hdr" id="sl-hybrid-lens-hdr">
              <span class="sl-hybrid-arrow">${lensExp ? '▼' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Lens${lensObj.hidden ? ' <span class="sl-part-hidden-tag">(hidden)</span>' : ''}</span>
              ${infoSection('sl-param-info-lens', LENS_INFO[lensObj.model] ?? '')}
              ${hybridPartControls(lensObj, 'lens')}
            </div>
            ${lensExp ? `<div class="sl-hybrid-body" data-hybrid-section="lens">
              <select class="sl-select" id="sl-model-select-lens">${lensModelOpts}</select>
              ${lensParamRows(lensObj)}
            </div>` : ''}
          </div>
          <div class="sl-hybrid-section">
            <div class="sl-hybrid-hdr" id="sl-hybrid-src-hdr">
              <span class="sl-hybrid-arrow">${srcExp ? '▼' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Source${srcObj.hidden ? ' <span class="sl-part-hidden-tag">(hidden)</span>' : ''}</span>
              ${infoSection('sl-param-info-src', SOURCE_INFO[srcObj.model] ?? '')}
              ${hybridPartControls(srcObj, 'src')}
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
        ? `<option value="sie"       ${obj.model==='sie'       ?'selected':''}>SIE (Isothermal, γ'=2)</option>
           <option value="nie"       ${obj.model==='nie'       ?'selected':''}>NIE (Nonsingular isothermal)</option>
           <option value="epl"       ${obj.model==='epl'       ?'selected':''}>EPL (Power law)</option>
           <option value="pointmass" ${obj.model==='pointmass' ?'selected':''}>Point mass</option>
           <option value="shear"       ${obj.model==='shear'       ?'selected':''}>External shear</option>
           <option value="convergence" ${obj.model==='convergence' ?'selected':''}>External convergence</option>
           <option value="deflection"  ${obj.model==='deflection'  ?'selected':''}>Constant deflection</option>`
        : `<option value="pointsource" ${obj.model==='pointsource' ?'selected':''}>Point source</option>
           <option value="gaussian"    ${obj.model==='gaussian'    ?'selected':''}>Gaussian</option>
           <option value="exponential" ${obj.model==='exponential' ?'selected':''}>Exponential</option>
           <option value="point"       ${obj.model==='point'       ?'selected':''}>Uniform disc</option>
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
            <button class="sl-delete-obj-btn" id="sl-delete-obj" title="Delete object" aria-label="Delete object"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1.5" y1="4" x2="12.5" y2="4"/><path d="M4 4l.5 7h5l.5-7"/><path d="M5 4V3h4v1"/></svg></button>
          </div>
          <select class="sl-select" id="sl-model-select">${modelOptions}</select>
          ${isLens ? lensParamRows(obj, true) : sourceParamRows(obj, true)}
        </div>`;
    }
  } else {
    paramsPanel = `<div class="sl-panel"><div class="sl-empty-msg">Click an object in the plane card or the image to edit its parameters.</div></div>`;
  }

  document.getElementById('sl-obj-panel').innerHTML = paramsPanel;

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
      // Per-part show/hide + delete. stopPropagation so the click doesn't also
      // expand/collapse the section header these buttons sit inside.
      document.getElementById('sl-part-vis-lens')?.addEventListener('click', e => {
        e.stopPropagation(); record(); lensObj.hidden = !lensObj.hidden; renderSidebar(); redraw();
      });
      document.getElementById('sl-part-vis-src')?.addEventListener('click', e => {
        e.stopPropagation(); record(); srcObj.hidden = !srcObj.hidden; renderSidebar(); redraw();
      });
      document.getElementById('sl-part-del-lens')?.addEventListener('click', e => {
        e.stopPropagation(); deleteHybridPart(pl, lensObj.id);
      });
      document.getElementById('sl-part-del-src')?.addEventListener('click', e => {
        e.stopPropagation(); deleteHybridPart(pl, srcObj.id);
      });
      // Lens section model + params
      document.getElementById('sl-model-select-lens')?.addEventListener('change', e => {
        lensObj.model = e.target.value; lensObj.params = defaultParams(lensObj.model);
        renderPlaneCard(); renderSidebar(); redraw();
      });
      document.getElementById('sl-model-select-src')?.addEventListener('change', e => {
        srcObj.model = e.target.value; srcObj.params = defaultParams(srcObj.model);
        renderPlaneCard(); renderSidebar(); redraw();
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="lens"] input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          const _v = readSliderValue(inp);
          lensObj.params[inp.dataset.param] = _v;
          if (valEl) valEl.textContent = fmtP(_v);
          updateThetaEReadout();
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
        renderPlaneCard(); renderSidebar(); redraw();
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
          updateThetaEReadout();
          redraw();
        });
      });
    }
  }
}

// ── View tab: display, reference plane, color mapping, Fermat contours ────────
function renderViewPanel() {
  const el = document.getElementById('sl-tab-view');
  if (!el) return;
  const ezs  = effectiveCritZs();
  const auto = state.critZs === null;
  const tdAvail = timeDelaysAvailable();
  const tdTitle = tdAvail
    ? 'Annotate each point-source image with its arrival-time delay in days, relative to the first-arriving image (needs a point source with 2+ images). Uses the full multiplane arrival-time surface, so it works for one or several lens planes. Scales with H₀ and Ω_m in the Settings tab.'
    : 'Time delays need at least one lens plane in front of the source.';

  el.innerHTML = `
    <div class="sl-panel">

      <label class="sl-hide-all-row" title="Hide every overlay and on-canvas control (markers, curves, legend, ruler, scale bar, colorbar, tool buttons) for a clean plot until switched back off">
        <input type="checkbox" id="sl-hide-overlays" ${state.hideOverlays?'checked':''}>
        Hide all overlays
      </label>

      <div class="sl-hybrid-section" style="padding:3px 0 5px">
        <div class="sl-view-hdr" style="padding:0">
          <span class="sl-panel-title" style="flex:1">Line art</span>
          <label style="display:flex;align-items:center;cursor:pointer;margin:0" title="Render the scene as flat vector line-art (lensed-image outlines, critical curves, caustics) in a minimal palette. Only uniform-disc and point sources produce clean lines.">
            <input type="checkbox" id="sl-lineart" ${state.lineArt?'checked':''} style="margin:0">
          </label>
        </div>
        ${ state.lineArt ? `
        <div class="sl-hybrid-body" style="display:block;padding:8px 2px 2px">
          <div class="sl-global-input">
            <label>Palette</label>
            <select id="sl-lineart-palette" style="flex:1 1 auto;min-width:0">
              ${Object.entries(LINE_ART_PALETTES).map(([k, v]) =>
                `<option value="${k}" ${state.lineArtPalette===k?'selected':''}>${v.name}</option>`).join('')}
            </select>
          </div>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-lineart-fill" ${state.lineArtFill?'checked':''}> Fill images</label>
            <label title="Curvature-aware smoothing: rounds off sampling staircase while preserving genuine cusps"><input type="checkbox" id="sl-lineart-smooth" ${state.lineArtSmooth?'checked':''}> Smooth</label>
          </div>
          <div class="sl-lineart-colors" title="Override any color from the chosen palette; re-selecting a palette resets them">
            ${LINE_ART_ROLES.map(([role, label]) =>
              `<label class="sl-la-color"><span>${label}</span><input type="color" data-la-color="${role}" value="${lineArtPalette()[role]}"></label>`).join('')}
          </div>
          <p class="sl-perf-note" style="margin:6px 0 0">Vector line-art of the lensing structure. Grid density follows the critical-curve setting (Settings). Gaussian / exponential / pasted sources are ignored in this mode.</p>
        </div>` : '' }
      </div>

      <div class="sl-hybrid-section">
        <div class="sl-view-hdr">
          <span class="sl-panel-title" style="flex:1">Display</span>
        </div>
        <div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <div class="sl-global-input">
            <label>FOV (″)</label>
            <input type="number" id="sl-fov" min="0.5" max="300" step="0.5" value="${state.fov}">
            <span class="sl-unit">"</span>
          </div>
          <div class="sl-global-input">
            <label>z<sub>s</sub> ref</label>
            <select id="sl-zs-mode" style="flex:0 1 auto;min-width:0">
              <option value="auto"   ${auto?'selected':''}>Auto</option>
              <option value="custom" ${auto?'':'selected'}>Custom</option>
            </select>
            <input type="number" id="sl-crit-zs-gen" min="0.1" max="15" step="0.1" value="${ezs.toFixed(2)}" ${auto?'disabled':''}>
          </div>
          <p class="sl-perf-note" style="margin:2px 0 8px">The source redshift referred to by the lensing quantity maps and critical curves. Auto tracks the highest source plane.</p>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-markers" ${state.showMarkers?'checked':''}> Positions</label>
            <label><input type="checkbox" id="sl-show-legend"  ${state.showLegend ?'checked':''}> Legend</label>
          </div>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-scalebar" ${state.showScaleBar?'checked':''}> Scale bar</label>
            <label title="${state.vizMode===0?'The lensed image has no colorbar; pick a quantity map to use one':''}"><input type="checkbox" id="sl-show-colorbar" ${state.showColorbar?'checked':''} ${state.vizMode===0?'disabled':''}> Colorbar</label>
          </div>
          <div class="sl-checkbox-row">
            <label><input type="checkbox" id="sl-show-crit" ${state.showCritCurves?'checked':''}> Critical curves</label>
            <label><input type="checkbox" id="sl-show-caus" ${state.showCaustics   ?'checked':''}> Caustics</label>
          </div>
          <div class="sl-checkbox-row">
            <label title="Measure distances and angles on the image (key L also enables the ruler)"><input type="checkbox" id="sl-show-ruler" ${state.showRuler?'checked':''}> Ruler</label>
            <label class="${tdAvail?'':'sl-label-disabled'}" title="${tdTitle}"><input type="checkbox" id="sl-show-td" ${state.showTimeDelays?'checked':''} ${tdAvail?'':'disabled'}> Time delays</label>
          </div>
        </div>
      </div>

      ${vizModeHasScale(state.vizMode) ? `
      <div class="sl-hybrid-section">
        <div class="sl-view-hdr">
          <span class="sl-panel-title" style="flex:1">Color Map</span>
          ${infoSection('sl-cmap-info', cmapInfoHtml(state.vizMode))}
        </div>
        <div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          ${(() => {
            const vs = vizScaleFor(state.vizMode);
            const heading = { 0:'Brightness stretch', 1:'κ color scale', 2:'γ color scale',
                              3:'|μ| color scale', 5:'|α| color scale' }[state.vizMode];
            const minLbl = 'Min';
            const maxLbl = 'Max';
            const paramRow = vs.scale === 2 ? `
          <div class="sl-global-input">
            <label>Power (γ)</label>
            <input type="range" id="sl-viz-param" data-disp-dec="2" min="0.1" max="2.0" step="any" data-drag-step="0.05" value="${vs.param}">
            <span class="sl-tone-param-val">${vs.param.toFixed(2)}</span>
          </div>` : vs.scale === 3 ? `
          <div class="sl-global-input">
            <label>Softening (a)</label>
            <input type="range" id="sl-viz-param" data-disp-dec="1" min="0.5" max="20" step="any" data-drag-step="0.5" value="${vs.param}">
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
        </div>
      </div>` : ''}

      ${state.vizMode === 6 ? `
      <div class="sl-hybrid-section">
        <div class="sl-view-hdr">
          <span class="sl-panel-title" style="flex:1">Fermat Potential</span>
          ${infoSection('sl-contours-info', contourInfoHtml())}
        </div>
        <div class="sl-hybrid-body" style="display:block;padding:6px 2px 2px">
          <div class="sl-checkbox-row sl-checkbox-row-full">
            <label><input type="checkbox" id="sl-fermat-use-src" ${state.fermatUseSourcePos?'checked':''}> Use last selected source for the source position and redshift</label>
          </div>
          ${state.fermatUseSourcePos && state.lastFermatSource ? `
          <p style="font-size:11px;color:var(--muted);margin:3px 0 0">
            &beta; = (${state.lastFermatSource.cx.toFixed(3)}&Prime;, ${state.lastFermatSource.cy.toFixed(3)}&Prime;)
          </p>` : ''}
          <p style="font-size:11px;color:var(--muted);margin:10px 0 6px">Iso-arrival-time contour spacing</p>
          <div class="sl-global-input">
            <label>Scale</label>
            <select id="sl-contour-scale">
              <option value="0" ${state.contourScale===0?'selected':''}>Linear</option>
              <option value="1" ${state.contourScale===1?'selected':''}>Asinh</option>
            </select>
          </div>
          <div class="sl-global-input">
            <label>Spacing (&times;)</label>
            <input type="number" class="sl-scrub" id="sl-contour-spacing" min="0.05" step="${_numStep(state.contourSpacing)}" value="${state.contourSpacing}">
          </div>
          <div style="margin-top:4px">
            <button id="sl-contour-reset" type="button" style="font-size:11px;background:none;border:none;color:var(--muted);text-decoration:underline;cursor:pointer;padding:0">Reset to default</button>
          </div>
        </div>
      </div>` : ''}
    </div>`;

  const _fovEl = document.getElementById('sl-fov');
  _fovEl?.addEventListener('change', e => { setFov(parseFloat(e.target.value)); });
  _attachScrub(_fovEl, { lo: 0.5, hi: 300, onChange: v => setFov(v) });
  document.getElementById('sl-zs-mode')?.addEventListener('change', e => {
    state.critZs = e.target.value === 'auto' ? null : effectiveCritZs();
    renderSidebar(); redraw();
  });
  const _zsEl = document.getElementById('sl-crit-zs-gen');
  _zsEl?.addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; updateZsChip(); updateThetaEReadout(); redraw(); } });
  _attachScrub(_zsEl, { lo: 0.1, hi: 15, onChange: v => { state.critZs = v; updateZsChip(); updateThetaEReadout(); redraw(); } });
  document.getElementById('sl-hide-overlays')?.addEventListener('change', e => {
    state.hideOverlays = e.target.checked;
    document.querySelector('.sl-body')?.classList.toggle('sl-hide-ov', state.hideOverlays);
    _updateColorbar(); updateZsChip(); redraw();
  });
  document.getElementById('sl-show-ruler')?.addEventListener('change', e => {
    state.showRuler = e.target.checked;
    if (!state.showRuler && state.rulerActive) { state.rulerActive = false; state.rulerDraft = null; }
    updateRulerUI(); redraw();
  });
  document.getElementById('sl-show-markers')?.addEventListener('change',e => { state.showMarkers = e.target.checked; redraw(); });
  document.getElementById('sl-show-legend')?.addEventListener('change', e => { state.showLegend  = e.target.checked; redraw(); });
  document.getElementById('sl-show-scalebar')?.addEventListener('change', e => { state.showScaleBar = e.target.checked; redraw(); });
  document.getElementById('sl-show-colorbar')?.addEventListener('change', e => { state.showColorbar = e.target.checked; _updateColorbar(); redraw(); });
  document.getElementById('sl-show-crit')?.addEventListener('change', e => { state.showCritCurves = e.target.checked; redraw(); });
  document.getElementById('sl-show-caus')?.addEventListener('change', e => { state.showCaustics   = e.target.checked; redraw(); });
  document.getElementById('sl-show-td')?.addEventListener('change', e => { state.showTimeDelays = e.target.checked; redraw(); });
  document.getElementById('sl-lineart')?.addEventListener('change', e => {
    state.lineArt = e.target.checked;
    renderSidebar();            // reveal / hide the palette sub-panel
    _updateColorbar();          // line art suppresses the colorbar
    redraw();
  });
  document.getElementById('sl-lineart-palette')?.addEventListener('change', e => {
    state.lineArtPalette = e.target.value;
    state.lineArtColors  = paletteColors(e.target.value);   // picking a palette resets the per-role overrides
    renderSidebar();                                        // refresh the color pickers to the new palette
    redraw();
  });
  document.getElementById('sl-lineart-fill')?.addEventListener('change', e => { state.lineArtFill = e.target.checked; redraw(); });
  document.getElementById('sl-lineart-smooth')?.addEventListener('change', e => { state.lineArtSmooth = e.target.checked; redraw(); });
  document.querySelectorAll('[data-la-color]').forEach(inp =>
    inp.addEventListener('input', e => { state.lineArtColors[e.target.dataset.laColor] = e.target.value; redraw(); }));
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
  document.getElementById('sl-contour-scale')?.addEventListener('change', e => {
    state.contourScale = e.target.value === '1' ? 1 : 0;
    redraw();
  });
  document.getElementById('sl-contour-reset')?.addEventListener('click', () => {
    state.contourSpacing = 1.0; state.contourScale = 0; renderSidebar(); redraw();
  });
  document.getElementById('sl-fermat-use-src')?.addEventListener('change', e => {
    state.fermatUseSourcePos = e.target.checked;
    renderSidebar(); redraw();
  });
}

function _downloadCSV(name, rows) {
  const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Export tab: capture and recording ─────────────────────────────────────────
function renderExportPanel() {
  const el = document.getElementById('sl-tab-export');
  if (!el) return;
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
      <div class="sl-capture-row" style="margin-top:6px">
        <button class="sl-capture-btn" id="sl-svg-btn" ${state.lineArt ? '' : 'disabled'}
                title="${state.lineArt ? 'Export the Line art view as a scalable vector SVG' : 'Enable Line art (View tab) to export a vector SVG'}">Save SVG (line art)</button>
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
  el.innerHTML = recordingPanel;

  // ── Data (CSV) section: export the most recently computed overlays. ────────
  const _curves = state._lastCurves;
  const _psImgs = state._lastPsImages ?? [];
  el.insertAdjacentHTML('beforeend', `
    <div class="sl-panel" style="margin-top:10px">
      <div class="sl-panel-title-row">
        <span class="sl-panel-title">DATA (CSV)</span>
        ${infoSection('sl-csv-info', `
          Exports the most recently computed overlays, with positions in arcseconds.<br><br>
          <b>Curves</b>: critical-curve and caustic segments, one row per segment, labelled <code>critical</code> or <code>caustic</code>, at the source redshift they were computed for.<br><br>
          <b>Image positions</b>: the numerically solved point-source image positions.<br><br>
          Buttons enable once the corresponding overlay has been computed at least once (show critical curves, or add a point source).`)}
      </div>
      <div class="sl-capture-row" style="margin-top:6px">
        <button class="sl-capture-btn" id="sl-csv-curves" ${_curves && (_curves.crit.length || _curves.caus.length) ? '' : 'disabled'}>Curves</button>
        <button class="sl-capture-btn" id="sl-csv-images" ${_psImgs.length ? '' : 'disabled'}>Image positions</button>
      </div>
    </div>`);
  document.getElementById('sl-csv-curves')?.addEventListener('click', () => {
    const c = state._lastCurves; if (!c) return;
    const rows = ['curve,x0_arcsec,y0_arcsec,x1_arcsec,y1_arcsec'];
    for (const [[x0, y0], [x1, y1]] of c.crit) rows.push(`critical,${x0},${y0},${x1},${y1}`);
    for (const [[x0, y0], [x1, y1]] of c.caus) rows.push(`caustic,${x0},${y0},${x1},${y1}`);
    _downloadCSV(`caustica-curves-zs${c.zs.toFixed(2)}.csv`, rows);
  });
  document.getElementById('sl-csv-images')?.addEventListener('click', () => {
    const rows = ['source,x_arcsec,y_arcsec'];
    for (const im of (state._lastPsImages ?? [])) rows.push(`${im.src},${im.x},${im.y}`);
    _downloadCSV('caustica-image-positions.csv', rows);
  });

  document.getElementById('sl-prog-section-hdr')?.addEventListener('click', () => { _progExpanded = !_progExpanded; renderSidebar(); });
  document.getElementById('sl-snapshot-btn')?.addEventListener('click', captureSnapshot);
  document.getElementById('sl-svg-btn')?.addEventListener('click', exportLineArtSVG);
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
}

function fmtP(v) {
  const a = Math.abs(v);
  if (a === 0)    return '0';
  if (a < 0.005)  return v.toFixed(4);
  if (a < 0.05)   return v.toFixed(3);
  return v.toFixed(2);
}

// Decimals fmtP shows for v — the arrow-key nudge unit is one count of the
// readout's last digit. Bare '0' nudges at the coarse band so a zeroed slider
// doesn't need dozens of presses to show movement.
function _fmtPDecimals(v) {
  const a = Math.abs(v);
  if (a !== 0 && a < 0.005) return 4;
  if (a !== 0 && a < 0.05)  return 3;
  return 2;
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
    <input type="range" data-param="${key}" min="${min}" max="${max}" step="any" data-drag-step="${step}" value="${val}">
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
  renderPlaneCard(); renderSidebar(); redraw();
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
    return sliderRowLog('Strength (")', 'b', 0.01, 100, p.b ?? 1)
         + objFooter(obj, showAttach)
         + thetaERow(obj);
  if (obj.model === 'sie')
    return sliderRowLog('b (")',   'b',   0.01, 100,   p.b   ?? 1)
         + sliderRow   ('q',       'q',   0.05, 1.0,   0.05, p.q   ?? 0.75)
         + sliderRow   ('φ (rad)', 'phi', 0,   Math.PI, 0.05, p.phi ?? 0)
         + objFooter(obj, showAttach)
         + thetaERow(obj);
  if (obj.model === 'nie')
    return sliderRowLog('b (")',    'b',   0.01, 100,   p.b   ?? 1)
         + sliderRow   ('q',        'q',   0.05, 1.0,   0.05, p.q   ?? 0.75)
         + sliderRow   ('φ (rad)',  'phi', 0,   Math.PI, 0.05, p.phi ?? 0)
         + sliderRowLog('r<sub>c</sub> (")', 'rc', 0.005, 20, p.rc ?? 0.2)
         + objFooter(obj, showAttach)
         + thetaERow(obj);
  if (obj.model === 'epl')
    return sliderRowLog('b (")',   'b',     0.01, 100,   p.b     ?? 1)
         + sliderRow   ('q',       'q',     0.05, 1.0,   0.05, p.q     ?? 0.75)
         + sliderRow   ('φ (rad)', 'phi',   0,   Math.PI, 0.05, p.phi   ?? 0)
         + sliderRow   ("γ'",      'gamma', 0.5, 3.0,     0.05, p.gamma ?? 2.0)
         + objFooter(obj, showAttach)
         + thetaERow(obj);
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
         + '<p style="font-size:11px;color:var(--muted);margin-top:4px;grid-column:1/-1">Image positions are computed with a numerical refinement algorithm. Einstein rings do not appear for point sources: use a uniform disc source instead. Some highly demagnified images may not appear.</p>';
  }
  if (obj.model === 'point') {
    const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
    const storedColor = p.color ?? '#ffffff';
    const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
    return sliderRowLog('r (")', 'sigma', 0.002, 4.0, p.sigma ?? 0.08)
         + sliderRow   ('q',      'q',    0.05, 1.0, 0.05, p.q   ?? 1.0)
         + sliderRow   ('φ (rad)','phi',  0, Math.PI, 0.05, p.phi ?? 0)
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
  const PAD = 12;
  const _mobAxis = window.innerWidth <= 640;
  const _textAlpha = _mobAxis ? 0.45 : 1.0;

  // ── Assign bump levels FIRST so the axis layout can be sized to the stack.
  // Close markers stack upward instead of overlapping; the dragged plane is pinned
  // one level above everything so it never flips under a neighbour mid-drag.
  const MIN_SEP = 26;   // min px between markers sharing a level
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
  if (_draggingPlaneId) planeLevel.set(_draggingPlaneId, levelMaxX.length);
  _planeLevels = planeLevel;  // share with hit-testing
  const maxLv = planeLevel.size ? Math.max(0, ...planeLevel.values()) : 0;

  // ── Place the axis baseline + per-level bump so the whole stack fits the FIXED
  // canvas height at any width. Desktop keeps the classic centred axis and 28px bump.
  // On mobile the strip is short: shrink the bump when markers crowd (no clipping on
  // narrow widths) and vertically centre the stack (no big gap on wide widths). This
  // is what keeps the timeline looking identical across mobile widths.
  const BELOW = 30;   // px below the axis for tick + L/S labels (tight, so the caption sits close)
  const ABOVE = 20;   // just the diamond above the axis (z-numbers sit beside it on mobile)
  let BUMP_STEP = 36;
  let axisY;
  if (_mobAxis) {
    if (maxLv > 0) BUMP_STEP = Math.min(28, Math.max(6, (Hl - BELOW - ABOVE - 2) / maxLv));
    const upExtent = ABOVE + maxLv * BUMP_STEP;
    axisY = Math.round((Hl + upExtent - BELOW) / 2);
    axisY = Math.min(Math.max(axisY, upExtent + 1), Hl - BELOW - 1);
  } else {
    // Markers sit on the line, so put the baseline low and give bumped markers
    // real clearance; the step shrinks adaptively if the stack gets deep.
    axisY = Hl - 33;
    if (maxLv > 0) BUMP_STEP = Math.min(36, Math.max(8, (axisY - 16) / maxLv));
  }
  _axisBaselineY = axisY; _axisBumpStep = BUMP_STEP;  // share with nearestMarker hit-testing

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

  for (const plane of state.planes) {
    const x    = axisZToX(plane.z, Wl);
    const col  = typeColorHex(planeEffectiveType(plane));
    const sel  = plane.id === state.selectedPlaneId;
    const lv   = planeLevel.get(plane.id) || 0;
    const dy   = lv * BUMP_STEP;   // extra upward shift

    // Markers sit ON the axis line by default (lv 0) and bump upward only to
    // dodge overlapping neighbours. Bumped markers keep a dashed leader line
    // down to their true position on the axis.
    ctx.strokeStyle = col;
    ctx.lineWidth   = sel ? 2 : 1.5;
    if (lv > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY + 6 - dy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Short axis tick
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY + 4); ctx.stroke();

    // Diamond (centred on the axis when not bumped)
    ctx.fillStyle = col;
    const dTop = axisY - 6 - dy, dMid = axisY - dy, dBot = axisY + 6 - dy;
    ctx.beginPath();
    ctx.moveTo(x, dTop); ctx.lineTo(x+5, dMid); ctx.lineTo(x, dBot); ctx.lineTo(x-5, dMid);
    ctx.closePath(); ctx.fill();

    // Selection: a ring around the diamond, matching the plane card's marker ring.
    if (sel) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, dMid - 9.5); ctx.lineTo(x + 8, dMid); ctx.lineTo(x, dMid + 9.5); ctx.lineTo(x - 8, dMid);
      ctx.closePath(); ctx.stroke();
    }

    // z label: beside the diamond on mobile (saves vertical space), above on desktop.
    ctx.font = sel ? 'bold 9.5px system-ui, sans-serif' : '9.5px system-ui, sans-serif';
    if (_mobAxis) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(plane.z.toFixed(2), x + (sel ? 10 : 7), dMid);
    } else {
      // dMid - 13 clears the selection ring (which reaches dMid - 9.5).
      ctx.textAlign = 'center';
      ctx.fillText(plane.z.toFixed(2), x, dMid - 13);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';  // reset for the L/S tag

    // L/S tag below axis
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    const _eff = planeEffectiveType(plane);
    const _lbl = _eff === 'lens' ? 'L' : _eff === 'source' ? 'S' : _eff === 'hybrid' ? 'H' : '';
    if (_lbl) ctx.fillText(_lbl, x, axisY + 26);
  }

  // Desktop: centred hint at the bottom of the canvas. On mobile these labels live
  // in the HTML caption below the axis (.sl-timeline-caption), so nothing is drawn.
  if (!_mobAxis) {
    ctx.font        = '10.5px system-ui, sans-serif';
    ctx.fillStyle   = dark ? '#8b949e' : '#6b7280';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Click to add a lens or source plane', Wl / 2, Hl - 4);
  }

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
    return (params.b ?? 1) ** 2 * Math.log(Math.max(Math.sqrt(ux*ux + uy*uy), SOFT));
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
  if (model === 'epl') {
    // Exact EPL potential ψ = (u·α)/(2−t) (Euler's theorem: ψ is homogeneous of
    // degree 2−t and α = ∇ψ). Reduces to the SIE potential u·α at t=1 (γ=2).
    const t = (params.gamma ?? 2) - 1;
    const [ax, ay] = deflectEPL(ux, uy, params.b ?? 1, params.q ?? 0.75, params.phi ?? 0, params.gamma ?? 2);
    let denom = 2 - t;                                    // singular only at γ=3 (log potential)
    if (Math.abs(denom) < 1e-3) denom = denom < 0 ? -1e-3 : 1e-3;
    return (ux*ax + uy*ay) / denom;
  }
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
    if (chi_j < 1e-9) continue;                     // lens at the observer: degenerate
    const [px, py] = traceRay(tx, ty, planes, dist, j); // x_j (x_0 = θ since no prior deflection)
    // A lens plane sharing the previous node's redshift (same χ) adds no new drift
    // segment, but its potential still contributes at that node — so accumulate it
    // regardless. Only advance the node (geometric term) for a genuinely new χ.
    if (chi_j - prevChi >= 1e-9) {
      if (chi_L < 0) chi_L = chi_j;
      const ex = chi_j * px, ey = chi_j * py;
      const dx = ex - prevEx, dy = ey - prevEy;
      geoDelay += 0.5 * (dx * dx + dy * dy) / (chi_j - prevChi);
      prevChi = chi_j; prevEx = ex; prevEy = ey;
    }
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

// Time-delay normalisation constant K (Mpc) that _computeFullFermat divides φ by:
// K = χ_L·χ_s/(χ_s − χ_L), with χ_L the first lens plane in front of the source and
// χ = (1+z)·D_ang the comoving distance. Feeding this same K into fermatDiffToDays turns
// a normalised Fermat difference back into a physical delay, because the K cancels:
//   Δt = (K/c)·(Δφ_raw/K) = Δφ_raw/c.
// So the choice of K is immaterial to the physical delay — it only rescales the surface
// for display — and this works unchanged for one OR many lens planes. For a single lens
// plane it equals the time-delay distance D_Δt = (1+z_L)D_L D_S/D_LS exactly, so the
// single-plane delays are byte-identical to the previous timeDelayDistance() path.
// MUST mirror _computeFullFermat's internal K selection exactly.
function _fermatDtDist(planes, dist, srcIdx) {
  const { D_obs } = dist;
  const chi   = j => (1 + planes[j].z) * D_obs[j];
  const chi_s = chi(srcIdx);
  if (chi_s < 1e-9) return 0;
  for (let j = 0; j < srcIdx; j++) {
    if (!planes[j].objects.some(o => !o.hidden && o.type === 'lens')) continue;
    const chi_L = chi(j);
    if (chi_L < 1e-9) continue;                 // lens at the observer: skip (as in _computeFullFermat)
    if (chi_s - chi_L > 1e-9) return chi_L * chi_s / (chi_s - chi_L);
    break;                                      // first lens coincides with source: fall through
  }
  return chi_s;                                 // no usable lens in front: matches the else-branch
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

// Rounded background-rectangle text label ("pill"), centred at (cx, cy). Shared by the
// ruler measurements and the point-source time-delay labels so they stay identical.
// Colours track the theme (dark/light); caller positions and clamps the centre.
function _pillLabel(ctx, text, cx, cy, fsize, dark) {
  const pillBg  = dark ? 'rgba(0,0,0,0.7)'        : 'rgba(255,255,255,0.82)';
  const textCol = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)';
  ctx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const padX = 6, padY = 4, boxW = tw + padX * 2, boxH = fsize + padY * 2, rr = 4;
  const bx = cx - boxW / 2, by = cy - boxH / 2;
  ctx.fillStyle = pillBg;
  ctx.beginPath();
  ctx.moveTo(bx + rr, by);
  ctx.arcTo(bx + boxW, by,        bx + boxW, by + boxH, rr);
  ctx.arcTo(bx + boxW, by + boxH, bx,        by + boxH, rr);
  ctx.arcTo(bx,        by + boxH, bx,        by,        rr);
  ctx.arcTo(bx,        by,        bx + boxW, by,        rr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = textCol;
  ctx.fillText(text, cx, cy + 0.5);
  return { boxW, boxH };
}

// Polyline (arcsec) tracing the edge of a uniform-disc source ellipse, used when
// no lens sits in front of the disc (image == source, no marching squares needed).
// σ is the semi-major-axis radius, minor axis σ·q, rotated by φ (matches the shader).
function discEllipsePoly(disc, M = 96) {
  const r  = disc.params.sigma ?? 0.08;
  const q  = Math.max(disc.params.q ?? 1, 0.05);
  const ph = disc.params.phi ?? 0;
  const cp = Math.cos(ph), sp = Math.sin(ph);
  const pts = [];
  for (let i = 0; i <= M; i++) {
    const t  = i / M * 2 * Math.PI;
    const xr = r * Math.cos(t), yr = r * q * Math.sin(t);
    pts.push([disc.cx + cp*xr - sp*yr, disc.cy + sp*xr + cp*yr]);
  }
  return pts;
}

// ── Line-art base layer ─────────────────────────────────────────────────────
// Line-art mode is a RESTYLE of the normal overlay, not a separate view: this
// function paints the opaque palette background (covering the skipped GL canvas)
// and the uniform-disc lensed-image outlines, then drawOverlay() draws the usual
// annotations (point-source dots, critical curves, markers, ruler, scale bar,
// legend) on top, recolored to the palette. So nothing that was visible before
// disappears when line art is switched on. The lensed-image outlines are computed
// with adaptive secant refinement + smoothing (see computeDiscImageOutlines).
function drawLineArtBase(W, H, dpr) {
  const pal = lineArtPalette();
  const Wl  = W / dpr, Hl = H / dpr;

  // Opaque background covers the (skipped) GL canvas underneath.
  overlayCtx.save();
  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.fillStyle = pal.bg;
  overlayCtx.fillRect(0, 0, W, H);
  overlayCtx.restore();

  if (!state.dist) return;

  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);
  overlayCtx.lineJoin = 'round';
  overlayCtx.lineCap  = 'round';

  const toPixel = (ax, ay) => [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  const strokeW = Math.max(1.1, Math.min(Wl, Hl) / 400);
  const planes  = state.planes;                    // kept sorted by z; matches state.dist
  // Base grid only needs to CAPTURE arcs; per-vertex secant refinement supplies the
  // smoothness, so a moderate cap keeps live dragging responsive. Follows critGridN.
  const laGridN     = Math.min(state.critGridN, 384);
  const samplingFov = state.fov * 1.3;             // sample wider so edge arcs aren't clipped
  const lensesInFront = (idx) => planes.slice(0, idx).some(p => p.objects.some(o => o.type === 'lens' && !o.hidden));

  // Uniform-disc lensed-image outlines, grouped per source plane (one trace each).
  const discPlanes = new Map();
  planes.forEach((plane, idx) => {
    for (const o of plane.objects)
      if (o.type === 'source' && o.model === 'point' && !o.hidden) {
        if (!discPlanes.has(idx)) discPlanes.set(idx, []);
        discPlanes.get(idx).push(o);
      }
  });
  for (const [idx, discs] of discPlanes) {
    const grid = lensesInFront(idx) ? traceSourceGrid(planes, state.dist, idx, samplingFov, laGridN) : null;
    for (const disc of discs) {
      let polys;
      if (grid) {
        const segs = computeDiscImageOutlines(planes, state.dist, idx,
          { cx: disc.cx, cy: disc.cy, sigma: disc.params.sigma, q: disc.params.q, phi: disc.params.phi },
          samplingFov, laGridN, grid);
        polys = chainSegments(segs);
      } else {
        polys = [discEllipsePoly(disc)];   // no foreground lens: image is the source ellipse
      }
      if (state.lineArtSmooth) polys = smoothPolylines(polys);
      overlayCtx.beginPath();
      for (const poly of polys) {
        if (!poly || poly.length < 2) continue;
        const [x0, y0] = toPixel(poly[0][0], poly[0][1]);
        overlayCtx.moveTo(x0, y0);
        for (let i = 1; i < poly.length; i++) { const [px, py] = toPixel(poly[i][0], poly[i][1]); overlayCtx.lineTo(px, py); }
      }
      if (state.lineArtFill) { overlayCtx.fillStyle = pal.imageFill; overlayCtx.globalAlpha = 0.9; overlayCtx.fill('evenodd'); overlayCtx.globalAlpha = 1; }
      overlayCtx.strokeStyle = pal.imageStroke; overlayCtx.lineWidth = strokeW; overlayCtx.stroke();
    }
  }

  overlayCtx.restore();
}

function drawOverlay() {
  const overlay = document.getElementById('sl-overlay');
  const r   = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W   = Math.max(1, Math.round(r.width  * dpr));
  const H   = Math.max(1, Math.round(r.height * dpr));
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  overlayCtx.clearRect(0, 0, W, H);

  // Line-art mode: paint the opaque palette background + disc-image outlines as a
  // base layer, then fall through so the usual annotations draw on top (recolored to
  // the palette below via _pal). Switching to line art therefore hides nothing.
  const _pal = state.lineArt ? lineArtPalette() : null;
  if (state.lineArt) drawLineArtBase(W, H, dpr);

  const hasLens     = state.planes.some(p => p.objects.some(o => o.type === 'lens'));
  // The hide-overlays master switch (View tab) suppresses annotations for a clean
  // plot; point-source image circles stay (they ARE the lensed light), and critical
  // curves / caustics stay too (they are structure, not a labelling annotation).
  const hideOv = state.hideOverlays;
  const showMk = state.showMarkers && !hideOv;
  const needCurve   = (state.showCritCurves || state.showCaustics) && state.dist && hasLens;
  const needEllipse      = !hideOv && state.planes.some(pl => pl.objects.some(o => o.showShape));
  const needPointSources = state.planes.some(pl => pl.objects.some(o => o.type === 'source' && o.model === 'pointsource' && !o.hidden));
  const needFermatPts = !hideOv && state.fermatPoints && state.fermatPoints.length > 0;
  const needRuler = !hideOv && state.showRuler && ((state.rulers && state.rulers.length) || state.rulerDraft);
  const needScale = state.showScaleBar && !hideOv;
  if (!needCurve && !showMk && !needEllipse && !needPointSources && !needFermatPts && !needRuler && !needScale) return;

  const Wl = W/dpr, Hl = H/dpr;
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  function toPixel(ax, ay) {
    return [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  }

  // ── Point source image circles ─────────────────────────────────────────────────────
  const _psAll = [];  // collected for the Data tab's CSV export
  // Relative time-delay annotations (days): any number of lens planes, source behind the
  // first lens, ≥2 images. Reference = first-arriving image (Fermat minimum); others +Δt.
  const _tdOn = state.showTimeDelays && !hideOv && timeDelaysAvailable();
  const _tdFirstLensZ = _tdOn ? firstLensPlaneZ() : null;
  for (const plane of state.planes) {
    for (const obj of plane.objects) {
      if (obj.type !== 'source' || obj.model !== 'pointsource' || obj.hidden) continue;
      const imagePositions = findPointSourceImages(obj, plane);
      for (const [tx, ty] of imagePositions) _psAll.push({ src: obj.id, x: tx, y: ty });
      const r_px = Math.max((obj.params.sigma ?? 0.05) / state.fov * Wl, 2.5);
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const storedColor = obj.params.color ?? '#ffffff';
      const col = dark ? storedColor : invertHexColor(storedColor);
      overlayCtx.fillStyle = _pal ? _pal.pointImage : col;
      overlayCtx.globalAlpha = _pal ? 1 : (obj.params.amplitude ?? 1.0);
      for (const [tx, ty] of imagePositions) {
        const [px, py] = toPixel(tx, ty);
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, r_px, 0, Math.PI * 2);
        overlayCtx.fill();
      }
      overlayCtx.globalAlpha = 1;

      // Time-delay labels beside each image of this source.
      if (_tdOn && _tdFirstLensZ != null && plane.z > _tdFirstLensZ && imagePositions.length >= 2) {
        const srcIdx = state.planes.indexOf(plane);
        const dtDist = _fermatDtDist(state.planes, state.dist, srcIdx);
        const phis = imagePositions.map(([tx, ty]) =>
          _computeFullFermat(tx, ty, state.planes, state.dist, srcIdx, obj.cx, obj.cy));
        let refI = 0;
        for (let i = 1; i < phis.length; i++) if (phis[i] < phis[refI]) refI = i;
        const fsize = (window.innerWidth <= 640) ? 12 : 14;
        overlayCtx.save();
        overlayCtx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
        imagePositions.forEach(([tx, ty], i) => {
          const [px, py] = toPixel(tx, ty);
          const days = fermatDiffToDays(dtDist, phis[i] - phis[refI]);
          const label = (i === refI) ? '0 d (ref)'
                      : `+${days >= 10 ? days.toFixed(0) : days.toFixed(1)} d`;
          // Pill just to the right of the image circle, clamped on-screen (same style as ruler).
          const tw = overlayCtx.measureText(label).width;
          const boxW = tw + 12, boxH = fsize + 8;
          let cx = px + r_px + 4 + boxW / 2, cy = py;
          cx = Math.min(Wl - boxW / 2 - 2, Math.max(boxW / 2 + 2, cx));
          cy = Math.min(Hl - boxH / 2 - 2, Math.max(boxH / 2 + 2, cy));
          _pillLabel(overlayCtx, label, cx, cy, fsize, dark);
        });
        overlayCtx.restore();
      }
    }
  }
  state._lastPsImages = _psAll;

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
          else if (obj.model === 'pointmass') { a_arc = p.b ?? 1; }
        } else if (obj.model === 'point') {
          a_arc = p.sigma ?? 0.08; q = p.q ?? 1; phi = p.phi ?? 0;  // hard edge: draw at exact radius
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
  if (showMk) {
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
    state._lastCurves = { zs: effectiveCritZs(), crit: critSegs, caus: causSegs };

    overlayCtx.lineWidth = _pal ? Math.max(1.3, Math.min(Wl, Hl) / 450) : 1.3;
    if (_pal) { overlayCtx.lineJoin = 'round'; overlayCtx.lineCap = 'round'; }
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
      if (state.showCritCurves) drawSegs(critFiltered, _pal ? _pal.critical : CRIT_COLOR);
      if (state.showCaustics)   drawSegs(causFiltered, _pal ? _pal.caustic : CAUS_COLOR);
    }
  }

  // ── 3. Legend (top-left) ─────────────────────────────────────────────────────
  const legendItems = [];
  if (state.showCritCurves && hasLens) legendItems.push({ color: _pal ? _pal.critical : CRIT_COLOR, label: 'Critical curves', isLine: true });
  if (state.showCaustics   && hasLens) legendItems.push({ color: _pal ? _pal.caustic : CAUS_COLOR, label: 'Caustics',        isLine: true });
  if (showMk) {
    const hasLensObj   = state.planes.some(p => p.objects.some(o => o.type === 'lens'   && !o.hybridId));
    const hasSrcObj    = state.planes.some(p => p.objects.some(o => o.type === 'source' && !o.hybridId));
    const hasHybridObj = state.planes.some(p => p.objects.some(o => o.hybridId));
    if (hasLensObj)   legendItems.push({ color: typeColorHex('lens'),   label: 'Lens',   isDot: true, markerType: 'lens'   });
    if (hasSrcObj)    legendItems.push({ color: typeColorHex('source'), label: 'Source', isDot: true, markerType: 'source' });
    if (hasHybridObj) legendItems.push({ color: typeColorHex('hybrid'), label: 'Hybrid', isDot: true, markerType: 'hybrid' });
  }
  // Dashed-ellipse "show shape" outlines get a legend entry so the dotted line reads.
  // Only the ellipse-drawing models qualify; the external-field models (shear /
  // convergence / deflection) draw solid arrows, not a dotted shape.
  const _ELLIPSE_LENS = new Set(['sie', 'nie', 'epl', 'pointmass']);
  const _ELLIPSE_SRC  = new Set(['gaussian', 'exponential', 'point']);
  const _anyShape = (type, models) => state.planes.some(p => p.objects.some(o =>
    o.showShape && !o.hidden && o.type === type && models.has(o.model)));
  if (_anyShape('lens',   _ELLIPSE_LENS)) legendItems.push({ color: typeColorHex('lens'),   label: 'Lens shape',   isDash: true });
  if (_anyShape('source', _ELLIPSE_SRC))  legendItems.push({ color: typeColorHex('source'), label: 'Source shape', isDash: true });

  if (state.showLegend && !hideOv && legendItems.length > 0) {
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
      } else if (item.isDash) {
        overlayCtx.strokeStyle = item.color; overlayCtx.lineWidth = _mob ? 1.5 : 2;
        overlayCtx.setLineDash(_mob ? [4, 3] : [6, 4]);
        overlayCtx.beginPath(); overlayCtx.moveTo(ix, iy); overlayCtx.lineTo(ix + iconW, iy); overlayCtx.stroke();
        overlayCtx.setLineDash([]);
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
  if (state.vizMode === 6 && !hideOv) {
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
      const by     = Hl - boxH - 44;   // 44px clears the scale bar in the bottom-right corner

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
    const _mob    = window.innerWidth <= 640;
    const fsize   = _mob ? 12 : 14;
    const accent  = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4da3ff';
    const segs    = [...state.rulers, state.rulerDraft].filter(Boolean);

    overlayCtx.setLineDash([]);
    overlayCtx.lineCap = 'round';
    for (const seg of segs) {
      const [x0, y0] = toPixel(seg.x0, seg.y0);
      const [x1, y1] = toPixel(seg.x1, seg.y1);
      const selected = seg.id && seg.id === state.selectedRulerId;
      const lineCol  = selected ? accent : mainCol;

      // Line: wide translucent halo underneath, then the crisp main stroke.
      overlayCtx.strokeStyle = haloCol; overlayCtx.lineWidth = selected ? 5 : 4;
      overlayCtx.beginPath(); overlayCtx.moveTo(x0, y0); overlayCtx.lineTo(x1, y1); overlayCtx.stroke();
      overlayCtx.strokeStyle = lineCol; overlayCtx.lineWidth = selected ? 2.4 : 1.6;
      overlayCtx.beginPath(); overlayCtx.moveTo(x0, y0); overlayCtx.lineTo(x1, y1); overlayCtx.stroke();

      // Endpoints: plain dots, or larger ringed grab handles when selected.
      const er = selected ? 4.5 : 3;
      for (const [ex, ey] of [[x0, y0], [x1, y1]]) {
        overlayCtx.beginPath(); overlayCtx.arc(ex, ey, er, 0, Math.PI * 2);
        overlayCtx.fillStyle = lineCol; overlayCtx.fill();
        if (selected) {
          overlayCtx.strokeStyle = haloCol; overlayCtx.lineWidth = 1.5; overlayCtx.stroke();
        }
      }

      // Distance (arcsec) + position angle (CCW from +x, y-up), normalised to 0–360°.
      const dx = seg.x1 - seg.x0, dy = seg.y1 - seg.y0;
      const dist = Math.hypot(dx, dy);
      const ang  = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      const label = `${dist.toFixed(2)}″ · ${Math.round(ang)}°`;

      // Label pill near the midpoint, nudged perpendicular to the line, clamped on-screen.
      overlayCtx.font = `${fsize}px system-ui, -apple-system, sans-serif`;
      const boxW = overlayCtx.measureText(label).width + 12, boxH = fsize + 8;
      const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
      const segLen = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / segLen, ny = (x1 - x0) / segLen; // unit normal
      const off = boxH / 2 + 6;
      let cx = midX + nx * off, cy = midY + ny * off;
      cx = Math.min(Wl - boxW / 2 - 2, Math.max(boxW / 2 + 2, cx));
      cy = Math.min(Hl - boxH / 2 - 2, Math.max(boxH / 2 + 2, cy));
      _pillLabel(overlayCtx, label, cx, cy, fsize, dark);
    }
  }

  // ── 6. Angular scale bar (bottom, centred) ───────────────────────────────────
  // Length snaps to a round value as the FOV changes: 1″ (fov ≤ 6), 2″ (≤ 10),
  // 5″ (≤ 30), 10″ above. Drawn on the overlay, so it appears in captures.
  if (needScale) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const s    = state.fov <= 6 ? 1 : state.fov <= 10 ? 2 : state.fov <= 30 ? 5 : 10;
    const wpx  = s / state.fov * Wl;
    const y    = Hl - 14;
    const x1   = Wl - 12, x0 = x1 - wpx;  // bottom-right corner
    const col  = dark ? '#ffffff' : '#000000';
    overlayCtx.strokeStyle = col;
    overlayCtx.lineWidth   = 1.5;
    overlayCtx.beginPath();
    overlayCtx.moveTo(x0, y); overlayCtx.lineTo(x1, y);          // bar
    overlayCtx.moveTo(x0, y - 4); overlayCtx.lineTo(x0, y + 4);  // end caps
    overlayCtx.moveTo(x1, y - 4); overlayCtx.lineTo(x1, y + 4);
    overlayCtx.stroke();
    overlayCtx.fillStyle    = col;
    overlayCtx.font         = `${window.innerWidth <= 640 ? 11 : 12}px system-ui, -apple-system, sans-serif`;
    overlayCtx.textAlign    = 'center';
    overlayCtx.textBaseline = 'bottom';
    overlayCtx.fillText(`${s}″`, (x0 + x1) / 2, y - 5);
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
  const on = !!info && state.showColorbar && !state.hideOverlays && !state.lineArt;
  // The colorbar keeps the bottom-left corner; this class lifts the ruler
  // cluster and warning badges clear of it (see --sl-bl-lift in the CSS).
  document.getElementById('sl-image-wrap')?.classList.toggle('sl-colorbar-visible', on);
  if (!on) { bar.style.display = 'none'; return; }
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
  return { ...vs, contourSpacing: state.contourSpacing, contourScale: state.contourScale };
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

  if (state.lineArt) {
    // Line-art mode draws everything as vectors on the overlay; skip the raster GL
    // pass entirely (the opaque overlay background covers the GL canvas).
    state.fermatPoints = null;
    state.saddlePhis = [];
  } else if (state.vizMode !== 0) {
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
  const _t0 = performance.now();
  drawOverlay();
  reportPerf(performance.now() - _t0);
  reportObjectCap();
  updateOverlayChips();
  updateZsChip();
}

// ── Capture & recording ───────────────────────────────────────────────────────

// Composite the WebGL canvas (always in surface brightness mode) + overlay.
// Composite the GL canvas + overlay (markers/curves/legend) into a flat 2D canvas,
// reflecting whatever is currently on screen. UI chrome (the viz-mode chip, colorbar,
// sidebar) lives in separate DOM elements and is intentionally NOT included.
function buildCompositeCanvas() {
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  // Line-art mode: the overlay already holds the opaque background + all vectors,
  // so it IS the finished image. Skip the (skipped/stale) GL layer and colorbar.
  if (state.lineArt) {
    const off = document.createElement('canvas');
    off.width  = ov.width;
    off.height = ov.height;
    off.getContext('2d').drawImage(ov, 0, 0);
    return off;
  }
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

// Scalable-vector serialisation of the Line-art view. Recomputes the same geometry
// as the on-screen line art (disc-image outlines, critical curves / caustics,
// point-source dots) via the shared lens.js extractors and returns an SVG document
// string, so the output is resolution-independent and editable in vector tools.
function buildLineArtSVGString() {
  if (!state.lineArt || !state.dist) return null;
  const pal = lineArtPalette();
  const S   = 1000;                 // SVG user units (square viewBox)
  const fov = state.fov;
  const sw  = (S / 400).toFixed(2);
  const map = (ax, ay) => [ +((ax / fov + 0.5) * S).toFixed(2), +((-ay / fov + 0.5) * S).toFixed(2) ];
  const pathD = (poly) => {
    if (!poly || poly.length < 2) return '';
    let d = 'M' + map(poly[0][0], poly[0][1]).join(',');
    for (let i = 1; i < poly.length; i++) d += 'L' + map(poly[i][0], poly[i][1]).join(',');
    return d;
  };

  const planes      = state.planes;
  const laGridN     = Math.min(state.critGridN, 384);
  const samplingFov = fov * 1.3;
  const lensesInFront = (idx) => planes.slice(0, idx).some(p => p.objects.some(o => o.type === 'lens' && !o.hidden));

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">`,
    `<rect width="${S}" height="${S}" fill="${pal.bg}"/>`,
  ];

  // Uniform-disc lensed-image outlines.
  planes.forEach((plane, idx) => {
    const discs = plane.objects.filter(o => o.type === 'source' && o.model === 'point' && !o.hidden);
    if (!discs.length) return;
    const grid = lensesInFront(idx) ? traceSourceGrid(planes, state.dist, idx, samplingFov, laGridN) : null;
    for (const disc of discs) {
      let polys = grid
        ? chainSegments(computeDiscImageOutlines(planes, state.dist, idx,
            { cx: disc.cx, cy: disc.cy, sigma: disc.params.sigma, q: disc.params.q, phi: disc.params.phi }, samplingFov, laGridN, grid))
        : [discEllipsePoly(disc)];
      if (state.lineArtSmooth) polys = smoothPolylines(polys);
      const d = polys.map(pathD).join(' ');
      if (!d) continue;
      const fill = state.lineArtFill ? `fill="${pal.imageFill}" fill-opacity="0.9" fill-rule="evenodd"` : 'fill="none"';
      parts.push(`<path d="${d}" ${fill} stroke="${pal.imageStroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  });

  // Critical curves / caustics (chained + smoothed for clean vector paths).
  if ((state.showCritCurves || state.showCaustics) && planes.some(p => p.objects.some(o => o.type === 'lens'))) {
    const res = computeCritCurvesForZs(planes, state.dist, effectiveCritZs(), samplingFov, state.critGridN);
    const _h  = fov / 2;
    const clip = (segs, m) => segs.filter(([[x0,y0],[x1,y1]]) =>
      (Math.abs(x0)<=_h*m && Math.abs(y0)<=_h*m) || (Math.abs(x1)<=_h*m && Math.abs(y1)<=_h*m));
    if (res.critSegments.length >= 50) {
      const emit = (segs, color) => {
        let ps = chainSegments(segs); if (state.lineArtSmooth) ps = smoothPolylines(ps);
        const d = ps.map(pathD).join(' ');
        if (d) parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
      };
      if (state.showCaustics)   emit(clip(res.causticSegments, 2.5), pal.caustic);
      if (state.showCritCurves) emit(clip(res.critSegments, 1),   pal.critical);
    }
  }

  // Point-source image dots.
  for (const plane of planes) for (const obj of plane.objects) {
    if (obj.type !== 'source' || obj.model !== 'pointsource' || obj.hidden) continue;
    const r = Math.max((obj.params.sigma ?? 0.05) / fov * S, 2.5).toFixed(2);
    for (const [tx, ty] of findPointSourceImages(obj, plane)) {
      const [cx, cy] = map(tx, ty);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pal.pointImage}"/>`);
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function exportLineArtSVG() {
  const svg = buildLineArtSVGString();
  if (svg) downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'caustica-lineart.svg');
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

// Tour helpers: the plane setup lives in the Scene tab (with the timeline shown
// alongside it on mobile), so "opening" it just selects that tab.
function _tourOpenPlaneSetup()  { setRailTab('scene'); }
function _tourClosePlaneSetup() { setRailTab('scene'); }
function _tourSetTab(tab)       { setRailTab(tab); }
// On mobile the rail sits below the image; scroll the image back into view for
// steps that talk about it.
function _tourShowImage() {
  if (window.innerWidth <= 640)
    document.getElementById('sl-image-wrap')?.scrollIntoView({ block: 'start' });
}

const TOUR_STEPS = [
  {
    target: '.sl-axis-wrap',
    onEnter: _tourOpenPlaneSetup,
    arrow: 'above',
    label: 'Redshift timeline',
    text: 'This axis is your line of sight, from the observer at z = 0 out to high redshift. Click anywhere on it to add a plane at that redshift, drag a marker to move a plane along the line of sight, and click a marker to select that plane.',
  },
  {
    target: '#sl-plane-card',
    onEnter: _tourOpenPlaneSetup,
    arrow: 'left',
    label: 'Plane viewer',
    text: 'The selected plane is a slice of the sky at its redshift, shown here. The tool column picks what a click on this canvas creates: a <b>Lens</b> that bends light, a <b>Source</b> that emits it, or a <b>Hybrid</b> that does both (keys <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>). With no tool active a click only selects and drags, so click the highlighted tool again (or press <kbd>Esc</kbd>) to stop placing objects. The <b>‹ ›</b> arrows (or a horizontal swipe on touch) step through the planes; the <b>z</b> field retunes the redshift, <b>Clear</b> (key <kbd>O</kbd>) empties the plane, and <b>Delete</b> (key <kbd>X</kbd>) removes it.',
  },
  {
    target: '#sl-obj-panel',
    onEnter: () => { _tourSetTab(window.innerWidth <= 640 ? 'object' : 'scene'); },
    arrow: 'left',
    label: 'Object controls',
    text: 'Select any object to edit it here. The dropdown sets the objects mass or light profile shape. The <b>ⓘ</b> button explains each parameter for a given profile, and <kbd>H</kbd> can be used to hide the selected object temporarily.',
  },
  {
    target: '#sl-image-wrap',
    onEnter: () => { _tourClosePlaneSetup(); _tourShowImage(); },
    arrow: 'right',
    label: 'Lensed image',
    text: 'This is what the observer at z = 0 sees. Light from every source is bent by all the lenses in front of it, with full multiplane lensing. Drag objects here or in the plane viewer and the image updates in real time. Zoom with the mouse wheel or a two-finger pinch; the scale bar at the bottom right keeps track of the angular scale.',
  },
  {
    target: '#sl-image-wrap',
    onEnter: () => {
      _tourClosePlaneSetup();
      state.showCritCurves = true;
      state.showCaustics   = true;
      setVizMode(0);
      _tourShowImage();
    },
    arrow: 'right',
    label: 'Critical curves',
    text: 'The <b>Critical curves</b> are where magnification formally diverges, and the <b>caustics</b> are the critical curves mapped onto the source plane. Press <kbd>C</kbd> to toggle them, use the chips beside the view dropdown, or the View tab.',
  },
  {
    target: '#sl-viz-mode',
    onEnter: () => {
      _tourClosePlaneSetup();
      state.showCritCurves = false;
      state.showCaustics   = false;
      setVizMode(6);
      _tourShowImage();
    },
    arrow: 'below',
    label: 'Lensing quantities',
    text: 'This dropdown maps a lensing quantity across the field: convergence κ, shear γ, magnification |μ|, deflection |α|, or the <b>Fermat potential φ</b> shown here. Its contours trace light arrival time, and the marked points are the images of the source (a minimum, saddle, or maximum of that surface). Press <kbd>I</kbd> to return to the lensed image.',
  },
  {
    target: '#sl-image-wrap',
    mobileOnly: true,
    onEnter: () => { _tourShowImage(); _tourShowSwipeHint('sl-image-wrap'); },
    arrow: 'below',
    label: 'Swipe to switch views',
    text: 'On touch screens you can also <b>swipe the image left or right</b> to cycle through these views, from the lensed image through each quantity map.',
  },
  {
    target: '#sl-plane-card',
    mobileOnly: true,
    onEnter: () => {
      _tourOpenPlaneSetup();
      document.getElementById('sl-plane-card')?.scrollIntoView({ block: 'nearest' });
      _tourShowSwipeHint('sl-plane-viewgroup', true);
    },
    arrow: 'above',
    label: 'Swipe to switch planes',
    text: 'The plane viewer works the same way: <b>swipe left or right</b> across its canvas to step through the planes.',
  },
  {
    target: '.sl-rail-tab-btn[data-tab="view"]',
    onEnter: () => { _tourSetTab('view'); setVizMode(0); },
    arrow: 'left',
    label: 'View tab',
    text: 'View holds everything about how the scene is displayed: the field of view, the reference source redshift z<sub>s</sub> used by the quantity maps and critical curves, overlay toggles, and the color mapping / brightness stretch.',
  },
  {
    target: '.sl-rail-tab-btn[data-tab="export"]',
    onEnter: () => { _tourSetTab('export'); },
    arrow: 'left',
    label: 'Export tab',
    text: 'Export saves pictures, movies, and data. <b>Live</b> recording captures whatever you do as a WebM or GIF (key <kbd>R</kbd> starts and stops it); <b>Programmatic</b> animates objects between set start and end positions; Save PNG grabs a still. The <b>Data</b> section exports critical curves, caustics, and point-source image positions as CSV.',
  },
  {
    target: '.sl-rail-tab-btn[data-tab="quality"]',
    onEnter: () => { _tourSetTab('quality'); },
    arrow: 'left',
    label: 'Settings',
    text: 'The gear holds two things. <b>Cosmology</b> lets you vary H<sub>0</sub> and &Omega;<sub>m</sub> (flat &Lambda;CDM), which rescales time delays and shifts the distance ratios behind the lensing. <b>Quality &amp; performance</b> trades accuracy or sharpness against redraw speed: the critical-curve resolution, the point-source image-finding grid, and the render scale. If a scene feels slow, come here.',
  },
  {
    target: '.sl-topbar',
    onEnter: () => { _tourSetTab('scene'); setVizMode(0); },
    arrow: 'below',
    label: 'Ready to explore',
    text: 'That is the tour. Everything else lives in this top bar: <b>undo / redo</b> for scene edits, the <b>preset</b> dropdown for ready-made scenes, <b>Save / Load</b> for YAML configurations, <b>Docs</b> for all the physics, <b>Tour</b> to replay this walkthrough, <kbd>?</kbd> for every keyboard shortcut, and the <b>theme</b> toggle. Now build a scene: add planes and objects, and watch the lensed image respond.',
    final: true,
  },
];

function _tourClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Position the highlight box around targetRect. Each edge is padded then clamped to the
// viewport INDEPENDENTLY, so a side that hugs a screen edge (e.g. the plane strip or the
// full-width mobile redshift axis) keeps its alignment with the target while the other
// sides keep their pad. The clamp floor is capped at the target's own edge: a constant
// inset would pull a viewport-flush edge 7px INSIDE the element, visibly offsetting the
// box off the target (worst on the bottom timeline elements). Flush edges instead draw
// the ring at the screen edge, sacrificing the soft outer ring on that side only.
function _positionSpotlight(targetRect) {
  if (!targetRect || targetRect.width === 0) {
    tour.spotlight.classList.add('no-target');
    Object.assign(tour.spotlight.style, { left: '50%', top: '50%', width: '0', height: '0' });
    return;
  }
  tour.spotlight.classList.remove('no-target');
  const pad = 6, inset = 7;   // inset exceeds the 5px accent-soft ring so it stays visible
  const vw = window.innerWidth, vh = window.innerHeight;
  const left   = Math.max(targetRect.left   - pad, Math.min(inset,      targetRect.left));
  const top    = Math.max(targetRect.top    - pad, Math.min(inset,      targetRect.top));
  const right  = Math.min(targetRect.right  + pad, Math.max(vw - inset, targetRect.right));
  const bottom = Math.min(targetRect.bottom + pad, Math.max(vh - inset, targetRect.bottom));
  Object.assign(tour.spotlight.style, {
    left:   `${left}px`,
    top:    `${top}px`,
    width:  `${Math.max(0, right - left)}px`,
    height: `${Math.max(0, bottom - top)}px`,
  });
}

const tour = {
  active: false, step: 0,
  steps: [],      // TOUR_STEPS filtered for this run (mobileOnly steps drop out on desktop)
  cleanup: null,  // per-step teardown (e.g. the swipe hint), run on step change / tour end
  backdrop: null, spotlight: null, tooltip: null, quitBtn: null,
};

// Remove the current step's artifact (if any) before entering another step or
// ending the tour.
function _tourStepCleanup() {
  if (!tour.cleanup) return;
  try { tour.cleanup(); } catch (_) {}
  tour.cleanup = null;
}

// Animated ‹ • › hint overlaid on a container during the mobile swipe tour
// steps: the dot slides left and right to suggest the gesture. compact is the
// smaller variant sized for the plane viewer's canvas.
function _tourShowSwipeHint(containerId, compact) {
  const host = document.getElementById(containerId);
  if (!host || document.getElementById('sl-swipe-hint')) return;
  const hint = document.createElement('div');
  hint.id = 'sl-swipe-hint';
  hint.className = 'sl-swipe-hint' + (compact ? ' sl-swipe-hint-compact' : '');
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = '<span class="sl-swipe-hint-chevron">‹</span><span class="sl-swipe-hint-dot"></span><span class="sl-swipe-hint-chevron">›</span>';
  host.appendChild(hint);
  tour.cleanup = () => hint.remove();
}

// ── First-visit tour nudge ────────────────────────────────────────────────────
// One-time callout for new visitors: the Tour button takes accent styling and a
// small bubble hangs beneath it. Clicking the bubble starts the tour (it is a
// child of the button, so the click bubbles into the existing listener). The
// first interaction anywhere else — pointer or key — dismisses it, and either
// way a localStorage flag stops it ever appearing again on this browser.
let _tourNudge = null;

function _initTourNudge() {
  try { if (localStorage.getItem('causticaTourPrompted')) return; } catch {}
  const btn = document.getElementById('sl-demo');
  if (!btn) return;
  btn.classList.add('sl-tour-nudge');
  const bubble = document.createElement('span');
  bubble.className = 'sl-tour-bubble';
  bubble.textContent = 'New here? Take the tour';
  btn.appendChild(bubble);
  // Presses on the button (or bubble) are left to the click → startTour path, so
  // removing the bubble mid-press can't swallow the click that starts the tour.
  const onDown = e => { if (!e.target?.closest?.('#sl-demo')) dismissTourNudge(); };
  const onKey  = () => dismissTourNudge();
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  _tourNudge = { btn, bubble, onDown, onKey };
}

function dismissTourNudge() {
  if (!_tourNudge) return;
  document.removeEventListener('pointerdown', _tourNudge.onDown, true);
  document.removeEventListener('keydown', _tourNudge.onKey, true);
  _tourNudge.btn.classList.remove('sl-tour-nudge');
  _tourNudge.bubble.remove();
  _tourNudge = null;
  try { localStorage.setItem('causticaTourPrompted', '1'); } catch {}
}

function _tourKeyHandler(e) {
  if (!tour.active) return;
  if (e.key === 'Enter') { e.preventDefault(); tourNext(); }
  if (e.key === 'Escape') { endTour(); }
}

function startTour() {
  if (tour.active) return;
  dismissTourNudge();
  // The tour demonstrates the overlays and the creation tools, so a hidden
  // canvas makes no sense: drop the temporary clean-plot state and make sure
  // the tools it points at are visible.
  if (state.hideOverlays) {
    state.hideOverlays = false;
    document.querySelector('.sl-body')?.classList.remove('sl-hide-ov');
    _updateColorbar(); updateZsChip(); redraw();
  }
  tour.active = true;
  tour.step   = 0;
  // Mobile-only steps (touch gestures) drop out of the sequence on desktop.
  tour.steps  = TOUR_STEPS.filter(s => !s.mobileOnly || window.innerWidth <= 640);

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
  const s = tour.steps[tour.step];
  if (!s) { endTour(); return; }
  _tourStepCleanup();
  tour.tooltip.style.visibility = 'hidden'; // hide until positioned
  if (s.onEnter) {
    s.onEnter();
    setTimeout(_renderTourStep, 120); // let layout settle after drawer/tab changes
  } else {
    _renderTourStep();
  }
}

function _renderTourStep() {
  const s = tour.steps[tour.step];
  if (!s || !tour.active) return;

  const sel = _tourTargetSel(s);
  let targetRect = null;
  if (sel) {
    const el = document.querySelector(sel);
    if (el) targetRect = el.getBoundingClientRect();
  }

  _positionSpotlight(targetRect);

  const isFinal = !!s.final;
  tour.tooltip.innerHTML = `
    <div class="tt-arrow"></div>
    <div class="tt-step">Step ${tour.step + 1} / ${tour.steps.length} · ${s.label || ''}</div>
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
  const s = tour.steps[tour.step];
  if (!s) return;
  const sel = _tourTargetSel(s);
  let targetRect = null;
  if (sel) {
    const el = document.querySelector(sel);
    if (el) targetRect = el.getBoundingClientRect();
  }
  _positionSpotlight(targetRect);
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
  if (tour.step >= tour.steps.length) { endTour(); return; }
  showTourStep();
}

function endTour() {
  if (!tour.active) return;
  tour.active = false;
  _tourStepCleanup();
  _tourClosePlaneSetup();
  window.removeEventListener('resize', repositionTour);
  document.removeEventListener('keydown', _tourKeyHandler);
  tour.backdrop?.remove();  tour.spotlight?.remove();  tour.tooltip?.remove();
  tour.backdrop = tour.spotlight = tour.tooltip = null;
}
