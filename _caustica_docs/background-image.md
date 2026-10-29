---
title: "7. Background and observation"
nav_title: "7. Background and observation"
order: 8
---

Two pictures can sit behind the lensed image. The **Background** is decoration: a picture framed to the square image panel. The **Observation** is data: an observed image of a lens, placed on the sky by its pixel scale, which you can line a model up against, cut with masks, and trace back to the source plane in the **Delensed image** view. Neither is lensed or bends any light. Both are drawn only in the **Lensed image** view, not on the quantity maps or in Line art, which draw their own background.

## Field colour

The empty field behind everything has a flat colour, **Colors** → **Field**. It also fills the margins a **Contain** fit leaves (below). It follows the light/dark theme like everything else on the image, so the default black field is white in the light theme; the colour picker shows the colour as it appears.

Its main use is with a pasted-image source (<a href="/caustica-documentation/source-models/#pasted-image">§6</a>), whose rectangular edge shows because the picture and the field differ there. **Match image** sets the field to the average colour of a band a few pixels deep around the pasted image's border (ignoring transparent pixels), which hides the edge; the source's own **Edge blend** softens what is left. It uses the selected pasted image, or else the first one in the scene.

## Compositing

The backdrop $I_\text{bg}$ is the field colour, with the background over it and the observation over that, each weighted by its own coverage (1 inside the picture, 0 outside, with a soft border from **Edge blend**). The lensed light is drawn on top, and hides the backdrop in proportion to its own brightness:

$$I_\text{out} = \operatorname{clamp}\Big(I_\text{src}' + I_\text{bg}\,(1 - C),\ 0,\ 1\Big), \qquad C = \max\big(\max_c I_{\text{src},c}',\ C_\text{paste}\big),$$

where $I_\text{src}'$ is the displayed source light (<a href="/caustica-documentation/source-models/#compositing-and-brightness-stretch">§6</a>), $\max_c$ takes its brightest colour channel, $C_\text{paste}$ is the largest pasted-image coverage at that pixel (<a href="/caustica-documentation/source-models/#pasted-image">§6</a>), and clamp limits each channel to $[0, 1]$. So a fully lit pixel hides the backdrop and an empty one shows it fully, and a pasted image hides it wherever it is. Changing a picture's **Brightness** therefore never changes the lensed light itself.

In the light theme the image is shown inverted (dark light on white). The pictures are inverted beforehand so they look the same in both themes. Saved images and recordings match the screen.

Each picture's **Brightness** (0 to 2) scales its light: 0 shows black in the dark theme and white in the light theme, 1 shows it as supplied. Its **Edge blend** (0 to 1) fades it out over a band inside its border, with weight $\operatorname{smoothstep}(0, w, d_x)\,\operatorname{smoothstep}(0, w, d_y)$, where $d_x$ and $d_y$ are the distances inside the nearest edge along each axis, $w = 0.4 \times$ Edge blend $\times$ the picture's shorter side, and $\operatorname{smoothstep}(0, w, d)$ rises smoothly from 0 at $d = 0$ to 1 at $d = w$.

## Background

Load a picture with **Upload image…** under **Background**. The eye button beside it hides the picture without removing it, and **Remove** removes it. Pictures larger than 4096 pixels on their longer side (background or observation) are shrunk to that size on loading.

**Framing.** The panel is square, so **Fit** sets how much of the picture the panel spans on each axis. With $a$ the picture's width over its height:

| Fit | Span $(s_x, s_y)$ | Result |
|---|---|---|
| Cover (crop), the default | $\big(\min(1, 1/a),\ \min(1, a)\big)$ | Fills the panel; the longer axis is cropped |
| Contain (fit) | $\big(\max(1, 1/a),\ \max(1, a)\big)$ | Whole picture visible; the rest is the field colour |
| Stretch | $(1, 1)$ | Fills the panel, distorting a non-square picture |
| Tile (mirrored) | as Contain | Whole picture visible, mirror-repeated to fill the rest (no edge, so no Edge blend) |

