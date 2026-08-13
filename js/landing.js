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
      var handle = String(s.instagramHandle || "").replace(/^@/, "");
      var igAbout = $("igFollowAbout");
      if (igAbout && handle) {
        igAbout.href = "https://instagram.com/" + encodeURIComponent(handle);
        igAbout.textContent = "Follow @" + handle;
      }
    })
    .catch(function () { /* static defaults remain */ });

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
