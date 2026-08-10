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
  var WIPE_COVER = "M 0 0 Q 50 0 100 0 L 100 100 Q 50 100 0 100 Z";
  var WIPE_BELOW = "M 0 100 Q 50 100 100 100 L 100 100 Q 50 100 0 100 Z";
  var WIPE_RISE = "M 0 55 Q 50 12 100 55 L 100 100 Q 50 100 0 100 Z";
  var WIPE_LIFT = "M 0 0 Q 50 0 100 0 L 100 42 Q 50 92 0 42 Z";
  var WIPE_GONE = "M 0 0 Q 50 0 100 0 L 100 0 Q 50 0 0 0 Z";
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

  // Magnetic CTAs (same kit): buttons lean toward the cursor and spring back.
  var magnetResets = [];
  window.addEventListener("scroll", function () {
    for (var mi = 0; mi < magnetResets.length; mi++) magnetResets[mi]();
  }, { passive: true });
  if (window.matchMedia("(pointer: fine)").matches) {
    gsap.utils.toArray(".btn-primary, .btn-outline, .cart-button").forEach(function (el) {
      var xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.3)" });
      var yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.3)" });
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

    // The recipe plays out: ingredients fly in from the edges and disappear
    // INTO the spinning cake, one after another, during the first half of
    // the scroll story.
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
      conv.to({}, { duration: 1.9 }); // hold: convergence owns only the first half of the stage
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
