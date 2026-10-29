---
title: "11. Preset configurations"
nav_title: "11. Preset configurations"
order: 12
---

The **Presets…** menu in the top bar loads ready-made scenes. Choosing **Presets…** itself reloads the default scene, and choosing the preset already loaded reloads it, discarding your edits. The lens and source models are described in <a href="/caustica-documentation/lens-models/">§5</a> and <a href="/caustica-documentation/source-models/">§6</a>.

- **Uniform Source**: an NIE galaxy ($r_c = 0.2$″) with an off-centre SIE companion at $z = 0.5$, lensing a uniform disc at $z = 1.5$.
- **Point Source**: an NIE at $z = 0.5$ and a point source at $z = 1.5$, showing tangential and radial critical curves and caustics, the image positions, and their time delays.
- **Fermat surface**: an SIE and an NIE at $z = 0.5$ and a uniform disc at $z = 1$, in the Fermat potential view, computed for the source's position.
- **Parity**: an NIE ($r_c \approx 0.08$″) at $z = 0.5$ and a point source at $z = 1.5$, in the Parity view with only the radial curves, and the images marked by handedness.
- **ZigZag Lens**: a point source at $z = 2.38$ lensed first by a galaxy at $z = 1.89$ and again by one at $z = 0.18$ (with shear and a constant deflection), so the light path zigzags.
- **Butterfly Caustic**: two flattened NIEs at $z = 0.5$ with nearly perpendicular major axes, whose caustic folds into "butterfly" shapes at its cusps (see [Orban de Xivry & Marshall 2009](https://ui.adsabs.harvard.edu/abs/2009MNRAS.399....2O/abstract) for an atlas of such lenses). The two lenses sit on separate planes at the same redshift, for easier editing.
- **Galaxy group**: six SIE galaxies with external shear at $z = 0.5$ in a 40″ field, with sources at $z = 1.15$, 2 and 3.
- **Image recreation**: a quadruply imaged quasar, recreated by eye. The photograph `quad_quasar_image.jpg` is the observation (<a href="/caustica-documentation/background-image/#observation">§7</a>), at 0.003125″ per pixel, shown at Brightness 0.6 so the computed image positions stand out. Two SIEs at $z = 0.5$ and a point source at $z = 1.34$ reproduce it. To do the same for another system, upload its image as the observation, move the lenses and source until the computed images land on the real ones, and check the fit in the Delensed image view.
- **Delensing**: a dog lensed into a ring by one SIE at $z = 0.38$ is the observation (`dog_lensed.png`, 0.003663″ per pixel), with z<sub>s</sub> ref = 1.65. It opens with the lensed image and the delensed image side by side, with zoom and the display toggles unlinked so the right view is zoomed in and shows no lens outline, and with the observation's card shown. Move or reshape the lens and the dog splits into offset copies.
- **Henry's arc**: a photograph of a lensed arc as the observation (`henry.jpg`, 0.003203″ per pixel), modelled by an NIE with external shear at $z = 0.41$, with a mask over the lens galaxy. It opens like **Delensing**, with z<sub>s</sub> ref = 1.02.
- **Realistic**: two photographs as pasted-image sources. An elliptical galaxy with its star field sits at $z = 0.5$, beside (not behind) an NIE lens at the same redshift, so you see it as the foreground galaxy. A spiral galaxy at $z = 2.67$ sits behind and is lensed into arcs, with **Contrast** 2.3 and full **Edge blend** so it does not show as a rectangle.
- **Line art**: an NIE and SIE at $z = 0.5$ lensing a uniform disc at $z = 1.5$, in Line art (<a href="/caustica-documentation/critical-curves/#line-art-vector-render-mode">§9</a>) with the Crimson (inv.) palette.
