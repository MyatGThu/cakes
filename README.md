# 🎂 Aurette by Mia — a cinematic, $0/month cake shop

The website for a Melbourne home bakery: a three-page experience with real
craft — and still **no build step, no server, no monthly bill, zero coding**
for the owner to maintain day-to-day.

- **The landing** (`index.html`) — a Swiss-grid, editorial layout: flat 2D
  ingredient illustrations fly in beside the headline and converge into a
  scroll-driven cake that assembles layer by layer; a scroll-speed-reactive
  marquee ribbon runs between acts. Navigation sweeps a curved ink "page
  wipe" carrying the monogram; primary buttons are magnetic with a rising
  hover-fill.
- **The menu** (`shop.html`) — the ordering flow. The tiered cakes play real
  footage on hover (desktop) or while in view (mobile), chromeless and muted;
  other products show flat 2D illustrations. Checkout computes the **earliest honest
  pickup date** from each product's lead time, closed days and the daily
  cutoff (in the shop's own timezone), then hands the order to **WhatsApp or
  email** as a tidy message — no payment backend to run; Mia confirms each
  order personally.
- **The story** (`about.html`) — parchment, torn paper, stamps, and the
  polaroid that straightens as you read.
- **Admin** (`admin.html`) — Mia edits products, prices, photos, lead times,
  closed days and slots in a form and presses **Publish**; it commits straight
  to this repo and the host redeploys in about a minute. The whole "database"
  is two JSON files in [`data/`](data/).
- **Everything degrades gracefully** — reduced motion, JS disabled, or a
  blocked CDN all get a complete, calm, static site.
- **Themes** (`themes.html`) — a picker that previews alternate palettes via
  `?theme=` (persisted per device) for choosing Aurette's look.

## How it fits together

```
index.html + js/landing.js   ← cinematic landing (flying ingredients, scroll cake)
shop.html + js/store.js      ← the menu, cart and ordering flow
about.html                   ← Mia's story (parchment / torn-paper treatment)
js/motion.js                 ← the whole GSAP layer: reveals, parallax, turntable,
                               ingredient choreography, page wipe, magnetic buttons,
                               marquee — pure progressive enhancement behind
                               html.motion-on (IntersectionObserver fallback: io-anim)
admin.html + js/admin.js     ← the owner's editor (commits via GitHub API)
data/settings.json           ← shop name, WhatsApp number, closed days, cutoff, slots
data/products.json           ← the menu: names, prices/sizes, media, lead times
images/flat/                 ← the flat 2D illustration set (products, ingredients,
                               hero cake) — hand-authored SVG per _spec.md
images/video/                ← real clips the cake cards hover-play + poster frames
images/brand/                ← the monogram in every size, resampled from
                               logo-original-150.png (the untouched original);
                               images/og.png is the share card built around it
tools/                       ← Playwright test suites + og-card generator (see
                               tools/README.md — not served in production)
src/worker.js + wrangler.jsonc ← Cloudflare Worker: serves the site, /api/instagram
                               feed cache + token refresh, /api/checkout Stripe stub
```

## Deploying on Cloudflare (recommended)

Cloudflare's free tier permits commercial sites (Vercel's doesn't) and includes everything
the live Instagram feed needs. One-time setup:

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com), then either:
   - **Push-to-deploy (recommended):** Workers & Pages → Create → *Import a repository* →
     pick this repo, build command *(none)*, deploy command `npx wrangler deploy`. Every push
     to `main` deploys; PRs get preview URLs.
   - **Or from a terminal:** `npm i -g wrangler && wrangler login && wrangler deploy`.
2. Create the KV namespace for the Instagram cache:
   `npx wrangler kv namespace create IG` → paste the printed `id` into `wrangler.jsonc`.
3. (When ready) add the Instagram token: `npx wrangler secret put IG_TOKEN` — see the
   Instagram section below. Until then the Fresh Bakes section shows the menu gallery.