A span of 1 means the panel covers the picture's full width (or height). **Zoom** $k$ (0.25 to 5) divides the span, magnifying the picture, and **Offset X / Y** $\boldsymbol{\delta}$ ($-1$ to 1, in half-panel widths, positive to the right and up) move it. A point at position $\mathbf{v}$ in the panel (0 to 1 on each axis) shows the picture at

$$\mathbf{uv} = \Big(\mathbf{v} - \tfrac{1}{2} - \tfrac{1}{2}\boldsymbol{\delta}\Big) \odot \frac{\mathbf{s}}{k} \;+\; \frac{1}{2},$$

where $\mathbf{uv}$ is the position in the picture (0 to 1 on each axis, with $v$ counted from the top), $\mathbf{s} = (s_x, s_y)$, and $\odot$ multiplies component by component.

**Zoom with FOV.** By default the background is fixed to the panel, so changing the FOV does not zoom it. With **Zoom with FOV** on, it is fixed to the sky instead: the span is multiplied by FOV/FOV₀, where FOV₀ is the FOV when the picture was loaded or the option turned on. A picture that belongs at a definite place on the sky should be an observation instead.

**Reset framing** restores Fit, Zoom, the offsets, Brightness, Edge blend and Zoom with FOV, and shows the picture if it was hidden.

**Configs.** The framing is saved as `bgFit`, `bgZoom`, `bgOffX`, `bgOffY`, `bgBright`, `bgEdgeBlend`, `bgSkyLock` and `bgHidden`, and checked against the ranges above on loading. A picture you upload is not saved (nor FOV₀). A config can name one of the pictures shipped with the presets with `bgImage`. Loading a config without `bgImage` removes a picture that came from a preset but keeps one you uploaded.

## Observation

Load the observed image under **Observation** (the eye icon). It is placed on the sky by its **Pixel scale** $p$ (arcsec per pixel of the image as supplied, $10^{-4}$ to 10), so a $W \times H$ pixel image covers $Wp \times Hp$ arcsec, centred at **Offset X / Y** (arcsec, positive to the right and up). It stays fixed on the sky as you change the FOV. A new picture starts at $p = \text{FOV}/\max(W, H)$, filling the view, centred. The line under **Pixel scale** gives its size on the sky.

- **Show in the lensed view** (on by default) draws it in the lensed-image view, over the background and behind the lensed light. The delensed view uses it either way.
- **Brightness** and **Edge blend** work as for the background, in both views.
- **Remove** removes the picture. Its masks stay, at their places on the sky.
- **Use lensed image** makes the lensed image as it is now the observation. It is drawn as in a tab showing the lensed-image view (with the instrument model, if one is on), over the current observation if that is shown, but without the background, overlays or point-source dots, on a black field. Its pixel scale is the FOV divided by the render width in pixels (**Settings** → render scale), centred, so it lies exactly where the light was. It starts hidden from the lensed view, with Brightness 1 and Edge blend 0. Delensing it through the same lens model should give back the sources, which is a useful check.
- **Open the delensed view** opens the **Delensed image** view beside the current one, or goes to its tab.

**In the scene drawer.** The left end of the line-of-sight strip (z = 0) is drawn as the observer's eye. Clicking it shows or hides the observation's card at the left of the drawer; the card starts hidden each time the app opens. The card shows the picture where it sits on the sky, with its masks. Clicking the card opens the Observation panel.

**Configs.** The observation is saved as `obsImage` (only for pictures shipped with the site, as for `bgImage`), `obsPixel`, `obsOffX`, `obsOffY`, `obsBright`, `obsEdge` and `obsShown`, and its masks as a top-level `masks:` list (below). The **Image recreation** preset (<a href="/caustica-documentation/presets/">§11</a>) loads its quasar photograph this way, at $p = 0.003125$″. Older configs that gave the background a pixel scale (`bgPixel` above 0) load it as the observation, and masks stored on planes move to the observation.

## Delensed view

The **Delensed image** view (U) runs the lens backwards on the observation. Each pixel of the observation is traced through the current lens model to the source plane at z<sub>s</sub> ref (<a href="/caustica-documentation/lensing-quantities/">§4</a>) and its colour is drawn where its light came from. With the right model, the multiple images of a source land on top of each other and form one source; with a wrong one they land as offset copies. You can drag and reshape lenses while watching the copies merge.

