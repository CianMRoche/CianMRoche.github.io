// simpleLens — main.js

import { Renderer }                            from './renderer.js';
import { precomputeDistances,
         computeCriticalCurves,
         angDiamDist,
         angDiamDistBetween }                  from './lens.js';

// ── ID generator ──────────────────────────────────────────────────────────────
let _nextId = 1;
function uid() { return _nextId++; }

// ── Type colors — lens = blue/cyan, source = amber ────────────────────────────
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
let _hybridExpanded = { lens: false, src: false };
let _lastHybridId   = null;

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
const state = {
  fov:             4.0,
  zMax:            3.0,
  planes:          [],
  selectedPlaneId: null,
  selectedObjId:   null,
  showCritCurves:  false,
  showCaustics:    false,
  showMarkers:     true,
  showLegend:      true,
  addMode:         'lens',   // 'lens' | 'source' | 'hybrid' — global tool state
  toneMap:         1,   // 0=linear, 1=sqrt, 2=power, 3=asinh
  toneMapPower:    0.5,
  toneMapAsinh:    5.0,
  critGridN:       512,
  critZs:          null,  // null = auto (highest-z source plane)
  dist:            null,
};

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

function defaultParams(model) {
  if (model === 'pointmass')   return { thetaE: 1.0 };
  if (model === 'sie')         return { b: 1.0, q: 0.75, phi: 0 };
  if (model === 'epl')         return { b: 1.0, q: 0.75, phi: 0, gamma: 2.0 };
  if (model === 'nfw')         return { kappaS: 0.5, rS: 0.4 };
  if (model === 'gaussian')    return { sigma: 0.06, q: 1.0,  phi: 0, amplitude: 1.0,  color: '#ffffff' };
  if (model === 'exponential') return { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20, color: '#ffffff' };
  if (model === 'point')       return { sigma: 0.08, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pastedimage') return { amplitude: 1.0 };
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
    console.error('simpleLens renderer init failed:', err);
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
  div.appendChild(h); div.appendChild(s);
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
        <h1>simpleLens</h1>
        <a class="sl-back-btn" href="/side_projects/">← Side projects</a>
        <a class="sl-demo-btn" href="/simplelens-how-it-works/" target="_blank" rel="noopener">Docs</a>
        <button class="sl-demo-btn" id="sl-demo" title="Walk through a tour of the controls">Tour</button>
        <button class="sl-theme-btn" id="sl-theme" title="Toggle dark mode" aria-label="Toggle dark mode">
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
  // sidebarEl no longer used — renderSidebar targets sl-params-col / sl-settings-col directly.
  overlayCtx = document.getElementById('sl-overlay').getContext('2d');
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function attachHandlers() {
  document.getElementById('sl-demo').addEventListener('click', startTour);
  document.getElementById('sl-theme').addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    applyThemeIcons(next);
    rebuildPlaneBoxes(); renderSidebar(); redraw();
  });
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');

  // Tab switching — static buttons, wired once.
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
    const btn = document.getElementById('sl-plane-setup-btn');
    const open = tl.classList.toggle('plane-setup-open');
    btn.textContent = open ? '▼ Plane Setup' : '▲ Plane Setup';
    if (open) { setTimeout(drawAxisCanvas, 150); }
  });
  // Set initial caret state.
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

  attachAxisHandlers();
  attachImageHandlers(document.getElementById('sl-image-wrap'));

  // Paste image from clipboard — applies to the currently selected pastedimage object.
  document.addEventListener('paste', e => {
    const obj = selectedObj();
    if (!obj || obj.model !== 'pastedimage') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
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
        rebuildPlaneBoxes();
        renderSidebar();
        redraw();
      };
      img.src = url;
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
    if (e.key === 'Escape') {
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

function attachImageHandlers(wrap) {
  let imgDrag = null; // { obj, plane, startCx, startCy, startMx, startMy }

  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
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
    if (!imgDrag) {
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
    if (!imgDrag) return;
    invalidateDistances();
    redraw();
    wrap.style.cursor = '';
    imgDrag = null;
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

    box.innerHTML = `
      <div class="sl-plane-header">
        <span class="sl-plane-z">z = ${plane.z.toFixed(2)}</span>
        <button class="sl-plane-clear" title="Clear all objects">○</button>
        <button class="sl-plane-del" title="Delete plane">×</button>
      </div>
      <canvas class="sl-plane-canvas" width="148" height="148"></canvas>`;

    planesEl.appendChild(box);

    // Clear button removes all objects from this plane.
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
  // Prevent iOS Safari from cancelling pointer events inside position:fixed ancestors.
  canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

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
  const ctx   = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
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
    // Hybrid pairs share a position — draw only once as a single purple dot.
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
    const rad = 6;
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
  sie: `<b>b</b> — Deflection scale (arcsec), equal to 4πσ<sub>v</sub>²/c². Proportional to the velocity dispersion squared; independent of distances. The Einstein ring appears at roughly b × (D<sub>LS</sub>/D<sub>S</sub>).<br>
        <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
        <b>φ</b> — Position angle of the major axis (radians).`,
  pointmass: `<b>Strength</b> — Mass scale (arcsec): equal to √(4GM / c² D<sub>L</sub>). For a fixed lens redshift, D<sub>L</sub> is constant, so Strength is proportional to √M. The Einstein ring appears at Strength × √(D<sub>LS</sub> / D<sub>S</sub>), so its size also depends on the redshift geometry.`,
  epl: `<b>b</b> — Deflection scale (arcsec). Same meaning as for the SIE; the Einstein ring appears at roughly b × (D<sub>LS</sub>/D<sub>S</sub>).<br>
        <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
        <b>φ</b> — Position angle of the major axis (radians).<br>
        <b>γ</b> — Power-law slope. γ = 2 is isothermal (identical to SIE). γ &lt; 2 gives a steeper central density; γ &gt; 2 gives a shallower one. Typical galaxies have γ ≈ 1.9–2.1.`,
};
const SOURCE_INFO = `
  <b>σ</b> — Source size (arcsec): 1σ half-width of the brightness profile.<br>
  <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
  <b>φ</b> — Position angle of the major axis (radians).<br>
  <b>Amplitude</b> — Peak surface brightness.`;

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

  // ── Params panel (built first — used in settingsContent below) ──────────────
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
        <option value="epl"       ${lensObj.model==='epl'       ?'selected':''}>EPL (Power law)</option>
        <option value="pointmass" ${lensObj.model==='pointmass' ?'selected':''}>Point mass</option>`;
      const srcModelOpts = `
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
            <button class="sl-hybrid-hdr" id="sl-hybrid-lens-hdr">
              <span class="sl-hybrid-arrow">${lensExp ? '▾' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Lens</span>
              ${infoSection('sl-param-info-lens', LENS_INFO[lensObj.model] ?? '')}
            </button>
            ${lensExp ? `<div class="sl-hybrid-body" data-hybrid-section="lens">
              <select class="sl-select" id="sl-model-select-lens">${lensModelOpts}</select>
              ${lensParamRows(lensObj)}
            </div>` : ''}
          </div>
          <div class="sl-hybrid-section">
            <button class="sl-hybrid-hdr" id="sl-hybrid-src-hdr">
              <span class="sl-hybrid-arrow">${srcExp ? '▾' : '▶'}</span>
              <span class="sl-panel-title" style="flex:1">Source</span>
              ${infoSection('sl-param-info-src', SOURCE_INFO)}
            </button>
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
           <option value="epl"       ${obj.model==='epl'       ?'selected':''}>EPL (Power law)</option>
           <option value="pointmass" ${obj.model==='pointmass' ?'selected':''}>Point mass</option>`
        : `<option value="gaussian"    ${obj.model==='gaussian'    ?'selected':''}>Gaussian</option>
           <option value="exponential" ${obj.model==='exponential' ?'selected':''}>Exponential</option>
           <option value="point"       ${obj.model==='point'       ?'selected':''}>Uniform circle</option>
           <option value="pastedimage" ${obj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;
      const infoHtml = isLens
        ? infoSection('sl-param-info', LENS_INFO[obj.model] ?? '')
        : infoSection('sl-param-info', SOURCE_INFO);
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
          ${isLens ? lensParamRows(obj) : sourceParamRows(obj)}
        </div>`;
    }
  } else {
    paramsPanel = `<div class="sl-panel"><div class="sl-empty-msg">Click an object in a plane box to edit its parameters.</div></div>`;
  }

  // ── Settings tab ─────────────────────────────────────────────────────────────
  const settingsContent = `
    <div class="sl-panel">
      <div class="sl-global-input">
        <label>Field of view</label>
        <input type="number" id="sl-fov" min="0.5" max="20" step="0.5" value="${state.fov}">
        <span class="sl-unit">"</span>
      </div>
      <div class="sl-global-input">
        <label>z max</label>
        <input type="number" id="sl-zmax" min="0.1" max="10" step="0.1" value="${state.zMax}">
      </div>
      <div class="sl-checkbox-row">
        <label><input type="checkbox" id="sl-show-markers" ${state.showMarkers?'checked':''}> Show source/lens positions</label>
        <label><input type="checkbox" id="sl-show-legend"  ${state.showLegend ?'checked':''}> Show legend</label>
      </div>
      <div class="sl-global-input">
        <label>Tone map</label>
        <select id="sl-tone-map">
          <option value="0" ${state.toneMap===0?'selected':''}>Linear</option>
          <option value="1" ${state.toneMap===1?'selected':''}>Square root</option>
          <option value="2" ${state.toneMap===2?'selected':''}>Power law</option>
          <option value="3" ${state.toneMap===3?'selected':''}>Asinh</option>
        </select>
      </div>
      ${state.toneMap === 2 ? `
      <div class="sl-global-input">
        <label>Power (γ)</label>
        <input type="range" id="sl-tone-power" min="0.1" max="1.0" step="0.05" value="${state.toneMapPower}">
        <span class="sl-tone-param-val">${state.toneMapPower.toFixed(2)}</span>
      </div>` : ''}
      ${state.toneMap === 3 ? `
      <div class="sl-global-input">
        <label>Scale (a)</label>
        <input type="range" id="sl-tone-asinh" min="0.5" max="20" step="0.5" value="${state.toneMapAsinh}">
        <span class="sl-tone-param-val">${state.toneMapAsinh.toFixed(1)}</span>
      </div>` : ''}

      <div class="sl-subsection-header">Critical Curves <kbd>C</kbd></div>
      <p class="sl-perf-note">(Can be slow at high resolutions.)</p>
      <div class="sl-checkbox-row">
        <label><input type="checkbox" id="sl-show-crit" ${state.showCritCurves?'checked':''}> Show critical curves</label>
        <label><input type="checkbox" id="sl-show-caus" ${state.showCaustics   ?'checked':''}> Show caustics</label>
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
      <div class="sl-global-input">
        <label>Source z<sub>s</sub></label>
        <input type="number" id="sl-crit-zs" min="0.1" max="15" step="0.1" value="${ezs.toFixed(2)}">
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
          <b>WebM</b> — fast, browser-native. Critical curves are hidden during programmatic recording to keep frame timing correct.<br><br>
          <b>GIF</b> — auto-looping, universally shareable. Slower to encode, 256 colors. GIF programmatic recording includes critical curves at full resolution.<br><br>
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

      <div class="sl-rec-subsection-label">Programmatic</div>

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
    </div>`;


  document.getElementById('sl-obj-panel').innerHTML     = paramsPanel;
  document.getElementById('sl-tab-settings').innerHTML  = settingsContent;
  document.getElementById('sl-tab-recording').innerHTML = recordingPanel;

  document.getElementById('sl-fov')?.addEventListener('change',         e => { const v = parseFloat(e.target.value); if (v > 0) { state.fov  = v; redraw(); } });
  document.getElementById('sl-zmax')?.addEventListener('change',        e => { const v = parseFloat(e.target.value); if (v > 0) { state.zMax = v; drawAxisCanvas(); } });
  document.getElementById('sl-show-markers')?.addEventListener('change',e => { state.showMarkers = e.target.checked; redraw(); });
  document.getElementById('sl-show-legend')?.addEventListener('change', e => { state.showLegend  = e.target.checked; redraw(); });
  document.getElementById('sl-tone-map')?.addEventListener('change', e => {
    state.toneMap = parseInt(e.target.value, 10);
    renderSidebar(); redraw();
  });
  document.getElementById('sl-tone-power')?.addEventListener('input', e => {
    state.toneMapPower = parseFloat(e.target.value);
    const v = e.target.parentElement.querySelector('.sl-tone-param-val');
    if (v) v.textContent = state.toneMapPower.toFixed(2);
    redraw();
  });
  document.getElementById('sl-tone-asinh')?.addEventListener('input', e => {
    state.toneMapAsinh = parseFloat(e.target.value);
    const v = e.target.parentElement.querySelector('.sl-tone-param-val');
    if (v) v.textContent = state.toneMapAsinh.toFixed(1);
    redraw();
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
  document.getElementById('sl-crit-zs')?.addEventListener('change',  e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; redraw(); } });
  document.getElementById('sl-show-crit')?.addEventListener('change', e => { state.showCritCurves = e.target.checked; redraw(); });
  document.getElementById('sl-show-caus')?.addEventListener('change', e => { state.showCaustics   = e.target.checked; redraw(); });

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
      // Lens section model + params
      document.getElementById('sl-model-select-lens')?.addEventListener('change', e => {
        lensObj.model = e.target.value; lensObj.params = defaultParams(lensObj.model);
        renderSidebar(); redraw();
      });
      document.getElementById('sl-model-select-src')?.addEventListener('change', e => {
        srcObj.model = e.target.value; srcObj.params = defaultParams(srcObj.model);
        renderSidebar(); redraw();
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="lens"] input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          lensObj.params[inp.dataset.param] = parseFloat(inp.value);
          if (valEl) valEl.textContent = fmtP(parseFloat(inp.value));
          redraw();
        });
      });
      document.getElementById('sl-obj-panel').querySelectorAll('[data-hybrid-section="src"] input[type="range"][data-param]').forEach(inp => {
        const valEl = inp.parentElement.querySelector('.sl-param-val');
        inp.addEventListener('input', () => {
          srcObj.params[inp.dataset.param] = parseFloat(inp.value);
          if (valEl) valEl.textContent = fmtP(parseFloat(inp.value));
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
      document.getElementById('sl-model-select')?.addEventListener('change', e => {
        obj.model = e.target.value; obj.params = defaultParams(obj.model);
        renderSidebar(); redraw();
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
          obj.params[inp.dataset.param] = parseFloat(inp.value);
          if (valEl) valEl.textContent = fmtP(parseFloat(inp.value));
          redraw();
        });
      });
    }
  }
}

function fmtP(v) { return v.toFixed(2); }

function sliderRow(label, key, min, max, step, val) {
  return `<div class="sl-param-row">
    <span class="sl-param-label">${label}</span>
    <input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="sl-param-val">${fmtP(val)}</span>
  </div>`;
}

function shapeToggle(obj) {
  return `<label class="sl-shape-toggle">
    <input type="checkbox" id="sl-show-shape" ${obj.showShape ? 'checked' : ''}>
    Show shape
  </label>`;
}

function lensParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'pointmass')
    return sliderRow('Strength (")', 'thetaE', 0.1, 3.0, 0.05, p.thetaE ?? 1)
         + shapeToggle(obj);
  if (obj.model === 'sie')
    return sliderRow('b (")',   'b',   0.1, 3.0,     0.05, p.b   ?? 1)
         + sliderRow('q',       'q',   0.1, 1.0,     0.05, p.q   ?? 0.75)
         + sliderRow('φ (rad)', 'phi', 0,   Math.PI, 0.05, p.phi ?? 0)
         + shapeToggle(obj);
  if (obj.model === 'epl')
    return sliderRow('b (")',   'b',     0.1, 3.0,     0.05, p.b     ?? 1)
         + sliderRow('q',       'q',     0.1, 1.0,     0.05, p.q     ?? 0.75)
         + sliderRow('φ (rad)', 'phi',   0,   Math.PI, 0.05, p.phi   ?? 0)
         + sliderRow('γ',       'gamma', 0.5, 3.0,     0.05, p.gamma ?? 2.0)
         + shapeToggle(obj);
  if (obj.model === 'nfw')
    return sliderRow('κ<sub>s</sub>',      'kappaS', 0.05, 3.0, 0.05, p.kappaS ?? 0.5)
         + sliderRow('r<sub>s</sub> (")', 'rS',     0.05, 2.0, 0.05, p.rS     ?? 0.4)
         + shapeToggle(obj);
  return '';
}

function sourceParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'point') {
    const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
    const storedColor = p.color ?? '#ffffff';
    const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
    return sliderRow('r (")', 'sigma', 0.005, 1.0, 0.005, p.sigma ?? 0.08)
         + `<div class="sl-param-row">
              <span class="sl-param-label">Color</span>
              <input type="color" data-param-color="1" value="${displayColor}" class="sl-color-input">
            </div>`
         + shapeToggle(obj);
  }

  if (obj.model === 'pastedimage') {
    const hint = obj.pasteCanvas ? '' :
      '<p style="font-size:11px;color:var(--muted);font-style:italic;margin-top:6px">Select this point, then Ctrl+V to paste an image</p>';
    return sliderRow('Brightness', 'amplitude', 0.1, 5.0, 0.1, p.amplitude ?? 1.0) + hint;
  }
  // In light mode the canvas is CSS-inverted, so show the complement in the
  // picker (what actually appears on screen) and invert back on store.
  const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
  const storedColor = p.color ?? '#ffffff';
  const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
  return sliderRow('σ (")',   'sigma',     0.005, 0.5, 0.005, p.sigma     ?? 0.06)
       + sliderRow('q',        'q',         0.1,  1.0, 0.05,  p.q         ?? 1.0)
       + sliderRow('φ (rad)',  'phi',        0, Math.PI, 0.05, p.phi       ?? 0)
       + sliderRow('A',        'amplitude',  0.1,  3.0, 0.1,   p.amplitude ?? 1.0)
       + `<div class="sl-param-row">
            <span class="sl-param-label">Color</span>
            <input type="color" data-param-color="1" value="${displayColor}"
                   class="sl-color-input" title="Source light color">
          </div>`
       + shapeToggle(obj);
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
  const needEllipse = state.planes.some(pl => pl.objects.some(o => o.showShape));
  if (!needCurve && !state.showMarkers && !needEllipse) return;

  const Wl = W/dpr, Hl = H/dpr;
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  function toPixel(ax, ay) {
    return [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  }

  // ── 0. Shape ellipses (drawn first, behind markers) ──────────────────────────
  if (needEllipse) {
    overlayCtx.lineWidth   = 1.5;
    overlayCtx.globalAlpha = 0.6;
    overlayCtx.setLineDash([5, 4]);
    for (const plane of state.planes) {
      for (const obj of plane.objects) {
        if (!obj.showShape || obj.hidden) continue;
        const col = typeColorHex(obj.type);
        const [px, py] = toPixel(obj.cx, obj.cy);
        const p = obj.params;
        let a_arc = 0, q = 1, phi = 0;
        if (obj.type === 'lens') {
          if      (obj.model === 'sie')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'epl')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'pointmass') { a_arc = p.thetaE ?? 1; }
        } else if (obj.model === 'point') {
          a_arc = p.sigma ?? 0.08; q = 1; phi = 0;  // hard edge — draw at exact radius
        } else if (obj.model !== 'pastedimage') {
          a_arc = 2 * (p.sigma ?? 0.1); q = p.q ?? 1; phi = p.phi ?? 0;
        }
        if (a_arc <= 0) continue;
        const a_px = a_arc / state.fov * Wl;
        const b_px = a_px * Math.max(q, 0.01);
        overlayCtx.strokeStyle = col;
        overlayCtx.beginPath();
        overlayCtx.ellipse(px, py, a_px, b_px, -phi, 0, Math.PI * 2);
        overlayCtx.stroke();
      }
    }
    overlayCtx.setLineDash([]);
    overlayCtx.globalAlpha = 1;
  }

  // ── 1. Position markers — same style as the plane-view canvases ─────────────
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
    // genuine ring near the edge — which has many segments in the wider sample but
    // few within the visible area — is not incorrectly suppressed.
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
    overlayCtx.fillStyle = _dark ? 'rgba(0,0,0,0.60)' : 'rgba(255,255,255,0.90)';
    overlayCtx.fillRect(lx, ly, boxW, boxH);

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

  overlayCtx.restore();
}

// ── Main redraw ───────────────────────────────────────────────────────────────
let _raf = null;
function activeToneMapParam() {
  if (state.toneMap === 2) return state.toneMapPower;
  if (state.toneMap === 3) return state.toneMapAsinh;
  return 0.5;
}

function redraw() {
  if (_raf) return;
  _raf = requestAnimationFrame(() => { _raf = null; _doRedraw(); });
}

function _doRedraw() {
  if (!renderer || !state.dist) return;
  const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
  renderer.setScene(allPlanes, state.dist, state.fov, state.toneMap, activeToneMapParam());
  for (const plane of state.planes) redrawPlaneCanvas(plane);
  drawAxisCanvas();
  drawOverlay();
}

// ── Capture & recording ───────────────────────────────────────────────────────

// Composite the WebGL canvas and 2D overlay into an offscreen canvas.
function buildCompositeCanvas() {
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  const off = document.createElement('canvas');
  off.width  = gl.width;
  off.height = gl.height;
  const ctx  = off.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  ctx.drawImage(ov, 0, 0);
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
    const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
    renderer.setScene(allPlanes, state.dist, state.fov, state.toneMap, activeToneMapParam());
    drawOverlay();
  }
  buildCompositeCanvas().toBlob(blob => downloadBlob(blob, 'simplelens.png'), 'image/png');
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
      // Cancelled — restore all start positions.
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
    //      affect playback speed — critical curves render correctly.
    // WebM: captureStream samples at real time; slow computation causes frame
    //       duplication, so critical curves/caustics are suppressed for WebM.
    if (renderer && state.dist) {
      const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
      renderer.setScene(allPlanes, state.dist, state.fov, state.toneMap, activeToneMapParam());
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
      // All frames done — finalize.
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
      gif.on('finished', blob => downloadBlob(blob, 'simplelens-prog.gif'));
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
      downloadBlob(new Blob(recState.chunks, { type: 'video/webm' }), 'simplelens-prog.webm');
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
  // Per-object staging: Map<objId, { initialPos, finalPos }> — each object keeps its own values
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
  // In light mode CSS applies filter:invert(1) to the GL canvas visually, but
  // drawImage captures raw pixels.  Replicate the inversion in the composite
  // using difference-blend with white, which is mathematically identical.
  if (document.documentElement.getAttribute('data-theme') !== 'dark') {
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lc.width, lc.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(ov, 0, 0);
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
    downloadBlob(blob, 'simplelens.webm');
    recState.chunks = [];
  };
  recorder.start(200); // collect data every 200ms
  // First composite immediately so the stream isn't blank.
  _compositeToLive();
}

function _loadGifJs(cb) {
  if (document.querySelector('script[data-gifjs]')) {
    // already injected but not yet loaded — wait
    document.querySelector('script[data-gifjs]').addEventListener('load', cb);
    return;
  }
  const script = document.createElement('script');
  script.src = 'gif.js';
  script.dataset.gifjs = '1';
  script.onload = cb;
  script.onerror = () => console.error('simpleLens: could not load gif.js');
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
    workerScript: 'gif.worker.js',   // same-origin — no CSP issues
  });
  recState.gifObj = gif;

  gif.on('finished', blob => downloadBlob(blob, 'simplelens.gif'));

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
  const btn = document.getElementById('sl-plane-setup-btn');
  tl.classList.add('plane-setup-open');
  if (btn) btn.textContent = '▼ Plane Setup';
}
function _tourClosePlaneSetup() {
  if (window.innerWidth > 640) return;
  const tl  = document.getElementById('sl-timeline');
  const btn = document.getElementById('sl-plane-setup-btn');
  tl.classList.remove('plane-setup-open');
  if (btn) btn.textContent = '▲ Plane Setup';
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
    text: 'When an object is selected, its parameters appear here. Choose a profile and adjust sliders. For <b>hybrid objects</b>, two collapsible sections appear, one for the lens and one for the source. You can drag objects directly in the main image panel too. Press <kbd>H</kbd> to hide or show the selected object.',
  },
  {
    target: '#sl-image-wrap',
    onEnter: _tourClosePlaneSetup,
    arrow: 'right',
    label: 'Lensed image',
    text: 'This panel shows what an observer at z = 0 would see. Light from source objects is bent by all intervening lenses using full multiplane gravitational lensing. Drag objects directly here or in the plane panels; the image updates in real time.',
  },
  {
    target: '.sl-tab-btn[data-tab="settings"]',
    mobileTarget: '.sl-mobile-tab-btn[data-tab="settings"]',
    onEnter: () => { _tourClosePlaneSetup(); _tourSetMobileTab('settings'); },
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
  left = _tourClamp(left, VP, window.innerWidth  - ttW - VP);
  top  = _tourClamp(top,  VP, window.innerHeight - ttH - VP);
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
