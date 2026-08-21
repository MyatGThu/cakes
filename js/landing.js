(function () {
  "use strict";
  /* Collage safety net: any cutout that fails to load (missing file, bad
     deploy) quietly falls back to its plainer flat twin. Capture phase —
     img error events do not bubble. */
  document.addEventListener("error", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "IMG" || el.dataset.fellBack === "done") return;
    var src = el.getAttribute("src") || "";
    if (src.indexOf("/cutout/") !== -1) {
      // first hop: try the plainer flat twin (kitchenware has none — that's
      // what the second hop is for)
      el.dataset.fellBack = "flat";
      el.setAttribute("src", src.replace("/cutout/", "/flat/"));
      return;
    }
    if (el.dataset.fellBack === "flat") {
      // no twin either: it is decorative, so remove it rather than show a
      // broken-image glyph in the middle of the collage
      el.dataset.fellBack = "done";
      el.style.display = "none";
    }
  }, true);
})();

/* Landing & About pages — light shop-context loader (no cart machinery here;
   ordering lives on shop.html). */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  fetch("data/settings.json?v=" + Date.now())
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      if (!s) return;
      var tagline = $("shopTagline");
      if (tagline) tagline.textContent = s.tagline || "";
      var ann = $("announcement");
      if (ann && s.announcement) { ann.textContent = s.announcement; ann.hidden = false; }
      var fName = $("footerShopName");
      if (fName) fName.textContent = s.shopName || "";
      var fPickup = $("footerPickup");
      if (fPickup) fPickup.textContent = s.pickupAddress ? "Pickup: " + s.pickupAddress : "";
      window.Aurette.renderFooterContact($("footerContact"), s);
      renderContactPage(s);
      var handle = String(s.instagramHandle || "").replace(/^@/, "");
      var igAbout = $("igFollowAbout");
      if (igAbout && handle) {
        igAbout.href = "https://instagram.com/" + encodeURIComponent(handle);
        igAbout.textContent = "Follow @" + handle;
      }
    })
    .catch(function () { /* static defaults remain */ });

  /* contact.html only. Everything here is read from settings.json rather than
     written into the page, so the hours, the closed day and the delivery note
     cannot drift away from what the shop actually does once Mia edits them. */
  function renderContactPage(s) {
    var list = $("contactChannels");
    if (list) {
      var channels = window.Aurette.contactChannels(s);
      list.innerHTML = "";
      if (!channels.length) {
        var li = document.createElement("li");
        li.className = "channel channel--none";
        li.textContent = "Contact details are being set up — check back shortly.";
        list.appendChild(li);
      }
      channels.forEach(function (c) {
        var li = document.createElement("li");
        li.className = "channel";
        var a = document.createElement("a");
        a.className = "btn btn-primary btn-lg";
        a.href = c.href;
        a.textContent = c.label;
        if (c.external) { a.target = "_blank"; a.rel = "noopener"; }
        var note = document.createElement("span");
        note.className = "channel-note";
        note.textContent = c.note;
        li.appendChild(a);
        li.appendChild(note);
        list.appendChild(li);
      });
    }

    var dl = $("practical");
    if (!dl) return;
    var rows = [];
    if (s.pickupAddress) rows.push(["Pickup", s.pickupAddress]);
    if (s.deliveryAvailable === true) {
      rows.push(["Delivery", s.deliveryNote || "Available across Melbourne — confirmed with your order."]);
    }
    var cutoff = parseInt(s.orderCutoffHour, 10);
    if (!isNaN(cutoff)) {
      var h = cutoff % 12 === 0 ? 12 : cutoff % 12;
      rows.push(["Daily cutoff", "Orders in after " + h + (cutoff < 12 ? "am" : "pm") +
        " start counting from the next day."]);
    }
    var closed = Array.isArray(s.closedWeekdays) ? s.closedWeekdays : [];
    if (closed.length) {
      rows.push(["Closed", closed.map(function (i) {
        return new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: "long" });
      }).join(" and ")]);
    }
    if (Array.isArray(s.pickupSlots) && s.pickupSlots.length) {
      rows.push(["Pickup windows", s.pickupSlots.join("  ·  ")]);
    }
    dl.innerHTML = "";
    rows.forEach(function (r) {
      var dt = document.createElement("dt"); dt.textContent = r[0];
      var dd = document.createElement("dd"); dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    var note = $("practicalNote");
    if (note) {
      note.textContent = "Every cake shows its own notice period on the menu — the site only offers " +
        "dates Mia can genuinely make.";
    }
  }

  // If an order is already in progress, the header button reflects it.
  try {
    var cart = JSON.parse(localStorage.getItem("cakeCart")) || [];
    var n = cart.reduce(function (a, it) { return a + (it && it.qty > 0 ? Math.floor(it.qty) : 0); }, 0);
    var chip = $("cartCount");
    var btn = $("orderNow");
    if (chip && btn && n > 0) {
      chip.textContent = String(n);
      chip.hidden = false;
      btn.childNodes[0].nodeValue = "Your Order";
      /* Once there is an order in progress this button is the order, not a
         second route to the menu — so send it to the drawer, not the top of
         the page. Empty, it stays a plain "Order Now" call to action. */
      btn.setAttribute("href", "shop.html#order");
      btn.setAttribute("aria-label", "Your order, " + n + (n === 1 ? " item" : " items"));
    }
  } catch (e) { /* fresh visitor */ }
})();
