---
permalink: /
title: "About me"
excerpt: "Personal webpage for Cian Roche"
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

I'm Cian (pronounced "k-ian", he/they), a physics PhD candidate at MIT. I work on understanding the particle nature of dark matter using gravitational lensing and stellar kinematics, and bridging the gap between cosmological simulations and real observations.

<!-- You can find me in the MIT Kavli Institute for Astrophysics and Space Research, room 37-624. -->

<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>
body { background-color: #0d1117 !important; }
.nav-cards { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1.5rem 0; }
.nav-card {
  flex: 1;
  min-width: 140px;
  padding: 1rem 1.125rem;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: #374151;
  background: #fff;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 0.18s, transform 0.18s;
}
.nav-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  transform: translateY(-2px);
  text-decoration: none;
  color: #374151;
}
.nav-card-title { font-weight: 600; margin-bottom: 3px; }
.nav-card-sub { font-size: 0.8rem; color: #6b7280; }
.page__content .nav-card,
.page__content .nav-card:hover { text-decoration: none; }
.slip-banner {
  width: 100%;
  height: 220px;
  overflow: hidden;
  border-radius: 10px;
  margin: 1.5rem 0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}
.slip-banner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center bottom;
  display: block;
}
.demo-wrap {
  border-radius: 12px;
  overflow: hidden;
  margin-top: 0.5rem;
}
/* Collapsible lensing section */
.lens-section {
  margin: 1.75rem 0 0;
}
details.lens-section > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  list-style: none;
  cursor: pointer;
  padding: 0.35rem 0 0.6rem;
  border-bottom: 1px solid #e5e7eb;
  user-select: none;
  -webkit-user-select: none;
}
details.lens-section > summary::-webkit-details-marker { display: none; }
.lens-heading {
  font-size: 1.5em;
  font-weight: bold;
  line-height: 1.3;
  transition: color 0.15s;
}
.lens-chevron {
  width: 18px;
  height: 18px;
  color: #9ca3af;
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  margin-left: 0.5rem;
}
details.lens-section[open] > summary .lens-chevron {
  transform: rotate(90deg);
}
details.lens-section > summary:hover .lens-heading { color: #3b82f6; }
.lens-content {
  overflow: hidden;
  transition: height 0.42s cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-theme="dark"] details.lens-section > summary { border-bottom-color: #30363d; }
html[data-theme="dark"] details.lens-section > summary:hover .lens-heading { color: #58a6ff; }
</style>

<div class="nav-cards">
  <a href="https://ui.adsabs.harvard.edu/search/q=docs(library%2FIfl1bToeQtOwhIzPv6OuIw)&sort=date%20desc%2C%20bibcode%20desc&p_=0" target="_blank" class="nav-card nav-card-research">
    <div class="nav-card-title">Papers</div>
    <div class="nav-card-sub">ADS library</div>
  </a>
  <a href="/files/CV.pdf" target="_blank" class="nav-card nav-card-cv">
    <div class="nav-card-title">CV</div>
    <div class="nav-card-sub">Full academic CV (PDF)</div>
  </a>
  <a href="https://github.com/CianMRoche" target="_blank" class="nav-card nav-card-astrowiki">
    <div class="nav-card-title">GitHub</div>
    <div class="nav-card-sub">CianMRoche</div>
  </a>
</div>

<details id="lens-section" class="lens-section">
  <summary>
    <span class="lens-heading">Learn About: Gravitational Lensing</span>
    <svg class="lens-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </summary>
  <div class="lens-content">

<p style="font-size:0.875rem; color:#6b7280; line-height:1.65; margin: 1rem 0 1.25rem;">
When a <span style="color:#BA7517">massive object</span> sits between us and a distant <span style="color:#378ADD">source</span>, its gravity bends the light into arcs and rings. Because the bending depends only on the mass of the lens and geometry, it is one of the cleanest ways to map <strong>dark matter</strong>.
</p>

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

  <!-- Plane bands -->
  <rect x="68" y="88" width="24" height="130" rx="3" fill="#378ADD" opacity="0.07"/>
  <line x1="80" y1="88" x2="80" y2="218" stroke="#378ADD" stroke-width="0.8" opacity="0.25" stroke-dasharray="4 3"/>
  <rect x="608" y="88" width="24" height="130" rx="3" fill="#888" opacity="0.07"/>
  <line x1="620" y1="88" x2="620" y2="218" stroke="#888" stroke-width="0.8" opacity="0.25" stroke-dasharray="4 3"/>

  <!-- Plane labels -->
  <text text-anchor="middle" x="80" y="82" fill="#378ADD" font-family="system-ui, sans-serif" font-size="10" letter-spacing="0.06em" opacity="0.7">SOURCE PLANE</text>
  <text text-anchor="middle" x="620" y="82" fill="#888" font-family="system-ui, sans-serif" font-size="10" letter-spacing="0.06em" opacity="0.7">IMAGE PLANE</text>

  <!-- apparent images label -->
  <text x="10" y="148" text-anchor="middle"
    fill="#85B7EB" font-family="system-ui, sans-serif" font-size="10" opacity="0.85"
    transform="rotate(-90 10 148)">apparent images</text>

  <!-- Arrows -->
  <line x1="18" y1="107" x2="60" y2="103" fill="none" stroke="#85B7EB" stroke-width="1" opacity="0.65" marker-end="url(#arr)"/>
  <line x1="18" y1="189" x2="60" y2="193" fill="none" stroke="#85B7EB" stroke-width="1" opacity="0.65" marker-end="url(#arr)"/>

  <!-- Apparent source dotted lines -->
  <line x1="620" y1="148" x2="105" y2="106" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>
  <line x1="620" y1="148" x2="105" y2="190" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>

  <!-- Apparent image markers -->
  <ellipse cx="80" cy="102" rx="9" ry="5.5" fill="#378ADD" opacity="0.3" transform="rotate(-20 80 102)"/>
  <ellipse cx="80" cy="102" rx="5" ry="3" fill="#85B7EB" opacity="0.6" transform="rotate(-20 80 102)"/>
  <circle cx="80" cy="102" r="1.5" fill="white" opacity="0.85"/>

  <ellipse cx="80" cy="194" rx="9" ry="5.5" fill="#378ADD" opacity="0.3" transform="rotate(-20 80 194)"/>
  <ellipse cx="80" cy="194" rx="5" ry="3" fill="#85B7EB" opacity="0.6" transform="rotate(-20 80 194)"/>
  <circle cx="80" cy="194" r="1.5" fill="white" opacity="0.85"/>

  <!-- Solid light rays -->
  <polyline points="96,136 340,124 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.7"/>
  <polyline points="96,148 340,148 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.5"/>
  <polyline points="100,158 340,172 620,148" fill="none" stroke="#85B7EB" stroke-width="1.2" opacity="0.7"/>

  <!-- Source galaxy -->
  <ellipse cx="80" cy="148" rx="34" ry="34" fill="url(#glowblue)"/>
  <ellipse cx="80" cy="148" rx="12" ry="7" fill="#378ADD" opacity="0.6" transform="rotate(-20 80 148)"/>
  <ellipse cx="80" cy="148" rx="6" ry="4" fill="#B5D4F4" opacity="0.85" transform="rotate(-20 80 148)"/>
  <circle cx="80" cy="148" r="2" fill="white" opacity="0.9"/>

  <!-- Lens mass -->
  <ellipse cx="340" cy="148" rx="50" ry="50" fill="url(#glow)"/>
  <ellipse cx="340" cy="148" rx="16" ry="10" fill="#BA7517" opacity="0.55" transform="rotate(15 340 148)"/>
  <ellipse cx="340" cy="148" rx="8" ry="5" fill="#FAC775" opacity="0.8" transform="rotate(15 340 148)"/>
  <circle cx="340" cy="148" r="3" fill="white" opacity="0.95"/>
  <line x1="340" y1="132" x2="340" y2="138" stroke="#999" stroke-width="0.6" opacity="0.5"/>
  <line x1="340" y1="158" x2="340" y2="164" stroke="#999" stroke-width="0.6" opacity="0.5"/>
  <line x1="324" y1="148" x2="330" y2="148" stroke="#999" stroke-width="0.6" opacity="0.5"/>
  <line x1="350" y1="148" x2="356" y2="148" stroke="#999" stroke-width="0.6" opacity="0.5"/>

  <!-- Observer eye -->
  <g transform="translate(620, 148)">
    <path d="M-14 0 Q0 -10 14 0 Q0 10 -14 0Z" fill="none" stroke="#888" stroke-width="1.3" opacity="0.8"/>
    <circle cx="0" cy="0" r="5" fill="none" stroke="#888" stroke-width="1.1" opacity="0.7"/>
    <circle cx="0" cy="0" r="2.2" fill="#888" opacity="0.7"/>
  </g>

  <!-- Object labels -->
  <text text-anchor="middle" x="80" y="170" fill="#888" font-family="system-ui, sans-serif" font-size="11">source galaxy</text>
  <text text-anchor="middle" x="340" y="210" fill="#888" font-family="system-ui, sans-serif" font-size="11">lens mass</text>
  <text text-anchor="middle" x="340" y="222" fill="#aaa" font-family="system-ui, sans-serif" font-size="10">(dark matter halo)</text>
  <text text-anchor="middle" x="620" y="172" fill="#888" font-family="system-ui, sans-serif" font-size="11">observer</text>
</svg>

<p style="font-size:0.875rem; color:#6b7280; line-height:1.65; margin: 1rem 0 0.5rem;">
Click a preset or load your own source image by pasting (Ctrl+V / Cmd+V) or dragging an image onto the left panel. Click the right panel to move the lens.</p>

<div class="demo-wrap">
  <iframe id="lensing-iframe" src=""
          width="100%" height="800"
          frameborder="0" style="border:none; display:block;">
  </iframe>
</div>

  </div><!-- .lens-content -->
</details>

<details id="dm-section" class="lens-section">
  <summary>
    <span class="lens-heading">Learn About: Dark Matter</span>
    <svg class="lens-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </summary>
  <div class="lens-content">

<p style="font-size:0.875rem; color:#6b7280; line-height:1.65; margin: 1rem 0 0.5rem;">
In cold dark matter (CDM), the central potential of a galaxy cluster is steep and cuspy — the brightest cluster galaxy (BCG) stays close to the cluster center. Self-interacting dark matter (SIDM) softens the core, allowing the BCG to oscillate more widely. Measuring how far off-center BCGs sit across many clusters constrains the dark matter self-interaction cross-section. Switch between models to see the effect, then press <em>Take Observation</em> to record BCG positions as a mock astronomer would.</p>

<div class="demo-wrap">
  <iframe id="dm-iframe" src=""
          width="100%" height="720"
          frameborder="0" style="border:none; display:block; background:#0d1117;">
  </iframe>
</div>

  </div><!-- .lens-content -->
</details>

<script>
function initCollapsible(detailsId, iframeId, iframeSrc) {
  var details = document.getElementById(detailsId);
  var content = details.querySelector('.lens-content');
  var loaded  = false;

  function setH(h) { content.style.height = h; }

  details.addEventListener('click', function(e) {
    if (!e.target.closest('summary')) return;
    e.preventDefault();
    if (details.open) {
      setH(content.scrollHeight + 'px');
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { setH('0'); });
      });
      content.addEventListener('transitionend', function close() {
        details.removeAttribute('open'); setH('');
        content.removeEventListener('transitionend', close);
      });
    } else {
      if (!loaded && iframeId) {
        document.getElementById(iframeId).src = iframeSrc;
        loaded = true;
      }
      details.setAttribute('open', '');
      var target = content.scrollHeight;
      setH('0');
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { setH(target + 'px'); });
      });
      content.addEventListener('transitionend', function open() {
        setH(''); content.removeEventListener('transitionend', open);
      });
    }
  });
}

initCollapsible('lens-section', 'lensing-iframe', '/assets/lensing_demo/index.html');
initCollapsible('dm-section',   'dm-iframe',      '/assets/dark_matter_demo/index.html');
</script>
