---
layout: archive
title: "Research"
permalink: /research/
author_profile: true
redirect_from:
  - /projects
---

{% include base_path %}

A collection of projects across observational astrophysics, cosmological simulations, and mathematical relativity. My current focus is on constraining dark matter properties using gravitational lensing and stellar kinematics.

<style>
.research-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.research-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.research-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  object-position: center;
  display: block;
  background: #f9fafb;
  padding: 0.5rem;
}
.research-card-body {
  padding: 1rem 1.125rem 1.25rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.research-card h3 {
  font-size: 0.975rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  line-height: 1.35;
}
.research-card p {
  font-size: 0.825rem;
  color: #6b7280;
  line-height: 1.55;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.research-card p.expanded {
  display: block;
  overflow: visible;
}
.read-more-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  margin-top: 0.3rem;
  display: block;
}
.read-more-btn:hover { text-decoration: underline; }
.research-card-footer {
  margin-top: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.badge {
  font-size: 0.7rem;
  font-weight: 500;
  padding: 2px 9px;
  border-radius: 20px;
  white-space: nowrap;
}
.badge-prep   { background: #fef3c7; color: #92400e; }
.badge-pub    { background: #d1fae5; color: #065f46; }
.badge-report { background: #e0e7ff; color: #3730a3; }
.research-link {
  font-size: 0.78rem;
  color: #3b82f6;
  text-decoration: none;
}
.research-link:hover { text-decoration: underline; }
</style>

<div class="research-grid">

  <div class="research-card">
    <img src="/images/ggsl.png" alt="Galaxy-galaxy strong lensing cross section">
    <div class="research-card-body">
      <h3>The Galaxy-Galaxy Strong Lensing Cross Section Tension</h3>
      <p>The Galaxy--Galaxy Strong Lensing (GGSL) Cross Section is a measure of how efficiently galaxies in galaxy clusters can lens background sources, and is related to the underlying feedback and dark matter physics of thsoe galaxies. For several years now a tension between the observed GGSL properties of cluster strong lens members and their counterparts in cosmological simulations has been observed. We study this tension again in the context of full light cone information in the simualtions, performing strong lens modelling on the observed and simulated images, and quantifying the effect of correlated structure close to the cluster redshift.</p>
      <div class="research-card-footer">
        <span class="badge badge-prep">In preparation</span>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/lightcone_mag.png" alt="Light cone strong lensing magnifications">
    <div class="research-card-body">
      <h3>Light Cone Strong Gravitational Lensing in Cosmological Simulations</h3>
      <p>Generating strong gravitational lensing images directly from cosmological simulation data is incredibly difficult due to the mismatched geometry of the lensing problem (a long, thin cone) and simulaiton boxes (cubes). We establish a methodology for generating images of strong lenses from full light cones in cosmological simualtions, for which the lens, sources and all intervening matter are drawn consistently from the parent simulation. Supervised by Prof. Michael McDonald and Prof. Mark Vogelsberger.</p>
      <div class="research-card-footer">
        <span class="badge badge-prep">In preparation</span>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/BCG_offsets.png" alt="BCG offsets in galaxy clusters">
    <div class="research-card-body">
      <h3>Dark Matter Self-Interaction via Galaxy Wobbling</h3>
      <p>The brightest cluster galaxy (BCG) can wobble over time in the potential well of its host cluster, which is dominated by dark matter. Distributions of BCG–potential-minimum offsets, obtained via strong lensing, constrain the self-interaction cross section of dark matter. Supervised by Prof. Michael McDonald and Prof. Mark Vogelsberger.</p>
      <div class="research-card-footer">
        <span class="badge badge-pub">Published</span>
        <a class="research-link" href="https://arxiv.org/abs/2402.00928" target="_blank">arXiv →</a>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/vesc3.png" alt="Escape velocity profiles of the Milky Way">
    <div class="research-card-body">
      <h3>Measuring the Milky Way Mass Profile via Stellar Kinematics</h3>
      <p>By modelling the tail of the stellar speed distribution of halo stars in Gaia DR3, we obtain an escape velocity profile of the Milky Way from 4–11 kpc. This constrains dark matter halo parameters (NFW, generalized NFW, Burkert), finding a light but consistent Milky Way mass. Supervised by Prof. Lina Necib. and Prof. Tongyan Lin.</p>
      <div class="research-card-footer">
        <span class="badge badge-pub">Published</span>
        <a class="research-link" href="https://arxiv.org/abs/2402.00108" target="_blank">arXiv →</a>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/penrose.png" alt="Penrose diagram for pp-wave spacetimes">
    <div class="research-card-body">
      <h3>Exact Wavelike Solutions in General Relativity</h3>
      <p>Master's thesis investigating the mathematical structure of pp-wave spacetimes, covering Penrose limits, the causal ladder, and the Ehlers-Kundt conjecture. Supervised by Prof. Carla Cederbaum. and Prof. Amir Babak Aazami.</p>
      <div class="research-card-footer">
        <span class="badge badge-pub">Published</span>
        <a class="research-link" href="https://arxiv.org/abs/2207.03591" target="_blank">arXiv →</a>
      </div>
    </div>
  </div>

  <!-- <div class="research-card">
    <img src="/images/lattice.gif" alt="Triangular optical lattice simulation">
    <div class="research-card-body">
      <h3>Exotic State Preparation in a Triangular Optical Lattice</h3>
      <p>Methods for creating higher orbital states in a triangular optical lattice, relevant to quantum simulation of condensed matter systems that require higher orbital occupation.</p>
      <div class="research-card-footer">
        <span class="badge badge-report">Report</span>
        <a class="research-link" href="/files/lattice.pdf" target="_blank">PDF →</a>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/ippprok.png" alt="Poloidal magnetic field structure">
    <div class="research-card-body">
      <h3>High Order Nulls in the Poloidal Fields of ASDEX Upgrade</h3>
      <p>Estimating the accuracy of poloidal field probes in resolving the complex magnetic field structure near the upper divertor plates of ASDEX Upgrade, for varying upper divertor coil currents.</p>
      <div class="research-card-footer">
        <span class="badge badge-report">Report</span>
        <a class="research-link" href="/files/nulls.pdf" target="_blank">PDF →</a>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/sigpros.png" alt="LIGO interferometry signal processing">
    <div class="research-card-body">
      <h3>An Introduction to Signal Processing in Interferometry</h3>
      <p>Signal processing techniques in the context of gravitational wave detection (GW150914) with LIGO. Written at undergraduate level, with a focus on building intuition rather than formalism.</p>
      <div class="research-card-footer">
        <span class="badge badge-report">Report</span>
        <a class="research-link" href="/files/sigpros.pdf" target="_blank">PDF →</a>
      </div>
    </div>
  </div>

  <div class="research-card">
    <img src="/images/92a.png" alt="Supernova 1992a light curve">
    <div class="research-card-body">
      <h3>The Progenitor System of Supernova 1992a</h3>
      <p>Late-time photometry of SN 1992a to infer its progenitor system. Modelling late-time light curve decay against HST and CTIO imaging to constrain the progenitor model for this Type Ia event.</p>
      <div class="research-card-footer">
        <span class="badge badge-report">Report</span>
        <a class="research-link" href="/files/92a.pdf" target="_blank">PDF →</a>
      </div>
    </div>
  </div> -->

</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.research-card p').forEach(function(p) {
    if (p.scrollHeight <= p.clientHeight + 1) return;
    var btn = document.createElement('button');
    btn.className = 'read-more-btn';
    btn.textContent = 'Read more';
    btn.addEventListener('click', function() {
      var expanded = p.classList.toggle('expanded');
      btn.textContent = expanded ? 'Show less' : 'Read more';
    });
    p.after(btn);
  });
});
</script>
