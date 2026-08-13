# Aurette cutout spec (magazine collage)

Every asset is a **paper cutout**: a flat illustration that looks scissored out
of a printed magazine and glued onto the page. Same 400×400 canvas language as
the flat set, plus the collage grammar below.

## The three layers, in order

1. **Sticker rim** — an offset silhouette in `#fffdf8` sitting *behind* the
   subject, 6–9px larger on every side, with a slightly ragged (hand-cut) edge.
   This is what makes a cutout read as cut, not drawn. Draw it as one path.
2. **Print shadow** — a single flat `#d9cbb6` shape offset ~7px down / 5px
   right behind the rim. No blur, no gradient: printed paper on paper.
3. **The subject** — flat fills only, on top.

## Rules

- viewBox `0 0 400 400`, transparent background, no `width`/`height` on root.
- Flat fills only. No gradients, no `stroke=`, no `filter=`, no `opacity=`.
- **Halftone is the one texture allowed**: dot clusters (small circles, 2–4px,
  in the subject's darker palette hex) to suggest magazine printing. Use on at
  most one or two areas per asset — a shadow side, a crust, a shadow under a
  rim. Never over the whole shape.
- Ragged edges: build the sticker rim from short straight segments (12–24 of
  them) with 1–3px jitter, so the cut looks hand-made rather than machine-round.
- Subject silhouettes stay **bold and simple** — readable at 56px.
- No text, no faces.

## Palette (hex only)

| role            | hex      |
|-----------------|----------|
| ink             | #241a14  |
| raspberry       | #b03052  |
| raspberry-deep  | #8e2440  |
| blush           | #f3d7de  |
| cream           | #f6ecdc  |
| paper-white     | #fffdf8  |
| gold            | #d9a94e  |
| gold-deep       | #a87d2e  |
| chocolate       | #4a2f1c  |
| chocolate-deep  | #2e1a0c  |
| leaf            | #356b44  |
| steel           | #b9bcc0  |
| steel-deep      | #7f8489  |
| print-shadow    | #d9cbb6  |

Steel/steel-deep exist for kitchenware only (whisks, tins, scales, piping
nozzles) — food never uses them.

Style anchors: 1960s bakery advertisements and recipe-card clippings, cut out
with scissors and re-glued. Bold, printed, slightly imperfect.
