---
permalink: /
title: ""
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
  position: relative;
  overflow: hidden;
}
.nav-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
}
.nav-card-research::before { background: #4aaee9; }
.nav-card-cv::before { background: #dd72cf; }
.nav-card-astrowiki::before { background: #e0af44; }
.nav-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  transform: translateY(-2px);
  text-decoration: none;
  color: #374151;
}
.nav-card-title { font-weight: 600; margin-bottom: 3px; }
.nav-card-sub { font-size: 0.8rem; color: #6b7280; }
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
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
  margin-top: 0.5rem;
}
.simulator-teaser {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 2.25rem 0 1.25rem;
  gap: 0.4rem;
}
.teaser-text {
  font-family: 'Caveat', cursive;
  font-size: 1.5rem;
  font-weight: 600;
  color: #6b7280;
  text-align: center;
  line-height: 1.2;
}
</style>

<div class="nav-cards">
  <a href="https://ui.adsabs.harvard.edu/search/q=author%3A%22Roche%2C+Cian%22+year%3A2020-2050&sort=date%20desc" target="_blank" class="nav-card nav-card-research">
    <div class="nav-card-title">Papers</div>
    <div class="nav-card-sub">ADS library</div>
  </a>
  <a href="/files/CV.pdf" target="_blank" class="nav-card nav-card-cv">
    <div class="nav-card-title">CV</div>
    <div class="nav-card-sub">Full academic CV (PDF)</div>
  </a>
  <a href="https://publish.obsidian.md/astrowiki/" target="_blank" class="nav-card nav-card-astrowiki">
    <div class="nav-card-title">AstroWiki</div>
    <div class="nav-card-sub">Online astro notes</div>
  </a>
</div>

<!-- <div class="slip-banner">
  <img src="/images/slip.jpg" alt="Strong gravitational lensing observation">
</div> -->
<!-- 
A large part of my research involves gravitational lensing, where massive objects bend light from things behind them, distorting their apparent shapes into arcs and rings. By modelling those distortions we can measure invisible dark matter. -->

<div class="simulator-teaser">
  <span class="teaser-text">Get some gravitational lensing intuition</span>
  <svg width="50" height="68" viewBox="0 0 50 68" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 25 3 C 39 18, 13 38, 27 58" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M 15 51 L 27 63 L 38 51" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</div>

<div class="demo-wrap">
  <iframe src="/assets/lensing_demo/index.html" 
          width="100%" height="960" 
          frameborder="0" style="border:none; display:block;">
  </iframe>
</div>
