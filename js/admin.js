/* Admin page — edits data/*.json and uploads images by committing to GitHub
   through the REST API, using a fine-grained personal access token that only
   has Contents access to this one repository. The token never leaves the
   browser (stored in localStorage on this device). */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var API = "https://api.github.com";
  var CONFIG_KEY = "cakeAdminConfig";
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var config = null;            // { owner, repo, branch, token }
  var products = [];            // parsed data/products.json
  var settings = {};            // parsed data/settings.json
  var shas = { products: null, settings: null };
  var dirty = { products: false, settings: false };
  var publishing = false;

  /* ---------- Small helpers ---------- */

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 3200);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function slugify(name) {
    var s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "item";
  }

  function bytesToBase64(bytes) {
    var chunks = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(chunks.join(""));
  }

  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  function base64ToText(b64) {
    var bin = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function setStatus(text) { $("statusText").textContent = text; }

  function updatePublishButton() {
    var isDirty = dirty.products || dirty.settings;
    $("publishBtn").disabled = publishing || !isDirty;
    $("publishBtn").innerHTML = publishing
      ? '<span class="spin"></span> Publishing…'
      : (isDirty ? "Publish changes" : "All published ✓");
  }

  function markDirty(which) {
    dirty[which] = true;
    updatePublishButton();
  }

  /* ---------- GitHub API ---------- */

  function gh(path, options) {
    options = options || {};
    options.headers = Object.assign({
      "Authorization": "Bearer " + config.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, options.headers || {});
    return fetch(API + "/repos/" + config.owner + "/" + config.repo + path, options);
  }

  function loadJsonFile(path) {
    return gh("/contents/" + path + "?ref=" + encodeURIComponent(config.branch) + "&t=" + Date.now())
      .then(function (r) {
        if (r.status === 404) throw new Error(path + " was not found on branch “" + config.branch + "”.");
        if (r.status === 401) throw new Error("The access key was rejected. Check it was copied fully.");
        if (!r.ok) throw new Error("GitHub error " + r.status + " while loading " + path + ".");
        return r.json();
      })
      .then(function (data) {
        return { json: JSON.parse(base64ToText(data.content)), sha: data.sha };
      });
  }

  function putFile(path, base64Content, sha, message, retried) {
    var body = { message: message, content: base64Content, branch: config.branch };
    if (sha) body.sha = sha;
    return gh("/contents/" + path, { method: "PUT", body: JSON.stringify(body) })
      .then(function (r) {
        if ((r.status === 409 || r.status === 422) && !retried) {
          // Someone else (or a previous save) changed the file — refresh sha and retry once.
          return gh("/contents/" + path + "?ref=" + encodeURIComponent(config.branch) + "&t=" + Date.now())
            .then(function (rr) { return rr.ok ? rr.json() : null; })
            .then(function (meta) {
              return putFile(path, base64Content, meta && meta.sha, message, true);
            });
        }
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (e) {
            throw new Error("Saving " + path + " failed (" + r.status + "): " + (e.message || "unknown error"));
          });
        }
        return r.json();
      });
  }

  /* ---------- Connect / setup ---------- */

  function detectRepoFromUrl() {
    var m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    if (!m) return {};
    var owner = m[1];
    var segments = location.pathname.split("/").filter(Boolean);
    // /repo/admin.html → repo; user-site root → <owner>.github.io
    var repo = segments.length > 1 ? segments[0] : owner + ".github.io";
    return { owner: owner, repo: repo };
  }

  function showSetup(prefill) {
    $("setupPanel").hidden = false;
    $("editorSection").hidden = true;
    var guess = detectRepoFromUrl();
    $("cfgOwner").value = (prefill && prefill.owner) || guess.owner || "";
    $("cfgRepo").value = (prefill && prefill.repo) || guess.repo || "";
    $("cfgBranch").value = (prefill && prefill.branch) || "main";
    setStatus("Not connected");
  }

  function connect() {
    var cfg = {
      owner: $("cfgOwner").value.trim(),
      repo: $("cfgRepo").value.trim(),
      branch: $("cfgBranch").value.trim() || "main",
      token: $("cfgToken").value.trim()
    };
    var errHost = $("setupError");
    errHost.innerHTML = "";
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      errHost.innerHTML = '<div class="notice notice-err">Please fill in the username, repository and access key.</div>';
      return;
    }
    config = cfg;
    $("connectBtn").disabled = true;
    $("connectBtn").textContent = "Connecting…";

    loadEverything()
      .then(function () {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        enterEditor();
      })
      .catch(function (err) {
        config = null;
        errHost.innerHTML = '<div class="notice notice-err">' + escapeHtml(err.message) + "</div>";
      })
      .then(function () {
        $("connectBtn").disabled = false;
        $("connectBtn").textContent = "Connect";
      });
  }

  function loadEverything() {
    return Promise.all([loadJsonFile("data/products.json"), loadJsonFile("data/settings.json")])
      .then(function (results) {
        products = Array.isArray(results[0].json) ? results[0].json : [];
        shas.products = results[0].sha;
        settings = results[1].json || {};
        shas.settings = results[1].sha;
        dirty.products = false;
        dirty.settings = false;
      });
  }

  function enterEditor() {
    $("setupPanel").hidden = true;
    $("editorSection").hidden = false;
    setStatus("Connected · " + config.owner + "/" + config.repo);
    renderProducts();
    renderSettings();
    updatePublishButton();
  }

  function logout() {
    if ((dirty.products || dirty.settings) &&
        !window.confirm("You have unpublished changes that will be lost. Disconnect anyway?")) return;
    localStorage.removeItem(CONFIG_KEY);
    config = null;
    dirty = { products: false, settings: false };
    showSetup();
  }

  /* ---------- Products editor ---------- */

  function productTemplate() {
    return {
      id: "new-item-" + Math.random().toString(36).slice(2, 7),
      name: "",
      description: "",
      category: "Cakes",
      image: "",
      leadTimeDays: 2,
      available: true,
      price: 0
    };
  }

  function renderProducts() {
    var host = $("productList");
    host.innerHTML = "";
    products.forEach(function (p, idx) { host.appendChild(productEditor(p, idx)); });
  }

  function productEditor(p, idx) {
    var hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    var box = document.createElement("div");
    box.className = "product-editor" + (p.available === false ? " unavailable" : "");
    box.innerHTML =
      '<div class="head">' +
        '<span class="title">' + (escapeHtml(p.name) || "New product") + "</span>" +
        '<div class="tools">' +
          '<button type="button" data-up title="Move up">↑</button>' +
          '<button type="button" data-down title="Move down">↓</button>' +
          '<button type="button" data-delete class="danger" title="Delete">Delete</button>' +
        "</div>" +
      "</div>" +
      '<div class="editor-grid">' +
        '<div class="image-slot">' +
          '<img alt="" src="' + escapeHtml(p.image || "") + '">' +
          '<button type="button" class="btn btn-outline upload-btn" data-upload>Upload photo</button>' +
          '<input type="file" accept="image/*" hidden data-file>' +
        "</div>" +
        "<div>" +
          '<div class="row-2">' +
            '<div class="field"><label>Name</label><input type="text" data-f="name" value="' + escapeHtml(p.name) + '"></div>' +
            '<div class="field"><label>Category</label><input type="text" data-f="category" value="' + escapeHtml(p.category || "") + '" placeholder="e.g. Cakes"></div>' +
          "</div>" +
          '<div class="field"><label>Description</label><textarea rows="2" data-f="description">' + escapeHtml(p.description || "") + "</textarea></div>" +
          '<div class="row-2">' +
            '<div class="field"><label>Days of notice needed</label><input type="number" min="0" max="60" data-f="leadTimeDays" value="' + escapeHtml(String(p.leadTimeDays == null ? 0 : p.leadTimeDays)) + '">' +
              '<p class="hint">0 = same-day, 3 = customers can pick up 3 days after ordering.</p></div>' +
            '<div class="field" data-single-price' + (hasVariants ? " hidden" : "") + '><label>Price</label><input type="number" min="0" step="0.01" data-f="price" value="' + escapeHtml(String(p.price == null ? "" : p.price)) + '"></div>' +
          "</div>" +
          '<div class="check-row field"><input type="checkbox" id="avail-' + idx + '" data-f="available"' + (p.available === false ? "" : " checked") + '><label for="avail-' + idx + '">Show on the website</label></div>' +
          '<div class="check-row field"><input type="checkbox" id="hasvar-' + idx + '" data-hasvariants' + (hasVariants ? " checked" : "") + '><label for="hasvar-' + idx + '">This product has sizes / options</label></div>' +
          '<div data-variants' + (hasVariants ? "" : " hidden") + '>' +
            '<label>Sizes &amp; prices</label>' +
            '<div data-variant-list></div>' +
            '<button type="button" class="btn btn-quiet" data-add-variant style="padding-left:0;">＋ Add a size</button>' +
          "</div>" +
        "</div>" +
      "</div>";

    // Simple field bindings
    box.querySelectorAll("[data-f]").forEach(function (input) {
      var key = input.getAttribute("data-f");
      input.addEventListener("input", function () {
        if (key === "available") {
          p.available = input.checked;
          box.className = "product-editor" + (p.available ? "" : " unavailable");
        } else if (key === "leadTimeDays") {
          p.leadTimeDays = input.value === "" ? 0 : parseInt(input.value, 10);
        } else if (key === "price") {
          p.price = input.value === "" ? 0 : parseFloat(input.value);
        } else {
          p[key] = input.value;
          if (key === "name") box.querySelector(".title").textContent = input.value || "New product";
        }
        markDirty("products");
      });
    });

    // Reorder / delete
    box.querySelector("[data-up]").addEventListener("click", function () {
      if (idx === 0) return;
      products.splice(idx - 1, 0, products.splice(idx, 1)[0]);
      markDirty("products"); renderProducts();
    });
    box.querySelector("[data-down]").addEventListener("click", function () {
      if (idx === products.length - 1) return;
      products.splice(idx + 1, 0, products.splice(idx, 1)[0]);
      markDirty("products"); renderProducts();
    });
    box.querySelector("[data-delete]").addEventListener("click", function () {
      if (!window.confirm("Delete “" + (p.name || "this product") + "” from the menu?")) return;
      products.splice(idx, 1);
      markDirty("products"); renderProducts();
    });

    // Variants
    var variantList = box.querySelector("[data-variant-list]");
    function renderVariantRows() {
      variantList.innerHTML = "";
      (p.variants || []).forEach(function (v, vi) {
        var row = document.createElement("div");
        row.className = "variant-row";
        row.innerHTML =
          '<input type="text" class="v-name" placeholder="e.g. 8&quot; (serves 14)" value="' + escapeHtml(v.name || "") + '">' +
          '<input type="number" class="v-price" min="0" step="0.01" placeholder="Price" value="' + escapeHtml(String(v.price == null ? "" : v.price)) + '">' +
          '<button type="button" title="Remove size">✕</button>';
        row.querySelector(".v-name").addEventListener("input", function (e) { v.name = e.target.value; markDirty("products"); });
        row.querySelector(".v-price").addEventListener("input", function (e) { v.price = e.target.value === "" ? 0 : parseFloat(e.target.value); markDirty("products"); });
        row.querySelector("button").addEventListener("click", function () {
          p.variants.splice(vi, 1);
          markDirty("products"); renderVariantRows();
        });
        variantList.appendChild(row);
      });
    }
    renderVariantRows();

    box.querySelector("[data-add-variant]").addEventListener("click", function () {
      p.variants = p.variants || [];
      p.variants.push({ name: "", price: 0 });
      markDirty("products"); renderVariantRows();
    });

    box.querySelector("[data-hasvariants]").addEventListener("change", function (e) {
      if (e.target.checked) {
        p.variants = (Array.isArray(p.variants) && p.variants.length) ? p.variants : [{ name: "", price: Number(p.price) || 0 }];
        box.querySelector("[data-variants]").hidden = false;
        box.querySelector("[data-single-price]").hidden = true;
      } else {
        if (Array.isArray(p.variants) && p.variants.length) p.price = Number(p.variants[0].price) || 0;
        delete p.variants;
        box.querySelector("[data-variants]").hidden = true;
        box.querySelector("[data-single-price]").hidden = false;
        var priceInput = box.querySelector('[data-f="price"]');
        if (priceInput) priceInput.value = String(p.price);
      }
      markDirty("products"); renderVariantRows();
    });

    // Photo upload
    var fileInput = box.querySelector("[data-file]");
    box.querySelector("[data-upload]").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (file) uploadPhoto(p, file, box);
      fileInput.value = "";
    });

    return box;
  }

  /* Resize/compress in the browser so phone photos don't bloat the repo. */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var MAX = 1200;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error("Could not process that image."));
          blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("That file doesn't look like an image."));
      };
      img.src = url;
    });
  }

  function uploadPhoto(product, file, box) {
    var btn = box.querySelector("[data-upload]");
    btn.disabled = true;
    btn.textContent = "Uploading…";
    compressImage(file)
      .then(function (bytes) {
        var path = "images/" + slugify(product.name || product.id) + "-" + Date.now() + ".jpg";
        return putFile(path, bytesToBase64(bytes), null, "Upload photo: " + (product.name || product.id))
          .then(function () { return path; });
      })
      .then(function (path) {
        product.image = path;
        box.querySelector(".image-slot img").src = path;
        markDirty("products");
        toast("Photo uploaded ✓ — press “Publish changes” to show it on the site.");
      })
      .catch(function (err) {
        toast("Photo upload failed: " + err.message);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Upload photo";
      });
  }

  /* ---------- Settings editor ---------- */

  function renderSettings() {
    $("sShopName").value = settings.shopName || "";
    $("sTagline").value = settings.tagline || "";
    $("sAnnouncement").value = settings.announcement || "";
    $("sCurrency").value = settings.currencySymbol || "$";
    $("sCutoff").value = settings.orderCutoffHour == null ? 16 : settings.orderCutoffHour;
    $("sWhatsapp").value = settings.whatsappNumber || "";
    $("sEmail").value = settings.orderEmail || "";
    $("sAddress").value = settings.pickupAddress || "";

    var bindings = {
      sShopName: "shopName", sTagline: "tagline", sAnnouncement: "announcement",
      sCurrency: "currencySymbol", sWhatsapp: "whatsappNumber",
      sEmail: "orderEmail", sAddress: "pickupAddress"
    };
    Object.keys(bindings).forEach(function (id) {
      var el = $(id);
      el.oninput = function () { settings[bindings[id]] = el.value; markDirty("settings"); };
    });
    $("sCutoff").oninput = function () {
      var v = parseInt($("sCutoff").value, 10);
      settings.orderCutoffHour = isNaN(v) ? 16 : Math.min(23, Math.max(0, v));
      markDirty("settings");
    };

    // Closed weekdays
    var grid = $("weekdayGrid");
    grid.innerHTML = "";
    WEEKDAYS.forEach(function (day, i) {
      var wrap = document.createElement("div");
      wrap.className = "check-row";
      var checked = Array.isArray(settings.closedWeekdays) && settings.closedWeekdays.indexOf(i) !== -1;
      wrap.innerHTML =
        '<input type="checkbox" id="wd-' + i + '"' + (checked ? " checked" : "") + '>' +
        '<label for="wd-' + i + '">' + day + "</label>";
      wrap.querySelector("input").addEventListener("change", function (e) {
        var set = Array.isArray(settings.closedWeekdays) ? settings.closedWeekdays.slice() : [];
        if (e.target.checked) { if (set.indexOf(i) === -1) set.push(i); }
        else { set = set.filter(function (d) { return d !== i; }); }
        set.sort();
        settings.closedWeekdays = set;
        markDirty("settings");
      });
      grid.appendChild(wrap);
    });

    // Pickup slots
    renderSlots();
    $("addSlotBtn").onclick = function () {
      settings.pickupSlots = Array.isArray(settings.pickupSlots) ? settings.pickupSlots : [];
      settings.pickupSlots.push("");
      markDirty("settings");
      renderSlots();
    };
  }

  function renderSlots() {
    var host = $("slotList");
    host.innerHTML = "";
    (Array.isArray(settings.pickupSlots) ? settings.pickupSlots : []).forEach(function (slot, i) {
      var row = document.createElement("div");
      row.className = "slot-row";
      row.innerHTML =
        '<input type="text" placeholder="e.g. 10:00 – 12:00" value="' + escapeHtml(slot) + '">' +
        '<button type="button" class="btn btn-quiet" title="Remove slot">✕</button>';
      row.querySelector("input").addEventListener("input", function (e) {
        settings.pickupSlots[i] = e.target.value;
        markDirty("settings");
      });
      row.querySelector("button").addEventListener("click", function () {
        settings.pickupSlots.splice(i, 1);
        markDirty("settings");
        renderSlots();
      });
      host.appendChild(row);
    });
  }

  /* ---------- Publish ---------- */

  function validateBeforePublish() {
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (!String(p.name || "").trim()) return "Product " + (i + 1) + " needs a name.";
      var lead = parseInt(p.leadTimeDays, 10);
      if (isNaN(lead) || lead < 0) return "“" + p.name + "” needs a valid number of notice days (0 or more).";
      if (Array.isArray(p.variants) && p.variants.length) {
        for (var j = 0; j < p.variants.length; j++) {
          var v = p.variants[j];
          if (!String(v.name || "").trim()) return "“" + p.name + "” has a size with no name.";
          if (isNaN(parseFloat(v.price)) || parseFloat(v.price) < 0) return "“" + p.name + "” has a size with an invalid price.";
        }
      } else {
        if (isNaN(parseFloat(p.price)) || parseFloat(p.price) < 0) return "“" + p.name + "” needs a valid price.";
      }
    }
    return null;
  }

  function normalizeProducts() {
    products.forEach(function (p) {
      p.name = String(p.name || "").trim();
      p.leadTimeDays = Math.max(0, parseInt(p.leadTimeDays, 10) || 0);
      if (!p.id || /^new-item-/.test(p.id)) p.id = slugify(p.name) + "-" + Math.random().toString(36).slice(2, 6);
      if (Array.isArray(p.variants)) {
        p.variants.forEach(function (v) { v.price = Number(v.price) || 0; });
        delete p.price;
      } else {
        p.price = Number(p.price) || 0;
      }
    });
  }

  function publish() {
    if (publishing) return;
    var problem = validateBeforePublish();
    var noticeHost = $("publishNotice");
    if (problem) {
      noticeHost.innerHTML = '<div class="notice notice-err">' + escapeHtml(problem) + "</div>";
      toast(problem);
      return;
    }
    noticeHost.innerHTML = "";
    normalizeProducts();
    publishing = true;
    updatePublishButton();

    // Trim empty pickup slots before saving.
    if (Array.isArray(settings.pickupSlots)) {
      settings.pickupSlots = settings.pickupSlots
        .map(function (s) { return String(s).trim(); })
        .filter(Boolean);
    }

    var steps = Promise.resolve();
    if (dirty.products) {
      steps = steps.then(function () {
        return putFile("data/products.json", textToBase64(JSON.stringify(products, null, 2) + "\n"),
          shas.products, "Update menu via shop admin")
          .then(function (res) { shas.products = res.content.sha; dirty.products = false; });
      });
    }
    if (dirty.settings) {
      steps = steps.then(function () {
        return putFile("data/settings.json", textToBase64(JSON.stringify(settings, null, 2) + "\n"),
          shas.settings, "Update shop settings via shop admin")
          .then(function (res) { shas.settings = res.content.sha; dirty.settings = false; });
      });
    }

    steps
      .then(function () {
        noticeHost.innerHTML = '<div class="notice notice-ok">Published! 🎉 The website updates in a minute or two — then refresh the shop page to see it.</div>';
        toast("Published ✓");
        renderProducts(); // reflect normalized data
      })
      .catch(function (err) {
        noticeHost.innerHTML = '<div class="notice notice-err">' + escapeHtml(err.message) + " — your changes are still here; try publishing again.</div>";
        toast("Publish failed — see the message at the top.");
      })
      .then(function () {
        publishing = false;
        updatePublishButton();
      });
  }

  /* ---------- Tabs & init ---------- */

  function selectTab(name) {
    var tabs = { products: "tabProducts", settings: "tabSettings", help: "tabHelp" };
    var panes = { products: "productsPane", settings: "settingsPane", help: "helpPane" };
    Object.keys(tabs).forEach(function (key) {
      $(tabs[key]).setAttribute("aria-selected", String(key === name));
      $(panes[key]).hidden = key !== name;
    });
  }

  function init() {
    $("connectBtn").addEventListener("click", connect);
    $("cfgToken").addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
    $("publishBtn").addEventListener("click", publish);
    $("addProductBtn").addEventListener("click", function () {
      products.push(productTemplate());
      markDirty("products");
      renderProducts();
      var editors = document.querySelectorAll(".product-editor");
      if (editors.length) editors[editors.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
    });
    $("logoutBtn").addEventListener("click", logout);
    $("tabProducts").addEventListener("click", function () { selectTab("products"); });
    $("tabSettings").addEventListener("click", function () { selectTab("settings"); });
    $("tabHelp").addEventListener("click", function () { selectTab("help"); });

    window.addEventListener("beforeunload", function (e) {
      if (dirty.products || dirty.settings) { e.preventDefault(); e.returnValue = ""; }
    });

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY)); } catch (e) { /* ignore */ }
    if (saved && saved.token) {
      config = saved;
      setStatus("Connecting…");
      loadEverything()
        .then(enterEditor)
        .catch(function (err) {
          toast(err.message);
          showSetup(saved);
        });
    } else {
      showSetup(saved);
    }
  }

  init();
})();
