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

<div class="demo-wrap">
  <iframe src="/assets/lensing_demo/index.html" 
          width="100%" height="960" 
          frameborder="0" style="border:none; display:block;">
  </iframe>
</div>
