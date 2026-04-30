---
permalink: /
title: "About me"
excerpt: "Personal webpage for Cian Roche"
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

<div class="hero-wrap">
  <svg class="hero-bg" viewBox="0 0 800 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle class="hero-star" cx="28"  cy="14"  r="1.1"/>
    <circle class="hero-star" cx="72"  cy="52"  r="0.7"/>
    <circle class="hero-star" cx="115" cy="22"  r="0.9"/>
    <circle class="hero-star" cx="158" cy="82"  r="1.0"/>
    <circle class="hero-star" cx="195" cy="36"  r="0.7"/>
    <circle class="hero-star" cx="238" cy="68"  r="1.2"/>
    <circle class="hero-star" cx="275" cy="12"  r="0.8"/>
    <circle class="hero-star" cx="312" cy="88"  r="0.9"/>
    <circle class="hero-star" cx="352" cy="45"  r="0.7"/>
    <circle class="hero-star" cx="390" cy="18"  r="1.0"/>
    <circle class="hero-star" cx="425" cy="72"  r="0.8"/>
    <circle class="hero-star" cx="460" cy="94"  r="0.7"/>
    <circle class="hero-star" cx="495" cy="30"  r="1.1"/>
    <circle class="hero-star" cx="530" cy="10"  r="0.8"/>
    <circle class="hero-star" cx="562" cy="78"  r="0.9"/>
    <circle class="hero-star" cx="598" cy="48"  r="0.7"/>
    <circle class="hero-star" cx="628" cy="92"  r="0.8"/>
    <circle class="hero-star" cx="745" cy="16"  r="1.0"/>
    <circle class="hero-star" cx="768" cy="62"  r="0.7"/>
    <circle class="hero-star" cx="792" cy="88"  r="0.9"/>
    <circle class="hero-star" cx="18"  cy="84"  r="0.8"/>
    <circle class="hero-star" cx="52"  cy="98"  r="0.7"/>
    <circle class="hero-star" cx="178" cy="96"  r="0.8"/>
    <circle class="hero-star" cx="440" cy="100" r="0.9"/>
    <circle class="hero-star" cx="720" cy="32"  r="0.7"/>
    <circle cx="668" cy="50" r="14"  fill="var(--dm-color)" opacity="0.07"/>
    <circle cx="668" cy="50" r="4"   fill="var(--dm-color)" opacity="0.22"/>
    <circle cx="668" cy="50" r="1.8" fill="var(--dm-color)" opacity="0.55"/>
    <path class="hero-arc" d="M 616 26 Q 668 -6 720 30" stroke="var(--lens-color)" stroke-width="1.6" opacity="0.30"/>
    <path class="hero-arc" d="M 618 74 Q 668 108 718 72" stroke="var(--lens-color)" stroke-width="1.0" opacity="0.20"/>
    <ellipse cx="668" cy="50" rx="54" ry="38" fill="none" stroke="var(--lens-color)" stroke-width="0.7" opacity="0.12"/>
  </svg>
  <p class="intro-text"><span class="lead-sentence">I'm Cian (pronounced "k-ian", he/they), a physics PhD candidate at MIT.</span> I work on understanding the particle nature of <span class="dm-highlight">dark matter</span> using <span class="lens-highlight">strong lensing</span> and stellar kinematics, and bridging the gap between cosmological simulations and real observations.</p>
</div>

<!-- You can find me in the MIT Kavli Institute for Astrophysics and Space Research, room 37-624. -->

