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
    document.title = SETTINGS.shopName + " — Cakes to Order";
    $("shopName").textContent = SETTINGS.shopName;
    $("shopTagline").textContent = SETTINGS.tagline || "";
    $("footerShopName").textContent = SETTINGS.shopName;
    $("footerPickup").textContent = SETTINGS.pickupAddress ? "Pickup: " + SETTINGS.pickupAddress : "";

    var contactBits = [];
    if (deliveryOn()) contactBits.push("Pickup & delivery available");
    if (SETTINGS.whatsappNumber) contactBits.push("WhatsApp orders welcome");
    if (SETTINGS.orderEmail) contactBits.push(SETTINGS.orderEmail);
    $("footerContact").textContent = contactBits.join(" · ");

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

  function renderChips() {
    var cats = ["All"];
    PRODUCTS.forEach(function (p) {
      if (p.available === false) return;
      if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
    });
    var host = $("categoryChips");
    host.innerHTML = "";
    if (cats.length <= 2) return; // only "All" plus one — no point filtering
    cats.forEach(function (c) {
      var b = document.createElement("button");
      b.className = "chip";
      b.textContent = c;
      b.setAttribute("aria-pressed", String(c === activeCategory));
      b.addEventListener("click", function () {
        activeCategory = c;
        renderChips();
        renderGrid();
      });
      host.appendChild(b);
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

  /* The 3D renders have animated turntable twins in images/3d/anim/ — slow
     360° loops that autoplay like GIFs. Cards use those, unless the visitor
     prefers reduced motion or the product photo is a real upload. */
  var PREFERS_STILL = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function cardImage(p) {
    if (!PREFERS_STILL && /^images\/3d\/[\w-]+\.webp$/.test(p.image || "")) {
      return "images/3d/anim/" + p.image.split("/").pop();
    }
    return p.image || "";
  }

  function renderGrid() {
    var host = $("productGrid");
    var items = visibleProducts();
    host.innerHTML = "";
    $("emptyNote").hidden = items.length > 0;

    items.forEach(function (p) {
      var badge = leadBadge(p);
      var pickup = earliestPickup(leadDays(p));
      var pickupHtml = pickup
        ? 'Earliest pickup: <strong>' + escapeHtml(shortDate(pickup)) + "</strong>"
        : escapeHtml(PAUSED_MSG);
      var card = document.createElement("article");
      card.className = "card";
      card.style.setProperty("--cat-tint", categoryTint(p.category));
      card.innerHTML =
        '<div class="photo-frame"><img class="photo" loading="lazy" width="800" height="800" alt="' + escapeHtml(p.name) + '" src="' + escapeHtml(cardImage(p)) + '"></div>' +
        '<div class="body">' +
          '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.text) + "</span>" +
          "<h3>" + escapeHtml(p.name) + "</h3>" +
          '<p class="desc">' + escapeHtml(p.description || "") + "</p>" +
          '<p class="pickup-note">' + pickupHtml + "</p>" +
          '<div class="meta">' +
            '<span class="price">' + escapeHtml(priceLabel(p)) + "</span>" +
            '<button class="btn btn-primary" data-add>Add</button>' +
          "</div>" +
        "</div>";
      card.querySelector("[data-add]").addEventListener("click", function () { openModal(p); });
      var photo = card.querySelector(".photo");
      photo.addEventListener("error", function fallBack() {
        photo.removeEventListener("error", fallBack);
        if (p.image && photo.getAttribute("src") !== p.image) photo.src = p.image;
      });
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
    // Deep-linkable cakes: Mia can put this exact URL in an Instagram story.
    if (history.replaceState) history.replaceState(null, "", "#cake-" + encodeURIComponent(p.id));
  }

  function closeModal() {
    if ($("productOverlay").hidden) return;
    $("productOverlay").hidden = true;
    modalState = null;
    document.body.style.overflow = "";
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    restoreFocus("modal");
  }

  function openFromHash() {
    var m = location.hash.match(/^#cake-(.+)$/);
    if (!m) return;
    var p = findProduct(decodeURIComponent(m[1]));
    if (p && p.available !== false) openModal(p);
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
    closeModal();
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

    $("cartCount").textContent = String(cartCount());
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
    $("cartButton").addEventListener("click", function () { renderCart(); openDrawer(); });
    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawerOverlay").addEventListener("click", closeDrawer);

    $("modalClose").addEventListener("click", closeModal);
    $("productOverlay").addEventListener("click", function (e) {
      if (e.target === $("productOverlay")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal(); closeDrawer(); }
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
      if (t.href) { el.href = t.href; el.target = "_blank"; el.rel = "noopener"; }
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
    var tiles = PRODUCTS.filter(function (p) { return p.available !== false && p.image; })
      .slice(0, 8)
      .map(function (p) { return { image: p.image, alt: p.name, caption: p.name }; });
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
      renderChips();
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
