/* Aurette — the handful of things every page needs.
   Loaded before landing.js / store.js on all three visitor pages, so both can
   share one implementation instead of drifting apart. */
window.Aurette = (function () {
  "use strict";

  /* The footer is the last thing a phone visitor reaches, and on a small screen
     it is where people look for a way to contact the bakery. It used to be set
     with textContent, so the handle and the email address were plain words you
     could not tap. Every channel here is a real link. */
  function renderFooterContact(host, settings) {
    if (!host) return;
    var links = [];
    var handle = String(settings.instagramHandle || "").replace(/^@/, "");
    if (handle) {
      links.push({
        href: "https://instagram.com/" + encodeURIComponent(handle),
        text: "@" + handle,
        external: true,
      });
    }
    var wa = String(settings.whatsappNumber || "").replace(/[^0-9]/g, "");
    if (wa) links.push({ href: "https://wa.me/" + wa, text: "WhatsApp", external: true });
    if (settings.orderEmail) {
      links.push({ href: "mailto:" + settings.orderEmail, text: settings.orderEmail });
    }
    if (!links.length) return; // keep whatever the static markup said

    host.textContent = "";
    links.forEach(function (l, i) {
      if (i) host.appendChild(document.createTextNode(" · "));
      var a = document.createElement("a");
      a.href = l.href;
      a.textContent = l.text;
      if (l.external) { a.target = "_blank"; a.rel = "noopener"; }
      host.appendChild(a);
    });
  }

  return { renderFooterContact: renderFooterContact };
})();
