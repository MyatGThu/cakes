/* Aurette by Mia — Cloudflare Worker.
   Serves the static site, plus:
     GET  /api/instagram  → the shop's latest Instagram posts, cached in KV.
                            Never fails loudly: with no token/KV it returns
                            {posts: []} and the front end shows its own gallery.
     POST /api/checkout   → creates a Stripe Checkout session (AUD). Returns
                            501 until STRIPE_SECRET_KEY is configured, so the
                            site works fine before payments are switched on.
   scheduled(): daily cron — refetches the feed and renews the 60-day
   Instagram token (refresh only works while the token is still alive, so the
   cron is what keeps the integration maintenance-free). */

var FEED_STALE_MS = 6 * 60 * 60 * 1000;        // refetch feed if older than 6h
var TOKEN_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // renew token weekly
var IG_API = "https://graph.instagram.com";
var IG_VERSION = "v26.0";

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === "/api/instagram") return instagramFeed(env, ctx);
    if (url.pathname === "/api/checkout") {
      if (request.method !== "POST") return json({ error: "POST only" }, 405);
      return checkout(request, env);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshInstagram(env, { renewToken: true }));
  },
};

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, extraHeaders || {}),
  });
}

/* ---------- Instagram ---------- */

async function getToken(env) {
  if (!env.IG) return null;
  var stored = await env.IG.get("token", "json");
  if (stored && stored.value) return stored;
  // First run: fall back to the wrangler secret; the cron migrates it into KV
  // on the first successful refresh so rotation can be persisted.
  if (env.IG_TOKEN) return { value: env.IG_TOKEN, refreshedAt: 0 };
  return null;
}

async function instagramFeed(env, ctx) {
  var headers = { "cache-control": "public, max-age=300" };
  if (!env.IG) return json({ posts: [], source: "unconfigured" }, 200, headers);

  var feed = await env.IG.get("feed", "json");
  var stale = !feed || Date.now() - feed.fetchedAt > FEED_STALE_MS;
  if (stale) ctx.waitUntil(refreshInstagram(env, { renewToken: false }).catch(function () {}));

  // Always serve last-known-good immediately (stale-while-revalidate).
  return json({ posts: feed ? feed.posts : [], fetchedAt: feed ? feed.fetchedAt : null }, 200, headers);
}

async function refreshInstagram(env, opts) {
  if (!env.IG) return;
  var token = await getToken(env);
  if (!token) return;

  if (opts.renewToken && Date.now() - (token.refreshedAt || 0) > TOKEN_REFRESH_MS) {
    var r = await fetch(
      IG_API + "/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(token.value)
    );
    if (r.ok) {
      var d = await r.json();
      if (d.access_token) {
        token = { value: d.access_token, refreshedAt: Date.now() };
        await env.IG.put("token", JSON.stringify(token));
      }
    }
    // On failure we keep the old token — it may still be inside its 60 days.
  }

  var fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
  var resp = await fetch(
    IG_API + "/" + IG_VERSION + "/me/media?fields=" + fields + "&limit=12&access_token=" + encodeURIComponent(token.value)
  );
  if (!resp.ok) return; // keep last-known-good feed in KV
  var data = await resp.json();
  if (!Array.isArray(data.data)) return;

  var posts = data.data
    .map(function (p) {
      return {
        id: p.id,
        caption: (p.caption || "").slice(0, 140),
        permalink: p.permalink,
        // Reels/videos expose a poster frame via thumbnail_url.
        image: p.media_type === "VIDEO" ? p.thumbnail_url : p.media_url,
        timestamp: p.timestamp,
      };
    })
    .filter(function (p) { return !!p.image; })
    .slice(0, 8);

  await env.IG.put("feed", JSON.stringify({ fetchedAt: Date.now(), posts }));
}

/* ---------- Stripe Checkout (Phase 2 — dormant until the key exists) ---------- */

async function checkout(request, env) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Online payment isn't set up yet — order via WhatsApp and we'll sort payment together." }, 501);
  }

  var body;
  try { body = await request.json(); } catch (e) { return json({ error: "Bad request" }, 400); }
  var items = Array.isArray(body && body.items) ? body.items.slice(0, 20) : [];
  if (!items.length) return json({ error: "Your order is empty." }, 400);

  // Prices always come from the server's own menu — never from the client.
  var origin = new URL(request.url).origin;
  var products = await env.ASSETS.fetch(origin + "/data/products.json").then(function (r) { return r.json(); });

  var params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("currency", "aud");
  params.set("success_url", origin + "/?paid=1");
  params.set("cancel_url", origin + "/?paid=0");

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var p = products.find(function (x) { return x.id === it.productId && x.available !== false; });
    if (!p) return json({ error: "An item in your order is no longer on the menu." }, 400);
    var hasVariants = Array.isArray(p.variants) && p.variants.length;
    var variant = hasVariants ? p.variants[it.variantIndex] : null;
    if (hasVariants && !variant) return json({ error: "An item in your order changed — please re-add it." }, 400);
    var unit = Number(hasVariants ? variant.price : p.price);
    var qty = Math.min(50, Math.max(1, parseInt(it.qty, 10) || 1));
    params.set("line_items[" + i + "][quantity]", String(qty));
    params.set("line_items[" + i + "][price_data][currency]", "aud");
    params.set("line_items[" + i + "][price_data][unit_amount]", String(Math.round(unit * 100)));
    params.set("line_items[" + i + "][price_data][product_data][name]", p.name + (variant ? " — " + variant.name : ""));
  }

  var resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.STRIPE_SECRET_KEY,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  var session = await resp.json();
  if (!resp.ok || !session.url) return json({ error: "Payment could not be started — please order via WhatsApp instead." }, 502);
  return json({ url: session.url });
}