<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>
:root {
  --dm-color:   #c07a15;
  --lens-color: #4a7ec5;
  --nav-accent: #7c6bcf;
}
html[data-theme="dark"] {
  background-color: #0d1117 !important;
  --dm-color:   #fbbf77;
  --lens-color: #93c5fd;
  --nav-accent: #c4b5fd;
}
/* Hero / intro */
.hero-wrap { position: relative; overflow: hidden; border-radius: 10px; margin-bottom: 1.5rem; }
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.hero-star { fill: rgba(20,30,60,0.10); }
html[data-theme="dark"] .hero-star { fill: rgba(255,255,255,0.28); }
.hero-arc { fill: none; }
.intro-text { position: relative; z-index: 1; color: #6b7280; margin: 0; line-height: 1.7; }
html[data-theme="dark"] .intro-text { color: #adbac7; }
.lead-sentence { font-size: 1.08em; font-weight: 500; }
.dm-highlight  { color: var(--dm-color); }
.lens-highlight { color: var(--lens-color); }
/* Nav link cards */
.nav-cards { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0 0 1.5rem; }
.nav-card {
  flex: 1; min-width: 140px; padding: 0.6rem 1rem;
  border: 1.5px solid #e5e7eb; border-left: 3px solid var(--nav-accent);
  border-radius: 8px; text-decoration: none; color: #374151; background: #fff;
  display: flex; align-items: center; gap: 0.65rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 0.18s, transform 0.18s;
}
.nav-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  transform: translateY(-2px); text-decoration: none; color: #374151;
}
.nav-card-icon { width: 18px; height: 18px; flex-shrink: 0; color: var(--nav-accent); }
.nav-card-title { font-weight: 600; margin-bottom: 2px; transition: color 0.18s; }
.nav-card:hover .nav-card-title { color: var(--nav-accent); }
.nav-card-sub { font-size: 0.8rem; color: #6b7280; }
.page__content .nav-card,
.page__content .nav-card:hover { text-decoration: none; }
/* Misc */
.slip-banner { width:100%; height:220px; overflow:hidden; border-radius:10px; margin:1.5rem 0; box-shadow:0 2px 10px rgba(0,0,0,0.08); }
.slip-banner img { width:100%; height:100%; object-fit:cover; object-position:center bottom; display:block; }
.demo-wrap { border-radius:12px; overflow:hidden; margin-top:0.5rem; }
/* Demo section cards */
.lens-section { margin: 1.75rem 0 0; }
details.lens-section > summary {
  display: flex; align-items: center; gap: 0.875rem;
  list-style: none; cursor: pointer; padding: 0.7rem 0;
  border-bottom: 1px solid #e5e7eb;
  user-select: none; -webkit-user-select: none;
}
details.lens-section > summary::-webkit-details-marker { display: none; }
.demo-preview {
  width: 56px; height: 56px; flex-shrink: 0;
  border-radius: 8px; overflow: hidden;
}
.demo-card-body { flex: 1; min-width: 0; }
.demo-card-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.15rem; }
.lens-heading { font-size: 1.3em; font-weight: bold; line-height: 1.3; transition: color 0.15s; }
#lens-section .lens-heading { color: var(--lens-color); }
#dm-section   .lens-heading { color: var(--dm-color); }
.demo-badge {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2px 8px; border-radius: 999px;
  background: var(--lens-color); color: #fff; align-self: center;
}
#dm-section .demo-badge { background: var(--dm-color); }
html[data-theme="dark"] .demo-badge { color: #0d1117; }
.demo-card-desc { font-size: 0.8rem; color: #6b7280; margin: 0; line-height: 1.5; }
.lens-chevron {
  width: 18px; height: 18px; color: #9ca3af;
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0; margin-left: 0.25rem;
}
details.lens-section[open] > summary .lens-chevron { transform: rotate(90deg); }
details.lens-section > summary:hover .lens-heading { color: #3b82f6; }
.lens-content { overflow: hidden; transition: height 0.42s cubic-bezier(0.4, 0, 0.2, 1); }
html[data-theme="dark"] details.lens-section > summary { border-bottom-color: #30363d; }
html[data-theme="dark"] details.lens-section > summary:hover .lens-heading { color: #58a6ff; }
</style>

<div class="nav-cards">
  <a href="https://ui.adsabs.harvard.edu/search/q=docs(library%2FIfl1bToeQtOwhIzPv6OuIw)&sort=date%20desc%2C%20bibcode%20desc&p_=0" target="_blank" class="nav-card">
    <svg class="nav-card-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 3h8l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/>
      <polyline points="12,3 12,7 16,7"/>
      <line x1="7" y1="11" x2="13" y2="11"/>
      <line x1="7" y1="14" x2="11" y2="14"/>
    </svg>
    <div>
      <div class="nav-card-title">Papers</div>
      <div class="nav-card-sub">ADS library</div>
    </div>
  </a>
  <a href="/files/CV.pdf" target="_blank" class="nav-card">
    <svg class="nav-card-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="16" height="11" rx="2"/>
      <circle cx="7.5" cy="10.5" r="2"/>
      <line x1="12" y1="9"   x2="16" y2="9"/>
      <line x1="12" y1="12"  x2="14.5" y2="12"/>
    </svg>
    <div>
      <div class="nav-card-title">CV</div>
      <div class="nav-card-sub">Full academic CV (PDF)</div>
    </div>
  </a>
  <a href="https://github.com/CianMRoche" target="_blank" class="nav-card">
    <svg class="nav-card-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.746 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clip-rule="evenodd"/>
    </svg>
    <div>
      <div class="nav-card-title">GitHub</div>
      <div class="nav-card-sub">CianMRoche</div>
    </div>
  </a>
</div>

<details id="lens-section" class="lens-section">
  <summary>
    <div class="demo-preview">
      <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <rect width="56" height="56" fill="rgba(74,126,197,0.10)" rx="8"/>
        <circle cx="28" cy="28" r="15" stroke="var(--lens-color)" stroke-width="1.6" opacity="0.85"/>
        <circle cx="28" cy="28" r="7"  fill="var(--dm-color)" opacity="0.15"/>
        <circle cx="28" cy="28" r="3"  fill="var(--dm-color)" opacity="0.55"/>
        <circle cx="28" cy="28" r="1.3" fill="var(--dm-color)" opacity="0.95"/>
        <circle cx="10" cy="12" r="0.7" fill="var(--lens-color)" opacity="0.5"/>
        <circle cx="44" cy="8"  r="0.5" fill="var(--lens-color)" opacity="0.4"/>
        <circle cx="50" cy="42" r="0.6" fill="var(--lens-color)" opacity="0.4"/>
        <circle cx="8"  cy="40" r="0.5" fill="var(--lens-color)" opacity="0.3"/>
      </svg>
    </div>
    <div class="demo-card-body">
      <div class="demo-card-header">
        <span class="lens-heading">Strong Lensing Demo</span>
        <span class="demo-badge">Interactive</span>
      </div>
      <p class="demo-card-desc">Move a lens mass to warp background galaxies into Einstein rings and giant arcs — the same physics used to map dark matter.</p>
    </div>
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
    <div class="demo-preview">
      <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
        <rect width="56" height="56" fill="rgba(192,122,21,0.08)" rx="8"/>
        <path d="M 4 50 Q 28 8 52 50" stroke="var(--dm-color)" stroke-width="1.8" opacity="0.9"/>
        <line x1="28" y1="48" x2="28" y2="53" stroke="var(--dm-color)" stroke-width="0.9" opacity="0.4"/>
        <circle cx="39" cy="30" r="5"   fill="var(--dm-color)" opacity="0.18"/>
        <circle cx="39" cy="30" r="2.5" fill="var(--dm-color)" opacity="0.85"/>
        <circle cx="6"  cy="14" r="0.7" fill="var(--dm-color)" opacity="0.35"/>
        <circle cx="48" cy="10" r="0.5" fill="var(--dm-color)" opacity="0.3"/>
        <circle cx="18" cy="8"  r="0.6" fill="var(--dm-color)" opacity="0.25"/>
      </svg>
    </div>
    <div class="demo-card-body">
      <div class="demo-card-header">
        <span class="lens-heading">Dark Matter Self-Interaction Demo</span>
        <span class="demo-badge">Interactive</span>
      </div>
      <p class="demo-card-desc">Watch a brightest-cluster galaxy oscillate in a dark matter potential well and build a mock offset distribution to constrain σ/m.</p>
    </div>
    <svg class="lens-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </summary>
  <div class="lens-content">

<p style="font-size:0.875rem; color:#6b7280; line-height:1.65; margin: 1rem 0 0.5rem;">
Dark Matter (DM) is the invisible but dominant mass component in the structures of our universe, with approximately 10 times more dark matter in our galaxy than matter we could see. The interaction properties of dark matter with itself remain largely a mystery, but looking at brightest cluster galaxies (BCGs), which are large galaxies sitting in the centers of the largest gravitationally bound structures in the universe (known as galaxy clusters), we can get some insights into these mysterious properties. Below is a simplified model of a BCG oscillating in the potential of a galaxy cluster, and how the typical distance away fromt he center changing with different dark matter self-interaction properties.</p>

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
