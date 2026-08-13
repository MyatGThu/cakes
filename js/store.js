/* Storefront logic — no build step, no dependencies.
   Menu and shop details come from data/products.json and data/settings.json. */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var SETTINGS = null;
  var PRODUCTS = [];
  var cart = loadCart();
  var activeCategory = "All";
  var modalState = null; // { product, qty }

  /* ---------- Utilities ---------- */

  function money(n) {
    var sym = (SETTINGS && SETTINGS.currencySymbol) || "$";
    var num = Number(n) || 0;
    var formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
    return sym + formatted;
  }

  /* Repair whatever is in localStorage rather than trusting it — a single
     malformed entry must never take the whole storefront down. */
  function sanitizeCart(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (it) {
        return it && typeof it === "object" &&
          typeof it.productId === "string" &&
          typeof it.qty === "number" && isFinite(it.qty) && it.qty >= 1 &&
          (it.variantIndex == null ||
            (typeof it.variantIndex === "number" && isFinite(it.variantIndex) && it.variantIndex >= 0));
      })
      .map(function (it) {
        return {
          productId: it.productId,
          variantIndex: it.variantIndex == null ? null : Math.floor(it.variantIndex),
          variantName: typeof it.variantName === "string" ? it.variantName : null,
          qty: Math.min(50, Math.floor(it.qty)),
          note: typeof it.note === "string" ? it.note : ""
        };
      });
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem("cakeCart");
      return sanitizeCart(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    try { localStorage.setItem("cakeCart", JSON.stringify(cart)); } catch (e) { /* private mode */ }
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  }

  function productHasVariants(p) {
    return Array.isArray(p.variants) && p.variants.length > 0;
  }

  function unitPrice(product, variantIndex) {
    if (productHasVariants(product)) {
      var v = product.variants[variantIndex] || product.variants[0];
      return Number(v.price) || 0;
    }
    return Number(product.price) || 0;
  }

  function variantName(product, variantIndex) {
    if (!productHasVariants(product)) return "";
    var v = product.variants[variantIndex];
    return v ? v.name : "";
  }

  /* ---------- Dates ---------- */

  function leadDays(p) {
    var n = parseInt(p.leadTimeDays, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function closedWeekdays() {
    return Array.isArray(SETTINGS.closedWeekdays) ? SETTINGS.closedWeekdays : [];
  }

  function isClosedDay(date) {
    return closedWeekdays().indexOf(date.getDay()) !== -1;
  }

  /* "Now" on the shop's clock. If settings.timezone (IANA name) is set, the
     cutoff and lead-day counting follow the bakery's time zone even for
     visitors whose device clock is elsewhere; otherwise the device clock. */
  function shopNow() {
    var tz = SETTINGS.timezone;
    if (tz) {
      try {
        var parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23"
        }).formatToParts(new Date());
        var map = {};
        parts.forEach(function (p) { map[p.type] = p.value; });
        var hour = Number(map.hour);
        return new Date(Number(map.year), Number(map.month) - 1, Number(map.day), hour === 24 ? 0 : hour);
      } catch (e) { /* unknown zone string — fall back to the device clock */ }
    }
    return new Date();
  }

  /* Earliest pickup for a given lead time. Orders after the cutoff hour start
     counting from tomorrow, and pickups skip past the shop's closed weekdays.
     Returns null when no pickup day exists (e.g. every weekday marked closed) —
     callers must treat that as "ordering is paused". */
  function earliestPickup(days, now) {
    now = now || shopNow();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var cutoff = parseInt(SETTINGS.orderCutoffHour, 10);
    if (!isNaN(cutoff) && now.getHours() >= cutoff) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + days);
    var guard = 0;
    while (isClosedDay(d) && guard++ < 14) d.setDate(d.getDate() + 1);
    return isClosedDay(d) ? null : d;
  }

  function cartEarliestPickup() {
    var maxLead = 0;
    for (var i = 0; i < cart.length; i++) {
      var p = findProduct(cart[i].productId);
      if (p) maxLead = Math.max(maxLead, leadDays(p));
    }
    return earliestPickup(maxLead);
  }

  var PAUSED_MSG = "We're not taking new orders right now — check back soon!";

  /* Local YYYY-MM-DD (never toISOString — that shifts across timezones). */
  function toInputValue(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function fromInputValue(s) {
    var parts = String(s || "").split("-");
    if (parts.length !== 3) return null;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function humanDate(d) {
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  }

  function shortDate(d) {
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }

  function weekdayName(idx) {
    // 2026-02-01 is a Sunday, so idx maps directly onto getDay() numbering.
    return new Date(2026, 1, 1 + idx).toLocaleDateString(undefined, { weekday: "long" });
  }

  function leadBadge(p) {
    var days = leadDays(p);
    if (days === 0) return { cls: "badge-ready", text: "Ready to go" };
    if (days === 1) return { cls: "badge-lead", text: "Made to order · 1 day ahead" };
    return { cls: "badge-lead", text: "Made to order · " + days + " days ahead" };
  }

  /* ---------- Rendering ---------- */

  function deliveryOn() {
    return SETTINGS.deliveryAvailable === true;
  }

  function fulfillmentMethod() {
    if (!deliveryOn()) return "pickup";
    var checked = document.querySelector('input[name="fulfillment"]:checked');
    return checked && checked.value === "delivery" ? "delivery" : "pickup";
  }

  function renderShopInfo() {
    /* The nav calls this page "Menu", so the tab has to say Menu too. */
    document.title = "The Menu — " + SETTINGS.shopName;
    $("shopName").textContent = SETTINGS.shopName;
    $("shopTagline").textContent = SETTINGS.tagline || "";
    $("footerShopName").textContent = SETTINGS.shopName;
    $("footerPickup").textContent = SETTINGS.pickupAddress ? "Pickup: " + SETTINGS.pickupAddress : "";

    window.Aurette.renderFooterContact($("footerContact"), SETTINGS);

    var ann = $("announcement");
    if (SETTINGS.announcement) {
      ann.textContent = SETTINGS.announcement;
      ann.hidden = false;
    } else {
      ann.hidden = true;
    }

    var getIt = deliveryOn() ? "choose pickup or delivery" : "choose a pickup day";
    var closed = closedWeekdays().map(weekdayName);
    $("heroText").textContent =
      "Everything is baked to order — pick what you'd like, " + getIt + ", and send us your order. " +
      "We'll confirm it personally." +
      (closed.length ? " (Closed on " + closed.join(" and ") + "s.)" : "");
  }

  function visibleProducts() {
    return PRODUCTS.filter(function (p) {
      if (p.available === false) return false;
      return activeCategory === "All" || p.category === activeCategory;
    });
  }

  /* The filter lives in the URL so "here are the cupcakes" is a link Mia can
     put in a story, and so it survives a refresh. replaceState, not pushState:
     a filter should not cost a Back press to escape the site. ?theme= has to
     survive alongside it. */
  function readCategoryFromUrl() {
    try {
      return new URLSearchParams(location.search).get("category") || "All";
    } catch (e) { return "All"; }
  }
  function writeCategoryToUrl() {
    if (!history.replaceState) return;
    try {
      var params = new URLSearchParams(location.search);
      if (activeCategory === "All") params.delete("category");
      else params.set("category", activeCategory);
      var q = params.toString();
      /* history.state carries the open-overlay marker. Passing null here would
         wipe it off a reloaded #cake-… entry before openFromHash() reads it. */
      history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
    } catch (e) { /* older browser — the filter simply stays off the URL */ }
  }

  /* The row is built once and afterwards only re-labelled. Rebuilding it with
     innerHTML on every change destroyed the very button the visitor had just
     pressed, throwing keyboard focus back to <body> — so a keyboard or screen
     reader user had to tab in from the top of the page after each filter. */
  function renderChips() {
    var cats = ["All"];
    PRODUCTS.forEach(function (p) {
      if (p.available === false) return;
      if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
    });
    if (cats.indexOf(activeCategory) === -1) activeCategory = "All";
    var host = $("categoryChips");
    host.innerHTML = "";
    /* Hide the container, not just its children: emptied, it still painted a
       dashed rule and 30px of margin above the grid. */
    host.hidden = cats.length <= 2; // only "All" plus one — no point filtering
    if (host.hidden) return;
    cats.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = c;
      b.setAttribute("data-cat", c);
      b.setAttribute("aria-pressed", String(c === activeCategory));
      b.addEventListener("click", function () {
        if (activeCategory === c) return;
        activeCategory = c;
        syncChips();
        renderGrid();
        writeCategoryToUrl();
        keepResultsInView();
      });
      host.appendChild(b);
    });
  }

  function syncChips() {
    var chips = $("categoryChips").querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", String(chips[i].getAttribute("data-cat") === activeCategory));
    }
  }

  /* Filtering from deep in the grid strands you: the shorter grid ends above
     where you were standing, the browser clamps the scroll, and you are left
     in the next section with nothing to look at. Measured at 375x667 with the
     strip sticky, filtering to a one-item category from the bottom of the menu
     left ZERO tabs and ZERO cards on screen while the live region cheerfully
     announced "1 item in Cupcakes". Making the row sticky does not fix this on
     its own — it makes it worse, because a shrinking containing block drags
     the stuck row up out of view with it.

     The rAF is load-bearing, not tidiness: called straight after renderGrid()
     this measures the old layout. And a stuck row reports its STUCK top from
     getBoundingClientRect, so the resting position has to be read with
     stickiness switched off for exactly one measurement — sticky does not
     affect sibling layout, so the in-flow box is unchanged and the read is
     exact. Scrolling is instant on purpose: this is a correction of a broken
     position, not a journey. */
  function keepResultsInView() {
    var host = $("categoryChips");
    if (!host || host.hidden || !window.requestAnimationFrame) return;
    requestAnimationFrame(function () {
      var cs = window.getComputedStyle(host);
      var stuck = cs.position === "sticky";
      var offset;
      if (stuck) {
        offset = parseFloat(cs.top) || 0;
        host.style.position = "static";
      } else {
        var hd = document.querySelector(".site-header");
        offset = (hd && window.getComputedStyle(hd).position === "sticky")
          ? Math.round(hd.getBoundingClientRect().height) + 6
          : 0;
      }
      var resting = host.getBoundingClientRect().top + window.pageYOffset;
      if (stuck) host.style.position = "";
      var target = Math.max(0, Math.round(resting - offset));
      if (window.pageYOffset > target + 1) {
        try { window.scrollTo({ top: target, behavior: "instant" }); }
        catch (e) { window.scrollTo(0, target); }
      }
    });
  }

  function priceLabel(p) {
    if (productHasVariants(p)) {
      var prices = p.variants.map(function (v) { return Number(v.price) || 0; });
      var min = Math.min.apply(null, prices);
      var max = Math.max.apply(null, prices);
      return min === max ? money(min) : "from " + money(min);
    }
    return money(p.price);
  }

  /* Card media, calmest-first: a product with real footage (p.video) shows a
     chromeless muted <video> that sits on its poster frame until hover plays
     it (desktop) or until it scrolls into view (touch, Instagram-style).
     Everything else shows its flat 2D illustration. Reduced-motion visitors
     always get stills. */
  var PREFERS_STILL = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CAN_HOVER = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var videoWatcher = null;
  function cardStill(p) {
    return (PREFERS_STILL && p.videoPoster) ? p.videoPoster : (p.image || "");
  }

  function attachCardVideo(card, p, vid) {
    vid.muted = true; // the attribute alone isn't trusted on dynamically built DOM
    vid.addEventListener("error", function () {
      var img = document.createElement("img");
      img.className = p.videoPoster ? "photo photo--real" : "photo";
      img.loading = "lazy";
      img.width = 800; img.height = 800;
      img.alt = p.name;
      img.addEventListener("error", function posterGone() {
        img.removeEventListener("error", posterGone);
        if (p.image && img.getAttribute("src") !== p.image) img.src = p.image;
      });
      img.src = p.videoPoster || cardStill(p);
      vid.replaceWith(img);
    });
    function play() { var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
    if (CAN_HOVER) {
      card.addEventListener("mouseenter", play);
      card.addEventListener("mouseleave", function () {
        vid.pause();
        try { vid.currentTime = 0; } catch (e) {}
      });
    } else if ("IntersectionObserver" in window) {
      videoWatcher = videoWatcher || new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio >= 0.45) { // epsilon under the 0.5 threshold — ratios can land at 0.499…
            var pr = en.target.play(); if (pr && pr.catch) pr.catch(function () {});
          } else {
            en.target.pause();
          }
        });
      }, { threshold: [0, 0.5] });
      videoWatcher.observe(vid);
    }
  }

  function renderGrid() {
    var host = $("productGrid");
    var items = visibleProducts();
    if (videoWatcher) { videoWatcher.disconnect(); videoWatcher = null; }
    host.innerHTML = "";
    $("emptyNote").hidden = items.length > 0;

    /* Filtering silently swaps the grid; without this a screen reader user gets
       no confirmation that pressing a category did anything. */
    var live = $("gridStatus");
    if (live) {
      live.textContent = items.length +
        (items.length === 1 ? " item" : " items") +
        (activeCategory === "All" ? " on the menu" : " in " + activeCategory);
    }

    items.forEach(function (p) {
      var badge = leadBadge(p);
      var pickup = earliestPickup(leadDays(p));
      var pickupHtml = pickup
        ? 'Earliest pickup: <strong>' + escapeHtml(shortDate(pickup)) + "</strong>"
        : escapeHtml(PAUSED_MSG);
      var card = document.createElement("article");
      card.className = "card";
      card.style.setProperty("--cat-tint", categoryTint(p.category));
      var media = (p.video && !PREFERS_STILL)
        ? '<video class="photo" width="720" height="540" muted loop playsinline disablepictureinpicture preload="metadata" poster="' + escapeHtml(p.videoPoster || p.image || "") + '" src="' + escapeHtml(p.video) + '" aria-label="' + escapeHtml(p.name) + '"></video>'
        : '<img class="photo' + (cardStill(p).indexOf("images/video/") === 0 ? " photo--real" : "") + '" loading="lazy" width="800" height="800" alt="' + escapeHtml(p.name) + '" src="' + escapeHtml(cardStill(p)) + '">';
      card.innerHTML =
        '<div class="photo-frame">' + media + "</div>" +
        '<div class="body">' +
          '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.text) + "</span>" +
          '<h3><a class="card-link" href="#cake-' + escapeHtml(encodeURIComponent(p.id)) + '">' +
            escapeHtml(p.name) + "</a></h3>" +
          '<p class="desc">' + escapeHtml(p.description || "") + "</p>" +
          '<p class="pickup-note">' + pickupHtml + "</p>" +
          '<div class="meta">' +
            '<span class="price">' + escapeHtml(priceLabel(p)) + "</span>" +
            '<button class="btn btn-primary" data-add>Add' +
              '<span class="sr-only"> ' + escapeHtml(p.name) + "</span>" +
            "</button>" +
          "</div>" +
        "</div>";

      /* The whole card opens the cake. On a phone the photo is the most
         natural thing to tap and it was the one dead part of the card — only
         the Add button was ever bound. The covering is done by a stretched
         ::after on the title, so this stays ONE real <a> with a real href:
         middle-click, copy-link and open-in-new-tab all land on the cake
         through openFromHash(). A plain click opens the modal here rather than
         reloading, because nothing listens for hashchange — the same reason
         the IG tiles do it by hand. Modified clicks are left alone so the
         browser can open its own tab. */
      var cardLink = card.querySelector(".card-link");
      var pressX = 0, pressY = 0;
      cardLink.addEventListener("mousedown", function (e) { pressX = e.clientX; pressY = e.clientY; });
      cardLink.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault(); // even on a drag, or the bare hash lands and opens nothing
        /* A press that travelled is someone trying to select text, not a tap.
           e.detail is 0 for keyboard activation, so Enter always passes. */
        if (e.detail && (Math.abs(e.clientX - pressX) > 6 || Math.abs(e.clientY - pressY) > 6)) return;
        showOverlay("modal", p);
      });
      /* Deliberately the same destination as the card: the button is not a
         second action, it is the labelled one. A mis-tap between them costs
         nothing because both outcomes are identical. */
      card.querySelector("[data-add]").addEventListener("click", function () { showOverlay("modal", p); });
      var photo = card.querySelector(".photo");
      if (photo.tagName === "VIDEO") {
        attachCardVideo(card, p, photo);
      } else {
        photo.addEventListener("error", function fallBack() {
          photo.removeEventListener("error", fallBack);
          // a missing cutout falls back to the plainer flat illustration
          var flat = String(p.image || "").replace("/cutout/", "/flat/");
          if (flat && photo.getAttribute("src") !== flat) photo.src = flat;
        });
      }
      host.appendChild(card);
    });

    document.dispatchEvent(new CustomEvent("aurette:menu-rendered"));
  }

  /* A soft tint per category so flavours read at a glance (Ceremony Coffee's
     colour-coding lesson) — stable hash into a small pastel palette. */
  var TINTS = ["#f7e4e9", "#f5ead3", "#e9f0e2", "#eee6f4", "#fbeadd"];
  function categoryTint(cat) {
    var s = String(cat || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
    return TINTS[h % TINTS.length];
  }

  /* ---------- Product modal ---------- */

  function openModal(p) {
    modalState = { product: p, qty: 1 };
    $("modalTitle").textContent = p.name;
    $("modalDesc").textContent = p.description || "";
    $("itemNote").value = "";
    $("qtyValue").textContent = "1";

    var badge = leadBadge(p);
    var badgeEl = $("modalBadge");
    badgeEl.className = "badge " + badge.cls;
    badgeEl.textContent = badge.text;

    var vf = $("variantField");
    var sel = $("variantSelect");
    if (productHasVariants(p)) {
      sel.innerHTML = "";
      p.variants.forEach(function (v, i) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = v.name + " — " + money(v.price);
        sel.appendChild(opt);
      });
      sel.value = "0";
      vf.hidden = false;
    } else {
      vf.hidden = true;
    }

    var pickup = earliestPickup(leadDays(p));
    $("modalPickup").textContent = pickup
      ? "Earliest pickup for this item: " + humanDate(pickup)
      : PAUSED_MSG;
    $("modalAdd").disabled = !pickup;
    $("modalAdd").textContent = pickup ? "Add to order" : "Ordering is paused";

    updateModalPrice();
    lastFocus.modal = document.activeElement;
    $("productOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    $("modalClose").focus();
  }

  function closeModal() {
    if ($("productOverlay").hidden) return;
    $("productOverlay").hidden = true;
    modalState = null;
    document.body.style.overflow = "";
    restoreFocus("modal");
  }

  /* ---------- Overlay history ----------
     A full-screen modal or drawer reads as a new page on a phone, so the
     back-swipe and the Android Back key have to close it. They used not to:
     neither overlay created a history entry, so Back left the site and took
     the half-built order with it.

     Three rules keep it honest:
       · the open overlay is described by ONE history entry, marked in
         history.state — never by a variable, so a reload and the return trip
         from the WhatsApp hand-off both read the answer the entry was made
         with;
       · popstate only RECONCILES the DOM to that state. It never pushes,
         replaces, or decides to close on its own, so a close and a back-press
         cannot fire each other;
       · a close consumes the entry with history.back() only when we pushed it.
         An overlay the page ARRIVED holding — a shared #cake- link, or the
         header's "Your Order" pointing at shop.html#order — adopts its entry
         instead, so Back returns to whoever sent the visitor here rather than
         costing a press to leave a page they entered once.

     The invariant that makes one Back press provable: pushState runs only when
     the current entry is unmarked, so the entry behind a pushed overlay is
     always one the reconciler will close. */

  function overlayState() {
    try { return (history.state && history.state.aurette) || null; }
    catch (e) { return null; }
  }

  function overlayOpen() {
    return !$("productOverlay").hidden || $("cartDrawer").classList.contains("open");
  }

  function overlayUrl(view, product) {
    return location.pathname + location.search +
      (view === "modal" ? "#cake-" + encodeURIComponent(product.id) : "#order");
  }

  /* Opening from an in-page tap: a card, an IG tile, the cart button. */
  function showOverlay(view, product) {
    var cur = overlayState();
    if (history.pushState) {
      try {
        var st = { aurette: {
          view: view,
          id: product ? product.id : null,
          /* A swap — cake to cake, or drawer to cake — rewrites the entry we
             are standing on rather than stacking a second one, so Back stays
             exactly one press from the menu. A swap inside an ADOPTED session
             stays adopted; promoting it would make the next Back walk out. */
          pushed: cur ? cur.pushed : true,
        } };
        if (cur) history.replaceState(st, "", overlayUrl(view, product));
        else history.pushState(st, "", overlayUrl(view, product));
      } catch (e) { /* file:// or a locked-down webview — the overlay still opens */ }
    }
    if (view === "modal") { closeDrawer(); openModal(product); }
    else { closeModal(); renderCart(); openDrawer(); }
  }

  /* The single close path behind ×, Escape, the backdrop and Add to Order. */
  function dismissOverlay() {
    if (!overlayOpen()) return;
    var st = overlayState();
    /* Shut the paper first, release the entry after: the tap lands
       immediately, and the popstate that follows finds nothing left to do
       because both closers no-op on an already-shut layer. That ordering is
       what stops a close and a back-press chasing each other, and it fails
       safe in a webview that swallows the traversal — a stale entry, not an
       overlay stuck on screen. */
    closeModal();
    closeDrawer();
    if (st && st.pushed) history.back();
    else clearOverlayUrl();
  }

  function clearOverlayUrl() {
    if (!history.replaceState) return;
    // null state on purpose: this drops the marker. ?category= survives.
    try { history.replaceState(null, "", location.pathname + location.search); }
    catch (e) { /* older browser — the hash simply stays on the URL */ }
  }

  /* Back, Forward, the iOS back-swipe and a bfcache restore all land here.
     Idempotent on purpose: a browser that fires popstate twice for one gesture
     must come out of this unchanged — in particular it must not re-run
     openModal() on the cake already showing and wipe the quantity and note the
     visitor has typed. */
  function syncOverlayToState() {
    var st = overlayState();
    var view = st ? st.view : null;
    var p = view === "modal" ? findProduct(st.id) : null;
    if (view === "modal" && (!p || p.available === false)) view = null;

    if (view === "modal") {
      if (modalState && modalState.product.id === p.id) return;
      closeDrawer();
      openModal(p);
      return;
    }
    if (view === "drawer") {
      closeModal();
      if (!$("cartDrawer").classList.contains("open")) { renderCart(); openDrawer(); }
      return;
    }
    closeModal();
    closeDrawer();
  }

  /* Runs once, at init. Whatever overlay the URL asks for opens on the entry
     the visitor ARRIVED on — adopted, not pushed (see above). Where the entry
     behind it happens to be this same page (a cake opened and then refreshed),
     Back still closes the overlay for free: it lands on an unmarked entry and
     the reconciler shuts it. Adoption never costs a working Back, it just
     declines to invent one. */
  function openFromHash() {
    var st = overlayState();
    var view = null;
    var p = null;
    if (st) {
      // A reload, or a Forward press into an entry we marked earlier.
      view = st.view;
      if (view === "modal") p = findProduct(st.id);
    } else if (location.hash === "#order") {
      /* The header slot on the landing and about pages says "Your Order" and
         points here — so it has to land on the order, not just on the page. */
      view = "drawer";
    } else {
      var m = location.hash.match(/^#cake-(.+)$/);
      if (m) { view = "modal"; p = findProduct(decodeURIComponent(m[1])); }
    }
    if (view === "modal" && (!p || p.available === false)) { clearOverlayUrl(); return; }
    if (!view) return;
    if (history.replaceState) {
      try {
        history.replaceState(
          { aurette: { view: view, id: p ? p.id : null, pushed: st ? !!st.pushed : false } },
          "", location.href);
      } catch (e) { /* older browser — the overlay still opens, Back still leaves */ }
    }
    if (view === "drawer") { renderCart(); openDrawer(); }
    else openModal(p);
  }

  function updateModalPrice() {
    if (!modalState) return;
    var vi = productHasVariants(modalState.product) ? Number($("variantSelect").value) : 0;
    var total = unitPrice(modalState.product, vi) * modalState.qty;
    $("modalPrice").textContent = money(total);
  }

  function addFromModal() {
    if (!modalState) return;
    var p = modalState.product;
    var vi = productHasVariants(p) ? Number($("variantSelect").value) : null;
    var note = $("itemNote").value.trim();

    // Merge with an identical line (same product, variant and note).
    var merged = false;
    for (var i = 0; i < cart.length; i++) {
      var it = cart[i];
      if (it.productId === p.id && it.variantIndex === vi && (it.note || "") === note) {
        it.qty += modalState.qty;
        merged = true;
        break;
      }
    }
    if (!merged) {
      cart.push({
        productId: p.id,
        variantIndex: vi,
        // Snapshot the variant name so a menu edit can't silently re-point
        // this line at a different size/price (indexes shift when the baker
        // deletes a variant).
        variantName: vi == null ? null : p.variants[vi].name,
        qty: modalState.qty,
        note: note
      });
    }
    saveCart();
    renderCart();
    dismissOverlay();
    toast(p.name + " added to your order");
    document.dispatchEvent(new CustomEvent("aurette:added"));
  }

  /* ---------- Cart ---------- */

  function cartCount() {
    return cart.reduce(function (n, it) { return n + it.qty; }, 0);
  }

  function cartTotal() {
    return cart.reduce(function (sum, it) {
      var p = findProduct(it.productId);
      if (!p) return sum;
      return sum + unitPrice(p, it.variantIndex == null ? 0 : it.variantIndex) * it.qty;
    }, 0);
  }

  function renderCart() {
    // Drop items the current menu can no longer honor: product removed or
    // hidden, variant structure changed, or the saved variant no longer
    // matches (the baker may have edited sizes since this cart was saved).
    var before = cart.length;
    cart = cart.filter(function (it) {
      var p = findProduct(it.productId);
      if (!p || p.available === false) return false;
      if (productHasVariants(p)) {
        if (it.variantIndex == null || it.variantIndex >= p.variants.length) return false;
        if (it.variantName && p.variants[it.variantIndex].name !== it.variantName) return false;
      } else if (it.variantIndex != null) {
        return false;
      }
      return true;
    });
    if (cart.length !== before) {
      saveCart();
      toast("The menu changed since your last visit — some items were removed from your order.");
    }

    var n = cartCount();
    $("cartCount").textContent = String(n);
    /* A static aria-label hid the count from the accessible name — a screen
       reader heard "Open your order" whether the order held nothing or six
       cakes. Keep the name and the badge in step instead. */
    $("cartButton").setAttribute("aria-label",
      n === 0 ? "Your order, empty" : "Your order, " + n + (n === 1 ? " item" : " items"));
    var host = $("cartItems");
    host.innerHTML = "";
    $("cartEmpty").hidden = cart.length > 0;
    $("checkoutSection").hidden = cart.length === 0;

    cart.forEach(function (it, idx) {
      var p = findProduct(it.productId);
      var vName = it.variantIndex == null ? "" : variantName(p, it.variantIndex);
      var row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML =
        '<img alt="" src="' + escapeHtml(p.image || "") + '">' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(p.name) + "</div>" +
          (vName ? '<div class="variant">' + escapeHtml(vName) + "</div>" : "") +
          (it.note ? '<div class="note">“' + escapeHtml(it.note) + "”</div>" : "") +
          '<div class="qty-row" style="margin-top:6px;">' +
            '<div class="qty-stepper">' +
              '<button type="button" data-minus aria-label="Decrease quantity">−</button>' +
              '<span class="qty">' + it.qty + "</span>" +
              '<button type="button" data-plus aria-label="Increase quantity">+</button>' +
            "</div>" +
            '<button type="button" class="remove" data-remove>Remove</button>' +
          "</div>" +
        "</div>" +
        '<div class="line-price">' +
          escapeHtml(money(unitPrice(p, it.variantIndex == null ? 0 : it.variantIndex) * it.qty)) +
        "</div>";
      row.querySelector("[data-minus]").addEventListener("click", function () {
        if (it.qty > 1) { it.qty--; } else { cart.splice(idx, 1); }
        saveCart(); renderCart();
      });
      row.querySelector("[data-plus]").addEventListener("click", function () {
        it.qty++; saveCart(); renderCart();
      });
      row.querySelector("[data-remove]").addEventListener("click", function () {
        cart.splice(idx, 1); saveCart(); renderCart();
      });
      host.appendChild(row);
    });

    $("cartTotal").textContent = money(cartTotal());
    if (cart.length > 0) refreshPickupControls();
  }

  function refreshPickupControls() {
    var earliest = cartEarliestPickup();
    var dateInput = $("pickupDate");
    dateInput.disabled = !earliest;
    $("sendWhatsApp").disabled = !earliest;
    $("sendEmail").disabled = !earliest;

    if (!earliest) {
      $("pickupBox").innerHTML = "⏸️ " + escapeHtml(PAUSED_MSG);
      return;
    }
    dateInput.min = toInputValue(earliest);

    var current = fromInputValue(dateInput.value);
    if (!current || current < earliest || isClosedDay(current)) {
      dateInput.value = toInputValue(earliest);
    }

    var method = fulfillmentMethod();
    var methodWord = method === "delivery" ? "delivery" : "pickup";
    $("pickupBox").innerHTML =
      "🗓️ Your items are made to order — the earliest " + methodWord + " for this order is <strong>" +
      escapeHtml(humanDate(earliest)) + "</strong>.";

    var closed = closedWeekdays().map(weekdayName);
    $("pickupDateHint").textContent = closed.length
      ? "We're closed on " + closed.join(" and ") + "s."
      : "";

    updateFulfillmentUi();

    var slotSel = $("pickupSlot");
    var slots = Array.isArray(SETTINGS.pickupSlots) ? SETTINGS.pickupSlots : [];
    if (slotSel.options.length !== slots.length) {
      slotSel.innerHTML = "";
      slots.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        slotSel.appendChild(opt);
      });
    }
    slotSel.parentElement.hidden = slots.length === 0;
  }

  function updateFulfillmentUi() {
    var method = fulfillmentMethod();
    $("fulfillmentField").hidden = !deliveryOn();
    $("deliveryAddressField").hidden = method !== "delivery";
    $("pickupDateLabel").textContent = method === "delivery" ? "Delivery day" : "Pickup day";
    $("pickupSlotLabel").textContent = method === "delivery" ? "Preferred delivery time" : "Pickup time";
    $("deliveryNoteHint").textContent = SETTINGS.deliveryNote || "";
  }

  function onPickupDateChange() {
    var dateInput = $("pickupDate");
    var chosen = fromInputValue(dateInput.value);
    var earliest = cartEarliestPickup();
    if (!chosen || !earliest) return;

    if (chosen < earliest) {
      dateInput.value = toInputValue(earliest);
      toast("Your order needs a little more time — earliest pickup is " + shortDate(earliest));
      return;
    }
    if (isClosedDay(chosen)) {
      var d = new Date(chosen);
      var guard = 0;
      do { d.setDate(d.getDate() + 1); } while (isClosedDay(d) && guard++ < 14);
      dateInput.value = toInputValue(d);
      toast("We're closed that day — moved your pickup to " + shortDate(d));
    }
  }

  /* ---------- Order submission ---------- */

  function validateOrderForm() {
    var earliest = cartEarliestPickup();
    if (!earliest) { toast("Sorry — " + PAUSED_MSG.charAt(0).toLowerCase() + PAUSED_MSG.slice(1)); return null; }

    var method = fulfillmentMethod();
    var name = $("custName").value.trim();
    var phone = $("custPhone").value.trim();
    var date = fromInputValue($("pickupDate").value);
    if (!name) { toast("Please add your name so we know whose cake it is!"); $("custName").focus(); return null; }
    if (!phone) { toast("Please add a phone number so we can confirm your order."); $("custPhone").focus(); return null; }

    var address = "";
    if (method === "delivery") {
      address = $("deliveryAddress").value.trim();
      if (!address) { toast("Please add your delivery address."); $("deliveryAddress").focus(); return null; }
    }

    if (!date) { toast("Please pick a day."); $("pickupDate").focus(); return null; }
    if (date < earliest || isClosedDay(date)) {
      onPickupDateChange();
      toast("Please double-check your " + (method === "delivery" ? "delivery" : "pickup") + " day.");
      return null;
    }
    return {
      method: method, address: address,
      name: name, phone: phone, date: date,
      slot: $("pickupSlot").value, note: $("orderNote").value.trim()
    };
  }

  function buildOrderText(form) {
    var lines = [];
    lines.push("🎂 New order — " + SETTINGS.shopName);
    lines.push("");
    cart.forEach(function (it) {
      var p = findProduct(it.productId);
      var vName = it.variantIndex == null ? "" : variantName(p, it.variantIndex);
      var price = unitPrice(p, it.variantIndex == null ? 0 : it.variantIndex) * it.qty;
      lines.push("• " + it.qty + "× " + p.name + (vName ? " (" + vName + ")" : "") + " — " + money(price));
      if (it.note) lines.push("   Note: " + it.note);
    });
    lines.push("");
    lines.push("Total: " + money(cartTotal()) + " (to be confirmed)");
    lines.push("");
    lines.push("Name: " + form.name);
    lines.push("Phone: " + form.phone);
    var when = humanDate(form.date) + (form.slot ? ", " + form.slot : "");
    if (form.method === "delivery") {
      lines.push("Delivery on: " + when);
      lines.push("Deliver to: " + form.address);
      lines.push("(Delivery fee to be confirmed)");
    } else {
      lines.push("Pickup: " + when);
    }
    if (form.note) lines.push("Note: " + form.note);
    return lines.join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  function wireOrderActions() {
    var wa = $("sendWhatsApp");
    var em = $("sendEmail");

    if (!SETTINGS.whatsappNumber) wa.style.display = "none";
    if (!SETTINGS.orderEmail) em.style.display = "none";

    wa.addEventListener("click", function () {
      var form = validateOrderForm();
      if (!form) return;
      var number = String(SETTINGS.whatsappNumber).replace(/[^0-9]/g, "");
      // Direct navigation, not window.open: popups are silently eaten inside
      // Instagram/Facebook in-app browsers, where much of our traffic arrives.
      // The cart lives in localStorage, so coming back loses nothing.
      window.location.href = "https://wa.me/" + number + "?text=" + encodeURIComponent(buildOrderText(form));
    });

    em.addEventListener("click", function () {
      var form = validateOrderForm();
      if (!form) return;
      toast("Opening your email app…");
      window.location.href = "mailto:" + SETTINGS.orderEmail +
        "?subject=" + encodeURIComponent("Cake order — " + form.name) +
        "&body=" + encodeURIComponent(buildOrderText(form));
    });

    $("copyOrder").addEventListener("click", function () {
      var form = validateOrderForm();
      if (!form) return;
      copyText(buildOrderText(form)).then(
        function () { toast("Order copied — paste it in any message to us!"); },
        function () { toast("Couldn't copy automatically — try the WhatsApp or email button."); }
      );
    });

    $("clearCart").addEventListener("click", function () {
      if (cart.length && !window.confirm("Clear everything from your order?")) return;
      cart = [];
      saveCart();
      renderCart();
    });
  }

  /* ---------- Focus management ---------- */

  var lastFocus = { modal: null, drawer: null };

  function restoreFocus(which) {
    var el = lastFocus[which];
    lastFocus[which] = null;
    if (el && document.contains(el) && typeof el.focus === "function") el.focus();
  }

  /* Keep Tab cycling inside whichever layer (modal or drawer) is open. */
  function trapFocus(container, e) {
    var nodes = container.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'
    );
    var list = Array.prototype.filter.call(nodes, function (el) {
      return el.getClientRects().length > 0;
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

  /* ---------- Drawer & modal wiring ---------- */

  function openDrawer() {
    lastFocus.drawer = document.activeElement;
    $("drawerOverlay").hidden = false;
    $("cartDrawer").classList.add("open");
    $("drawerClose").focus();
  }

  function closeDrawer() {
    if (!$("cartDrawer").classList.contains("open")) return;
    $("drawerOverlay").hidden = true;
    $("cartDrawer").classList.remove("open");
    restoreFocus("drawer");
  }

  function wireUi() {
    $("cartButton").addEventListener("click", function () { showOverlay("drawer", null); });
    $("drawerClose").addEventListener("click", function () { dismissOverlay(); });
    $("drawerOverlay").addEventListener("click", function () { dismissOverlay(); });

    $("modalClose").addEventListener("click", function () { dismissOverlay(); });
    $("productOverlay").addEventListener("click", function (e) {
      if (e.target === $("productOverlay")) dismissOverlay();
    });
    /* Back, Forward and the iOS back-swipe. motion.js keeps its own pageshow
       handler for the wipe sheet; the two are independent. */
    window.addEventListener("popstate", syncOverlayToState);
    window.addEventListener("pageshow", function (e) { if (e.persisted) syncOverlayToState(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") dismissOverlay();
      if (e.key === "Tab") {
        if (!$("productOverlay").hidden) trapFocus($("productOverlay"), e);
        else if ($("cartDrawer").classList.contains("open")) trapFocus($("cartDrawer"), e);
      }
    });

    $("qtyMinus").addEventListener("click", function () {
      if (modalState && modalState.qty > 1) {
        modalState.qty--;
        $("qtyValue").textContent = String(modalState.qty);
        updateModalPrice();
      }
    });
    $("qtyPlus").addEventListener("click", function () {
      if (modalState && modalState.qty < 50) {
        modalState.qty++;
        $("qtyValue").textContent = String(modalState.qty);
        updateModalPrice();
      }
    });
    $("variantSelect").addEventListener("change", updateModalPrice);
    $("modalAdd").addEventListener("click", addFromModal);
    $("modalShare").addEventListener("click", function () {
      if (!modalState) return;
      var url = location.origin + location.pathname + "#cake-" + encodeURIComponent(modalState.product.id);
      copyText(url).then(
        function () { toast("Link copied — perfect for an Instagram story!"); },
        function () { toast("Couldn't copy — the link is: " + url); }
      );
    });
    $("pickupDate").addEventListener("change", onPickupDateChange);

    var radios = document.querySelectorAll('input[name="fulfillment"]');
    Array.prototype.forEach.call(radios, function (r) {
      r.addEventListener("change", function () {
        updateFulfillmentUi();
        if (cart.length) refreshPickupControls();
      });
    });

    wireOrderActions();
  }

  /* ---------- Instagram section ----------
     Tries the Worker's cached feed; on any failure (GitHub Pages hosting, no
     token yet, Meta outage) it quietly falls back to a gallery built from the
     menu itself — the section never looks broken. */

  function renderIgTiles(tiles) {
    var host = $("igGrid");
    host.innerHTML = "";
    tiles.forEach(function (t) {
      var el = document.createElement(t.href ? "a" : "div");
      el.className = "ig-tile";
      if (t.href) {
        el.href = t.href;
        if (t.product) {
          /* A real href, so the tile can be copied and shared and still lands
             on the cake via openFromHash — but the click opens the modal here
             rather than reloading. */
          el.addEventListener("click", function (e) {
            e.preventDefault();
            showOverlay("modal", t.product);
          });
        } else {
          el.target = "_blank";
          el.rel = "noopener";
        }
      }
      el.innerHTML =
        '<img loading="lazy" width="400" height="400" alt="' + escapeHtml(t.alt || "") + '" src="' + escapeHtml(t.image) + '">' +
        (t.caption ? '<span class="veil"><span>' + escapeHtml(t.caption) + "</span></span>" : "");
      host.appendChild(el);
    });
    document.dispatchEvent(new CustomEvent("aurette:ig-rendered"));
  }

  function igFallbackGallery() {
    $("igTitle").textContent = "This week's bakes";
    $("igSub").textContent = "A taste of what leaves the kitchen.";
    /* These tiles carry a hover caption and read as tappable, so they have to
       be: each one opens its cake instead of being eight dead photographs at
       the bottom of the page. */
    var tiles = PRODUCTS.filter(function (p) { return p.available !== false && p.image; })
      .slice(0, 8)
      .map(function (p) {
        return {
          image: p.image, alt: p.name, caption: p.name,
          href: "#cake-" + encodeURIComponent(p.id), product: p,
        };
      });
    renderIgTiles(tiles);
  }

  function loadInstagram() {
    var handle = String(SETTINGS.instagramHandle || "").replace(/^@/, "");
    if (handle) {
      $("igFollow").href = "https://instagram.com/" + encodeURIComponent(handle);
      $("igFollow").textContent = "Follow @" + handle;
      $("igActions").hidden = false;
    }

    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 4000); });
    Promise.race([fetch("api/instagram").catch(function () { return null; }), timeout])
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (data && Array.isArray(data.posts) && data.posts.length) {
          if (handle) $("igTitle").textContent = "Fresh from @" + handle;
          $("igSub").textContent = "The latest bakes, straight from Instagram.";
          renderIgTiles(data.posts.map(function (p) {
            return { image: p.image, href: p.permalink, alt: p.caption || "Instagram post", caption: p.caption };
          }));
        } else {
          igFallbackGallery();
        }
      });
  }

  /* ---------- Init ---------- */

  function fetchJson(path) {
    return fetch(path + "?v=" + Date.now()).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + path + " (" + r.status + ")");
      return r.json();
    });
  }

  Promise.all([fetchJson("data/settings.json"), fetchJson("data/products.json")])
    .then(function (results) {
      SETTINGS = results[0];
      PRODUCTS = Array.isArray(results[1]) ? results[1] : [];
      renderShopInfo();
      activeCategory = readCategoryFromUrl();
      renderChips();
      /* renderChips() coerces an unknown category back to All; this stops the
         dead ?category=Pavlova travelling on through anyone's reshared link. */
      writeCategoryToUrl();
      renderGrid();
      renderCart();
      wireUi();
      loadInstagram();
      openFromHash();
    })
    .catch(function (err) {
      $("shopName").textContent = "Oops";
      $("heroText").textContent =
        "The menu couldn't be loaded. If you're the owner, check that data/products.json and data/settings.json exist. (" +
        err.message + ")";
    });
})();
