---
title: "9. Critical curves and caustics"
nav_title: "9. Critical curves and caustics"
order: 10
---

**Critical curves** are the lines on the image where $\det A = 0$, with $A$ the matrix of derivatives of the source position $\boldsymbol{\beta}$ with respect to the image position $\boldsymbol{\theta}$ (<a href="/caustica-documentation/lensing-quantities/#the-lens-mapping-jacobian">§4</a>). The magnification is infinite there, and sources near them are stretched into arcs. The same lines traced back to the source plane are the **caustics**; a source crossing a caustic gains or loses two images. Press **C** to show or hide both. They are computed for z<sub>s</sub> ref (<a href="/caustica-documentation/lensing-quantities/">§4</a>) in four steps.

1. **Trace a grid.** Trace $N \times N$ rays to the source plane, with $N$ set by **Critical curves** under **Settings**: 256, 512 (default), 1024 or 2048. The grid spans 1.3 times the FOV, or the **FOV buffer** (**Settings**, default 5″, up to 60″) if that is larger, so curves just outside the view are found in full. When you zoom in on the caustics, their critical curves can lie well outside the view; the buffer keeps them on the grid, at the cost of a coarser grid.
2. **Compute $\det A$** at each grid point from its neighbours' $\boldsymbol{\beta}$.
3. **Find where it changes sign.** In each grid cell whose corners have both signs of $\det A$, a short line segment is placed where the linear interpolation between corners is zero (the marching-squares method). The segments join into curves.
4. **Map to caustics.** Each point of a critical curve is moved to its $\boldsymbol{\beta}$, interpolated from the same grid.

<figure>
  <img class="img-light" src="/images/caustica-docs/crit-light.png" alt="Critical curves and caustics of a compound lens.">
  <img class="img-dark"  src="/images/caustica-docs/crit-dark.png"  alt="Critical curves and caustics of a compound lens.">
  <figcaption>Critical curves and caustics of a lens with several mass components.</figcaption>
</figure>

Small features such as the sharp points of caustics (cusps) need a higher **Critical curves** setting.

## Tangential and radial curves

On a critical curve one of the two eigenvalues of $A$ (the factors by which $A$ stretches its two special directions) is zero, and the other equals $\operatorname{tr} A = A_{11} + A_{22}$. A segment is **tangential** where $\operatorname{tr} A > 0$ and **radial** where $\operatorname{tr} A < 0$. For a single lens plane these are where $1 - \kappa - \gamma = 0$ and $1 - \kappa + \gamma = 0$, with $\kappa$ and $\gamma$ the convergence and shear (<a href="/caustica-documentation/lensing-quantities/">§4</a>); the test also works for several planes. Arcs along a tangential curve are stretched along it, and along a radial curve across it. Each caustic segment takes the type of its critical segment.

With **Curve types** on (**View** → **Critical curves**, on by default), radial curves are dotted and tangential ones solid, each with a legend entry, and **Show** can limit the display to one type. With it off, all curves are solid.

A point mass has no radial curve. An SIE's radial critical curve is a tiny loop around its 0.001″ core, but its radial caustic is full size. An NIE and an EPL with $\gamma' < 2$ have resolved radial curves. Radial loops of fewer than 12 segments are dropped, since a singular centre leaves a small spurious loop at any grid size.

## Line art (vector render mode)

**Colors** → **Line art** replaces the lensed image with flat vector drawing, for clean figures. It restyles the **Lensed image** view only: quantity maps and source-plane views draw as usual. It draws:

- the lensed images of **uniform-disc** sources, filled and outlined;
- **point-source** images, as dots;
- the critical curves and caustics, following their own toggles.

Gaussian, exponential and pasted-image sources have no sharp edge and are not drawn. Markers, ruler, scale bar and legend stay as usual, in the **Annotations** colour (below). The background and the observation are not shown, since line art draws its own background.

**Controls.** **Fill images** switches between filled shapes and outlines only, **Fill alpha** sets the fill's opacity (0 to 1, default 0.9), and **Smooth** rounds off the curves. **Palette** picks a fixed colour scheme, the same in both themes: **Default** (the site's dark background `#0d1117`, light blue `#93c5fd` images and critical curves, gold `#fbbf24` caustics), **Ink**, **Ink (inv.)**, **Crimson**, **Crimson (inv.)**, **Blueprint**, **Blueprint (inv.)**, **Espresso**, **Mint** or **Noir**. Below it, a colour picker for each role (background, image fill, image line, critical, caustic, point image, and the lens, source and hybrid markers) overrides the palette; choosing a palette again resets them. All of these are saved in configs.

**Export.** Line art is drawn on the overlay, so saved images and recordings include it. **Export** → **Save SVG (line art)** saves the same drawing as a vector SVG file, for editing or printing at any size, while the left (or only) view shows line art. Its **Background** toggle (on by default) sets whether the file includes the background colour; off gives a transparent background.

**How the disc outlines are found.** A disc's lensed image is where

$$g(\boldsymbol{\theta}) = r_\text{ell}\big(\boldsymbol{\beta}(\boldsymbol{\theta})\big) - \sigma \le 0,$$

with $r_\text{ell}$ the disc's elliptical radius and $\sigma$ its semi-major axis (the **r** control; <a href="/caustica-documentation/source-models/#uniform-disc">§6</a>). Its outline, $g = 0$, is found by marching squares on the same grid as the critical curves (one set of rays serves both). Near critical curves $g$ changes quickly, so a plain contour would look ragged, and two steps fix this:

1. **Refinement.** Each outline point is moved onto the true outline by a few extra ray traces along its grid edge. The extra work goes where the outline bends most.
2. **Smoothing.** The outline is smoothed by repeatedly cutting its corners, except at sharp points (real cusps), which are kept.

## Annotation color

**Colors** → **Annotations** sets the colour of the scale bar, legend text, ruler lines and labels, time-delay labels, and Fermat markers and their legend. Object markers, critical curves, caustics, point-source dots and line-art colours are not affected. With **Auto** on (the default) it is white in the dark theme and black in the light theme. Picking a colour turns Auto off and keeps that colour, which helps with a light line-art palette on a dark page. Backgrounds behind labels switch between dark and light to contrast with the chosen colour. Saved in configs as `annotAuto` and `annotColor`.

**View** → **Display** → **Legend BG** (off by default) puts a translucent panel behind the legend so lines underneath do not run through the text.
