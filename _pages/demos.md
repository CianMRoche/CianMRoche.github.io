---
permalink: /demos/
title: "Demos"
excerpt: "Interactive astrophysics demos"
author_profile: true
---

<style>
:root {
  --dm-color:   #c07a15;
  --lens-color: #4a7ec5;
  --nav-accent: #7c6bcf;
}
html[data-theme="dark"] {
  --dm-color:   #fbbf77;
  --lens-color: #93c5fd;
  --nav-accent: #c4b5fd;
}

/* Tabs */
.demo-tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid #e5e7eb; margin: 1.25rem 0 0; }
html[data-theme="dark"] .demo-tabs { border-bottom-color: #30363d; }
.dtab {
  appearance: none; background: none; border: none; font: inherit; cursor: pointer;
  padding: 0.7rem 1.15rem; color: #6b7280; font-weight: 600; font-size: 1.05rem;
  border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s;
}
.dtab:hover { color: #374151; }
html[data-theme="dark"] .dtab { color: #8b949e; }
html[data-theme="dark"] .dtab:hover { color: #e6edf3; }
.dtab[aria-selected="true"] { color: var(--lens-color); border-bottom-color: var(--lens-color); }
.dtab:focus-visible { outline: 2px solid var(--lens-color); outline-offset: 3px; border-radius: 3px; }
#dtab-dm[aria-selected="true"] { color: var(--dm-color); border-bottom-color: var(--dm-color); }

.dpanel { padding-top: 1.25rem; }
/* The theme's reset sets `section { display: block }`, which overrides the UA
   [hidden] rule; restore hidden behaviour explicitly so tab switching works. */
.dpanel[hidden] { display: none; }
.dpanel-intro { font-size: 0.9rem; color: #6b7280; line-height: 1.65; }
html[data-theme="dark"] .dpanel-intro { color: #8b949e; }
.demo-wrap { border-radius: 12px; overflow: hidden; margin-top: 0.75rem; }

/* Call-to-action button linking to the full Caustica simulator. */
.lens-cta-btn {
  display: inline-block; background: #fff; border: 1.5px solid #3b82f6; color: #3b82f6 !important;
  border-radius: 6px; padding: 5px 13px; font-size: 0.78rem; font-weight: 500;
  text-decoration: none !important; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.lens-cta-btn:hover { background: #3b82f6; color: #fff !important; }
html[data-theme="dark"] .lens-cta-btn { background: #0d1117; border-color: #7bbfcc; color: #7bbfcc !important; }
html[data-theme="dark"] .lens-cta-btn:hover { background: #7bbfcc; color: #0d1117 !important; }
</style>

Here are some interactive demos which explain aspects of my research.

<div class="demo-tabs" role="tablist" aria-label="Demos">
  <button class="dtab" role="tab" aria-selected="true"  data-tab="lensing" id="dtab-lensing">Lensing Demo</button>
  <button class="dtab" role="tab" aria-selected="false" data-tab="dm"      id="dtab-dm">Dark Matter Demo</button>
</div>

<div class="demo-panels">

  <section class="dpanel" data-panel="lensing" role="tabpanel" aria-labelledby="dtab-lensing">

<p class="dpanel-intro">When a <span style="color:#BA7517">massive object</span> sits between us and a distant <span style="color:#378ADD">source</span>, its gravity bends the light into arcs and rings. Because the bending depends only on the mass of the lens and geometry, it is one of the cleanest ways to map <strong>dark matter</strong>.</p>

<svg width="100%" viewBox="0 65 680 170" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>Gravitational lensing divider illustration</title>
  <desc>Gravitational lensing with source and image plane shaded bands.</desc>
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M2 2 L8 5 L2 8" fill="none" stroke="#85B7EB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#EF9F27" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#EF9F27" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowblue" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#378ADD" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#378ADD" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="68" y="88" width="24" height="130" rx="3" fill="#378ADD" opacity="0.07"/>
  <line x1="80" y1="88" x2="80" y2="218" stroke="#378ADD" stroke-width="0.8" opacity="0.25" stroke-dasharray="4 3"/>
  <rect x="608" y="88" width="24" height="130" rx="3" fill="#888" opacity="0.07"/>
  <line x1="620" y1="88" x2="620" y2="218" stroke="#888" stroke-width="0.8" opacity="0.25" stroke-dasharray="4 3"/>
  <text text-anchor="middle" x="80" y="82" fill="#378ADD" font-family="system-ui, sans-serif" font-size="10" letter-spacing="0.06em" opacity="0.7">SOURCE PLANE</text>
  <text text-anchor="middle" x="620" y="82" fill="#888" font-family="system-ui, sans-serif" font-size="10" letter-spacing="0.06em" opacity="0.7">IMAGE PLANE</text>
  <text x="10" y="148" text-anchor="middle" fill="#85B7EB" font-family="system-ui, sans-serif" font-size="10" opacity="0.85" transform="rotate(-90 10 148)">apparent images</text>
  <line x1="18" y1="107" x2="60" y2="103" fill="none" stroke="#85B7EB" stroke-width="1" opacity="0.65" marker-end="url(#arr)"/>
  <line x1="18" y1="189" x2="60" y2="193" fill="none" stroke="#85B7EB" stroke-width="1" opacity="0.65" marker-end="url(#arr)"/>
  <line x1="620" y1="148" x2="105" y2="106" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>
  <line x1="620" y1="148" x2="105" y2="190" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>
  <ellipse cx="80" cy="102" rx="9" ry="5.5" fill="#378ADD" opacity="0.3" transform="rotate(-20 80 102)"/>
  <ellipse cx="80" cy="102" rx="5" ry="3" fill="#85B7EB" opacity="0.6" transform="rotate(-20 80 102)"/>
  <circle cx="80" cy="102" r="1.5" fill="white" opacity="0.85"/>
  <ellipse cx="80" cy="194" rx="9" ry="5.5" fill="#378ADD" opacity="0.3" transform="rotate(-20 80 194)"/>
  <ellipse cx="80" cy="194" rx="5" ry="3" fill="#85B7EB" opacity="0.6" transform="rotate(-20 80 194)"/>
  <circle cx="80" cy="194" r="1.5" fill="white" opacity="0.85"/>
  <polyline points="96,136 340,124 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.7"/>
  <polyline points="96,148 340,148 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.5"/>
  <polyline points="100,158 340,172 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.7"/>
  <ellipse cx="80" cy="148" rx="34" ry="34" fill="url(#glowblue)"/>
  <ellipse cx="80" cy="148" rx="12" ry="7" fill="#378ADD" opacity="0.6" transform="rotate(-20 80 148)"/>
  <ellipse cx="80" cy="148" rx="6" ry="4" fill="#B5D4F4" opacity="0.85" transform="rotate(-20 80 148)"/>
  <circle cx="80" cy="148" r="2" fill="white" opacity="0.9"/>
  <ellipse cx="340" cy="148" rx="50" ry="50" fill="url(#glow)"/>
  <ellipse cx="340" cy="148" rx="16" ry="10" fill="#BA7517" opacity="0.55" transform="rotate(15 340 148)"/>
  <ellipse cx="340" cy="148" rx="8" ry="5" fill="#FAC775" opacity="0.8" transform="rotate(15 340 148)"/>
  <circle cx="340" cy="148" r="3" fill="white" opacity="0.95"/>
  <g transform="translate(620, 148)">
    <path d="M-14 0 Q0 -10 14 0 Q0 10 -14 0Z" fill="none" stroke="#888" stroke-width="1.3" opacity="0.8"/>
    <circle cx="0" cy="0" r="5" fill="none" stroke="#888" stroke-width="1.1" opacity="0.7"/>
    <circle cx="0" cy="0" r="2.2" fill="#888" opacity="0.7"/>
  </g>
  <text text-anchor="middle" x="80" y="170" fill="#888" font-family="system-ui, sans-serif" font-size="11">source galaxy</text>
  <text text-anchor="middle" x="340" y="210" fill="#888" font-family="system-ui, sans-serif" font-size="11">lens mass</text>
  <text text-anchor="middle" x="340" y="222" fill="#aaa" font-family="system-ui, sans-serif" font-size="10">(dark matter halo)</text>
  <text text-anchor="middle" x="620" y="172" fill="#888" font-family="system-ui, sans-serif" font-size="11">observer</text>
</svg>

<p class="dpanel-intro">Load your own source image by pasting (Ctrl+V / Cmd+V) or dragging an image onto the left panel, or choose one of the presets. Click/drag in the right panel to move the lens. For a much more complete lensing simulator, <a class="lens-cta-btn" href="/assets/caustica/">Launch Caustica &rarr;</a></p>

<div class="demo-wrap">
  <iframe class="demo-iframe" data-src="/assets/lensing_demo/index.html" width="100%" height="800" frameborder="0" style="border:none; display:block;"></iframe>
</div>

  </section>

  <section class="dpanel" data-panel="dm" role="tabpanel" aria-labelledby="dtab-dm" hidden>

<p class="dpanel-intro">Dark Matter (DM) is the invisible but dominant mass component in the structures of our universe, with approximately 10 times more dark matter in our galaxy than matter we could see. <strong>The interaction properties of dark matter with itself remain largely a mystery</strong>, but looking at brightest cluster galaxies (BCGs), which sit in the centers of galaxy clusters, we can get some insights into these mysterious properties. Below is a simplified model of a BCG oscillating in the potential of a galaxy cluster, and how the typical distance from the cluster center changes with different dark matter self-interaction properties.</p>

<div class="demo-wrap">
  <iframe class="demo-iframe" data-src="/assets/dark_matter_demo/index.html" width="100%" height="900" frameborder="0" style="border:none; display:block; background:#0d1117;"></iframe>
</div>

  </section>
</div>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.dtab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.dpanel'));
  function activate(name) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'); });
    panels.forEach(function (p) {
      var on = p.dataset.panel === name;
      p.hidden = !on;
      if (on) {
        var f = p.querySelector('iframe[data-src]');
        if (f && !f.getAttribute('src')) { f.setAttribute('src', f.dataset.src); }  
      }
    });
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { activate(t.dataset.tab); }); });
  activate('lensing');
})();
</script>
