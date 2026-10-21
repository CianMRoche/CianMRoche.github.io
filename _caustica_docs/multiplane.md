---
title: "3. Multiplane lensing recursion"
nav_title: "3. Multiplane lensing recursion"
order: 4
---

Planes are sorted by increasing redshift.
A ray **observed** at image-plane angle $\boldsymbol{\theta}$ (a 2-D vector in arcsec) is traced forward through each plane in order.
Its angular position at plane $j$ is given by the *multiplane recursion* (Schneider, Ehlers & Falco 1992):

<div class="doc-key" markdown="1">
**Multiplane recursion**

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\left(\boldsymbol{\theta}_k\right)$$
</div>

| Symbol | Meaning |
|---|---|
| $\boldsymbol{\theta}$ | Observed angle (image-plane position); fixed for each rendered pixel |
| $\boldsymbol{\theta}_j$ | Ray's angular position at plane $j$ (arcsec) |
| $D_{kj}$ | Angular diameter distance from plane $k$ to plane $j$ |
| $D_j$ | Angular diameter distance from observer to plane $j$ |
| $\hat{\boldsymbol{\alpha}}_k(\boldsymbol{\theta}_k)$ | Deflection angle from all lens objects in plane $k$, evaluated at the ray's position $\boldsymbol{\theta}_k$ |

Each object carries its own type, **lens** or **source**, independently of which plane it belongs to.
Only lens objects enter the deflection sum; source objects are passive and receive the ray without contributing to it.
A plane containing both types is a **hybrid plane**; its lens objects deflect and its source objects emit, handled separately by the same recursion.
The weight $D_{kj}/D_j$ converts the deflection at plane $k$ into its angular displacement at the later plane $j$.

The position at the target plane is the **source-plane position** $\boldsymbol{\beta}$, where source brightness is sampled.

<div class="doc-note" markdown="1">
**Key idea.** Because each lens plane evaluates its deflection at the ray's *already-deflected* position $\boldsymbol{\theta}_k$, successive lens planes interact non-linearly, a key feature of multiplane lensing absent in single-plane calculations.
</div>

<div class="doc-figpair">
  <figure class="figpair-main">
    <img class="img-light" src="/images/caustica-docs/multiplane-light.png" alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <img class="img-dark"  src="/images/caustica-docs/multiplane-dark.png"  alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <figcaption>A two-lens-plane configuration: lenses at z = 0.4 and z = 0.8 deflect light from a source at z = 1.6, the two deflections compounding non-linearly.</figcaption>
  </figure>
  <figure class="figpair-side">
    <img class="img-light" src="/images/caustica-docs/plane-timeline-light.png" alt="Redshift timeline showing two lens planes and a source plane as draggable markers.">
    <img class="img-dark"  src="/images/caustica-docs/plane-timeline-dark.png"  alt="Redshift timeline showing two lens planes and a source plane as draggable markers.">
    <figcaption>The plane controls for the same scene: each plane is a marker on the redshift timeline (observer at z = 0), draggable to set its redshift. Objects are added to the selected plane.</figcaption>
  </figure>
</div>
