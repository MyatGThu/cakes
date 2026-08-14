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
  if (!motionOK) {
    try { sessionStorage.removeItem("auretteWipe"); } catch (e) {}
    return;
  }

  /* ---------- Fallback: IntersectionObserver + CSS ---------- */
  if (!hasGsap) {
    document.documentElement.classList.remove("wipe-hold");
    try { sessionStorage.removeItem("auretteWipe"); } catch (e) {}
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

  /* ---------- The page wipe (Dennis Snellenberg's signature move) ----------
     Internal navigation sweeps a curved ink sheet up over the page; the next
     page arrives already covered (html.wipe-hold, set pre-paint) and the
     sheet lifts away with the destination's name on it. */
  /* A torn strip of paper, not a smooth curve. The sheet's viewBox is
     stretched to the whole viewport (preserveAspectRatio="none"), so the
     tear needs MANY small irregular notches — a few big alternating teeth
     read as a saw blade, not paper. One fixed jitter table keeps every
     state's path identical in structure so they morph cleanly. */
  var JAG_STEPS = 56;
  var JAG = (function () {
    var a = [], seed = 9241;
    for (var i = 0; i <= JAG_STEPS; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      var r = (seed / 2147483648) * 2 - 1;            // -1 … 1
      // occasional deeper nick, like a fibre catching
      a.push(i % 7 === 3 ? r * 1.8 : r);
    }
    a[0] = 0; a[JAG_STEPS] = 0;                        // meet the edges cleanly
    return a;
  })();

  function sheet(topY, topAmp, botY, botAmp) {
    var i, d = "M 0 " + topY;
    for (i = 1; i <= JAG_STEPS; i++) {
      d += " L " + ((i * 100) / JAG_STEPS).toFixed(2) + " " + (topY + JAG[i] * topAmp).toFixed(2);
    }
    for (i = JAG_STEPS; i >= 0; i--) {
      d += " L " + ((i * 100) / JAG_STEPS).toFixed(2) + " " + (botY + JAG[i] * botAmp).toFixed(2);
    }
    return d + " Z";
  }
  var WIPE_BELOW = sheet(100, 0, 100, 0);
  var WIPE_RISE = sheet(52, 1.5, 100, 0);
  var WIPE_COVER = sheet(0, 0, 100, 0);
  var WIPE_LIFT = sheet(0, 0, 45, 1.5);
  var WIPE_GONE = sheet(0, 0, 0, 0);
  var wipe = document.querySelector(".page-wipe");
  var wipePath = wipe && wipe.querySelector("path");
  var wipeLabel = wipe && wipe.querySelector(".wipe-label");
  var wipeCenter = wipe && wipe.querySelector(".wipe-center");
  var wiping = false;
  var wipeArrived = null;
  try {
    wipeArrived = sessionStorage.getItem("auretteWipe");
    sessionStorage.removeItem("auretteWipe");
  } catch (e) {}

  function hideWipe() {
    wiping = false;
    document.documentElement.classList.remove("wipe-hold");
    if (wipe) gsap.set(wipe, { autoAlpha: 0 });
  }

  if (wipe && wipeArrived !== null) {
    gsap.set(wipe, { autoAlpha: 1 });
    gsap.set(wipePath, { attr: { d: WIPE_COVER } });
    wipeLabel.textContent = wipeArrived;
    gsap.set(wipeCenter, { opacity: 1 });
    document.documentElement.classList.remove("wipe-hold");
    gsap.timeline({ delay: 0.12, onComplete: hideWipe })
      .to(wipeCenter, { opacity: 0, y: -26, duration: 0.3, ease: "power2.in" })
      .to(wipePath, { attr: { d: WIPE_LIFT }, duration: 0.42, ease: "power2.in" }, 0.08)
      .to(wipePath, { attr: { d: WIPE_GONE }, duration: 0.34, ease: "power2.out" }, ">");
  } else {
    hideWipe();
  }
  // Back/forward cache restores the old page with the sheet still up — drop it.
  window.addEventListener("pageshow", function (e) { if (e.persisted) hideWipe(); });

  if (wipe) {
    var WIPE_LABELS = { "": "Aurette", "index.html": "Aurette", "shop.html": "The Menu", "about.html": "The Baker" };
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      var page = url.pathname.split("/").pop();
      if (!Object.prototype.hasOwnProperty.call(WIPE_LABELS, page)) return;
      if (url.pathname === location.pathname) return; // in-page anchors keep scrolling
      e.preventDefault();
      if (wiping) return;
      wiping = true;
      wipeLabel.textContent = WIPE_LABELS[page];
      gsap.set(wipe, { autoAlpha: 1 });
      gsap.set(wipeCenter, { opacity: 0, y: 30 });
      gsap.timeline({
        onComplete: function () {
          try { sessionStorage.setItem("auretteWipe", WIPE_LABELS[page]); } catch (err) {}
          window.location.href = url.href;
        },
      })
        .fromTo(wipePath, { attr: { d: WIPE_BELOW } }, { attr: { d: WIPE_RISE }, duration: 0.4, ease: "power2.in" })
        .to(wipePath, { attr: { d: WIPE_COVER }, duration: 0.34, ease: "power3.out" })
        .to(wipeCenter, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, "-=0.4");
    });
  }

  /* The same curve CSS calls --ease-viscous, so the GSAP layer and the CSS
     layer settle identically instead of drifting apart. GSAP takes a plain
     function as an ease, which saves loading the CustomEase plugin for one
     curve. The binary search is more than accurate enough at frame
     resolution, and it runs once per tween tick on one hovered element. */
  function cubicBezier(x1, y1, x2, y2) {
    function axis(t, a, b) {
      var u = 1 - t;
      return 3 * a * t * u * u + 3 * b * t * t * u + t * t * t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 22; i++) {
        t = (lo + hi) / 2;
        if (axis(t, x1, x2) < x) lo = t; else hi = t;
      }
      return axis((lo + hi) / 2, y1, y2);
    };
  }
  var viscous = cubicBezier(0.62, 0.02, 0.14, 1);

  // Magnetic CTAs (same kit): buttons lean toward the cursor and spring back.
  var magnetResets = [];
  window.addEventListener("scroll", function () {
    for (var mi = 0; mi < magnetResets.length; mi++) magnetResets[mi]();
  }, { passive: true });
  if (window.matchMedia("(pointer: fine)").matches) {
    /* BÖBA's viscous feel: the button is dragged through something thick, so it
       trails the cursor and then creeps home. The elastic spring this replaces
       was the opposite reading — honey clings and settles, it does not bounce —
       so this swaps the curve rather than adding another kind of motion. */
    var VISCOUS = { duration: 0.85, ease: "power3.out" };
    gsap.utils.toArray(".btn-primary, .btn-outline, .cart-button").forEach(function (el) {
      var xTo = gsap.quickTo(el, "x", VISCOUS);
      var yTo = gsap.quickTo(el, "y", VISCOUS);
      var rect = null; // measured once per hover; scrolling invalidates it below
      magnetResets.push(function () { rect = null; });
      el.addEventListener("mouseenter", function () { rect = el.getBoundingClientRect(); });
      el.addEventListener("mousemove", function (e) {
        if (!rect) rect = el.getBoundingClientRect();
        xTo((e.clientX - (rect.left + rect.width / 2)) * 0.34);
        yTo((e.clientY - (rect.top + rect.height / 2)) * 0.5);
      });
      el.addEventListener("mouseleave", function () { rect = null; xTo(0); yTo(0); });
    });
  }

  /* Hover wobble: a scrap re-settles at a new angle. It used to snap there on
     an elastic bounce; on the viscous curve it resists, swings, and creeps into
     place — so the whole hover layer, paper included, now shares one feel.
     Longer durations than the elastic version because viscous motion that
     hurries reads as sluggish rather than thick. Desktop pointers only; the
     resting tilt is CSS, so the no-JS page still looks pasted-up. */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    /* `lift` is for menu cards, which also rise on hover. The rise has to be
       tweened HERE rather than left to CSS: GSAP writes an inline transform for
       the rotation, and an inline transform beats the stylesheet outright — so
       `.card:hover { transform: … translateY(-6px) }` never applied at all, and
       the few pixels the card appeared to move were just its bounding box
       growing as it turned. */
    function wobble(el, lift) {
      el.addEventListener("mouseenter", function () {
        gsap.to(el, {
          rotation: gsap.utils.random(-2.6, 2.6),
          y: lift ? -6 : 0,
          duration: 0.7, ease: viscous, overwrite: "auto",
        });
      });
      el.addEventListener("mouseleave", function () {
        /* clearProps hands the element back to CSS, which is what restores the
           resting tilt. Without it a hovered scrap settled at a flat 0° and
           stayed there — the pasted-up angle was lost for the rest of the
           visit. The last degree of the return is a snap rather than a tween,
           which at these angles is well under a pixel. */
        gsap.to(el, {
          rotation: 0, y: 0,
          duration: 0.75, ease: viscous, overwrite: "auto",
          clearProps: "transform",
        });
      });
    }
    gsap.utils.toArray(".scrap").forEach(function (el) { wobble(el, false); });
    document.addEventListener("aurette:menu-rendered", function () {
      gsap.utils.toArray("#productGrid .card").forEach(function (el) { wobble(el, true); });
    });
  }

  /* Three webfonts (Archivo, Fraunces, Caveat) land after first paint and
     reflow the page — without a refresh, ScrollTrigger keeps its stale
     measurements and reveal batches below the fold never fire. */
  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }

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

  /* Collage entrance: cards and scraps are DEALT onto the page — each one
     arrives from its own direction with its own spin, settling into the
     resting tilt CSS already gives it. */
  function dealIn(els) {
    if (!els.length) return;
    ScrollTrigger.batch(els, {
      start: "top 90%",
      once: true,
      onEnter: function (batch) {
        gsap.from(batch, {
          opacity: 0,
          x: function () { return gsap.utils.random(-130, 130); },
          y: 90,
          rotation: function () { return gsap.utils.random(-14, 14); },
          scale: 0.92,
          duration: 0.8,
          ease: "back.out(1.4)",
          stagger: { each: 0.07, from: "random" },
          clearProps: "transform",
          overwrite: true,
        });
      },
    });
  }
  revealIn(gsap.utils.toArray("[data-reveal]:not(.scrap)"));
  dealIn(gsap.utils.toArray(".scrap"));
  document.addEventListener("aurette:menu-rendered", function () {
    dealIn(gsap.utils.toArray("#productGrid .card"));
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
          // Punctuation right after a word (e.g. the comma after an <em>)
          // must stay glued to it, or it can wrap to the start of a line.
          if (/^[,.;:!?)’”]/.test(piece) && frag.lastChild && frag.lastChild.nodeType === Node.ELEMENT_NODE) {
            frag.lastChild.appendChild(document.createTextNode(piece));
            return;
          }
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
    var heroDelay = wipeArrived !== null ? 0.55 : 0.1; // wait for the wipe to lift
    gsap.from(heroTitle.querySelectorAll(".word"), {
      yPercent: 70, opacity: 0, duration: 1.0, stagger: 0.07, ease: rise, delay: heroDelay,
    });
    gsap.from(".act-hero .hero-mark, .act-hero .eyebrow, .act-hero .sub, .act-hero .cta-row, .scroll-cue", {
      opacity: 0, y: 20, duration: 0.9, stagger: 0.12, ease: "power2.out", delay: heroDelay + 0.3,
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

    // Ingredients: fly IN on arrival (img), bob idly (img), and scatter back
    // OUT as you scroll away (wrapper) — separate layers, no transform fights.
    var introDelay = (wipeArrived !== null ? 0.55 : 0.1) + 0.35;
    gsap.utils.toArray(".act-hero .ing-fly").forEach(function (el, i) {
      var img = el.querySelector(".ing");
      var fx = parseFloat(el.getAttribute("data-fx") || "0");
      var fy = parseFloat(el.getAttribute("data-fy") || "-160");
      var rot = parseFloat(el.getAttribute("data-rot") || "90");
      gsap.from(img, {
        x: fx, y: fy, rotation: rot, opacity: 0,
        duration: 1.3, delay: introDelay + i * 0.07, ease: "power3.out",
        onComplete: function () {
          gsap.to(img, {
            y: "+=" + (7 + (i % 3) * 4), rotation: (i % 2 ? 4 : -4),
            duration: 2 + (i % 3) * 0.6, repeat: -1, yoyo: true, ease: "sine.inOut",
          });
        },
      });
      gsap.fromTo(el, { x: 0, y: 0, rotation: 0, opacity: 1 }, {
        x: fx * 0.55, y: -140 - (i % 4) * 70, rotation: rot * 0.4, opacity: 0, ease: "none",
        scrollTrigger: { trigger: heroAct, start: "top top", end: "bottom top", scrub: 0.5 },
      });
    });
  }

  // The stage: the flat cake assembles layer by layer as you scroll,
  // while ingredients fly in from the edges and disappear into it.
  var stage = document.querySelector(".cake-stage");
  if (stage) {
    var layers = ["#sPlate", "#sTier1", "#sTier2", "#sTier3", "#sDots", "#sCherry"];
    gsap.set(layers, { opacity: 0, y: -64 });
    var build = gsap.timeline({
      scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.4 },
    });
    layers.forEach(function (sel, i) {
      build.to(sel, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.2 + i * 0.3);
    });
    build.to({}, { duration: 1.2 }); // dwell on the finished cake

    var captions = gsap.utils.toArray(".stage-caption");
    gsap.set(captions, { autoAlpha: 0, y: 26 });
    var shown = -1;
    ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: function (self) {
        var want = Math.min(2, Math.floor(self.progress * 3.15));
        if (want !== shown) {
          if (shown >= 0) gsap.to(captions[shown], { autoAlpha: 0, y: -20, duration: 0.35, ease: "power2.in", overwrite: true });
          gsap.to(captions[want], { autoAlpha: 1, y: 0, duration: 0.5, ease: rise, overwrite: true });
          shown = want;
        }
      },
    });
    gsap.fromTo(".stage-cake", { scale: 0.88, y: 30 }, {
      scale: 1.0, y: 0, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.4 },
    });

    // The recipe plays out: flat ingredients fly in and vanish into the cake
    // during the first half of the scroll story.
    var stageIngs = gsap.utils.toArray(".stage-ing");
    if (stageIngs.length) {
      var squeeze = window.innerWidth < 700 ? 0.42 : 1;
      var conv = gsap.timeline({
        scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.4 },
      });
      stageIngs.forEach(function (el, i) {
        var sx = parseFloat(el.getAttribute("data-sx") || "300") * squeeze;
        var sy = parseFloat(el.getAttribute("data-sy") || "0") * squeeze;
        var rot = parseFloat(el.getAttribute("data-srot") || "120");
        var at = i * 0.16;
        conv.fromTo(el,
          { x: sx, y: sy, rotation: rot, scale: 1, opacity: 0 },
          { x: sx * 0.16, y: sy * 0.16, rotation: rot * 0.25, opacity: 1, scale: 0.72, duration: 0.5, ease: "power1.in", immediateRender: true }, at)
          .to(el, { x: 0, y: 0, scale: 0.2, opacity: 0, duration: 0.2, ease: "power2.in" }, at + 0.5);
      });
      conv.to({}, { duration: 1.9 });
    }
  }

  // Scroll-speed-reactive marquee ribbon: it drifts on its own, races when
  // you scroll fast, and runs backwards when you scroll back up.
  var track = document.querySelector(".marquee-track");
  if (track) {
    var loop = gsap.fromTo(track, { xPercent: 0 }, { xPercent: -50, ease: "none", duration: 24, repeat: -1 });
    loop.totalTime(2400); // start deep into the infinite loop so rewinding never pins at time 0
    var boost = { v: 1 };
    ScrollTrigger.create({
      onUpdate: function (self) {
        var v = gsap.utils.clamp(-5, 5, self.getVelocity() / 260);
        if (Math.abs(v) > Math.abs(boost.v) || v * boost.v < 0) boost.v = v;
      },
    });
    gsap.ticker.add(function () {
      loop.timeScale(gsap.utils.interpolate(loop.timeScale(), boost.v, 0.08));
      boost.v = gsap.utils.interpolate(boost.v, 1, 0.03);
    });
  }

  // Teaser: renders float at different speeds and gently tilt while scrolling.
  var teaser = document.querySelector(".teaser");
  if (teaser) {
    [[".float-a", -70, -5], [".float-b", -130, 6], [".float-c", -40, -3], [".float-d", -170, 14], [".float-e", -90, -18]].forEach(function (cfg) {
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
