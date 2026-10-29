---
title: "6. Source brightness models"
nav_title: "6. Source brightness models"
order: 7
---

A ray reaching a plane at position $\boldsymbol{\beta}$ (arcsec) picks up the surface brightness $I(\boldsymbol{\beta})$ of every source on that plane. The analytic profiles depend on $\boldsymbol{\beta}$ through the elliptical radius

$$\mathbf{d} = \boldsymbol{\beta} - (c_x, c_y), \qquad \begin{pmatrix}x_r \\ y_r\end{pmatrix} = R(-\varphi)\,\mathbf{d}, \qquad r_\text{ell}^2 = x_r^2 + (y_r/q)^2,$$

where $\mathbf{d}$ is the offset from the source centre, $R(-\varphi)$ is the rotation by $-\varphi$, and $(x_r, y_r)$ is the offset along the source's major and minor axes.
This differs from the lens elliptical radius (<a href="/caustica-documentation/lens-models/">§5</a>) by a factor of $q$: here $\sigma$ is the semi-major axis of the isophote, as in galaxy photometry, while lenses follow Kormann et al. (1994) so that their deflection scale $b$ does not depend on $q$.

| Symbol | Control | Meaning |
|---|---|---|
| $(c_x, c_y)$ | drag the marker | Source centre on its plane (arcsec) |
| $\varphi$ | φ | Position angle of the major axis (radians) |
| $q$ | q | Axis ratio minor/major, $0 \lt q \leq 1$ |
| $\sigma$ | σ | Scale radius (arcsec), rendered no smaller than 0.01″ |
| $A$ | A | Amplitude, the peak surface brightness |
| | Color | Colour the profile is drawn in (white by default) |

The point source, uniform disc and pasted image use some of these with a different meaning; each section below says how.

<div class="doc-figrow">
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-pointsource-light.png" alt="Point source lensed by an SIE into multiple images.">
    <img class="img-dark"  src="/images/caustica-docs/src-pointsource-dark.png"  alt="Point source lensed by an SIE into multiple images.">
    <figcaption>Point source</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-gaussian-light.png" alt="Gaussian source lensed by an SIE.">
    <img class="img-dark"  src="/images/caustica-docs/src-gaussian-dark.png"  alt="Gaussian source lensed by an SIE.">
    <figcaption>Gaussian</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-pasted-light.png" alt="A pasted image lensed by an SIE.">
    <img class="img-dark"  src="/images/caustica-docs/src-pasted-dark.png"  alt="A pasted image lensed by an SIE.">
    <figcaption>Pasted image</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">The same SIE lens acting on a point source, a Gaussian, and a pasted image.</figcaption>

## Gaussian

$$I = A\exp\left(-\frac{r_\text{ell}^2}{2\sigma^2}\right)$$

## Exponential

$$I = A\exp\left(-\frac{r_\text{ell}}{\sigma}\right)$$

This is the Sérsic profile $I \propto \exp\big[-(r_\text{ell}/\sigma)^{1/n}\big]$ with index $n = 1$, more extended than the Gaussian.

## Uniform disc

$$I = \begin{cases} A & r_\text{ell} \leq \sigma \\ 0 & \text{otherwise} \end{cases}$$

A filled ellipse with a sharp edge. Here $\sigma$ is the semi-major axis, set as **r**. The disc has no A control and uses $A = 1$ unless a config sets `amplitude`.

**Show shape** draws the outline at $r_\text{ell} = 2\sigma$ for the Gaussian and exponential, and at $\sigma$ for the uniform disc.

## Point source

A point source models a quasar or other compact object. The code finds every image-plane position $\boldsymbol{\theta}_i$ that maps to the source centre, $\boldsymbol{\beta}(\boldsymbol{\theta}_i) = (c_x, c_y)$, and draws a dot at each. Here $\sigma$ (**Size**) is the dot radius in arcsec, $A$ its opacity, and **Color** its colour; there is no $q$ or $\varphi$. The dots are drawn over the image rather than added to the light, so they are not stretched by lensing (like a PSF-limited quasar image) and do not go through the brightness stretch below. The **Unlensed** view shows a single dot at $(c_x, c_y)$.

Sign changes of $\boldsymbol{\beta} - (c_x, c_y)$ on a coarse grid of $\boldsymbol{\theta}$ give starting guesses, and Newton-Raphson with a backtracking line search refines each until $\lvert\boldsymbol{\beta}(\boldsymbol{\theta}) - (c_x, c_y)\rvert^2 \lt 10^{-14}$ arcsec². Solutions closer than $10^{-5}$″ are merged. The grid is the **Point source** setting under **Settings**: 150, 300 (default), 600 or 1200 points across the field. Denser grids find images near caustics more reliably but are slower.

<div class="doc-warning" markdown="1">
**Heads up.** A point source never forms arcs or rings; use a Gaussian or uniform disc for those. Highly demagnified images (such as the central image of an SIE) can be missed by the grid search.
</div>

