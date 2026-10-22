---
title: "1. Coordinate system"
nav_title: "1. Coordinate system"
order: 2
---

All angular positions are measured in **arcseconds** (″): object coordinates $(c_x, c_y)$, deflection angles, and size parameters all use this unit.
The image panel shows a square patch of sky of side *field of view* `fov` (default 4″), centred on the optical axis. A **scale bar** at the bottom right of the image shows a round angular length (1″ for fov ≤ 6″, 2″ up to 10″, 5″ up to 30″, 10″ beyond), togglable in the View tab and included in captures.
Radians appear only in intermediate formulae and are converted back to arcseconds throughout.

## Measuring with the ruler

To read an angular separation directly off the image, arm the ruler with its button in the tool column at the left of the window, below the object tools (always there), or press **L**; the same button or key disarms it. *On phones* its button sits at the bottom-left of the image panel instead. The **Rulers** toggle in the View tab's Display section only shows or hides the measurements: arming the ruler turns it on, and turning it off also disarms the ruler, which would otherwise draw lines that cannot be seen. With the tool armed, click and drag between any two points: the line's length is reported in arcseconds and its **position angle**, measured counter-clockwise from the positive $x$-axis (rightward) with $y$ increasing upward, as `distance″ · angle°`.

Endpoints are stored in sky coordinates, so a measurement stays anchored to the same points (and its readout stays constant) as you change the field of view. Measurements are additive: each drag adds another line, and the newest one becomes selected. A committed measurement is a first-class object: click it to select it, drag its line to move it, or drag either endpoint to reshape it. Only one thing (a measurement or an object) is selected at a time. Delete the selected measurement with the **trash** button (the tool column's, or the one on the image) or with **Backspace**; the **×** button on the image clears all of them. Measurements persist when you disarm the ruler or hide them (**Esc** first deselects the current measurement, then disarms the tool). The ruler lines are drawn on the same overlay as the markers and critical curves, so they appear in saved PNGs and recordings; the ruler buttons, being ordinary UI chrome, are excluded from both.
