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

  function loadCart() {
    try {
      var raw = localStorage.getItem("cakeCart");
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
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

  /* Earliest pickup for a given lead time, starting from `now`.
     Orders after the cutoff hour start counting from tomorrow, and
     pickups skip past the shop's closed weekdays. */
  function earliestPickup(days, now) {
    now = now || new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var cutoff = parseInt(SETTINGS.orderCutoffHour, 10);
    if (!isNaN(cutoff) && now.getHours() >= cutoff) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + days);
    var guard = 0;
    while (isClosedDay(d) && guard++ < 14) d.setDate(d.getDate() + 1);
    return d;
  }

  function cartEarliestPickup() {
    var maxLead = 0;
    for (var i = 0; i < cart.length; i++) {
      var p = findProduct(cart[i].productId);
      if (p) maxLead = Math.max(maxLead, leadDays(p));
    }
    return earliestPickup(maxLead);
  }

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

  function renderShopInfo() {
    document.title = SETTINGS.shopName + " — Order for Pickup";
    $("shopName").textContent = SETTINGS.shopName;
    $("shopTagline").textContent = SETTINGS.tagline || "";
    $("footerShopName").textContent = SETTINGS.shopName;
    $("footerPickup").textContent = SETTINGS.pickupAddress ? "Pickup: " + SETTINGS.pickupAddress : "";

    var contactBits = [];
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

    var closed = closedWeekdays().map(weekdayName);
    if (closed.length) {
      $("heroText").textContent =
        "Everything is baked to order — pick what you'd like, choose a pickup day, and send us your order. " +
        "We'll confirm it personally. (No pickups on " + closed.join(" or ") + "s.)";
    }
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

  function renderGrid() {
    var host = $("productGrid");
    var items = visibleProducts();
    host.innerHTML = "";
    $("emptyNote").hidden = items.length > 0;

    items.forEach(function (p) {
      var badge = leadBadge(p);
      var pickup = earliestPickup(leadDays(p));
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<img class="photo" loading="lazy" alt="' + escapeHtml(p.name) + '" src="' + escapeHtml(p.image || "") + '">' +
        '<div class="body">' +
          '<span class="badge ' + badge.cls + '">' + escapeHtml(badge.text) + "</span>" +
          "<h3>" + escapeHtml(p.name) + "</h3>" +
          '<p class="desc">' + escapeHtml(p.description || "") + "</p>" +
          '<p class="pickup-note">Earliest pickup: <strong>' + escapeHtml(shortDate(pickup)) + "</strong></p>" +
          '<div class="meta">' +
            '<span class="price">' + escapeHtml(priceLabel(p)) + "</span>" +
            '<button class="btn btn-primary" data-add>Add</button>' +
          "</div>" +
        "</div>";
      card.querySelector("[data-add]").addEventListener("click", function () { openModal(p); });
      host.appendChild(card);
    });
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

    $("modalPickup").textContent = "Earliest pickup for this item: " + humanDate(earliestPickup(leadDays(p)));
    updateModalPrice();
    $("productOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("productOverlay").hidden = true;
    modalState = null;
    document.body.style.overflow = "";
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
      cart.push({ productId: p.id, variantIndex: vi, qty: modalState.qty, note: note });
    }
    saveCart();
    renderCart();
    closeModal();
    toast(p.name + " added to your order");
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
    // Drop items whose product was removed from the menu.
    cart = cart.filter(function (it) { return !!findProduct(it.productId); });

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
    dateInput.min = toInputValue(earliest);

    var current = fromInputValue(dateInput.value);
    if (!current || current < earliest || isClosedDay(current)) {
      dateInput.value = toInputValue(earliest);
    }

    $("pickupBox").innerHTML =
      "🗓️ Your items are made to order — the earliest pickup for this order is <strong>" +
      escapeHtml(humanDate(earliest)) + "</strong>.";

    var closed = closedWeekdays().map(weekdayName);
    $("pickupDateHint").textContent = closed.length
      ? "No pickups on " + closed.join(" or ") + "s."
      : "";

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

  function onPickupDateChange() {
    var dateInput = $("pickupDate");
    var chosen = fromInputValue(dateInput.value);
    var earliest = cartEarliestPickup();
    if (!chosen) return;

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
    var name = $("custName").value.trim();
    var phone = $("custPhone").value.trim();
    var date = fromInputValue($("pickupDate").value);
    if (!name) { toast("Please add your name so we know whose cake it is!"); $("custName").focus(); return null; }
    if (!phone) { toast("Please add a phone number so we can confirm your order."); $("custPhone").focus(); return null; }
    if (!date) { toast("Please pick a pickup day."); $("pickupDate").focus(); return null; }

    var earliest = cartEarliestPickup();
    if (date < earliest || isClosedDay(date)) {
      onPickupDateChange();
      toast("Please double-check your pickup day.");
      return null;
    }
    return { name: name, phone: phone, date: date, slot: $("pickupSlot").value, note: $("orderNote").value.trim() };
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
    lines.push("Pickup: " + humanDate(form.date) + (form.slot ? ", " + form.slot : ""));
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

    wa.addEventListener("click", function (e) {
      var form = validateOrderForm();
      if (!form) { e.preventDefault(); return; }
      var number = String(SETTINGS.whatsappNumber).replace(/[^0-9]/g, "");
      wa.href = "https://wa.me/" + number + "?text=" + encodeURIComponent(buildOrderText(form));
      toast("Opening WhatsApp — just press send!");
    });

    em.addEventListener("click", function (e) {
      var form = validateOrderForm();
      if (!form) { e.preventDefault(); return; }
      em.href = "mailto:" + SETTINGS.orderEmail +
        "?subject=" + encodeURIComponent("Cake order — " + form.name) +
        "&body=" + encodeURIComponent(buildOrderText(form));
      toast("Opening your email app…");
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

  /* ---------- Drawer & modal wiring ---------- */

  function openDrawer() {
    $("drawerOverlay").hidden = false;
    $("cartDrawer").classList.add("open");
  }

  function closeDrawer() {
    $("drawerOverlay").hidden = true;
    $("cartDrawer").classList.remove("open");
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
    $("pickupDate").addEventListener("change", onPickupDateChange);

    wireOrderActions();
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
    })
    .catch(function (err) {
      $("shopName").textContent = "Oops";
      $("heroText").textContent =
        "The menu couldn't be loaded. If you're the owner, check that data/products.json and data/settings.json exist. (" +
        err.message + ")";
    });
})();