## Pasted image

Select the object and paste a picture with Ctrl+V (Cmd+V), or use **Load image…** in its controls. It is centred on $(c_x, c_y)$, with its height set to the field of view when you load it (later zooming does not resize it). Here $\sigma$ is **Scale**, a multiplier on that size, and $A$ is **Brightness**. There is no $q$, $\varphi$ or **Color**. The picture is sampled bilinearly from a mipmap chain.

A pasted image is opaque: its dark pixels hide what is behind them rather than letting the background through (<a href="/caustica-documentation/background-image/">§7</a>). Its coverage $C$ is 1 inside the picture and falls to 0 over a soft border,

$$C = \prod_{i \in \{u,v\}} \operatorname{smoothstep}\big(0,\ w,\ \min(uv_i,\, 1 - uv_i)\big), \qquad w = \min\big(\tfrac{3}{2}\,\text{fwidth}(uv) + w_\text{blend},\ 0.45\big),$$

where $uv = (uv_u, uv_v) \in [0,1]^2$ is the position of $\boldsymbol{\beta}$ within the picture, $w$ is the border width in those units, $\operatorname{smoothstep}(0, w, x)$ rises smoothly from 0 at $x = 0$ to 1 at $x = w$, and $\text{fwidth}(uv)$ is how much $uv$ changes between neighbouring screen pixels. The first term keeps the border about 1.5 pixels wide at any magnification. **Edge blend** (0 to 1) sets $w_\text{blend} = 0.4 \times$ Edge blend, fading the picture into the field. Because the picture is opaque, **Brightness** darkens it rather than fading it out; use **Edge blend** to let the field through.

**Contrast** $k \in [0.3, 2.5]$ and **Saturation** $s \in [0, 2]$ adjust the picture's colour $\mathbf{c} = (r, g, b)$ at each point before **Brightness**:

$$\mathbf{c}' = \operatorname{clamp}\Big(\big(Y + s\,(\mathbf{c} - Y) - \tfrac12\big)\,k + \tfrac12,\ 0,\ 1\Big), \qquad Y = 0.2126\,r + 0.7152\,g + 0.0722\,b,$$

where $Y$ is the perceived brightness of $\mathbf{c}$, a weighted sum of its channels with the standard weights for the eye's sensitivity (most to green, least to blue; ITU-R BT.709), and clamp limits each channel to $[0, 1]$. $s = 0$ gives greyscale and $s = k = 1$ leaves the picture unchanged. A picture spread along an arc tends to look washed out, and $k > 1$ brings back its shadows.

**Apply brightness stretch** (off by default) sends the picture through the brightness stretch below. A photograph is already display-encoded, so the stretch washes it out. Turn it on if the picture is a surface-brightness map.

Your own pictures are not saved in a config. A config can name one of the site's images with an `image:` key on the object (the **Realistic** preset does this, <a href="/caustica-documentation/presets/">§11</a>), checked against the same allowlist as `bgImage` (<a href="/caustica-documentation/background-image/">§7</a>).

## Compositing and brightness stretch

Each pixel collects the light of every visible source: **Color** $\times\, I$ for the analytic profiles and $A\,C\,\mathbf{c}'$ for pasted images. Hidden objects add no light and no lensing. The light is split into $I_\text{analytic}$ (analytic sources), $I_\text{stretched}$ (pasted images with **Apply brightness stretch** on) and $I_\text{as-is}$ (pasted images with it off), and the displayed source light is

$$I_\text{src}' = \operatorname{clamp}\Big(f\big(\operatorname{clamp}(I_\text{analytic} + I_\text{stretched},\,0,\,1)\big) + I_\text{as-is},\ 0,\ 1\Big),$$

applied to each colour channel separately. Pasted images with the stretch off keep their tones, while analytic light still adds on top.

The stretch $f$ is set under **Colors** → **Color map**, with the same controls as the quantity maps (<a href="/caustica-documentation/lensing-quantities/">§4</a>). **Min** and **Max** (default 0 and 1) set the black and white points, $u = \operatorname{clamp}\big((I - \text{Min})/(\text{Max} - \text{Min}),\ 0,\ 1\big)$, and **Scale** picks the curve:

| Scale | $f$ |
|---|---|
| Linear | $u$ |
| Square root (default) | $\sqrt{u}$ |
| Power law | $u^{\gamma}$, with **Power** $\gamma \in [0.1, 2]$; lower $\gamma$ lifts faint light more |
| Asinh | $\operatorname{asinh}(a u) / \operatorname{asinh}(a)$, with **Softening** $a \in [0.5, 20]$; linear for faint light, logarithmic for bright (Lupton et al. 2004) |
| Log | $(\ln I - \ln \text{Min}) / (\ln \text{Max} - \ln \text{Min})$, clamped to $[0,1]$; Min is floored just above zero |

There is no palette menu here, since the lensed image carries its own colour.
