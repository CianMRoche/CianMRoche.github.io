---
permalink: /
title: ""
excerpt: "Personal webpage for Cian Roche"
author_profile: false
redirect_from: 
  - /about/
  - /about.html
---

<style>
.site-banner {
  width: 100%;
  height: 200px;
  overflow: hidden;
  border-radius: 0 0 12px 12px;
  margin-bottom: 2rem;
}
.site-banner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
.profile-hero {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  margin-bottom: 2rem;
}
.profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid #e5e7eb;
}
.profile-info { flex: 1; min-width: 0; }
.profile-name {
  font-size: 1.375rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.2rem;
  line-height: 1.2;
}
.profile-role {
  font-size: 0.85rem;
  color: #6b7280;
  margin-bottom: 0.6rem;
}
.profile-bio {
  font-size: 0.9rem;
  color: #374151;
  line-height: 1.65;
  margin: 0 0 0.75rem;
}
.profile-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  font-size: 0.8rem;
}
.profile-links a { color: #3b82f6; text-decoration: none; }
.profile-links a:hover { text-decoration: underline; }
.profile-links .sep { color: #d1d5db; margin: 0 0.4rem; }
.nav-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 2rem;
}
.nav-card {
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
.nav-card-bar {
  width: 24px;
  height: 2px;
  border-radius: 2px;
  margin-bottom: 0.6rem;
}
.nav-card-bar-research { background: #4aaee9; }
.nav-card-bar-cv       { background: #dd72cf; }
.nav-card-bar-astrowiki{ background: #e0af44; }
.nav-card-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 3px; }
.nav-card-sub { font-size: 0.78rem; color: #6b7280; }
.section-rule {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 0 0 0.75rem;
}
.section-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #9ca3af;
  text-transform: uppercase;
  margin: 0 0 0.875rem;
}
.demo-wrap {
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
  margin-top: 0.5rem;
}
@media (max-width: 500px) {
  .profile-hero { flex-direction: column; }
  .nav-cards { grid-template-columns: 1fr; }
}
</style>

<div class="site-banner">
  <img src="/images/slip.jpg" alt="Strong gravitational lensing observation">
</div>

<div class="profile-hero">
  <img class="profile-avatar" src="/images/profile.png" alt="Cian Roche">
  <div class="profile-info">
    <div class="profile-name">Cian Roche</div>
    <div class="profile-role">Physics PhD candidate &middot; MIT &middot; Cambridge, MA</div>
    <p class="profile-bio">I work on understanding the particle nature of dark matter using gravitational lensing and stellar kinematics, and bridging the gap between cosmological simulations and real observations. Pronounced "k-ian", he/they.</p>
    <div class="profile-links">
      <a href="https://space.mit.edu/people/roche-cian/" target="_blank">MIT webpage</a>
      <span class="sep">&middot;</span>
      <a href="mailto:roche@mit.edu">Email</a>
      <span class="sep">&middot;</span>
      <a href="https://github.com/CianMRoche" target="_blank">GitHub</a>
      <span class="sep">&middot;</span>
      <a href="https://orcid.org/0000-0002-3400-6991" target="_blank">ORCID</a>
    </div>
  </div>
</div>

<div class="nav-cards">
  <a href="https://ui.adsabs.harvard.edu/search/q=author%3A%22Roche%2C+Cian%22+year%3A2020-2050&sort=date%20desc" target="_blank" class="nav-card">
    <div class="nav-card-bar nav-card-bar-research"></div>
    <div class="nav-card-title">Papers</div>
    <div class="nav-card-sub">ADS library</div>
  </a>
  <a href="/files/CV.pdf" target="_blank" class="nav-card">
    <div class="nav-card-bar nav-card-bar-cv"></div>
    <div class="nav-card-title">CV</div>
    <div class="nav-card-sub">Full academic CV (PDF)</div>
  </a>
  <a href="https://publish.obsidian.md/astrowiki/" target="_blank" class="nav-card">
    <div class="nav-card-bar nav-card-bar-astrowiki"></div>
    <div class="nav-card-title">AstroWiki</div>
    <div class="nav-card-sub">Online astro notes</div>
  </a>
</div>

<hr class="section-rule">
<p class="section-label">Research</p>

A large part of my research involves gravitational lensing, where massive objects bend light from things behind them, distorting their apparent shapes into arcs and rings. By modelling those distortions we can measure invisible dark matter.

<hr class="section-rule">
<p class="section-label">Gravitational Lensing Simulator</p>

Drag the lens, choose a mass profile, and watch how dark matter distorts background light.

<div class="demo-wrap">
  <iframe src="/assets/lensing_demo/index.html" 
          width="100%" height="960" 
          frameborder="0" style="border:none; display:block;">
  </iframe>
</div>
