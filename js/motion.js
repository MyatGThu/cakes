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
  function heroReady() { document.documentElement.classList.remove("motion-pending"); }
  if (!(motionOK && hasGsap)) heroReady();
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

  /* ---------- Smooth scroll (Lenis) ----------
     A mouse wheel delivers scroll in discrete jumps, so every scrub-driven
     parallax on this page inherits that stepping no matter how the tween is
     eased — the stutter is in the scroll POSITION, and that is the only place
     it can be fixed. Lenis interpolates the position and hands ScrollTrigger
     the smoothed value, which is why one small library does more for the
     parallax here than any amount of easing work.

     Three things keep it from fighting the rest of the site:
       · GSAP's ticker drives it (autoRaf: false) so there is ONE rAF loop and
         Lenis and ScrollTrigger can never read a different frame's position;
       · touch is left alone — a phone's native inertia is already smooth, and
         hijacking it costs responsiveness for nothing;
       · it is inside the motion-on gate, so reduced motion, a blocked CDN, or
         no JS all keep plain native scrolling.
     It also keeps the real scroll position (no transformed wrapper), which is
     what lets position: sticky — the header and the category strip — survive. */
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,   // native inertia on touch
      duration: 1.05,
      anchors: { offset: -84 }, // clear the sticky header on #story, #menu, …
    });
    document.documentElement.classList.add("lenis-on");
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    /* store.js re-anchors the grid after a category change; with Lenis running
       a raw window.scrollTo is fought by the next frame's interpolation. */
    if (window.Aurette) {
      window.Aurette.scrollToY = function (y) { lenis.scrollTo(y, { immediate: true }); };
    }
  }

  /* ---------- Entrances wait for the page to settle ----------
     The arrival wipe and the hero entrance used to start while the page was
     still doing its heaviest work (images decoding, fonts reflowing, on the
     shop the whole menu rendering), and lagSmoothing(0) then skipped the time
     lost in those long frames — so their opening frames jumped (measured: the
     shop's wipe lift ran its first nine frames at ~15fps). They now start on
     `load` (and, on the shop, once the menu has rendered) plus two frames,
     with an 800ms failsafe so a slow image can never hold the page. */
  var settledQueue = [], settled = false;
  function whenSettled(fn) { if (settled) fn(); else settledQueue.push(fn); }
  (function () {
    var loaded = document.readyState === "complete";
    var menu = !document.getElementById("productGrid");
    function go() {
      if (settled) return;
      settled = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { settledQueue.splice(0).forEach(function (fn) { fn(); }); });
      });
    }
    function check() { if (loaded && menu) go(); }
    if (!loaded) window.addEventListener("load", function () { loaded = true; check(); });
    if (!menu) document.addEventListener("aurette:menu-rendered", function () { menu = true; check(); });
    setTimeout(go, 800);
    check();
  })();

  /* One layout re-measure for the burst of reasons to re-measure at start-up
     (fonts, load, the menu, the Instagram tiles) rather than four in a row. */
  var refreshTimer = 0;
  function refreshSoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 120);
  }

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
    var lift = gsap.timeline({ paused: true, onComplete: hideWipe })
      .to(wipeCenter, { opacity: 0, y: -26, duration: 0.3, ease: "power2.in" })
      .to(wipePath, { attr: { d: WIPE_LIFT }, duration: 0.42, ease: "power2.in" }, 0.08)
      .to(wipePath, { attr: { d: WIPE_GONE }, duration: 0.34, ease: "power2.out" }, ">");
    whenSettled(function () { lift.play(); });
  } else {
    hideWipe();
  }
  // Back/forward cache restores the old page with the sheet still up — drop it.
  window.addEventListener("pageshow", function (e) { if (e.persisted) hideWipe(); });

  if (wipe) {
    var WIPE_LABELS = { "": "Aurette", "index.html": "Aurette", "shop.html": "The Menu", "about.html": "The Baker", "contact.html": "Say Hello" };
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

  /* ---------- The laneway wall ----------
     Real depth, not one drifting backdrop: each pasted layer moves at its own
     rate across the section, so the wall reads as things stuck at different
     distances. This is the piece Lenis exists for — scrubbed against a stepped
     native wheel it judders, and against an interpolated position it glides.
     `ease: "none"` on purpose: the scroll position is the timeline, so any
     easing here would fight the visitor's own hand. */
  var laneway = document.querySelector(".laneway");
  if (laneway) {
    /* The ghost is centred with translateX(-50%); left to itself GSAP would
       bake that into a pixel x on the first tween and it would sit hundreds of
       pixels off-centre after a resize. Hand GSAP the percentage instead. */
    gsap.set(".lane-ghost", { x: 0, xPercent: -50 });
    gsap.utils.toArray(".lane-layer").forEach(function (layer) {
      var depth = parseFloat(layer.getAttribute("data-lane") || "0.3");
      gsap.fromTo(layer,
        { yPercent: depth * 46 },
        {
          yPercent: -depth * 46,
          ease: "none",
          scrollTrigger: {
            trigger: laneway,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.5,
          },
        });
    });
    /* The suburb tickets deal themselves onto the wall the first time it is
       reached — same paste-up gesture the rest of the collage uses. */
    revealIn(gsap.utils.toArray(".lane-suburbs li"));
  }

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
      var rest = null; // the CSS resting tilt, read before GSAP first touches it
      el.addEventListener("mouseenter", function () {
        if (rest === null) rest = gsap.getProperty(el, "rotation");
        gsap.to(el, {
          rotation: gsap.utils.random(-2.6, 2.6),
          y: lift ? -6 : 0,
          duration: 0.7, ease: viscous, overwrite: "auto",
        });
      });
      el.addEventListener("mouseleave", function () {
        /* Tween back to the resting tilt itself, then clearProps hands the
           element back to CSS with nothing left to jump. Returning to 0° and
           letting clearProps restore the tilt snapped the last degree in one
           frame — about 5px at a card's corners, not the "under a pixel" this
           comment used to claim. Without clearProps at all a hovered scrap
           stays flat for the rest of the visit. */
        gsap.to(el, {
          rotation: rest || 0, y: 0,
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
  window.addEventListener("load", refreshSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshSoon);

  // Generic reveals — everything rises into place.
  /* Calm, not busy: things arrive one at a time. The trigger sits lower in the
     viewport so a section is properly on screen before it starts, and the
     longer duration and stagger mean a group reads as a sequence rather than a
     single flash of everything at once. */
  function revealIn(els) {
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: 34 });
    ScrollTrigger.batch(els, {
      start: "top 82%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 1.05, stagger: 0.14, ease: rise, overwrite: true });
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
  /* The shop's "How it works" steps are also scraps, but on desktop the pinned
     timeline below owns their opacity — and dealIn's overwrite: true deleted
     that timeline's step tweens, so the highlight never moved. They are dealt
     in only where there is no pin. */
  var howSteps = gsap.utils.toArray("#how .step");
  dealIn(gsap.utils.toArray(".scrap").filter(function (el) { return howSteps.indexOf(el) < 0; }));
  gsap.matchMedia().add("(max-width: 859px)", function () { dealIn(howSteps); });
  document.addEventListener("aurette:menu-rendered", function () {
    dealIn(gsap.utils.toArray("#productGrid .card"));
    refreshSoon();
  });
  document.addEventListener("aurette:ig-rendered", function () {
    revealIn(gsap.utils.toArray(".ig-tile"));
    refreshSoon();
  });

  // The hero entrance is one paused timeline, played once the page settles;
  // its from() tweens still set their starting states immediately.
  var intro = gsap.timeline({ paused: true });
  whenSettled(function () { intro.play(); });

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
    intro.from(heroTitle.querySelectorAll(".word"), {
      yPercent: 70, opacity: 0, duration: 1.0, stagger: 0.07, ease: rise,
    }, heroDelay);
    intro.from(".act-hero .hero-mark, .act-hero .eyebrow, .act-hero .sub, .act-hero .cta-row, .scroll-cue", {
      opacity: 0, y: 20, duration: 0.9, stagger: 0.12, ease: "power2.out",
    }, heroDelay + 0.3);
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
      scrollTrigger: {
        trigger: heroAct, start: "top top", end: "18% top", scrub: true,
        // the CSS bob keeps ticking under opacity 0 — stop it once it is gone
        onLeave: function () { document.documentElement.classList.add("cue-gone"); },
        onEnterBack: function () { document.documentElement.classList.remove("cue-gone"); },
      },
    });

    // Ingredients: fly IN on arrival (img), bob idly (img), and scatter back
    // OUT as you scroll away (wrapper) — separate layers, no transform fights.
    var introDelay = (wipeArrived !== null ? 0.55 : 0.1) + 0.35;
    /* The idle bob repeats forever, so it only runs while the hero is on
       screen — an off-screen loop is main-thread work for nothing (measured:
       most of an idle phone's per-second budget, with the marquee below). */
    var bobs = [];
    var heroOnScreen = ScrollTrigger.create({
      trigger: heroAct, start: "top bottom", end: "bottom top",
      onToggle: function (self) {
        heroOnScreen = self.isActive;
        bobs.forEach(function (t) { t.paused(!heroOnScreen); });
      },
    }).isActive;
    gsap.utils.toArray(".act-hero .ing-fly").forEach(function (el, i) {
      var img = el.querySelector(".ing");
      var fx = parseFloat(el.getAttribute("data-fx") || "0");
      var fy = parseFloat(el.getAttribute("data-fy") || "-160");
      var rot = parseFloat(el.getAttribute("data-rot") || "90");
      intro.from(img, {
        x: fx, y: fy, rotation: rot, opacity: 0,
        duration: 1.3, ease: "power3.out",
        onComplete: function () {
          bobs.push(gsap.to(img, {
            y: "+=" + (7 + (i % 3) * 4), rotation: (i % 2 ? 4 : -4),
            duration: 2 + (i % 3) * 0.6, repeat: -1, yoyo: true, ease: "sine.inOut",
            paused: !heroOnScreen,
          }));
        },
      }, introDelay + i * 0.07);
      gsap.fromTo(el, { x: 0, y: 0, rotation: 0, opacity: 1 }, {
        x: fx * 0.55, y: -140 - (i % 4) * 70, rotation: rot * 0.4, opacity: 0, ease: "none",
        scrollTrigger: { trigger: heroAct, start: "top top", end: "bottom top", scrub: 0.5 },
      });
    });
  }

  /* ---------- The film: a scroll-scrubbed frame sequence ----------
     The story stage plays real footage frame by frame from the scroll
     position, so the visitor holds the playhead: scroll down and the cake is
     made, scroll up and time runs backwards. Frames rather than a <video>
     because seeking a video on every scroll tick waits on the decoder and
     stutters (iOS Safari worst of all); a pre-cut frame on a canvas answers
     instantly in both directions. tools/gen-film.js cuts the frames.

     Loading is coarse-to-fine — every 32nd frame, then every 16th, … — so a
     visitor who scrolls in early still sees the film move, just in bigger
     steps, while the rest arrive. Phones and Save-Data get the small set at
     half the frame count. Until a frame is on the canvas the still stays up,
     and without motion-on there is no canvas at all: the still (the finished
     cake) IS the static page.

     Decoding is the other half of fluid. A loaded <img> is still compressed —
     the browser may throw its pixels away again — and drawImage() on it
     decodes on the main thread mid-frame (measured: most of the dropped
     frames on the stage on phones). So frames near the playhead are turned
     into ImageBitmaps, which decode off-thread, and bitmaps that fall out of
     that window are closed so memory stays bounded however long the film is.

     data-sequence is an edit list over the cut frames ("1-80,81-120,120-81")
     so a shot can play forwards and then run back on itself — the layers
     that fly apart are reassembled by time running backwards — without
     shipping a single extra frame. */
  function makeFilm(el) {
    var base = el.getAttribute("data-film");
    var total = parseInt(el.getAttribute("data-frames") || "0", 10);
    var seq = [];
    (el.getAttribute("data-sequence") || "1-" + total).split(",").forEach(function (range) {
      var ends = range.split("-");
      var a = parseInt(ends[0], 10) - 1, b = parseInt(ends[1] || ends[0], 10) - 1;
      var dir = a <= b ? 1 : -1;
      for (var i = a; i !== b + dir; i += dir) if (i >= 0 && i < total) seq.push(i);
    });
    var canvas = el.querySelector(".film-canvas");
    if (!base || !total || !seq.length || !canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext("2d");
    var conn = navigator.connection || {};
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var small = !!conn.saveData || el.clientWidth * dpr < 900;
    var set = small ? "sm" : "lg";
    var step = small ? 2 : 1;
    var last = Math.floor((total - 1) / step) * step;
    function snap(i) { return Math.min(last, Math.round(i / step) * step); }
    var frames = [];   // loaded, still-compressed images
    var bits = {};     // decoded ImageBitmaps, only near the playhead
    var decoding = {};
    var WIN = 12 * step; // frames either side of the playhead kept decoded
    var canBitmap = typeof window.createImageBitmap === "function";
    var want = 0, drawn = -1, started = false, live = false;

    function url(i) { return base + "/" + set + "/" + ("00" + (i + 1)).slice(-3) + ".webp"; }
    function queue() {
      var seen = {}, q = [];
      function add(i) { if (!seen[i]) { seen[i] = true; q.push(i); } }
      add(snap(seq[0])); add(snap(seq[seq.length - 1]));
      for (var gap = 32 * step; gap >= step; gap /= 2) {
        for (var i = 0; i <= last; i += gap) add(i);
      }
      return q;
    }
    function nearest(i) {
      for (var d = 0; d <= last; d += step) {
        if (frames[i - d]) return i - d;
        if (frames[i + d]) return i + d;
      }
      return -1;
    }
    function fit() {
      // Never more canvas pixels than the frames have: painting a 600px frame
      // into a 718px canvas costs a third more fill for no extra detail.
      var cap = small ? 600 : 1080;
      var scale = Math.min(dpr, cap / Math.max(1, canvas.clientWidth));
      var w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h; drawn = -1;
      }
    }
    // Prefer a frame that is already decoded if one is within a couple of
    // steps — a near-enough frame now beats the exact one after a stall.
    function pick(i) {
      for (var d = 0; d <= 2 * step; d += step) {
        if (bits[i - d]) return i - d;
        if (bits[i + d]) return i + d;
      }
      return nearest(i);
    }
    function decodeWindow() {
      if (!canBitmap) return;
      for (var i = Math.max(0, want - WIN); i <= Math.min(last, want + WIN); i += step) {
        if (frames[i] && !bits[i] && !decoding[i]) {
          decoding[i] = true;
          (function (k) {
            createImageBitmap(frames[k]).then(function (b) {
              decoding[k] = false;
              if (Math.abs(k - want) > WIN) { b.close(); return; }
              bits[k] = b;
              draw();
            }, function () { decoding[k] = false; });
          })(i);
        }
      }
      for (var key in bits) {
        if (Math.abs(key - want) > WIN) { bits[key].close(); delete bits[key]; }
      }
    }
    function draw() {
      var i = pick(want);
      if (i < 0 || i === drawn) return;
      var src = bits[i] || frames[i], cw = canvas.width, ch = canvas.height;
      if (!cw || !ch) return;
      var iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
      var s = Math.max(cw / iw, ch / ih); // cover
      var w = iw * s, h = ih * s;
      ctx.drawImage(src, (cw - w) / 2, (ch - h) / 2, w, h);
      drawn = i;
      if (!live) { live = true; el.classList.add("film-live"); }
    }
    function load() {
      if (started) return;
      started = true;
      fit();
      var q = queue(), active = 0;
      (function pump() {
        while (active < 6 && q.length) {
          (function (i) {
            active++;
            var img = new Image();
            img.decoding = "async";
            function done() { active--; pump(); }
            img.onload = function () {
              // decode off the main thread before the canvas ever asks for it
              var ready = img.decode ? img.decode() : Promise.resolve();
              ready.catch(function () {}).then(function () { frames[i] = img; decodeWindow(); draw(); done(); });
            };
            img.onerror = done;
            img.src = url(i);
          })(q.shift());
        }
      })();
    }
    if (window.ResizeObserver) new ResizeObserver(function () { fit(); draw(); }).observe(canvas);
    return {
      load: load,
      seek: function (p) {
        var next = snap(seq[Math.round(p * (seq.length - 1))]);
        if (next !== want) { want = next; decodeWindow(); }
        draw();
      },
    };
  }

  // Every hero starting state is set by now — let it be seen.
  heroReady();

  // The stage: ingredients fly in and vanish into the film, which then plays
  // the cake being made from the scroll position.
  var stage = document.querySelector(".cake-stage");
  if (stage) {
    var filmEl = stage.querySelector(".film");
    var reel = filmEl && makeFilm(filmEl);
    var captions = gsap.utils.toArray(".stage-caption");
    gsap.set(captions, { autoAlpha: 0, y: 26 });
    var shown = -1;
    function caption(want) {
      if (want === shown || !captions[want]) return;
      if (shown >= 0) gsap.to(captions[shown], { autoAlpha: 0, y: -20, duration: 0.35, ease: "power2.in", overwrite: true });
      gsap.to(captions[want], { autoAlpha: 1, y: 0, duration: 0.5, ease: rise, overwrite: true });
      shown = want;
    }
    // Where each caption takes over, as a fraction of the film's edit list
    // (data-chapters) — the subtitles follow the picture, not the scrollbar.
    var chapters = ((filmEl && filmEl.getAttribute("data-chapters")) || "0,0.34,0.67").split(",").map(parseFloat);
    function chapterAt(p) {
      var k = 0;
      chapters.forEach(function (c, i) { if (p >= c) k = i; });
      return k;
    }
    var playhead = { p: 0 };
    if (reel) {
      // start fetching well before the stage arrives
      ScrollTrigger.create({ trigger: stage, start: "top 300%", onEnter: reel.load, onEnterBack: reel.load });
    }
    gsap.timeline({
      scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.6 },
    })
      .to({}, { duration: 0.05 }) // hold the opening frame while the ingredients land
      .to(playhead, {
        p: 1, duration: 0.9, ease: "none",
        onUpdate: function () { if (reel) reel.seek(playhead.p); caption(chapterAt(playhead.p)); },
      })
      .to({}, { duration: 0.05 }); // and the last one, before the page moves on
    caption(0);
    gsap.fromTo(".stage-cake", { scale: 0.94, y: 24 }, {
      scale: 1.0, y: 0, ease: "none",
      scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.4 },
    });

    // The paper ingredients fly in and vanish into the film in the opening
    // fifth of the stage, just as the real ones appear on screen — the
    // collage hands over to the footage.
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
        var at = i * 0.05;
        conv.fromTo(el,
          { x: sx, y: sy, rotation: rot, scale: 1, opacity: 0 },
          { x: sx * 0.16, y: sy * 0.16, rotation: rot * 0.25, opacity: 1, scale: 0.72, duration: 0.5, ease: "power1.in", immediateRender: true }, at)
          .to(el, { x: 0, y: 0, scale: 0.2, opacity: 0, duration: 0.2, ease: "power2.in" }, at + 0.5);
      });
      conv.to({}, { duration: 3.6 });
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
    // Runs only while the ribbon is on screen, ticker included.
    loop.paused(!ScrollTrigger.create({
      trigger: track.parentElement, start: "top bottom", end: "bottom top",
      onToggle: function (self) { loop.paused(!self.isActive); },
    }).isActive);
    gsap.ticker.add(function () {
      if (loop.paused()) return;
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
