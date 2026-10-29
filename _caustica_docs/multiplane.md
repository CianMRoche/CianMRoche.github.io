---
title: "3. Multiplane lensing recursion"
nav_title: "3. Multiplane lensing recursion"
order: 4
---

The scene is a set of planes, each at its own redshift, sorted from nearest to farthest. For each pixel, a ray is traced from the observer through the planes in order. The ray seen at angle $\boldsymbol{\theta}$ on the sky (the pixel's position, in arcsec) reaches plane $j$ at angular position (Schneider, Ehlers & Falco 1992)

<div class="doc-key" markdown="1">
**Multiplane recursion**

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\left(\boldsymbol{\theta}_k\right)$$
</div>

| Symbol | Meaning |
|---|---|
| $\boldsymbol{\theta}$ | Angle at which the ray is seen, fixed for each pixel (arcsec) |
| $\boldsymbol{\theta}_j$ | Angular position of the ray at plane $j$ (arcsec) |
| $D_j$ | Angular diameter distance from the observer to plane $j$ (<a href="/caustica-documentation/cosmology/">§2</a>) |
| $D_{kj}$ | Angular diameter distance from plane $k$ to plane $j$ |
| $\hat{\boldsymbol{\alpha}}_k(\boldsymbol{\theta}_k)$ | Total bending angle from the lenses on plane $k$, at the ray's position there (<a href="/caustica-documentation/lens-models/">§5</a>) |

The factor $D_{kj}/D_j$ turns the bending at plane $k$ into a shift in position at plane $j$. Each plane bends the ray at the position the earlier planes have already moved it to, so the effects of two lens planes do not simply add.

Every object is either a **lens** or a **source**, whatever plane it is on. Only lenses bend rays; sources only emit light. A plane can hold both. The ray's position on a source's plane is that source's $\boldsymbol{\beta}$, where its brightness is evaluated (<a href="/caustica-documentation/source-models/">§6</a>).

A scene can have up to 8 planes, 32 lenses and 32 sources, of which 4 can be pasted images (hidden objects do not count; some GPUs allow fewer). Objects or planes beyond that still appear in the scene but are not drawn, and a warning on the image says how many.

<div class="doc-figpair">
  <figure class="figpair-main">
    <img class="img-light" src="/images/caustica-docs/multiplane-light.png" alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <img class="img-dark"  src="/images/caustica-docs/multiplane-dark.png"  alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <figcaption>Lenses at z = 0.4 and z = 0.8 bending the light of a source at z = 1.6.</figcaption>
  </figure>
  <figure class="figpair-side">
    <img class="img-light" src="/images/caustica-docs/plane-timeline-light.png" alt="The line-of-sight strip showing two lens planes and a source plane as draggable marks.">
    <img class="img-dark"  src="/images/caustica-docs/plane-timeline-dark.png"  alt="The line-of-sight strip showing two lens planes and a source plane as draggable marks.">
    <figcaption>The same scene's planes on the line-of-sight strip, from the observer at z = 0. Drag a mark to change that plane's redshift.</figcaption>
  </figure>
</div>
