# Aurette flat illustration spec (Swiss / editorial)

Every product and ingredient is a flat 2D vector illustration. One shared
language so the set reads as a system:

- viewBox `0 0 400 400`, no width/height attrs on the `<svg>` root.
- **Flat fills only.** No gradients, no strokes/outlines, no filters, no
  drop shadows, no 3D shading. Depth is allowed ONLY as a single flat
  offset shape in `--paper-shadow` (see palette) behind the subject,
  offset 10–14px down-right, like cut paper.
- Geometry: simple shapes — rects (rx for soft corners), circles,
  ellipses, and short paths. Compositions sit on an invisible grid;
  center the subject with ~8% margin.
- Background: transparent. The page supplies the ground.

Palette (hex only, nothing else):

| role            | hex      |
|-----------------|----------|
| ink             | #241a14  |
| raspberry       | #b03052  |
| raspberry-deep  | #8e2440  |
| blush           | #f3d7de  |
| cream           | #f6ecdc  |
| gold            | #d9a94e  |
| chocolate       | #4a2f1c  |
| chocolate-deep  | #2e1a0c  |
| leaf            | #356b44  |
| paper-shadow    | #e9ddcc  |

Style anchors: mid-century fruit-crate labels flattened to Swiss poster
geometry. Bold silhouettes readable at 48px. A cake is stacked rounded
rects + a scalloped drip path; berries are circles with a leaf wedge;
no faces, no texture, no text inside the SVG.
