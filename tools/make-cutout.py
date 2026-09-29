#!/usr/bin/env python3
"""Turn a background-removed photo into an Aurette magazine cutout.

    python3 tools/make-cutout.py in.png images/cutout/photo/ing-strawberry.webp

The photo set follows the same three-layer grammar as images/cutout/_spec.md,
baked into the pixels rather than applied with CSS filters (cheaper to paint
while it moves, and it survives the no-filter rule):

  1. print shadow  - the rim's silhouette, flat #d9cbb6, offset down-right
  2. sticker rim   - #fffdf8 paper around the subject, cut in short straight
                     scissor strokes with a little jitter, never machine-round
  3. the subject   - the photograph itself

The rim is cut around the OUTSIDE of the subject only (RETR_EXTERNAL), so the
gaps between a whisk's wires are paper, the way scissors would leave them.

Needs: pip install pillow numpy opencv-python-headless
"""
import argparse
import math

import cv2
import numpy as np
from PIL import Image

RIM = (0xFF, 0xFD, 0xF8)
SHADOW = (0xD9, 0xCB, 0xB6)


def scissor_polygon(contour, step, jitter, rng):
    """Re-cut a smooth contour as short straight strokes with a hand wobble."""
    pts = contour.reshape(-1, 2).astype(np.float64)
    seg = np.sqrt(((np.roll(pts, -1, 0) - pts) ** 2).sum(1))
    total = seg.sum()
    n = max(12, int(total / step))
    cum = np.concatenate([[0], np.cumsum(seg)])
    out = []
    for i in range(n):
        d = (i + rng.uniform(-0.3, 0.3)) * total / n % total
        k = np.searchsorted(cum, d, side="right") - 1
        k = min(k, len(pts) - 1)
        t = (d - cum[k]) / max(seg[k], 1e-6)
        p = pts[k] + (pts[(k + 1) % len(pts)] - pts[k]) * t
        out.append(p)
    out = np.array(out)
    # push each vertex outward along the local normal by 0..jitter, so a
    # wobble can never bite into the subject
    centre = out.mean(0)
    for i, p in enumerate(out):
        v = p - centre
        norm = math.hypot(*v) or 1.0
        out[i] = p + v / norm * rng.uniform(0, jitter)
    return out.round().astype(np.int32)


def make(src, dst, size, rim, seed):
    rng = np.random.default_rng(seed)
    im = Image.open(src).convert("RGBA")
    alpha = np.array(im)[..., 3]
    ys, xs = np.where(alpha > 24)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    S = size * 2  # work at 2x; the final downsample anti-aliases the cut
    pad = int(S * 0.075)
    scale = (S - 2 * pad) / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    subject = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    subject.paste(im, ((S - im.width) // 2, (S - im.height) // 2), im)

    mask = (np.array(subject)[..., 3] > 110).astype(np.uint8) * 255
    r = max(2, int(S * rim))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    grown = cv2.dilate(mask, k)
    contours, _ = cv2.findContours(grown, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    rim_mask = np.zeros_like(mask)
    for c in contours:
        if cv2.contourArea(c) < (S * 0.01) ** 2:
            continue
        poly = scissor_polygon(c, step=S * 0.028, jitter=S * 0.004, rng=rng)
        cv2.fillPoly(rim_mask, [poly], 255)
    rim_mask = np.maximum(rim_mask, grown)  # the cut never undercuts the dilation

    dx, dy = round(S * 0.0125), round(S * 0.0175)  # ~5px right, 7px down at 400
    shadow_mask = np.zeros_like(rim_mask)
    shadow_mask[dy:, dx:] = rim_mask[: S - dy, : S - dx]

    out = np.zeros((S, S, 4), np.uint8)
    out[shadow_mask > 0] = (*SHADOW, 255)
    out[rim_mask > 0] = (*RIM, 255)
    base = Image.fromarray(out, "RGBA")
    base.alpha_composite(subject)
    base = base.resize((size, size), Image.LANCZOS)
    base.save(dst, "WEBP", quality=84, alpha_quality=92, method=6)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--size", type=int, default=480)
    ap.add_argument("--rim", type=float, default=0.02, help="rim width as a fraction of the working canvas")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    make(a.src, a.dst, a.size, a.rim, a.seed)