**Method.** The observation's area on the sky is covered by a grid of 512 points along its longer side (proportionally fewer along the shorter), joined into triangles. Each point is moved to its traced source position $\boldsymbol{\beta}$, and each triangle carries its piece of the picture, stretched to fit. Where the grid folds over itself (inside the caustics) several images land on the same source pixel, and they are averaged with weights $\lvert\mu\rvert$:

$$I(\boldsymbol{\beta}) = \frac{\sum_i \lvert\mu_i\rvert\, I_\text{obs}(\boldsymbol{\theta}_i)}{\sum_i \lvert\mu_i\rvert},$$

where the $\boldsymbol{\theta}_i$ are the images of $\boldsymbol{\beta}$ inside the picture, $\mu_i$ their magnifications (<a href="/caustica-documentation/lensing-quantities/">§4</a>), and $I_\text{obs}$ the observed brightness. This is the average over all observed pixels that land on a source pixel, since a more magnified image covers more pixels. Lensing does not change surface brightness, so for a correct model all images agree.

Four rules keep the result clean:

- A triangle with any corner at $\lvert\mu\rvert < 0.05$ is dropped. These very faint regions, mostly around a singular lens centre, would smear a few pixels over a wide area.
- A triangle whose source-plane area is more than 20 times what its corners' $\lvert\mu\rvert$ imply is dropped. These are torn across a singular centre.
- Each corner's $\lvert\mu\rvert$ is limited to 20 times the triangle's own area ratio, which removes occasional bad values next to a singular centre.
- Weights are capped at $\lvert\mu\rvert = 100$, so thin triangles along a critical curve cannot dominate.

Source pixels that nothing reaches show the empty field. The view needs a GPU that can render to floating-point images (almost all can); the Observation panel says if it cannot. As a check, a Gaussian source rendered through an SIE and delensed is recovered to 0.03% (rms, relative to its peak), with its centre within a pixel and its total brightness within 0.04%.

**Display.** Like the other source-plane views, it hides the image-plane overlays (critical curves, point-source images and time delays, stretch whiskers) but keeps the caustics, the lens, source and mask markers, and the ruler. The picture's own tones are shown in either theme, with the observation's **Brightness** and **Edge blend** applied to each observed pixel before the averaging. With no observation, the view says how to add one.

**Masks.** A mask removes an elliptical patch of the observation before delensing, usually over the lens galaxy (whose light would otherwise be spread over the source plane) or a foreground star. A source point whose images are all masked shows the empty field; one with an unmasked image is built from that alone. Masks belong to the observation, not to a plane.

| Symbol | Control | Meaning |
|---|---|---|
| $(c_x, c_y)$ | drag the marker | Centre on the sky (arcsec) |
| $r$ | Size (″) | Semi-major axis, 0.01″ to 20″ |
| $q$ | q | Axis ratio minor/major |
| $\varphi$ | φ (rad) | Position angle of the major axis |

A mask covers $x_r^2 + (y_r/q)^2 \le r^2$, with $(x_r, y_r)$ the offset from its centre along its axes, as for sources (<a href="/caustica-documentation/source-models/">§6</a>). Place one with the mask tool (key **4**, or **+ Mask** in the Observation panel), available while there is an observation, by clicking the image in any view or the observation's card. The Observation panel lists the masks, each with an eye to switch it off and a × to delete it. Masks are drawn as grey markers in every view except the line-art lensed image; in the lensed-image view and on the card they also show their outline and a light fill. They affect only the delensed view, are applied exactly at each pixel, and up to 16 are used (the panel says if more are on). They are saved in a config as `masks:` entries with `cx`, `cy`, `r`, `q`, `phi` and `hidden`.

<div class="doc-warning" markdown="1">
**Heads up.** The lens galaxy's own light is traced back like everything else unless a mask covers it. The blurring of the telescope is not undone either, so the reconstruction is as blurred as the observation, and differently in each image, since each is magnified by a different amount.
</div>
