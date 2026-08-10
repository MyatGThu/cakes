/* Aurette by Mia — motion layer (pure progressive enhancement).
   Nothing on the page depends on this file: without it (or with GSAP's CDN
   blocked, or with prefers-reduced-motion set) the site renders complete and
   static. GSAP drives the rich path; a small IntersectionObserver + CSS path
   covers browsers where the CDN didn't load. */

(function () {
  "use strict";

  var motionOK = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  if (!motionOK) return;

  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  /* ---------- Fallback path: IntersectionObserver + CSS transitions ---------- */

  if (!hasGsap) {
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("io-anim");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });

    function observeAll(selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
        if (!el.classList.contains("in")) io.observe(el);
      });
    }
    observeAll("[data-reveal]");
    document.addEventListener("aurette:menu-rendered", function () { observeAll("#productGrid .card"); });
    document.addEventListener("aurette:ig-rendered", function () { observeAll(".ig-tile"); });
    return;
  }

  /* ---------- Rich path: GSAP + ScrollTrigger ---------- */

  gsap.registerPlugin(ScrollTrigger);

  // Hero headline: split into word spans (keeping the accented word intact)
  // and cascade them in. Runs immediately — the text was never hidden in CSS.
  var heroTitle = document.getElementById("heroTitle");
  if (heroTitle) {
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(heroTitle.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach(function (piece) {
          if (!piece) return;
          if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span");
          w.className = "word";
          w.textContent = piece;
          frag.appendChild(w);
        });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add("word");
        frag.appendChild(node);
      }
    });
    heroTitle.innerHTML = "";
    heroTitle.appendChild(frag);
    gsap.from(heroTitle.querySelectorAll(".word"), {
      yPercent: 60, opacity: 0, duration: 0.9, stagger: 0.06, ease: "power3.out", delay: 0.1,
    });
    gsap.from(".hero .eyebrow, .hero .sub, .hero .cta-row", {
      opacity: 0, y: 18, duration: 0.8, stagger: 0.12, ease: "power2.out", delay: 0.35,
    });
  }

  // Generic section reveals.
  function revealIn(els, extra) {
    gsap.set(els, { opacity: 0, y: 26 });
    ScrollTrigger.batch(els, Object.assign({
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: "power3.out", overwrite: true });
      },
    }, extra || {}));
  }
  revealIn(document.querySelectorAll("[data-reveal]"));
  document.addEventListener("aurette:menu-rendered", function () {
    revealIn(document.querySelectorAll("#productGrid .card"));
    ScrollTrigger.refresh();
  });
  document.addEventListener("aurette:ig-rendered", function () {
    revealIn(document.querySelectorAll(".ig-tile"));
    ScrollTrigger.refresh();
  });

  // The cake assembles as you scroll (our Simply Chocolate homage).
  // Desktop: pinned, scrubbed. Small screens: the cake stays whole and the
  // generic reveals carry the section.
  var mm = gsap.matchMedia();
  mm.add("(min-width: 860px)", function () {
    var layers = ["#cakeL1", "#cakeL2", "#cakeL3", "#cakeDrip", "#cakeTop", "#cakeSparkles"];
    var steps = gsap.utils.toArray("#how .step");
    gsap.set(layers, { opacity: 0, y: -70, transformOrigin: "50% 100%" });
    gsap.set("#cakeSparkles", { y: 0, scale: 0.6 });
    gsap.set(steps, { opacity: 0.3 });

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: "#how .how-stage",
        start: "top 18%",
        end: "+=1400",
        scrub: 0.6,
        pin: true,
      },
    });
    tl.to(steps[0], { opacity: 1, duration: 0.3 }, 0)
      .to("#cakeL1", { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 0.1)
      .to(steps[0], { opacity: 0.3, duration: 0.3 }, 1.1)
      .to(steps[1], { opacity: 1, duration: 0.3 }, 1.1)
      .to("#cakeL2", { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 1.2)
      .to("#cakeL3", { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 1.9)
      .to(steps[1], { opacity: 0.3, duration: 0.3 }, 2.7)
      .to(steps[2], { opacity: 1, duration: 0.3 }, 2.7)
      .to("#cakeDrip", { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 2.8)
      .to("#cakeTop", { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, 3.3)
      .to("#cakeSparkles", { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 3.7)
      .to(steps[2], { opacity: 1, duration: 0.2 }, 3.9);

    return function () { gsap.set(layers.concat(steps), { clearProps: "all" }); };
  });

  // Order-flow micro-feedback: the cart badge pops when something is added.
  document.addEventListener("aurette:added", function () {
    var count = document.getElementById("cartCount");
    if (count) {
      gsap.fromTo(count, { scale: 1 }, { scale: 1.55, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
    }
    var btn = document.getElementById("cartButton");
    if (btn) gsap.fromTo(btn, { y: 0 }, { y: -4, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.out" });
  });
})();
