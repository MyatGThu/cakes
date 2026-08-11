# tools/ — render studio & test suites

Nothing here ships to visitors (see `.assetsignore` / deploy notes) — these are the
scripts that generate the site's 3D imagery and drive its browser tests.

## Setup

```bash
cd tools && npm install
# If Playwright's Chromium is already installed elsewhere:
#   export CHROMIUM_PATH=/path/to/chromium  (otherwise `npx playwright install chromium`)
```

## The render studio (`studio/`)

`studio/scene.html` is a self-contained Three.js scene: procedural canvas textures
(buttercream, crumb, wood, cookie, lemon, strawberry), physical materials, and
image-based lighting. Builders exist for every product, the 24-frame hero
turntable, and 11 transparent ingredient sprites. The drivers screenshot it
headlessly (SwiftShader — no GPU needed) straight into `../images/`:

- `npm run render:products` — 7 product stills + 24 hero turntable frames
- `npm run render:anim` — 32-frame 360° animated-WebP loops for the tiered cakes
- `npm run render:ingredients` — the transparent ingredient sprites
- `npm run og` — rebuilds `images/og.png` around `images/brand/logo.png`

Tweak a cake (colours, tiers, toppings) by editing its builder in `scene.html`,
then re-run the driver — same filenames, so no markup changes.

## Tests

- `npm test` — `smoke3.js` (3 pages: motion, turntable, cart, fallbacks, mobile,
  no-CDN, reduced-motion) + `wipetest.js` (page wipe, magnetic buttons) +
  `animtest.js` (turntable loops on cards)
- `npm run test:video` — hover/in-view video behaviour. Generates VP9 twins of
  the product clips first (`gen-testmedia.js`) because Playwright's Chromium has
  no H.264 decoder; production browsers play the real H.264 files.

Each suite serves the repo root on its own port, routes the GSAP CDN to the
local npm copy, and asserts zero page errors. Screenshots land in `out/`.
