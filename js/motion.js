/* Aurette by Mia — motion layer v2 (pure progressive enhancement).
   One concept drives everything (the Daylight lesson): things RISE — dough,
   tiers, type — and settle softly, like piped frosting.
   Without this file, GSAP, or with prefers-reduced-motion: the site renders
   complete and static (html.motion-on gates the cinematic layout states). */

(function () {
  "use strict";

  var motionOK = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  if (motionOK && hasGsap) document.documentElement.classList.add("motion-on");
  if (!motionOK) return;

  /* ---------- Fallback: IntersectionObserver + CSS ---------- */
  if (!hasGsap) {
    if (!("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("io-anim");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    function observeAll(sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
        if (!el.classList.contains("in")) io.observe(el);
      });
    }
    observeAll("[data-reveal]");
    document.addEventListener("aurette:menu-rendered", function () { observeAll("#productGrid .card"); });
    document.addEventListener("aurette:ig-rendered", function () { observeAll(".ig-tile"); });
    return;
  }

  /* ---------- Rich path ---------- */
  gsap.registerPlugin(ScrollTrigger);
  var rise = "power3.out";

  // Generic reveals — everything rises into place.
  function revealIn(els) {
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: 30 });
    ScrollTrigger.batch(els, {
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: rise, overwrite: true });
      },
    });
  }
  revealIn(gsap.utils.toArray("[data-reveal]"));
  document.addEventListener("aurette:menu-rendered", function () {
    revealIn(gsap.utils.toArray("#productGrid .card"));
    ScrollTrigger.refresh();
  });
  document.addEventListener("aurette:ig-rendered", function () {
    revealIn(gsap.utils.toArray(".ig-tile"));
    ScrollTrigger.refresh();
  });

  // Hero headline: word cascade (landing page).
  var heroTitle = document.getElementById("heroTitle");
  if (heroTitle && heroTitle.closest(".act-hero")) {
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
      yPercent: 70, opacity: 0, duration: 1.0, stagger: 0.07, ease: rise, delay: 0.1,
    });
    gsap.from(".act-hero .eyebrow, .act-hero .sub, .act-hero .cta-row, .scroll-cue", {
      opacity: 0, y: 20, duration: 0.9, stagger: 0.12, ease: "power2.out", delay: 0.4,
    });
  }

  // Hero parallax: scroll depth + pointer drift (desktop fine pointers only).
  var heroAct = document.querySelector(".act-hero");
  if (heroAct) {
    gsap.utils.toArray(".parallax-layer").forEach(function (layer) {
      var depth = parseFloat(layer.getAttribute("data-depth") || "0.3");
      gsap.to(layer, {
        yPercent: -22 * depth * 3,
        ease: "none",
        scrollTrigger: { trigger: heroAct, start: "top top", end: "bottom top", scrub: 0.6 },
      });
    });
    if (window.matchMedia("(pointer: fine)").matches) {
      var quicks = gsap.utils.toArray(".parallax-layer").map(function (layer) {
        return {
          x: gsap.quickTo(layer, "x", { duration: 0.6, ease: "power2.out" }),
          y: gsap.quickTo(layer, "y", { duration: 0.6, ease: "power2.out" }),
          depth: parseFloat(layer.getAttribute("data-depth") || "0.3"),
        };
      });
      heroAct.addEventListener("mousemove", function (e) {
        var cx = (e.clientX / window.innerWidth - 0.5) * 2;
        var cy = (e.clientY / window.innerHeight - 0.5) * 2;
        quicks.forEach(function (q) { q.x(cx * 26 * q.depth); q.y(cy * 18 * q.depth); });
      });
    }
    gsap.to(".scroll-cue", {
      opacity: 0,
      scrollTrigger: { trigger: heroAct, start: "top top", end: "18% top", scrub: true },
    });
  }

  // The turntable: the 3D cake spins and rises as you scroll.
  var stage = document.querySelector(".cake-stage");
  if (stage) {
    var canvas = document.getElementById("turntable");
    var ctx = canvas.getContext("2d");
    var FRAMES = 24, imgs = [], current = -1, pending = 0;
    for (var i = 0; i < FRAMES; i++) {
      var im = new Image();
      im.src = "images/3d/hero/frame-" + String(i).padStart(2, "0") + ".webp";
      im.onload = (function (idx) { return function () { if (idx === pending) draw(idx); }; })(i);
      imgs.push(im);
    }
    function draw(idx) {
      pending = idx;
      var im = imgs[idx];
      if (!im || !im.complete || !im.naturalWidth) return;
      if (idx === current) return;
      current = idx;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    }
    draw(0);

    var captions = gsap.utils.toArray(".stage-caption");
    gsap.set(captions, { autoAlpha: 0, y: 26 });
    var shown = -1;
    ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        draw(Math.round(p * FRAMES * 1.5) % FRAMES);
        var want = Math.min(2, Math.floor(p * 3.15));
        if (want !== shown) {
          if (shown >= 0) gsap.to(captions[shown], { autoAlpha: 0, y: -20, duration: 0.35, ease: "power2.in", overwrite: true });
          gsap.to(captions[want], { autoAlpha: 1, y: 0, duration: 0.5, ease: rise, overwrite: true });
          shown = want;
        }
      },
    });
    gsap.fromTo(".stage-cake", { scale: 0.78, y: 46 }, {
      scale: 1.0, y: 0, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.4 },
    });
  }

  // Teaser: renders float at different speeds and gently tilt while scrolling.
  var teaser = document.querySelector(".teaser");
  if (teaser) {
    [[".float-a", -70, -5], [".float-b", -130, 6], [".float-c", -40, -3]].forEach(function (cfg) {
      gsap.fromTo(cfg[0], { y: 70, rotation: 0 }, {
        y: cfg[1], rotation: cfg[2], ease: "none",
        scrollTrigger: { trigger: teaser, start: "top bottom", end: "bottom top", scrub: 0.5 },
      });
    });
  }

  // Drifting petals: small objects that travel and turn across whole sections.
  gsap.utils.toArray(".drift").forEach(function (el, i) {
    var sway = (i % 2 ? 1 : -1);
    gsap.fromTo(el, { y: -60, x: 0, rotation: 0 }, {
      y: 160, x: sway * 90, rotation: sway * 140, ease: "none",
      scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.8 },
    });
  });

  // Shop page: the SVG cake assembles in the pinned "how it works" section.
  var mm = gsap.matchMedia();
  mm.add("(min-width: 860px)", function () {
    if (!document.querySelector("#how .how-stage")) return;
    var layers = ["#cakeL1", "#cakeL2", "#cakeL3", "#cakeDrip", "#cakeTop", "#cakeSparkles"];
    var steps = gsap.utils.toArray("#how .step");
    gsap.set(layers, { opacity: 0, y: -70, transformOrigin: "50% 100%" });
    gsap.set("#cakeSparkles", { y: 0, scale: 0.6 });
    gsap.set(steps, { opacity: 0.3 });
    var tl = gsap.timeline({
      scrollTrigger: { trigger: "#how .how-stage", start: "top 18%", end: "+=1400", scrub: 0.6, pin: true },
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

  // Order micro-feedback: the cart badge pops when something is added.
  document.addEventListener("aurette:added", function () {
    var count = document.getElementById("cartCount");
    if (count) gsap.fromTo(count, { scale: 1 }, { scale: 1.55, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
    var btn = document.getElementById("cartButton");
    if (btn) gsap.fromTo(btn, { y: 0 }, { y: -4, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.out" });
  });

  // About page: the polaroid straightens slightly as you read past it.
  var polaroid = document.querySelector(".polaroid");
  if (polaroid) {
    gsap.fromTo(polaroid, { rotation: -2.5 }, {
      rotation: 1.5, ease: "none",
      scrollTrigger: { trigger: ".sheet-story", start: "top 70%", end: "bottom 30%", scrub: 0.8 },
    });
  }
})();
