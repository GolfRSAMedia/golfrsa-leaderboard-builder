// Shared helpers for the download bank (Supabase). Used by index.html and bank.html.
(function () {
  "use strict";
  var cfg = window.GOLFRSA_CONFIG || {};
  var client = null;
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient) {
    try { client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } }); }
    catch (e) { client = null; }
  }
  var BUCKET = cfg.bucket || "leaderboards";
  var TZ = cfg.timeZone || "Africa/Johannesburg";

  function slug(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "leaderboard";
  }

  // "2026-11" in South African time, so a late-night download lands in the right month
  function monthKey(date) {
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(date || new Date());
    var y = "", m = "";
    p.forEach(function (x) { if (x.type === "year") y = x.value; if (x.type === "month") m = x.value; });
    return y + "-" + m;
  }

  function monthLabel(key) {
    var parts = String(key).split("-");
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, 15));
    return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  }

  function dateTimeLabel(iso) {
    return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  }

  function publicUrl(path, downloadName) {
    if (!client || !path) return "";
    var opts = downloadName ? { download: downloadName } : undefined;
    return client.storage.from(BUCKET).getPublicUrl(path, opts).data.publicUrl;
  }

  // Upload the PNG (+ small JPEG thumbnail) and record it. Resolves with the new row.
  function fileDownload(png, thumb, meta) {
    if (!client) return Promise.reject(new Error("The download bank isn't set up yet."));
    var month = monthKey(new Date());
    var stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var base = month + "/" + slug(meta.tournament) + "_" + slug(meta.round_title) + "_" + stamp;
    var store = client.storage.from(BUCKET);
    return store.upload(base + ".png", png, { contentType: "image/png", upsert: false })
      .then(function (r) { if (r.error) throw r.error; return thumb ? store.upload(base + ".jpg", thumb, { contentType: "image/jpeg", upsert: false }) : { error: null }; })
      .then(function (r) {
        var row = {
          tournament: String(meta.tournament).slice(0, 120),
          venue: String(meta.venue || "").slice(0, 120),
          dates: String(meta.dates || "").slice(0, 60),
          round_title: String(meta.round_title || "").slice(0, 40),
          rounds_played: meta.rounds_played || 0,
          leader: String(meta.leader || "").slice(0, 80),
          created_by: String(meta.created_by || "").slice(0, 60),
          month: month,
          file_path: base + ".png",
          thumb_path: r.error ? null : base + ".jpg"
        };
        return client.from("downloads").insert(row).select().single();
      })
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  function listDownloads() {
    if (!client) return Promise.reject(new Error("The download bank isn't set up yet."));
    // newest first; pages of 1000 until done (plenty for years of tournaments)
    var all = [], size = 1000;
    function page(from) {
      return client.from("downloads").select("*").order("created_at", { ascending: false }).range(from, from + size - 1)
        .then(function (r) {
          if (r.error) throw r.error;
          all = all.concat(r.data || []);
          return (r.data || []).length === size ? page(from + size) : all;
        });
    }
    return page(0);
  }

  window.GolfBank = {
    enabled: !!client, fileDownload: fileDownload, listDownloads: listDownloads,
    publicUrl: publicUrl, monthKey: monthKey, monthLabel: monthLabel, dateTimeLabel: dateTimeLabel, slug: slug
  };
})();
