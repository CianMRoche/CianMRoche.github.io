---
layout: archive
title: "Side Projects"
permalink: /side_projects/
author_profile: true
redirect_from:
  - /sideprojects
---

{% include base_path %}

<style>
.sp-img-wrap {
  float: right;
  margin-left: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  padding: 6px;
}
html[data-theme="dark"] .sp-img-wrap {
  background: #161b22;
}
.sp-img-wrap img.img-dark { display: none; }
html[data-theme="dark"] .sp-img-wrap img.img-light { display: none; }
html[data-theme="dark"] .sp-img-wrap img.img-dark  { display: block; }

.sp-launch {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 8px 18px;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff !important;
  font-size: 0.92rem;
  letter-spacing: 0.03em;
  text-decoration: none !important;
  border: 1px solid #2563eb;
  transition: filter 0.1s ease;
}
.sp-launch:hover { filter: brightness(1.08); }
html[data-theme="dark"] .sp-launch {
  background: transparent;
  color: #7bbfcc !important;
  border-color: #7bbfcc;
}
html[data-theme="dark"] .sp-launch:hover {
  background: #7bbfcc;
  color: #0d1117 !important;
}

@media (max-width: 600px) {
  .sp-img-wrap {
    float: none;
    margin-left: 0;
    margin-bottom: 1rem;
    width: 100%;
  }
  .sp-img-wrap img {
    width: 100%;
    height: auto;
  }
}
</style>

<div style="clear: both;">
  <div class="sp-img-wrap">
    <img class="img-light" src="/images/caustica-prog-2pointmass-light.gif" alt="Caustica logo" width="250" height="250">
    <img class="img-dark"  src="/images/caustica-prog-2pointmass.gif" alt="Caustica logo" width="250" height="250">
  </div>
  <div>
    <h2>Caustica</h2>
    <p>An interactive multi-plane gravitational lensing simulator and intuition-builder. Build up lens and source planes by clicking on a redshift axis. Choose from different lens mass and source light profiles. Supports critical curve and caustic overlays.</p>
    <a class="sp-launch" href="/assets/caustica/">Launch Caustica →</a>
  </div>
</div>

<br clear="left"/>


<div style="clear: both;">
  <div class="sp-img-wrap">
    <img class="img-light" src="/images/chi_by_eye_logo.svg" alt="χ by eye logo" width="250" height="250">
    <img class="img-dark"  src="/images/chi_by_eye_logo_inverted.svg" alt="χ by eye logo" width="250" height="250">
  </div>
  <div>
  <h2><span style="font-family:'Times New Roman',serif;font-style:italic;">χ</span> by eye</h2>
    <p>A short intuition-building browser game in the GeoGuessr style for students learning how to interpret data with uncertainties, or senior researchers looking to test their eye. Useful as an educational tool or just for fun. Works in browser or mobile :)</p>
    <a class="sp-launch" href="/assets/chi_by_eye/">Launch χ by eye →</a>
  </div>
</div>

<br clear="left"/>


<div style="clear: both;">
  <div class="sp-img-wrap">
    <img class="img-light" src="/images/astrowiki.png" alt="astrowiki connected graph" width="250" height="250">
    <img class="img-dark" src="/images/astrowiki_inverted.png" alt="astrowiki connected graph" width="250" height="250">
  </div>
  <div>
  <h2>AstroWiki</h2>
    <p><a href="https://publish.obsidian.md/astrowiki/">Astrowiki</a> is a set of living notes I created and now co-maintain with Alex Yelland (MIT) on much of astrophysics, intended to supplement study for the MIT astrophysics division oral qualification exam, currently referred to as "the 168". Pictured is a graphical representation of most of the original wiki. The current website hosts astrowiki version 2 which was almost entirely written by Alex, based upon the original wiki and various sets of notes provided by our peers.</p>
  </div>
</div>

<br clear="left"/>


<div style="clear: both;">
  <div class="sp-img-wrap">
    <img class="img-light" src="/images/corner.png" alt="corner plot" width="250" height="250">
    <img class="img-dark" src="/images/corner_inverted.png" alt="corner plot" width="250" height="250">
  </div>
  <div>
  <h2>Practical Bayesian Sampling in Python and Julia</h2>
    <p>In this project, Markov chain Monte Carlo (MCMC) algorithms are implemented in both Python and Julia and benchmarked in both serial and parallel via a parameter fitting problem. Both the user experience of implementing and using these algorithms and the raw computational performance are considered in order to form a recommendation to young scientists interested in MCMC, in particular those with existing experience in Python. It is found that MCMC algorithms run in Julia on a single core of a consumer laptop outperform almost identical implementations (and the popular package emcee) in python run on hundreds of cores on a supercomputing cluster. Report and code <a href="https://github.com/CianMRoche/Practical-Bayesian-Sampling">here</a> </p>
  </div>
</div>

<br clear="left"/>


<!-- <div style="clear: both;">
  <div style="float: right; margin-right 5em;">
    <img src="/images/young2.png" alt="Birdtrack diagram" width="250" height="250">
  </div>
  <div>
  <h2>Introduction to Hermitian Young Operators</h2>
    <p>This is a pdf containing links to videos I made, introducing topics from group and representation theory in a seminar setting. This was the first of a 3 part series, with the goal of introducing Hermitian Young operators for use in physics (eg. QCD). Report <a href="/files/young.pdf">here</a> </p>
  </div>
</div>

<br clear="left"/> -->


<!-- <div style="clear: both;">
  <div style="float: right; margin-right 5em;">
    <img src="/images/lox.png" alt="Combination Lock" width="250" height="250">
  </div>
  <div>
  <h2>The Combinatorics of Physical Security </h2>
    <p>This is a presentation I made for fun in a day or two over Winter break. Very casual in tone, but in my opinion it's an interesting connection between the world of locking mechanisms and that of introductory combinatorics. Beamer talk <a href="/files/young.pdf">here</a> </p>
  </div>
</div>

<br clear="left"/> -->


<!-- <div style="clear: both;">
  <div style="float: right; margin-right 5em;">
    <img src="/images/sprel.png" alt="frames" width="250" height="250">
  </div>
  <div>
  <h2>Fundamentals of Special Relativity  </h2>
    <p>A document which motivates in a self-contained fashion the fundamentals of special relativity, arriving at the Lorentz transformation and demonstrating the origins of length contraction and time dilation. The document is concluded by explicit demonstration that Lorentz transformations are isometries of Minkowski space. Report <a href="/files/sprel.pdf">here</a> </p>
  </div>
</div>

<br clear="left"/> -->
