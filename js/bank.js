// Download bank page: lists every filed leaderboard by month and tournament.
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var B = window.GolfBank || { enabled: false };
  var rows = [], filt = { tournament: "", month: "", q: "" };

  function setStatus(s, t) { $("status").dataset.s = s; $("statusText").textContent = t; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

  if (!B.enabled) { $("setup").hidden = false; setStatus("warn", "Not connected"); return; }

  function load() {
    setStatus("saving", "Loading downloads…");
    B.listDownloads().then(function (data) {
      rows = data; $("overview").hidden = false; $("summaryPanel").hidden = false;
      fillFilters(); render();
      setStatus("saved", "Updated " + new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    }).catch(function (e) {
      setStatus("warn", "Couldn't load the bank" + (e && e.message ? ": " + e.message : ""));
    });
  }

  function fillFilters() {
    var tSel = $("fTourn"), mSel = $("fMonth");
    var tours = uniq(rows.map(function (r) { return r.tournament; })).sort(function (a, b) { return a.localeCompare(b); });
    var months = uniq(rows.map(function (r) { return r.month; })).sort().reverse();
    function opts(sel, list, label, fmt) {
      var keep = sel.value; sel.textContent = ""; sel.appendChild(new Option(label, ""));
      list.forEach(function (v) { sel.appendChild(new Option(fmt ? fmt(v) : v, v)); });
      sel.value = list.indexOf(keep) >= 0 ? keep : "";
    }
    opts(tSel, tours, "All tournaments"); opts(mSel, months, "All months", B.monthLabel);
    var now = B.monthKey(new Date());
    $("stTotal").textContent = rows.length;
    $("stTourn").textContent = tours.length;
    $("stMonth").textContent = rows.filter(function (r) { return r.month === now; }).length;
    $("stMonthLbl").textContent = B.monthLabel(now);
  }

  function matchesSearch(r) {
    if (!filt.q) return true;
    return [r.tournament, r.venue, r.dates, r.round_title, r.leader, r.created_by].join(" ").toLowerCase().indexOf(filt.q) >= 0;
  }
  function matches(r) {
    if (filt.tournament && r.tournament !== filt.tournament) return false;
    if (filt.month && r.month !== filt.month) return false;
    return matchesSearch(r);
  }

  function render() {
    var list = rows.filter(matches);
    $("showing").textContent = list.length === rows.length ? "Showing all " + rows.length : "Showing " + list.length + " of " + rows.length;
    $("none").hidden = list.length > 0 || rows.length === 0;
    renderSummary(rows.filter(matchesSearch));
    renderGallery(list);
    if (!rows.length) { $("gallery").textContent = ""; var p = el("p", "empty panel", "Nothing in the bank yet. Downloads from the builder will appear here."); $("gallery").appendChild(p); }
  }

  // month -> tournament -> {count, rounds, latest}
  function renderSummary(list) {
    var tb = $("sumBody"); tb.textContent = "";
    var byMonth = {};
    list.forEach(function (r) {
      var m = byMonth[r.month] || (byMonth[r.month] = {});
      var t = m[r.tournament] || (m[r.tournament] = { n: 0, rounds: [], latest: r.created_at });
      t.n++; if (r.round_title && t.rounds.indexOf(r.round_title) < 0) t.rounds.push(r.round_title);
      if (r.created_at > t.latest) t.latest = r.created_at;
    });
    Object.keys(byMonth).sort().reverse().forEach(function (mk) {
      var tours = byMonth[mk], total = 0; Object.keys(tours).forEach(function (k) { total += tours[k].n; });
      var mr = el("tr", "monthrow"); var td = el("td", null, B.monthLabel(mk)); td.colSpan = 2; mr.appendChild(td);
      var tn = el("td", "n", String(total)); mr.appendChild(tn); mr.appendChild(el("td")); tb.appendChild(mr);
      Object.keys(tours).sort(function (a, b) { return tours[b].latest.localeCompare(tours[a].latest); }).forEach(function (name) {
        var t = tours[name], tr = el("tr", "click");
        if (filt.tournament === name && filt.month === mk) tr.classList.add("on");
        tr.tabIndex = 0;
        tr.appendChild(el("td", null, name));
        tr.appendChild(el("td", "meta", t.rounds.slice().sort(roundOrder).join(", ")));
        tr.appendChild(el("td", "n", String(t.n)));
        tr.appendChild(el("td", "meta", B.dateTimeLabel(t.latest)));
        function pick() {
          var same = filt.tournament === name && filt.month === mk;
          filt.tournament = same ? "" : name; filt.month = same ? "" : mk;
          $("fTourn").value = filt.tournament; $("fMonth").value = filt.month; render();
          if (!same) $("gallery").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        }
        tr.addEventListener("click", pick);
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        tb.appendChild(tr);
      });
    });
  }
  function roundOrder(a, b) { function k(s) { return /FINAL/.test(s) ? 99 : (parseInt(String(s).replace(/\D/g, ""), 10) || 50); } return k(a) - k(b); }

  function renderGallery(list) {
    var g = $("gallery"); g.textContent = "";
    var byMonth = {};
    list.forEach(function (r) { (byMonth[r.month] || (byMonth[r.month] = [])).push(r); });
    Object.keys(byMonth).sort().reverse().forEach(function (mk) {
      var sec = el("section", "stack"); sec.style.gap = "10px";
      var h = el("h2", "month-h", B.monthLabel(mk)); h.appendChild(el("span", null, byMonth[mk].length + (byMonth[mk].length === 1 ? " download" : " downloads")));
      sec.appendChild(h);
      var grid = el("div", "cards");
      byMonth[mk].forEach(function (r) { grid.appendChild(card(r)); });
      sec.appendChild(grid); g.appendChild(sec);
    });
  }

  function card(r) {
    var c = el("article", "dl");
    var full = B.publicUrl(r.file_path);
    var a = el("a", "thumb"); a.href = full; a.target = "_blank"; a.rel = "noopener";
    a.setAttribute("aria-label", "Open " + r.tournament + " " + (r.round_title || "") + " full size");
    var img = new Image(); img.loading = "lazy"; img.alt = ""; img.src = B.publicUrl(r.thumb_path || r.file_path); a.appendChild(img);
    c.appendChild(a);
    var info = el("div", "info");
    info.appendChild(el("span", "r", r.round_title || "Leaderboard"));
    info.appendChild(el("span", "t", r.tournament));
    if (r.venue) info.appendChild(el("span", "m", r.venue));
    if (r.leader) info.appendChild(el("span", "m", "Leader: " + r.leader));
    info.appendChild(el("span", "m", B.dateTimeLabel(r.created_at) + (r.created_by ? " · " + r.created_by : "")));
    var acts = el("div", "acts");
    var dl = el("a", "primary", "Download");
    dl.href = B.publicUrl(r.file_path, (B.slug(r.tournament) + "_" + B.slug(r.round_title) + ".png")); dl.rel = "noopener";
    var op = el("a", null, "Open"); op.href = full; op.target = "_blank"; op.rel = "noopener";
    acts.appendChild(dl); acts.appendChild(op); info.appendChild(acts);
    c.appendChild(info);
    return c;
  }

  $("fTourn").addEventListener("change", function () { filt.tournament = this.value; render(); });
  $("fMonth").addEventListener("change", function () { filt.month = this.value; render(); });
  var qT; $("fSearch").addEventListener("input", function () { var v = this.value; clearTimeout(qT); qT = setTimeout(function () { filt.q = v.trim().toLowerCase(); render(); }, 150); });
  $("refresh").addEventListener("click", load);
  $("clearF").addEventListener("click", function () { filt = { tournament: "", month: "", q: "" }; $("fTourn").value = ""; $("fMonth").value = ""; $("fSearch").value = ""; render(); });

  load();
})();
