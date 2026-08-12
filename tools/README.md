# tools/ — test suites & og-card generator

Nothing here ships to visitors (see `.assetsignore` / deploy notes) — these are
the browser test suites and the social-share-card generator.

## Setup

```bash
cd tools && npm install
# If Playwright's Chromium is already installed elsewhere:
#   export CHROMIUM_PATH=/path/to/chromium  (otherwise `npx playwright install chromium`)
```

## Tests

- `npm test` — `smoke3.js` (3 pages: motion, stage build, cart, fallbacks,
  mobile, no-CDN, reduced-motion) + `wipetest.js` (page wipe, magnetic buttons)
- `npm run test:video` — hover/in-view video behaviour. Generates VP9 twins of
  the product clips first (`gen-testmedia.js`) because Playwright's Chromium has
  no H.264 decoder; production browsers play the real H.264 files.

Each suite serves the repo root on its own port, routes the GSAP CDN to the
local npm copy, and asserts zero page errors. Screenshots land in `out/`.
