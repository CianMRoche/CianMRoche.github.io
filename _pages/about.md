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
.demo-wrap {
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
  margin-top: 0.5rem;
}
.lens-banner {
  position: relative;
  width: 100%;
  height: 340px;
  margin: 1.5rem 0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.10);
}
.lens-banner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
.lens-banner-credit {
  position: absolute;
  bottom: 8px;
  right: 10px;
  font-size: 0.65rem;
  color: rgba(255,255,255,0.80);
  background: rgba(0,0,0,0.40);
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.01em;
}
</style>

<!-- <div class="nav-cards">
  <a href="/research/" class="nav-card nav-card-research">
    <div class="nav-card-title">Research</div>
    <div class="nav-card-sub">Dark matter, lensing, kinematics</div>
  </a>
  <a href="/files/CV.pdf" target="_blank" class="nav-card nav-card-cv">
    <div class="nav-card-title">CV</div>
    <div class="nav-card-sub">Full academic CV (PDF)</div>
  </a>
  <a href="https://publish.obsidian.md/astrowiki/" target="_blank" class="nav-card nav-card-astrowiki">
    <div class="nav-card-title">AstroWiki</div>
    <div class="nav-card-sub">Online Astro Notes</div>
  </a>
</div>

Take a look at the research I'm involved in, my academic CV, or AstroWiki, which is a set of living notes I started and now co-maintain with Alex Yelland to help students study for astrophysics qualifying exams at MIT. <br><br> -->

<div class="lens-banner">
  <img src="https://cdn.esahubble.org/archives/images/screen/heic0814a.jpg" alt="Gravitational lensing arcs in galaxy cluster Abell 2218, imaged by the Hubble Space Telescope">
  <span class="lens-banner-credit">Credit: NASA, ESA, J.-P. Kneib et al.</span>
</div>

A large part of my research involves gravitational lensing, where massive objects bend light from things behind them, distorting their apparent shapes into arcs and rings. By modelling those distortions we can measure invisible dark matter. Try out the simulator below to build some intuition:

<div class="demo-wrap">
  <iframe src="/assets/lensing_demo/index.html" 
          width="100%" height="960" 
          frameborder="0" style="border:none; display:block;">
  </iframe>
</div>
