(function () {
  "use strict";
  var FOOTER_LOGO = window.GOLFRSA_FOOTER_LOGO || "";
  var ROUNDS = ["r1", "r2", "r3", "r4"];
  var DEFAULT_CFG = { tournament: "", venue: "", dates: "", par: 72, totalRounds: 4, show: 10, roundTitle: "", tag: "LEADERBOARD",
                      logoId: "", photoId: "", photoX: 15, photoY: 40, photoZoom: 100 };
  var EXAMPLE = [
    ["Liezl Smit", "Westlake Golf Club", 76, 79], ["Vicki Traut", "Royal Cape Golf Club", 83, 73],
    ["Gina da Silva", "Selborne Golf Club", 88, 75], ["Gaby Gramm", "Durban Country Club", 79, 87],
    ["Sandra Winter", "Mowbray Golf Club", 90, 78], ["Melanie Scholtz", "Stellenbosch Golf Club", 87, 81],
    ["Tanya le Roux", "Erinvale Golf Club", 84, 84], ["Maritha de Beer", "Pretoria Country Club", 87, 82],
    ["Lauren vd Merwe", "Kingswood Golf Estate", 86, 84], ["Karin Watts", "Randpark Golf Club", 85, 85]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var KEY = "golfrsa-leaderboard-v1", IMG_KEY = "golfrsa-leaderboard-img-";
  var cfg = Object.assign({}, DEFAULT_CFG);
  var players = {};          // id -> data
  var canWrite = true;
  var imgData = { logo: "", photo: "" };   // data URLs
  var images = {};           // slot -> HTMLImageElement
  var store = (function () { try { var t = "__t"; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; } catch (e) { return null; } })();
  function load() {
    if (!store) return;
    try {
      var d = JSON.parse(store.getItem(KEY) || "null");
      if (d) { cfg = Object.assign({}, DEFAULT_CFG, d.cfg || {}); players = d.players || {}; }
      imgData.logo = store.getItem(IMG_KEY + "logo") || ""; imgData.photo = store.getItem(IMG_KEY + "photo") || "";
    } catch (e) {}
  }
  var saveT = null, saveOk = true;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (!store) return refreshStatus();
      try { store.setItem(KEY, JSON.stringify({ cfg: cfg, players: players })); saveOk = true; } catch (e) { saveOk = false; }
      refreshStatus();
    }, 300);
  }
  function persistImage(slot) {
    if (!store) return true;
    try { if (imgData[slot]) store.setItem(IMG_KEY + slot, imgData[slot]); else store.removeItem(IMG_KEY + slot); return true; }
    catch (e) { return false; }
  }
  var footerImg = new Image(); footerImg.onload = schedule; footerImg.src = FOOTER_LOGO;

  // ---------------- status + toast ----------------
  function setStatus(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }
  function refreshStatus() {
    if (!store) return setStatus("warn", "This browser won't save – export a CSV before closing");
    if (!saveOk) return setStatus("warn", "Couldn't save – export a CSV to keep your scores");
    setStatus("saved", "Saved on this computer");
  }
  var toastT;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600); }

  // ---------------- scoring ----------------
  function num(v) { v = String(v == null ? "" : v).trim(); return /^-?\d+$/.test(v) ? parseInt(v, 10) : null; }
  function fmtPar(n) { return n === 0 ? "E" : (n > 0 ? "+" + n : String(n)); }

  function compute(list) {
    var total = Math.max(1, Math.min(4, num(cfg.totalRounds) || 4));
    var par = num(cfg.par); if (par === null) par = 72;
    var played = [];
    for (var i = 0; i < total; i++) {
      var k = ROUNDS[i];
      if (list.some(function (p) { return num(p[k]) !== null; })) played.push(k);
    }
    // keep rounds contiguous up to the last one with scores
    if (played.length) { var last = ROUNDS.indexOf(played[played.length - 1]); played = ROUNDS.slice(0, last + 1); }
    var rows = list.filter(function (p) { return String(p.name || "").trim(); }).map(function (p, idx) {
      var tot = 0, n = 0;
      played.forEach(function (k) { var s = num(p[k]); if (s !== null) { tot += s; n++; } });
      return { src: p, name: String(p.name).trim(), club: String(p.club || "").trim(), scores: played.map(function (k) { return num(p[k]); }),
               n: n, tot: n ? tot : null, toPar: n ? tot - par * n : null, order: idx };
    });
    rows.sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      if (a.n && b.n && a.toPar !== b.toPar) return a.toPar - b.toPar;
      return a.order - b.order;
    });
    rows.forEach(function (r, i) {
      if (!r.n) { r.pos = ""; return; }
      var p = i; while (p > 0 && rows[p - 1].n === r.n && rows[p - 1].toPar === r.toPar) p--;
      var tied = (i > 0 && rows[i - 1].n === r.n && rows[i - 1].toPar === r.toPar) || (i < rows.length - 1 && rows[i + 1].n === r.n && rows[i + 1].toPar === r.toPar);
      r.pos = (tied ? "T" : "") + (p + 1);
      r.rank = p + 1;
    });
    var title = String(cfg.roundTitle || "").trim();
    if (!title) title = (played.length >= total && total > 1) ? "FINAL ROUND" : "ROUND " + Math.max(1, played.length);
    return { rows: rows, played: played, title: title.toUpperCase(), total: total };
  }

  function orderedPlayers() {
    return Object.keys(players).map(function (id) { return Object.assign({ id: id }, players[id]); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : 1); });
  }

  // ---------------- drawing (same layout as the Photoshop script) ----------------
  var C = { green: "#0E4A32", dark: "#1C3A2B", grey: "#E4E8E5", alt: "#F3F6F4", white: "#FFFFFF", cream: "#FDF5D6",
            gold: "#E6B422", red: "#CF2E2E", muted: "#6B7A72", sub: "#B9D3C5", line: "#D5DBD7" };
  var L = { scale: 0.9, rightMargin: 24, radius: 20, pad: 22, posW: 60, nameGap: 12, nameW: 270, nameMin: 225,
            roundW2: 56, roundW: 46, totW: 66, parW: 58, headerH: 280, colHeadH: 36, footerH: 72, maxRowH: 84, cardOpacity: 0.8 };
  var FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

  function getImage(slot) {
    var src = imgData[slot]; if (!src) return null;
    if (!images[slot] || images[slot]._src !== src) {
      var im = new Image(); im._src = src; im.onload = schedule; im.onerror = function () { im._failed = true; schedule(); };
      im.src = src; images[slot] = im;
    }
    var img = images[slot];
    return (img.complete && img.naturalWidth && !img._failed) ? img : null;
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  function draw(model) {
    var cv = $("board"), ctx = cv.getContext("2d"), W = 1080, H = 1350, S = L.scale;
    function z(v) { return Math.round(v * S); }
    ctx.clearRect(0, 0, W, H);

    // photo
    var photo = getImage("photo");
    if (photo) {
      var zoom = Math.max(1, (num(cfg.photoZoom) || 100) / 100);
      var sc = Math.max(W / photo.naturalWidth, H / photo.naturalHeight) * zoom;
      var dw = photo.naturalWidth * sc, dh = photo.naturalHeight * sc;
      var fx = (num(cfg.photoX) == null ? 15 : num(cfg.photoX)) / 100, fy = (num(cfg.photoY) == null ? 40 : num(cfg.photoY)) / 100;
      ctx.drawImage(photo, (W - dw) * fx, (H - dh) * fy, dw, dh);
    } else {
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#9DB0A4"); g.addColorStop(1, "#4D6B5A");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "bold 30px " + FONT; ctx.textAlign = "left";
      ctx.fillText("Upload a background photo", 40, H - 60);
    }

    var rows = model.rows.slice(0, Math.max(1, num(cfg.show) || 10));
    var nR = model.played.length, nRows = Math.max(1, rows.length);
    var roundW = z(nR <= 2 ? L.roundW2 : L.roundW);
    var nameW = z(Math.max(L.nameMin, L.nameW - 15 * Math.max(0, nR - 2)));
    var pad = z(L.pad), posW = z(L.posW), gap = z(L.nameGap), totW = z(L.totW), parW = z(L.parW);
    var cardW = Math.min(pad * 2 + posW + gap + nameW + nR * roundW + totW + parW, W - 40);
    var R = W - z(L.rightMargin), X = R - cardW;
    var headerH = z(L.headerH), colHeadH = z(L.colHeadH), footerH = z(L.footerH);
    var rowH = Math.min(z(L.maxRowH), Math.floor((H - z(80) - headerH - colHeadH - footerH) / nRows));
    var rs = rowH / L.maxRowH;
    var cardH = headerH + colHeadH + rowH * nRows + footerH;
    var Y = Math.round((H - cardH) / 2), radius = z(L.radius);

    var parR = R - pad, totC = parR - parW - totW / 2, firstRight = totC - totW / 2, roundC = [];
    for (var i = 0; i < nR; i++) roundC.push(firstRight - (nR - i - 0.5) * roundW);
    var posC = X + pad + posW / 2, nameX = X + pad + posW + gap;

    function txt(str, x, y, size, color, bold, align, maxW) {
      str = String(str); var s = Math.round(size * 10) / 10;
      ctx.font = (bold ? "bold " : "") + s + "px " + FONT;
      if (maxW) { var w = ctx.measureText(str).width; if (w > maxW) { s = Math.max(8, Math.floor(s * maxW / w * 10) / 10); ctx.font = (bold ? "bold " : "") + s + "px " + FONT;
        while (ctx.measureText(str).width > maxW && s > 8) { s -= 0.5; ctx.font = (bold ? "bold " : "") + s + "px " + FONT; } } }
      ctx.fillStyle = color; ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(str, x, y);
    }

    // shadow, cut out under the card
    var sh = document.createElement("canvas"); sh.width = W; sh.height = H; var q = sh.getContext("2d");
    q.filter = "blur(" + z(18) + "px)"; q.fillStyle = "#000"; rr(q, X, Y + z(10), cardW, cardH, radius); q.fill();
    q.filter = "none"; q.globalCompositeOperation = "destination-out"; rr(q, X, Y, cardW, cardH, radius); q.fill();
    ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(sh, 0, 0); ctx.restore();

    // card
    ctx.save(); ctx.globalAlpha = L.cardOpacity; ctx.fillStyle = C.green; rr(ctx, X, Y, cardW, cardH, radius); ctx.fill(); ctx.restore();

    // header
    var logo = getImage("logo");
    var lx = X + z(24), ly = Y + z(22), lw = cardW - z(48), lh = z(140);
    if (logo) {
      var ls = Math.min(lw / logo.naturalWidth, lh / logo.naturalHeight), ldw = logo.naturalWidth * ls, ldh = logo.naturalHeight * ls;
      ctx.drawImage(logo, lx + (lw - ldw) / 2, ly + (lh - ldh) / 2, ldw, ldh);
    } else {
      ctx.fillStyle = C.dark; ctx.fillRect(X + Math.round(cardW / 2) - z(230), ly, z(460), lh);
      txt("EVENT LOGO", X + cardW / 2, ly + lh / 2 + z(8), 22 * S, C.sub, true, "center");
    }
    var vd = String(cfg.venue || "").toUpperCase() + (cfg.dates ? (cfg.venue ? "  •  " : "") + cfg.dates : "");
    if (vd) txt(vd, X + cardW / 2, Y + z(196), 18 * S, C.sub, false, "center", cardW - z(56));
    var halfW = (cardW - z(56)) / 2 - z(8);
    txt(model.title, X + z(28), Y + z(250), 36 * S, C.white, true, "left", halfW);
    txt(String(cfg.tag || "LEADERBOARD").toUpperCase(), R - z(28), Y + z(250), 36 * S, C.gold, true, "right", halfW);

    // column headers
    var ty = Y + headerH;
    ctx.fillStyle = C.grey; ctx.fillRect(X, ty, cardW, colHeadH);
    var lb = ty + Math.round(colHeadH * 0.66), lf = 14 * S;
    txt("POS", posC, lb, lf, C.muted, true, "center");
    txt("PLAYER", nameX, lb, lf, C.muted, true, "left");
    model.played.forEach(function (k, j) { txt(k.toUpperCase(), roundC[j], lb, Math.min(lf, roundW * 0.32), C.muted, true, "center"); });
    txt("TOT", totC, lb, lf, C.muted, true, "center");
    txt("PAR", parR, lb, lf, C.muted, true, "right");

    // rows
    var fRound = Math.min(21 * rs, roundW * 0.44), fName = 24 * rs, fClub = 16 * rs, fPos = 28 * rs, fTot = 26 * rs;
    rows.forEach(function (r, ri) {
      var y = ty + colHeadH + ri * rowH, lead = r.rank === 1;
      ctx.fillStyle = lead ? C.cream : (ri % 2 ? C.alt : C.white); ctx.fillRect(X, y, cardW, rowH);
      if (lead) { ctx.fillStyle = C.gold; ctx.fillRect(X, y, Math.max(4, z(7)), rowH); }
      var base = y + rowH * 0.636;
      txt(r.pos, posC, base, fPos, C.dark, true, "center", posW - 4);
      txt(r.name.toUpperCase(), nameX, y + rowH * 0.5, fName, C.dark, true, "left", nameW - z(8));
      if (r.club) txt(r.club, nameX, y + rowH * 0.795, fClub, C.muted, false, "left", nameW - z(8));
      r.scores.forEach(function (s, j) { txt(s === null ? "–" : s, roundC[j], base, fRound, C.muted, false, "center", roundW - z(6)); });
      if (r.tot !== null) txt(r.tot, totC, base, fTot, C.dark, true, "center", totW - 4);
      if (r.toPar !== null) txt(fmtPar(r.toPar), parR, base, fTot, r.toPar < 0 ? C.red : C.dark, true, "right", parW - 2);
      ctx.fillStyle = C.line; ctx.fillRect(X, y + rowH - 1, cardW, 1);
    });

    // footer
    var fy = ty + colHeadH + rowH * nRows, fbh = Math.round(footerH * 0.46), fbw = cardW - z(80);
    if (footerImg.complete && footerImg.naturalWidth) {
      var fs = Math.min(fbw / footerImg.naturalWidth, fbh / footerImg.naturalHeight), fw = footerImg.naturalWidth * fs, fh = footerImg.naturalHeight * fs;
      ctx.drawImage(footerImg, X + z(40) + (fbw - fw) / 2, fy + (footerH - fh) / 2, fw, fh);
    }
  }

  // ---------------- render loop ----------------
  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; renderAll(); }); }

  function currentList() {
    var list = orderedPlayers();
    var example = !list.some(function (p) { return String(p.name || "").trim(); });
    if (example) list = EXAMPLE.map(function (e, i) { return { name: e[0], club: e[1], r1: e[2], r2: e[3], order: i }; });
    return { list: list, example: example };
  }

  function renderAll() {
    var cur = currentList(), model = compute(cur.list);
    draw(model);
    $("exampleBadge").hidden = !cur.example;
    $("dlPng").disabled = cur.example;
    $("dlCsv").disabled = cur.example;
    var real = compute(orderedPlayers());
    $("roundInfo").textContent = real.played.length ? model.title.charAt(0) + model.title.slice(1).toLowerCase() + " · " + real.played.length + " of " + real.total + " rounds in" : "No scores yet";
    renderTable(real);
    renderImages();
  }

  // ---------------- table ----------------
  var domOrder = "";
  function renderTable(model) {
    var list = orderedPlayers(), tb = $("tbody");
    $("emptyRow").hidden = list.length > 0;
    $("playerCount").textContent = list.length ? list.length + (list.length === 1 ? " player" : " players") : "";
    var byId = {}; model.rows.forEach(function (r) { byId[r.src.id] = r; });
    var order = list.map(function (p) { return p.id; }).join("|");
    if (order !== domOrder) {
      var act = document.activeElement, keep = act && act.dataset && act.dataset.pid ? { id: act.dataset.pid, f: act.dataset.f, s: act.selectionStart, e: act.selectionEnd } : null;
      tb.textContent = "";
      list.forEach(function (p) { tb.appendChild(buildRow(p)); });
      domOrder = order;
      if (keep) { var el = tb.querySelector('input[data-pid="' + keep.id + '"][data-f="' + keep.f + '"]'); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    }
    list.forEach(function (p) {
      var tr = tb.querySelector('tr[data-pid="' + p.id + '"]'); if (!tr) return;
      tr.querySelectorAll("input[data-f]").forEach(function (inp) {
        if (inp === document.activeElement) return;
        var v = p[inp.dataset.f]; v = v == null ? "" : String(v);
        if (inp.value !== v) inp.value = v;
      });
      var r = byId[p.id];
      tr.querySelector(".pos").textContent = r && r.pos ? r.pos : "";
      tr.classList.toggle("top", !!(r && r.rank === 1));
      tr.querySelector(".tot").textContent = r && r.tot !== null ? r.tot : "";
      var pc = tr.querySelector(".par"); pc.textContent = r && r.toPar !== null ? fmtPar(r.toPar) : ""; pc.classList.toggle("under", !!(r && r.toPar < 0));
    });
  }

  function buildRow(p) {
    var tr = document.createElement("tr"); tr.dataset.pid = p.id;
    var td = document.createElement("td"); td.className = "pos"; tr.appendChild(td);
    [["name", "Player name"], ["club", "Home club"]].forEach(function (f) {
      var c = document.createElement("td"), i = document.createElement("input");
      i.type = "text"; i.id = "p-" + p.id + "-" + f[0]; i.dataset.pid = p.id; i.dataset.f = f[0]; i.setAttribute("aria-label", f[1]); i.autocomplete = "off";
      i.disabled = !canWrite; c.appendChild(i); tr.appendChild(c);
    });
    ROUNDS.forEach(function (k) {
      var c = document.createElement("td"), i = document.createElement("input"); c.className = "sc";
      i.type = "text"; i.inputMode = "numeric"; i.id = "p-" + p.id + "-" + k; i.dataset.pid = p.id; i.dataset.f = k; i.maxLength = 3;
      i.setAttribute("aria-label", k.toUpperCase() + " score"); i.disabled = !canWrite; c.appendChild(i); tr.appendChild(c);
    });
    var t1 = document.createElement("td"); t1.className = "calc tot"; tr.appendChild(t1);
    var t2 = document.createElement("td"); t2.className = "calc par"; tr.appendChild(t2);
    var t3 = document.createElement("td"), b = document.createElement("button");
    b.type = "button"; b.className = "icon"; b.textContent = "×"; b.title = "Remove player"; b.setAttribute("aria-label", "Remove player"); b.disabled = !canWrite;
    b.addEventListener("click", function () {
      if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Remove"; setTimeout(function () { b.classList.remove("armed"); b.textContent = "×"; }, 3000); return; }
      removePlayer(p.id);
    });
    t3.appendChild(b); tr.appendChild(t3);
    return tr;
  }

  $("tbody").addEventListener("input", function (e) {
    var i = e.target; if (!i.dataset || !i.dataset.pid) return;
    var id = i.dataset.pid, f = i.dataset.f, v = i.value;
    if (ROUNDS.indexOf(f) >= 0) { v = v.replace(/[^0-9]/g, ""); if (v !== i.value) i.value = v; }
    if (!players[id]) return;
    players[id] = Object.assign({}, players[id]); players[id][f] = v;
    queueWrite(id, (function () { var o = {}; o[f] = v; return o; })());
    schedule();
  });
  // Enter moves down the same column, like a scorecard
  $("tbody").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return; var i = e.target; if (!i.dataset || !i.dataset.f) return;
    e.preventDefault(); var tr = i.closest("tr").nextElementSibling;
    if (tr) { var n = tr.querySelector('input[data-f="' + i.dataset.f + '"]'); if (n) { n.focus(); n.select(); } }
  });

  // ---------------- edits (saved locally) ----------------
  function queueWrite() { persist(); }
  function addPlayer(data, silent) {
    var id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    players[id] = Object.assign({ name: "", club: "", r1: "", r2: "", r3: "", r4: "", order: Date.now() + Math.random() }, data || {});
    persist(); if (!silent) schedule();
    return id;
  }
  function removePlayer(id) { delete players[id]; persist(); schedule(); }
  $("addPlayer").addEventListener("click", function () {
    var id = addPlayer({}); setTimeout(function () { var el = document.querySelector('input[data-pid="' + id + '"][data-f="name"]'); if (el) el.focus(); }, 50);
  });
  $("clearAll").addEventListener("click", function () { var n = Object.keys(players).length; if (!n) return; $("clearN").textContent = n; $("clearConfirm").hidden = false; });
  $("clearNo").addEventListener("click", function () { $("clearConfirm").hidden = true; });
  $("clearYes").addEventListener("click", function () { $("clearConfirm").hidden = true; Object.keys(players).forEach(removePlayer); toast("All players removed"); });

  // ---------------- config ----------------
  function saveCfg(fields) { Object.assign(cfg, fields); persist(); schedule(); }
  var cfgInputs = { tournament: "text", venue: "text", dates: "text", par: "num", totalRounds: "num", show: "num", roundTitle: "text", photoX: "num", photoY: "num", photoZoom: "num" };
  Object.keys(cfgInputs).forEach(function (k) {
    var el = $(k);
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () {
      var o = {}; o[k] = cfgInputs[k] === "num" ? (num(el.value) == null ? DEFAULT_CFG[k] : num(el.value)) : el.value; saveCfg(o);
    });
  });
  function fillCfgInputs() {
    Object.keys(cfgInputs).forEach(function (k) { var el = $(k); if (el === document.activeElement) return; var v = cfg[k] == null ? "" : String(cfg[k]); if (el.value !== v) el.value = v; });
  }

  // ---------------- images ----------------
  function renderImages() {
    $("logoThumb").style.backgroundImage = imgData.logo ? 'url("' + imgData.logo + '")' : "none";
    $("photoThumb").style.backgroundImage = imgData.photo ? 'url("' + imgData.photo + '")' : "none";
    $("logoBtn").textContent = imgData.logo ? "Replace logo" : "Upload logo";
    $("photoBtn").textContent = imgData.photo ? "Replace photo" : "Upload photo";
  }
  function shrink(file, maxW, type, quality) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, maxW / im.naturalWidth), c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error("encode")); }, type, quality);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("That file isn't an image this browser can open. Use JPG or PNG.")); };
      im.src = url;
    });
  }
  function toDataURL(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  function wireUpload(btn, input, slot, maxW, type) {
    $(btn).addEventListener("click", function () { $(input).click(); });
    $(input).addEventListener("change", function () {
      var f = this.files && this.files[0]; this.value = ""; if (!f) return;
      var b = $(btn); b.disabled = true;
      shrink(f, maxW, type, 0.88).then(toDataURL).then(function (url) {
        imgData[slot] = url; schedule();
        var kept = persistImage(slot);
        toast((slot === "logo" ? "Logo" : "Photo") + " updated" + (kept ? "" : " – too big to remember after closing"));
      }).catch(function (e) { toast(e && e.message ? e.message : "That image didn't load. Try a JPG or PNG."); })
        .then(function () { b.disabled = false; renderImages(); });
    });
  }
  wireUpload("logoBtn", "logoFile", "logo", 1400, "image/png");
  wireUpload("photoBtn", "photoFile", "photo", 1620, "image/jpeg");

  // ---------------- paste import ----------------
  function parseTable(text) {
    var lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/).filter(function (l) { return l.trim(); });
    var meta = {}, rows = [], header = null;
    lines.forEach(function (l) {
      var delim = l.indexOf("\t") >= 0 ? "\t" : ((l.split(";").length > l.split(",").length) ? ";" : ",");
      var cells = splitLine(l, delim).map(function (c) { return c.trim(); });
      if (/^#/.test(cells[0])) { meta[cells[0].slice(1).toUpperCase()] = cells.slice(1).filter(Boolean).join(", "); return; }
      if (!cells.some(Boolean)) return;
      var up = cells.map(function (c) { return c.toUpperCase(); });
      if (!header && up.some(function (c) { return c === "NAME" || c === "PLAYER" || c === "PLAYER NAME"; })) { header = up.map(normH); return; }
      rows.push(cells);
    });
    var out = rows.map(function (c) {
      var p = {};
      if (header) header.forEach(function (h, i) { if (h) p[h] = c[i] || ""; });
      else { p.name = c[0] || ""; p.club = c[1] || ""; ROUNDS.forEach(function (k, i) { p[k] = c[i + 2] || ""; }); }
      ROUNDS.forEach(function (k) { p[k] = num(p[k]) === null ? "" : String(num(p[k])); });
      return { name: p.name || "", club: p.club || "", r1: p.r1 || "", r2: p.r2 || "", r3: p.r3 || "", r4: p.r4 || "" };
    }).filter(function (p) { return p.name.trim(); });
    return { players: out, meta: meta };
  }
  function normH(h) {
    var m = h.match(/^(R|RD|RND|ROUND)\s*(\d)$/); if (m && +m[2] >= 1 && +m[2] <= 4) return "r" + m[2];
    if (h === "NAME" || h === "PLAYER" || h === "PLAYER NAME") return "name";
    if (h === "CLUB" || h === "HOME CLUB" || h === "GOLF CLUB") return "club";
    return "";
  }
  function splitLine(l, d) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < l.length; i++) { var ch = l.charAt(i);
      if (ch === '"') { if (q && l.charAt(i + 1) === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === d && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur); return out;
  }
  function doImport(replace) {
    var res = parseTable($("pasteBox").value);
    if (!res.players.length) { $("pasteMsg").textContent = "No players found. Put one player per line: name, club, then the round scores."; return; }
    if (replace) Object.keys(players).forEach(removePlayer);
    var base = Date.now();
    res.players.forEach(function (p, i) { p.order = base + i; addPlayer(p, true); });
    var m = res.meta, o = {};
    if (m.TOURNAMENT) o.tournament = m.TOURNAMENT; if (m.VENUE) o.venue = m.VENUE; if (m.DATES) o.dates = m.DATES; if (num(m.PAR) !== null) o.par = num(m.PAR);
    if (num(m.ROUNDS) !== null) o.totalRounds = Math.min(4, num(m.ROUNDS)); if (num(m.SHOW) !== null) o.show = num(m.SHOW);
    if (Object.keys(o).length) { saveCfg(o); fillCfgInputs(); }
    $("pasteBox").value = ""; $("pasteMsg").textContent = "";
    toast((replace ? "Replaced with " : "Added ") + res.players.length + " players");
    schedule();
  }
  $("pasteReplace").addEventListener("click", function () { doImport(true); });
  $("pasteAdd").addEventListener("click", function () { doImport(false); });

  // ---------------- downloads ----------------
  function safeName(s) { return String(s).replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_") || "Leaderboard"; }
  function saveFile(name, blob) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  // ---------------- download + bank ----------------
  var NAME_KEY = "golfrsa-leaderboard-name", BANK_KEY = "golfrsa-leaderboard-bank";
  var bank = window.GolfBank || { enabled: false };
  (function setupBankUi() {
    var nameEl = $("createdBy"), tick = $("toBank");
    try { nameEl.value = (store && store.getItem(NAME_KEY)) || ""; tick.checked = !store || store.getItem(BANK_KEY) !== "off"; } catch (e) {}
    nameEl.addEventListener("input", function () { try { store && store.setItem(NAME_KEY, nameEl.value); } catch (e) {} });
    tick.addEventListener("change", function () { try { store && store.setItem(BANK_KEY, tick.checked ? "on" : "off"); } catch (e) {} });
    if (!bank.enabled) { $("bankOpts").hidden = true; $("bankOff").hidden = false; }
  })();
  function thumbBlob() {
    return new Promise(function (res) {
      var c = document.createElement("canvas"); c.width = 360; c.height = 450;
      c.getContext("2d").drawImage($("board"), 0, 0, 360, 450);
      c.toBlob(function (b) { res(b); }, "image/jpeg", 0.82);
    });
  }
  $("dlPng").addEventListener("click", function () {
    var btn = this, model = compute(orderedPlayers());
    var toBank = bank.enabled && $("toBank").checked;
    var tName = String(cfg.tournament || "").trim();
    if (toBank && !tName) { toast("Add the tournament name first so the download can be filed in the bank."); $("tournament").focus(); return; }
    draw(model);
    $("board").toBlob(function (blob) {
      if (!blob) { toast("Couldn't create the image. Try again."); return; }
      saveFile("Leaderboard_" + safeName(tName || "") + (tName ? "_" : "") + safeName(model.title) + ".png", blob);
      if (!toBank) { toast("PNG downloaded"); return; }
      btn.disabled = true; setStatus("saving", "Filing in the download bank…");
      var leader = model.rows[0] && model.rows[0].n ? model.rows[0].name : "";
      thumbBlob().then(function (thumb) {
        return bank.fileDownload(blob, thumb, {
          tournament: tName, venue: cfg.venue, dates: cfg.dates, round_title: model.title,
          rounds_played: model.played.length, leader: leader, created_by: $("createdBy").value.trim()
        });
      }).then(function () { toast("PNG downloaded and filed in the bank"); })
        .catch(function (e) { toast("PNG downloaded, but it couldn't be filed in the bank" + (e && e.message ? ": " + e.message : ".")); })
        .then(function () { btn.disabled = false; refreshStatus(); });
    }, "image/png");
  });
  $("dlCsv").addEventListener("click", function () {
    var model = compute(orderedPlayers());
    function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = ["#TOURNAMENT," + q(cfg.tournament), "#VENUE," + q(cfg.venue), "#DATES," + q(cfg.dates), "#PAR," + cfg.par, "#ROUNDS," + cfg.totalRounds, "#SHOW," + cfg.show];
    if (cfg.roundTitle) lines.push("#ROUND," + q(cfg.roundTitle));
    lines.push("POS,NAME,CLUB,R1,R2,R3,R4,TOT,PAR");
    model.rows.forEach(function (r) {
      var p = r.src; lines.push(["", q(r.name), q(r.club), p.r1 || "", p.r2 || "", p.r3 || "", p.r4 || "", "", ""].join(","));
    });
    saveFile("Leaderboard_Scores.csv", new Blob(["\uFEFF" + lines.join("\n") + "\n"], { type: "text/csv" })); toast("CSV downloaded");
  });

  // ---------------- boot ----------------
  load(); fillCfgInputs(); renderAll(); refreshStatus();
})();