4. Custom domain: buy it in Cloudflare (Registrar sells at cost, ~US$10–11/yr for .com)
   and attach it under the Worker's **Settings → Domains & Routes**. Then update the
   `og:image` URL in `index.html` to the new domain.

> GitHub Pages also still works as a free fallback host (steps below) — the site detects
> that `/api/instagram` doesn't exist there and quietly shows its built-in gallery instead.

## The live Instagram feed (one-time, ~15 minutes)

1. Mia converts her Instagram to a **Professional account** (free, reversible):
   Instagram app → Settings → Account type → *Switch to professional* → Creator or Business.
2. At [developers.facebook.com](https://developers.facebook.com): **My Apps → Create App**,
   any name (e.g. "Aurette Website").
3. In the app dashboard: add the **Instagram** product → choose **API setup with Instagram
   business login** (not the Facebook-login variant).
4. Under *Generate access tokens*: **Add an Instagram Account** → log in as the shop account
   (accept the tester invite inside the Instagram app if prompted).
5. Click **Generate Token** next to the connected account, authorise, and copy the token —
   it's shown once. The app never needs review or to go "Live" for showing your own feed.
6. Store it: `npx wrangler secret put IG_TOKEN` (paste the token).

The Worker's daily cron then keeps everything alive automatically: it refetches the feed
(Instagram's image URLs expire, so this matters) and renews the 60-day token weekly.
**If the Worker is ever paused for 60+ days the token dies permanently** — just repeat
steps 4–6 to mint a new one.

## Online payments (Stripe, when she's ready)

Mia is Melbourne-based, and Stripe fully supports Australia (AUD):

- **Phase 1 — no code:** create a [Stripe](https://stripe.com/au) account, and send
  customers **Payment Links** in WhatsApp when confirming orders (e.g. a 50% deposit for
  custom cakes). Nothing to deploy.
- **Phase 2 — built-in checkout:** `npx wrangler secret put STRIPE_SECRET_KEY`. The
  Worker's `/api/checkout` endpoint already creates AUD Checkout Sessions with
  **server-side prices** (it re-reads `data/products.json`, never trusting the browser),
  which unlocks Apple Pay / Google Pay. The storefront button for it can be added when
  this phase begins.

## GitHub Pages fallback (original setup)

### 1. Put the site live on GitHub Pages

1. Merge this branch into `main` (or make `main` from it).
2. In the repo: **Settings → Pages → Build and deployment** → Source: **Deploy from a branch** →
   Branch: **main**, folder **/(root)** → Save.
3. After a minute the site is live at `https://<your-username>.github.io/cakes/`.

> Optional: buy a custom domain (~$10–15/year, the only possible cost) and add it under
> **Settings → Pages → Custom domain**.

### 2. Set the real shop details

Open `data/settings.json` (on GitHub: press `.` or use the pencil icon) and set:

| Key | What it is |
| --- | --- |
| `shopName`, `tagline`, `announcement` | Text at the top of the shop |
| `currencySymbol` | e.g. `"$"`, `"€"`, `"K"` |
| `whatsappNumber` | Digits only, international format, e.g. `15551234567` for +1 555 123 4567. Empty `""` hides the WhatsApp button |
| `orderEmail` | Backup order channel. Empty `""` hides the email button |
| `pickupAddress` | Shown in the footer — keep it vague if she prefers to share the exact address per order |
| `deliveryAvailable` | `true` shows a Pickup / Delivery choice at checkout (delivery asks for an address); `false` = pickup only |
| `deliveryNote` | Small print under the delivery address field, e.g. how the delivery fee works |
| `orderCutoffHour` | 0–23. Orders placed after this hour count from tomorrow (e.g. `16` = 4 pm) |
| `timezone` | Optional IANA zone (e.g. `"Australia/Melbourne"`) so the cutoff follows the *shop's* clock even for visitors in other time zones. Empty = each visitor's device clock |
| `instagramHandle` | Shown as the "Follow @…" button in the Fresh Bakes section (no `@`). The live feed itself comes from the Worker — see the Instagram section |
| `closedWeekdays` | Days with no pickups: `0`=Sunday … `6`=Saturday, e.g. `[0, 1]` |
| `pickupSlots` | Time windows customers choose from, e.g. `["10:00 – 12:00", "14:00 – 17:00"]` |

(All of this is also editable later in the admin page — this is just the head start.)

### 3. Create the baker's "access key" (a GitHub token)

The admin page needs permission to save changes to this repository. Create a
**fine-grained personal access token** that can touch *only this repo*:

1. GitHub → your avatar → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Name: `cake-shop-admin`. Expiration: pick e.g. 1 year (put a reminder in your calendar —
   she'll need a fresh key after it expires).
3. **Repository access**: *Only select repositories* → this repo.
4. **Permissions → Repository permissions → Contents: Read and write.** Nothing else.
5. Generate, copy the `github_pat_…` string, and send it to the baker privately
   (not in a public place — treat it like a password to the website, nothing more:
   it cannot touch your account or other repos).

### 4. Hand it over

Send her two things:

- The admin link: `https://<your-username>.github.io/cakes/admin.html`
- The access key from step 3

She opens the link, pastes the key once (it's remembered on her device), and from then on
it's: *edit → Publish → live in a minute*. Her cheat-sheet is in [`GUIDE.md`](GUIDE.md).

## How the pickup-date estimate works

Each product has `leadTimeDays` ("days of notice needed"). At checkout:

1. Take the **largest** lead time among the items in the order.
2. If it's already past the daily cutoff hour, start counting from tomorrow.
3. Skip over any closed weekdays.

That date is shown as the earliest pickup, the date picker won't allow anything earlier,
and picking a closed day politely bumps to the next open one. Each product card also shows
its own earliest-pickup date up front, so there are no surprises at checkout.

## Product videos (hover to play)

A product whose JSON entry has a `video` (and ideally `videoPoster`) shows that clip on
its menu card instead of a photo: still until the cursor hovers it on desktop, playing
quietly while on screen on phones, never any player controls. To add one from a phone
video (any orientation):

```bash
ffmpeg -i clip.mp4 -vf "crop=in_w:in_w*3/4,scale=720:540,fps=24" \
  -c:v libx264 -crf 25 -an -movflags +faststart images/video/<product-id>.mp4
ffmpeg -i images/video/<product-id>.mp4 -frames:v 1 images/video/<product-id>-poster.webp
```

Then in `data/products.json` add to the product:
`"video": "images/video/<product-id>.mp4", "videoPoster": "images/video/<product-id>-poster.webp"`.
Keep clips to ~4–8 seconds and roughly 0.3–1 MB. The admin page preserves these fields
when Mia edits and publishes, and if a video file is missing the card quietly shows its
photo instead.

## Local preview

Static files fetched with `fetch()` need a local server (opening `index.html` directly
won't load the menu):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Browser tests and the 3D render studio live in [`tools/`](tools/) —
`cd tools && npm install && npm test` (details in `tools/README.md`).

## Costs, limits & when to outgrow this

- **Hosting: free** (GitHub Pages, public repo). Bandwidth limits are far beyond what a
  home bakery will see.
- **Orders: free** — they're just WhatsApp/email messages; there's no order backend.
  If she ever wants online payments, inventory counts, or automated order management,
  that's the point to move to a paid platform (Shopify Starter, Square Online, Ecwid —
  roughly $5–30/month). This site's data is two JSON files, so migrating the menu is trivial.
- **The token expires** (whatever expiry you chose) — recreate it and send her a new one.

## Security notes

- The access key lives only in the baker's browser (`localStorage`) and travels only to
  `api.github.com`. Anyone can *view* `admin.html`, but without a key it can't change anything.
- The token is scoped to this single repository's contents — worst case if leaked, someone
  could edit this website (fixable via git history) but nothing else on the account.
- Customer details (name, phone) never touch the site or the repo — they only travel
  inside the WhatsApp/email message the customer themselves sends.
