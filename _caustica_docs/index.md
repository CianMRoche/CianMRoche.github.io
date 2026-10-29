---
title: "How Caustica works"
nav_title: "Overview and quick start"
order: 0
permalink: /caustica-documentation/
---


<div class="doc-cyan" markdown="1">
Warning: These docs are mostly auto-generated so dont trust them yet. I'm working on going through them all and making them sensible, but it takes a lot of time! :)
</div>

[Caustica](/assets/caustica/) is a tool for easily visualizing strong gravitational lensing, named after the term used by 17th century mathematicians for the curves onto which refracted light rays converge, which were capable of burning objects.

<figure class="doc-fig-wide">
  <img class="img-light" src="/images/caustica-docs/ui-light.png" alt="The Caustica interface: the image, the scene drawer below it, and the control panels on the right.">
  <img class="img-dark"  src="/images/caustica-docs/ui-dark.png"  alt="The Caustica interface: the image, the scene drawer below it, and the control panels on the right.">
  <figcaption>Caustica showing a zigzag lens: the lensed image, the planes below it, and the controls on the right.</figcaption>
</figure>

<div class="doc-cyan" markdown="1">
Caustica was built with heavy use of AI tools for code generation, and as a whole its calculations have not been peer-reviewed or independently validated. Where a component was cross-checked against an established reference it is noted in the relevant section (for example, the EPL lens was ported from and validated against [lenstronomy](https://github.com/lenstronomy/lenstronomy); see <a href="/caustica-documentation/lens-models/">§5</a>). It is intended for education, intuition-building, visualization and media creation only, and should not be relied on for research.
</div>

## Quick start

On a computer the window has the image in the middle, with view tabs above it, a tool column on its left, the **scene drawer** below it, and the control panels on the right, picked with the column of icons on the right edge. On phones everything is in one scrolling column; the phone version of each step is in *italics*.

A scene is a set of **planes** at different redshifts, each holding **objects**: lenses, which bend light, and sources, which emit it (<a href="/caustica-documentation/multiplane/">§3</a>).

1. **Add a plane.** Click **+ Plane** in the drawer's header to add an empty plane behind the farthest one, or click a blank part of the **line-of-sight strip** beside it to add one at that redshift. The strip runs from the observer (the eye at its left end, <a href="/caustica-documentation/background-image/#observation">§7</a>) out to **z<sub>max</sub>** (the box at its right end), with a mark for each plane. Drag a mark to change its plane's redshift, or click it to select the plane. Marks that would overlap move just above or below the line. A line marked z<sub>s</sub> is the reference source redshift, the source redshift that the maps and critical curves are computed for (<a href="/caustica-documentation/lensing-quantities/">§4</a>). Below the strip, each plane has a card showing its objects at their true (unlensed) positions. The panel at the right of the drawer holds the selected plane's **Redshift**, **Clear** (key **O**) and **Delete** (key **X**); **[** and **]** step through the planes. The chevron in the header hides the drawer. *On phones, tap the redshift line under the image to add a plane there, and use the plane viewer in the **Scene** tab.*
2. **Place objects.** Pick a tool in the tool column: ▲ **Lens**, ▼ **Source**, or ◆ **Hybrid** (a lens and a source at the same spot that move together), or press **1**, **2** or **3**. Then click a card's viewer to place the object on that plane, or the image to place it on the selected plane. Click the tool again (or press **Esc**) to turn it off; with no tool on, clicks only select and drag. The trash button deletes the selected object. With an observation loaded (an observed image, <a href="/caustica-documentation/background-image/#observation">§7</a>), a mask tool (key **4**) appears too, for cutting patches out of it. *On phones, use the **L / S / H** (and **M**) tools beside the Scene tab's plane viewer.*
3. **Select and move.** Drag objects on the image or in a viewer, or nudge them with the arrow keys. **Cmd**-click (**Ctrl**-click on Windows and Linux) adds an object to the selection or removes it, and dragging a box on empty image space selects everything inside it. Dragging any selected object moves them all, across planes too; other edits act only on the object clicked last. **H** or the eye button hides an object: it stops affecting the image but stays as a grey marker you can select and show again. **Cmd/Ctrl+C** and **V** copy and paste; the undo and redo arrows by the title (**Cmd/Ctrl+Z**, **Shift+Z**) undo scene edits, but not view settings.
4. **Set parameters** in the **Object** panel (the triangle icon; *the **Object** tab on phones*). Changing an object's model keeps its position, axis ratio $q$, position angle $\varphi$, deflection scale $b$ and colour where the new model has them. A hybrid shows its lens and source halves separately, each with its own eye and delete buttons.
5. **Choose views.** Each view is a tab above the image: click the showing tab to pick its view from a menu, or use the letter keys (**I** for the lensed image; see <a href="/caustica-documentation/keyboard-shortcuts/">shortcuts</a>). The menu groups the views into the **image plane**, the sky as seen (lensed image and maps, <a href="/caustica-documentation/lensing-quantities/">§4</a>), and the **source plane**, where the sources really are (Image number, Source magnification, Unlensed, Delensed image), which are tagged **source**. **+** adds a tab, and the split button (or dragging a tab to the right half) shows two views side by side. The view you clicked last is the focused one, which the panels and keys act on. The **link** button between the views sets what they share: zoom, z<sub>s</sub> ref, the display toggles, the instrument, line art, and the background framing. Each view has its own toggles for critical curves, caustics (<a href="/caustica-documentation/critical-curves/">§9</a>) and object markers at the right end of its tab strip, and **C** switches the curves of the focused view. Zoom with the mouse wheel or a pinch, or type the field of view (**FOV**, the width of the image in arcsec) under **View** → **Field**. *On phones, use the view menu above the image, or swipe across empty image space to change view.*
6. **Measure** with the ruler (key **L**, <a href="/caustica-documentation/coordinates/#measuring-with-the-ruler">§1</a>).
7. **Save.** **Save** in the top bar downloads the scene as a config file (YAML, a plain-text format) and **Load** reads one back. It stores the planes and objects, every view setting, the observation's settings and masks, and the layout of the views (open tabs, the focused view, unlinked settings). Pictures you upload are not saved. Settings missing from a file load at their defaults. **Presets…** has ready-made scenes (<a href="/caustica-documentation/presets/">§11</a>). *On phones, Save and Load are in the top bar's **⋯** menu.*

**View** → **Hide all overlays** hides the markers, legend, ruler, scale bar, colour bar and on-image buttons for a clean picture; critical curves, caustics, point-source images and stretch whiskers (<a href="/caustica-documentation/lensing-quantities/#stretch-whiskers">§4</a>) stay. **Full screen** (the button beside the theme toggle, or **F**) shows only the image, or both views, as large as the window allows, with the on-image overlays, and objects can still be dragged; **F**, **Esc** or the button in the top-right corner leaves it. **Tour** in the top bar walks through the controls. **Export** saves pictures and videos (<a href="/caustica-documentation/recording/">§10</a>).

**Where the controls live.** On a computer, the icons down the right edge choose the panel:

| Panel | Contents |
|---|---|
| Object | The selected object's parameters |
| View | **Field** (FOV and z<sub>s</sub> ref), Hide all overlays, **Display** toggles (legend, scale bar, object **Shapes**, colour bar, stretch whiskers, rulers, time delays), **Critical curves** options, and settings of the current view |
| Colors | **Color map**, **Field** colour, **Annotations** colour, and **Line art** |
| Background | A decorative picture behind the image (<a href="/caustica-documentation/background-image/#background">§7</a>) |
| Observation (eye) | An observed image on the sky, its masks, and the Delensed view (<a href="/caustica-documentation/background-image/#observation">§7</a>) |
| Instrument | Detector pixels and blur (<a href="/caustica-documentation/instrument/">§8</a>) |
| Export | Pictures, videos, animations and data (<a href="/caustica-documentation/recording/">§10</a>) |
| Settings (gear) | Cosmology (<a href="/caustica-documentation/cosmology/">§2</a>) and quality: critical-curve and point-source grids, FOV buffer, render scale |

On phones the tabs are **Object**, **Scene**, **View**, **Export** and Settings, and the View tab lists the View, Colors, Background, Observation and Instrument sections in turn. Where these docs say "the View tab", they mean that list on a phone.
