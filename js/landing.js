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
      var bits = [];
      if (s.deliveryAvailable === true) bits.push("Pickup & delivery available");
      if (s.whatsappNumber) bits.push("WhatsApp orders welcome");
      if (s.orderEmail) bits.push(s.orderEmail);
      var fContact = $("footerContact");
      if (fContact) fContact.textContent = bits.join(" · ");
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
    }
  } catch (e) { /* fresh visitor */ }
})();
