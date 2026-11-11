// =====================================================================
//  GolfRSA Leaderboard Builder for Photoshop
//  File > Scripts > Browse...  ->  pick this file  ->  pick your CSV
//
//  - Builds the whole leaderboard card from the CSV (any number of
//    round columns: R1, R2, R3, R4 ...).
//  - Card width is calculated from the number of rounds; text is sized
//    from the column widths and shrunk to fit where needed.
//  - Run it again with a new CSV and it deletes the old "LEADERBOARD"
//    group and rebuilds it, so the card resizes automatically.
//  - Your photo (layer named PHOTO) and logos (layers named LOGO and
//    FOOTER LOGO) are kept and repositioned, never deleted.
//  - LOGO = the tournament lockup. If it's missing you're asked to pick
//    the file. New tournament: right-click LOGO > Replace Contents (or
//    delete the layer and you'll be asked again).
//
//  DAILY WORKFLOW (one CSV for the whole tournament):
//    Keep columns R1,R2,R3,R4 in the file from day one. Fill in R1 on
//    day 1, add R2 scores on day 2, and so on. Only rounds that contain
//    scores appear on the card, so it widens itself each day.
//    POS, TOT and PAR can be left blank: the script adds up the rounds,
//    works out the score to par, sorts the field and assigns ties (T5).
//    Fill them in yourself only if you want to override the calculation.
//    You can paste the whole field: only the top #SHOW players are drawn.
//
//  CSV format:
//    Optional header lines first, starting with #:
//      #VENUE,Selborne Golf Club
//      #DATES,31 Oct - 2 Nov 2026
//      #PAR,72            (course par per round)
//      #ROUNDS,4          (total rounds -> last day reads FINAL ROUND)
//      #SHOW,10           (players to show)
//      #ROUND,Round 2     (optional; set automatically if left out)
//      #TAG,Leaderboard
//      #FOOTER,GOLFRSA
//    Then the table:
//      POS,NAME,CLUB,R1,R2,R3,R4,TOT,PAR
// =====================================================================
#target photoshop

var CFG = {
    docW: 1080, docH: 1350,
    scale: 0.9,               // overall card size (1 = original). Also adapts to document width.
    rightMargin: 24,          // gap between card and right edge
    radius: 20,
    pad: 22,                  // inner side padding
    posW: 60,                 // position column
    nameGap: 12,              // space between position and player name
    nameW: 270,               // player column at 1-2 rounds (shrinks 15px per extra round)
    nameMin: 225,
    roundW2: 56,              // width of one round column when 1-2 rounds
    roundW: 46,               // width of one round column when 3+ rounds
    totW: 66, parW: 58,
    headerH: 280, colHeadH: 36, footerH: 72,
    maxRowH: 84,
    shadow: true,
    cardOpacity: 80,          // green card background opacity (%) - rows stay solid
    font: 'ArialMT',
    fontBold: 'Arial-BoldMT',
    colors: {
        green: '0E4A32', dark: '1C3A2B', grey: 'E4E8E5', alt: 'F3F6F4', white: 'FFFFFF',
        cream: 'FDF5D6', gold: 'E6B422', red: 'CF2E2E', muted: '6B7A72', sub: 'B9D3C5', line: 'D5DBD7'
    },
    meta: {
        VENUE: 'SELBORNE GOLF CLUB', DATES: '31 Oct \u2013 2 Nov 2026',
        ROUND: '', TAG: 'LEADERBOARD', PAR: '72', ROUNDS: '4', SHOW: '10', FOOTER: 'GOLFRSA'
    }
};

var doc, data;

function cTID(s) { return charIDToTypeID(s); }
function sTrim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
function col(hex) { var c = new SolidColor(); c.rgb.hexValue = hex; return c; }

// ---------- CSV ----------
var DELIM = ',';

function parseLine(l) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < l.length; i++) {
        var ch = l.charAt(i);
        if (ch == '"') { if (q && l.charAt(i + 1) == '"') { cur += '"'; i++; } else q = !q; }
        else if (ch == DELIM && !q) { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
}

function readText(f, enc) {
    f.encoding = enc; f.open('r');
    var t = f.read(); f.close();
    return t;
}

function countChar(s, ch) { var n = 0; for (var i = 0; i < s.length; i++) if (s.charAt(i) == ch) n++; return n; }

// Normalise column names: "Player" -> NAME, "Round 1" / "Rd1" -> R1, "Total" -> TOT, "To Par" -> PAR
function normHeader(h) {
    h = sTrim(h).toUpperCase().replace(/^"|"$/g, '');
    var m = h.match(/^(R|RD|RND|ROUND)\s*(\d+)$/);
    if (m) return 'R' + m[2];
    if (h == 'PLAYER' || h == 'PLAYER NAME' || h == 'NAMES') return 'NAME';
    if (h == 'TOTAL') return 'TOT';
    if (h == 'TO PAR' || h == '+/-' || h == 'SCORE') return 'PAR';
    if (h == 'POSITION' || h == 'P') return 'POS';
    if (h == 'GOLF CLUB' || h == 'HOME CLUB') return 'CLUB';
    return h;
}

function readCSV(f) {
    var txt = readText(f, 'UTF-8');
    // UTF-16 files (Excel "Unicode Text") read as text full of nulls
    if (txt.indexOf('\u0000') >= 0) txt = readText(f, 'UTF-16');
    // non-UTF-8 files (Excel "CSV (Comma delimited)") come through with replacement characters
    if (txt.indexOf('\uFFFD') >= 0) txt = readText(f, 'CP1252');
    txt = txt.replace(/^\uFEFF/, '');
    var lines = txt.split(/\r\n|\r|\n/);

    // detect the separator from the first table line (comma, semicolon or tab)
    for (var d = 0; d < lines.length; d++) {
        var probe = lines[d].replace(/^"/, '');
        if (!sTrim(probe) || probe.charAt(0) == '#') continue;
        var cs = countChar(probe, ','), ss = countChar(probe, ';'), ts = countChar(probe, '\t');
        DELIM = (ss > cs && ss >= ts) ? ';' : ((ts > cs && ts > ss) ? '\t' : ',');
        break;
    }

    var meta = {}, k;
    for (k in CFG.meta) meta[k] = CFG.meta[k];
    var header = null, rows = [];
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (!sTrim(l.split(DELIM).join('').replace(/"/g, ''))) continue;
        var lc = l.replace(/^"/, '');
        if (lc.charAt(0) == '#') {
            var p = parseLine(l);
            var key = sTrim(p[0]).replace(/^"?#/, '').replace(/"$/, '').toUpperCase();
            p.shift();
            var val = [];
            for (var v = 0; v < p.length; v++) if (sTrim(p[v])) val.push(sTrim(p[v]));
            meta[key] = val.join(', ');
            continue;
        }
        var cells = parseLine(l);
        if (!header) { header = []; for (var h = 0; h < cells.length; h++) header.push(normHeader(cells[h])); continue; }
        var row = {};
        for (var c = 0; c < header.length; c++) row[header[c]] = sTrim(cells[c] || '');
        rows.push(row);
    }
    if (!header) throw new Error('No table found in the CSV.');
    var hasName = false;
    for (var n = 0; n < header.length; n++) if (header[n] == 'NAME') hasName = true;
    if (!hasName) throw new Error('No NAME column found.\nColumns read: ' + header.join(' | ') +
        '\nSeparator detected: ' + (DELIM == '\t' ? 'tab' : DELIM) +
        '\nThe table header should be: POS,NAME,CLUB,R1,R2,R3,R4,TOT,PAR');
    var rounds = [];
    for (var j = 0; j < header.length; j++) if (/^R\d+$/.test(header[j])) rounds.push(header[j]);
    return { meta: meta, rows: rows, rounds: rounds };
}

// ---------- scoring ----------
function num(v) { v = sTrim(v || ''); return /^-?\d+$/.test(v) ? parseInt(v, 10) : null; }
function fmtPar(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }

function processData(d) {
    var coursePar = num(d.meta.PAR); if (coursePar === null) coursePar = 72;
    // only keep rounds that have at least one score
    var played = [];
    for (var i = 0; i < d.rounds.length; i++) {
        for (var r = 0; r < d.rows.length; r++) if (num(d.rows[r][d.rounds[i]]) !== null) { played.push(d.rounds[i]); break; }
    }
    d.rounds = played;
    // drop empty player lines
    var rows = [];
    for (r = 0; r < d.rows.length; r++) if (sTrim(d.rows[r].NAME || '')) rows.push(d.rows[r]);
    var autoPos = true;
    for (r = 0; r < rows.length; r++) if (sTrim(rows[r].POS || '')) { autoPos = false; break; }
    for (r = 0; r < rows.length; r++) {
        var row = rows[r], tot = 0, n = 0;
        for (i = 0; i < played.length; i++) { var s = num(row[played[i]]); if (s !== null) { tot += s; n++; } }
        row._tot = n ? tot : 99999;
        row._n = n;
        if (!sTrim(row.TOT || '') && n) row.TOT = String(tot);
        if (!sTrim(row.PAR || '') && n) row.PAR = fmtPar(tot - coursePar * n);
        row._toPar = n ? tot - coursePar * n : 99999;
        row._i = r;
    }
    if (autoPos) {
        // most rounds played first, then lowest to par, then CSV order
        rows.sort(function (a, b) { return (b._n - a._n) || (a._toPar - b._toPar) || (a._i - b._i); });
        for (r = 0; r < rows.length; r++) {
            var p = r;
            while (p > 0 && rows[p - 1]._toPar == rows[r]._toPar && rows[p - 1]._n == rows[r]._n) p--;
            var tied = (r > 0 && rows[r - 1]._toPar == rows[r]._toPar && rows[r - 1]._n == rows[r]._n) ||
                       (r < rows.length - 1 && rows[r + 1]._toPar == rows[r]._toPar && rows[r + 1]._n == rows[r]._n);
            rows[r].POS = rows[r]._n ? (tied ? 'T' : '') + (p + 1) : '';
        }
    }
    var show = num(d.meta.SHOW); if (show === null || show < 1) show = 10;
    d.rows = rows.slice(0, show);
    // automatic round title
    if (!sTrim(d.meta.ROUND || '')) {
        var total = num(d.meta.ROUNDS);
        d.meta.ROUND = (total !== null && played.length >= total && total > 1) ? 'FINAL ROUND' : 'ROUND ' + Math.max(1, played.length);
    }
    return d;
}

// File picker that filters by extension on both Mac (needs a function) and Windows (needs a mask)
function pickFile(title, exts) {
    var isMac = $.os.toLowerCase().indexOf('mac') >= 0;
    var re = new RegExp('\\.(' + exts.join('|') + ')$', 'i');
    var filter = isMac
        ? function (f) { return (f instanceof Folder) || re.test(f.name); }
        : title + ':*.' + exts.join(';*.');
    return File.openDialog(title, filter);
}

// ---------- drawing helpers ----------
function ellipseSel(x, y, w, h, add) {
    var d = new ActionDescriptor(), ref = new ActionReference();
    ref.putProperty(cTID('Chnl'), cTID('fsel'));
    d.putReference(cTID('null'), ref);
    var r = new ActionDescriptor();
    r.putUnitDouble(cTID('Top '), cTID('#Pxl'), y);
    r.putUnitDouble(cTID('Left'), cTID('#Pxl'), x);
    r.putUnitDouble(cTID('Btom'), cTID('#Pxl'), y + h);
    r.putUnitDouble(cTID('Rght'), cTID('#Pxl'), x + w);
    d.putObject(cTID('T   '), cTID('Elps'), r);
    d.putBoolean(cTID('AntA'), true);
    executeAction(cTID(add ? 'AddT' : 'setd'), d, DialogModes.NO);
}

function roundRectSel(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    doc.selection.select([[x + r, y], [x + w - r, y], [x + w - r, y + h], [x + r, y + h]]);
    doc.selection.select([[x, y + r], [x + w, y + r], [x + w, y + h - r], [x, y + h - r]], SelectionType.EXTEND);
    ellipseSel(x, y, 2 * r, 2 * r, true);
    ellipseSel(x + w - 2 * r, y, 2 * r, 2 * r, true);
    ellipseSel(x, y + h - 2 * r, 2 * r, 2 * r, true);
    ellipseSel(x + w - 2 * r, y + h - 2 * r, 2 * r, 2 * r, true);
}

function newLayer(group, name) { var l = group.artLayers.add(); l.name = name; doc.activeLayer = l; return l; }

function rect(group, name, x, y, w, h, hex) {
    var l = newLayer(group, name);
    doc.selection.select([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    doc.selection.fill(col(hex));
    doc.selection.deselect();
    return l;
}

function roundRect(group, name, x, y, w, h, r, hex) {
    var l = newLayer(group, name);
    roundRectSel(x, y, w, h, r);
    doc.selection.fill(col(hex));
    doc.selection.deselect();
    return l;
}

function circle(group, name, x, y, d, hex) {
    var l = newLayer(group, name);
    ellipseSel(x, y, d, d, false);
    doc.selection.fill(col(hex));
    doc.selection.deselect();
    return l;
}

function layerW(l) { var b = l.bounds; return b[2].as('px') - b[0].as('px'); }

// x,y = baseline anchor (left / centre / right depending on align)
function txt(group, name, str, x, y, size, hex, bold, align, maxW) {
    var l = group.artLayers.add();
    l.kind = LayerKind.TEXT;
    l.name = name;
    var t = l.textItem;
    t.justification = align == 'center' ? Justification.CENTER : (align == 'right' ? Justification.RIGHT : Justification.LEFT);
    t.contents = (str === '' ? ' ' : str);
    t.font = bold ? CFG.fontBold : CFG.font;
    t.size = Math.round(size * 10) / 10;
    t.color = col(hex);
    t.position = [x, y];
    if (maxW && str !== '') fitText(l, maxW, size);
    return l;
}

function fitText(l, maxW, size) {
    var w = layerW(l);
    if (w <= maxW) return;
    var s = Math.max(8, Math.floor(size * maxW / w * 10) / 10);
    l.textItem.size = s;
    var guard = 0;
    while (layerW(l) > maxW && s > 8 && guard++ < 20) { s -= 0.5; l.textItem.size = s; }
}

function findTop(name) {
    for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].name == name) return doc.layers[i];
    return null;
}

// Scale + centre a layer inside a box (used for LOGO / FOOTER LOGO / PHOTO)
function fitLayer(l, x, y, w, h, cover) {
    var b = l.bounds;
    var bw = b[2].as('px') - b[0].as('px'), bh = b[3].as('px') - b[1].as('px');
    if (bw <= 0 || bh <= 0) return;
    var s = cover ? Math.max(w / bw, h / bh) : Math.min(w / bw, h / bh);
    l.resize(s * 100, s * 100, AnchorPosition.MIDDLECENTER);
    b = l.bounds;
    var cx = (b[0].as('px') + b[2].as('px')) / 2, cy = (b[1].as('px') + b[3].as('px')) / 2;
    l.translate(x + w / 2 - cx, y + h / 2 - cy);
}

function placeFile(title, name) {
    var f = pickFile(title, ['png', 'jpg', 'jpeg', 'psd', 'psb', 'ai', 'pdf', 'svg', 'tif', 'tiff']);
    if (!f) return null;
    var d = new ActionDescriptor();
    d.putPath(cTID('null'), f);
    executeAction(cTID('Plc '), d, DialogModes.NO);
    doc.activeLayer.name = name;
    return doc.activeLayer;
}

function placePhoto() {
    var f = pickFile('STEP 2 of 3: Choose the background PHOTO (Cancel to skip)', ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'psd', 'heic']);
    if (!f) return null;
    var d = new ActionDescriptor();
    d.putPath(cTID('null'), f);
    executeAction(cTID('Plc '), d, DialogModes.NO);
    var l = doc.activeLayer;
    l.name = 'PHOTO';
    fitLayer(l, 0, 0, doc.width.as('px'), doc.height.as('px'), true);
    var bottom = doc.layers[doc.layers.length - 1];
    if (bottom != l) l.move(bottom, bottom.isBackgroundLayer ? ElementPlacement.PLACEBEFORE : ElementPlacement.PLACEAFTER);
    return l;
}

// ---------- built-in GolfRSA footer logo ----------
var GOLFRSA_LOGO_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAA4QAAACTCAYAAADWddeFAACMb0lEQVR42u2dd5xcVf3+359z78yW9EICIaEFkF6kCmpABGkKogliQbCAogKC/qzfb4gdC0qT' +
    'L6AiRdFEBZQOCqGH3hIBqYFAejbJ1pl7z+f3xz03uawpMzszu7O753m9rglmdnbm3nPPPc95Pp/nETw8PJg+fbqZsfM8Ye5OwowZUfd/bwhCLrr3ntGXPf63' +
    'fGNuyIThzU27rurs2Kylq3346y3LG1o6Wk0uCMNxQ0fuaCCnqEUkWNXR/uqqrs5lgQjbjBlfGNU4tG1UY+MygefmLn7z35/Z94DCOQd9fFUoUoj/+0OF7m+W' +
    'c85RRNRfKQ8PDw8PDw8Pj2pCBvsJUFVZx7nY0HnRdf1d/GK9P7JAw87zhLmzlBnYNeTPhJx0w282v2/+MxPG5IYf+syS18eHsFMul9uppaN9eFex2Bjmc6EG' +
    'BhWIVbFqk9EQdeOSQQDGABAag1EQq8SFogIdo5uHtecDM39VV9eTk8eMWzQ83/RwAXnigc9+d4mItL/9804JmTdOmTnTenLo4eHh4eFRlfXfhhfK/nnr4Qnh' +
    'gLrxzbq+r4jENXx/BdRPJnVIAqfNsimhD4HP3nLFVk/Mf2mPVR0dh7/VunLHnAn2XV5oawzyeWJRbKHoyJ64q6qKaqraaXrpBczbBoCgaLpx4B4+qoIxBhFQ' +
    'C4GBfI6cCbCFIs0S6pB8w/MYeWzrEWMfHt4w5J+3fvobz71trE6dGjAVmDYr9hfVw8PDw8NjvaTPrIfoxZWsH/06r1+t/ymR/FtPCAfuBKAbu8CqOgJoBoa5' +
    'czLc8QRdxzlaDRSBGFgFdAGrN/Q71jEhWT959PI4nznVMHcnZcYMC5CTgIOv/MHury9f9oHF7aver9YesFILQ9QYbBRBoQiIAtaNIQGMVve+SRiiogpOYsQA' +
    'hkCQhgbEWoaZPCI8PmHIyIdGDxn2t58fe8Ij7xq7/ao1A2jm1CD73Tw8PDzq5Dk8mKqQfMVQ/W3+60bWZsY9c0cAQeYailvrFZLLKVE1f6+HhyeEvUMA10m2' +
    'VHULYCKwFbCd+3NLYKSbDIa4PwVo2MCvs26SSAlhJ7DS/f0t4HXgVXe8AbwuIst78pk9Kh4YwqxpJlXRDHDsXy7Y4Zk3X//gitUrP9Jli/u1ikWtQlcXIBaw' +
    'JOzPaB/eH6JYRS2IoDYgHyJBQIMJaDK5l8Y3D71jwrDxf7z/lO/e2xUVWaN+AgONGG5oh7dPJ88qVRcM9ioNjzpdHPjxXa1WlPRQvJpUy7nFAHH3c6uqI4HJ' +
    'wARgW2BrYIvM2i9wfw8yxN64dV2X+/sK9/e3gMXAAuC1zN9fX9f9oqqBu/axv+Z9ei9OLOHZI0BRRN70hLAfLxK734iqOgbYDdgFmOII4ObAmBLffkML6nIW' +
    'ppGbQBYBTwKPAf8GnhWRZaVOaB49IILTphlmJURQVRveecl3jl60avlnVhY7D+ow0myjInQVQUyMJKWeWqf3gyTfwYIoaoUwMOQChpocTRI+PWn0uGsO2Gz7' +
    'v1xyzImvuBtBps6camb5clIPD48+eDaLiKrqWGCcew4O9I0ACyx137NdRDpLXL9IpgrFP/fLXwMG3ddMqjoReCfwbmA/ks3/STUcgyuAhY4gPgw8AfxbRJ4v' +
    '5fN61Gx8BCISq+pU4BJ3nwUbUPfFzVXvB551yrD1hLAf7DJnSaCqhsC+wHvcxdwZ2Gw9F92u5xxUZCrT7e8p1jf43gKeB+4GHgIeEJHV69hJ98phDxVBAT57' +
    '82UTH/jP859auHrFZ9pFt+2MXSmoEiOCQNAvT65iERRrhVxownyOoSa3YpMhI67fauToS/914rfnDARiqKpGRKyq7gMc5VR5qYOysABYKCL/52+6sgjCcSQb' +
    'dVE9Kr4ebxvfb4rIZem1K/N6hyISqep04BskLRbBIDhvq9z81AV0kGwELyKpFHrF/fkq8JKItK5HTfIVQz1bA+4OHAIc7eaYdW3+xxWsgXUDAsG63qPNXeu7' +
    'gNnA/SLyll/j9YloNAfYq4wfvVJETkrXH54Q1umF7TYBNAIHuYXi4SSlAN1v4LhbyYb0wUNCM5NJ+rDt/jnedJPGrcBtIrKo20PC16Nv+CwL50wJmDE7EuCz' +
    'N1y29eyXnjt9cduKT7cFOirqKkBkY0Q2NIH31+9uQS1CSEOeZjHRuCEjb99y9Jhf3v/p/70zQmE6ZjrTmdHPSkkzC8uvAufV2cebLyJb9mTBPBgXcI7YXw8c' +
    '489Iv8CLIrJdTxZFmfv2R8C3/Kl8GwrAMuA/JGrSU8CjwAvZ8+zJ4caJoKqOAo4FPkGiBjash/zVev2n3Q5ZxwbIcuAe4Hrg9m7kMPSqYc3UwSOBG50QZEok' +
    '/R3Aro7QDyqVUPpDXXi2oVdV9wemuYXFNvx3iWZ645s63knMHt0JYgtwB3AdcIuItHTb7fAPiCxmzgyYNi0W4NPXXTzp/ldePHNx26rPt5poWNxZAKsRiEEG' +
    'vCKhCTm0AfkczUGOMc3Dbt1u7ITzZp/4zTuSp+PMAKZaZ5bTnwjhF4AL3UM+qIPSMAPMFZE9PCEsixBeBZzg5unQn5m6RHqPPSEi+1ZICH8AfLtO7tteNZXp' +
    '9t+aUZPW9RzqdATxLvfsvy997mcIgx2sm8LdBQFVnQx80c0lE9ax/jN1UkmSVqR1J4grgH8AfwTuzHwvTwyr/8y5DTisjDkofTb9UkTOSomlJ4T1tRM0HPgo' +
    '8CmSnkDppgKaPlIAqzl52HWUmb7piOGVIvJIt93DwU0Mp083zJihgD66YEHzJ//6y9MXrFpxVptEm9iOLlAiRAIGn4lFMpasNTTkZEiQY5OG4X/dd5stvj/r' +
    'o2c/pQpTp84MZs2aFvcjQngacHGdEcJnRWRXTwjLejj/Afi4J4T9ghA+LiJ7VUgIfzjICGG11KS3gNuAmcBdaT/iYKwWyi7IVXUb4HTgZBIn+KwSWO+VP+tb' +
    '4z0CXA78KW0b8sSwaurg/sADZXKdlMAvI/EgWTyYVEJTbztB7mJad0Enuj6Ep4DfkpSIpo2f6YULB0AZYPpQCDIk15Lsfn0JeFhVb1XV41S1QURi15MTlBqs' +
    'OrDI4JSQGTNsKEZ3Of/rnzjs6u899sLqpT9e3dW+iW3vikAUkXCQOhomY8kYoRjHbW0d+mq09CN33vf6nD32u+bHDy1dOjwhg9PNmlxEDw8PD4/emp+Ne9aH' +
    'mWe+desaJfE/OAm42T37v6mqm7vnvnXPfTPQVUG3GRGr6lBVnUFiyneGI4NRpsKqP2z8rmuNp8A+wGXAk6p6lqqOEJEoXd/526UifDVj2lQOJ7LAWOAkR8oH' +
    'zTrJ1BkRVDcBbKOqvwKeBs4hcYmymZsoHMCmBOnEYdx3TctlPwD8FZijqid1J4aDRhUEYcbs6Og//HyHTX76hX/8p3XpNcs7Vu9g2ztjlMFMBFmnqZERMcU4' +
    'KswZ2fDS/NZvfuz9f338/cf+8YQwnGFBdOrUmf6h4+Hh4dH3JDHMxFOkhGdX4MfAM6r6K1XdqRsxlAGq8Kj7jlOBx4H/JYmGyK4BpZ+v8SSzrt0G+AXwhKqe' +
    'rarNbi0sA53816C60KrqjsCHM5sGZRu7A192GeV2sAgvpo5u/lhVN1XV77sJ4AxgVGYCMP1kJ6jaE0eYKY2wwO7AFSQ7hyepas6dOzOgJ46ZUwNmzLCqyjvO' +
    'O/OMu1/994Nvdaw+uqu9IyZSO0jLQzcee98Q0/DSJqF5eQSxWRUvWtw2+clnW/64w35X/Gn69OsnJGrhzMCrhR4eHh519dzPEoZRbk30qKr+UlUnZTaEzQAs' +
    '9xuhqr9zZbPbZdaBA+05n65r0+u8NfBz4DFV/USGGA/OarAexaeKAmcCuTLVwe4q4UTg4+79BgUpN3WgCsaq2uScBJ8AvksSFjpQJwB6rPasHagxibXyFcA9' +
    'qnqUK7MdiBOHMGVKyLRZ8XF/OG+bTX/+5Vtf6lj5q9aO9pF0RTEiwSAwjOnhmbMEhRzho5thsYiYIDTWtre3xa/Mbzv+939764nDPzpramCmxSDKdL8T6eHh' +
    '4VGHhCEtM2xyi90nVPVbqtqYPvcHABkM3XpwP+B+kl5By9r8OKlSH1/kjjjz/t17O23miNfxM1pjYrgDcI2q3qiqewy6arDK1MEtgI9lhKQexz+TqIS5waIS' +
    'mjpQBd8P3EdiK7+pJ4JlTxz7Azeq6p9U9R0DauJISkTVzJ4d7XTB10+4/ZVnHlnUsfKwqL0jcmETfnJcH6xAg6Vx3mawpBlyFhQUjDESiO2IFy/rGPfok4tn' +
    '7v7e314yf/78JmaI9SWkHh4eHtRrmWFKDMcAPwJmq+oB/b280K0JI1X9JEk+886szSs1FRDAOLOmzJbmhplNdrOOeDKTOYJ1/Ixk3j+qIknsvr47CnhQVX+Y' +
    'KSP1auGG1cEvkvSZ2go4RCq+7AR8xL1v4F1Ga2QfrKqbkvQHnspau1dPAnvmepgO4Db3kPiFiHT1a8vcmVMDps2KVTU36edf+dnirtYzCl1dYIk9ESxlOrPk' +
    '2ptpvG5HtCOAQP/rcSWCjSIllx9qxo4N5nzwiAknn/+Do/8N00OYEXmXUe8y6l1G8S6jvecyqj0s8aq357GsJ/9OquxaGbv7KAJmAD9MN4P7y3O/25rwmyT9' +
    'klQw12ejHroTydXAC8DLJO6RbwBL3P+/pJt7fTOwifsM493fx5KUEU5yfzas5/6pputp9jw8BpwhIve78yY+n/pt4wi3UfIsMK5ChTB77h8A3jsYHH7D3l4U' +
    'ALGqHgWcD0zOSPR+gVCZyhsDQ4AfAkep6lkiMqdfThyODE45f/rE8T/94h+Wxl3vte0dFjFSd2RQWefGYJB5/mtm+6V7MFWtegclhPwTE9BVOWiM1tkiqIoJ' +
    'AiGOWqO33mrY77ob3rjvwyf+9XPXXfWR6xIX0nO0v2QWenh4MFBUMPp5a8eGyKJdhxpVSZ9humj9PrC/qn5GRBb3B1LYjQx+130H28NxkJ7bMPOzaRj8AyTx' +
    'DvOA5dlc6x5+7qEkbU3vAPZwx/4k/X9hlclhVhXey7UI/QQ4R0SK6eaLnzrWjKOTHIGvxuZxqtQeABwiIrcP9FxC6eWd/rzbAToLrwrWMusmAApugk13DfvH' +
    'xDF9esiMGdH7L/vB/nOWvPqH1XHXNnQWI4yEffz06hYxLO5xbtzf5e13lLVv3ytW9x7ufYzqGhtZRVCpEklUgVxEftEoGv7+DlTikm4vQeMoNsHw4Y1svcWQ' +
    'sx7910m/jGIEVegjBcwrhF4h9GAwKITpPfWou8/DfqgUWmAoifnLkIyqtDmJmjQcyLPuIOxKc5Szz/25zgjj6Xp/5mc8JP4H+F63TOmeKKUArcCNJPnN/xSR' +
    'Zev6vRkXdy1nnby+86mqjSQCx0EkQejvJXFF7X6dTRXUZyFpszpNRJ4Z7LnUGXWwCXjGEfNS1MFSIiXSuesWETmyJ/MhXiFcZ234TsBvgHdlJnu/KKjNDmvs' +
    'Hj7fB96nqqeJyHN1P3FMnx7KjBnRbhd8/dg5S1+9enWhYyiR7RsymCWARiAXgHHkD8F0ReRiS9TVSdxZgLZORGFYUdHY8p6RQ9i0McdrcZGVAq1hwKpcjmIu' +
    'xyojdAVgRRxJTAhk4H5nZQRRCQhpeGxzNCIparGl/JQEQaB21ap2nn/JnLfnQVdOfuqek79cEEl6OWfM8KUpHh4etdxkeV5Efj8AF6tD3CJ1e2BHEjVpD0cW' +
    'uytK0gPSkD73I5Leu9tV9QQRuateSWFm0+CrFZDBONPf9wZwKfAHEXmlm9GIyZYjO4UnrpB8ZBVeFZFOR8bnAher6jjgSOCjwPscWamUGJoMAX43Sf/omSJy' +
    'VbcqPAapOng8SXyHLfH8ShkK7WGquo+IPDKQVcKwl8oBjnFkcKzfHaa3ylbSCfBg4F5HCme5xvP6UzVmTg2YNiPa7ldnf/Y/q5dd3t7RLqJYlV4kgyk5EyAM' +
    'kkOEoLOILGtFl6+meWkrrW8uQVZ1kC/E6MpW4vaONdyx3Z3003aZxGFjhrE0ikGctVkY0t7czILQ8IqBZSOG82xzA4815lja3MhS9/uwuoYglkUOVaAhIv+f' +
    'TeG1YZCPEnOZMibWMBDt6miNXniJL+184BXjH7/rxBNEJPKk0MPDo8ZoUNUw0xdHP92UTZ+96p6zrSTKxTPdyg73IilH+yDwzkxPmu2h6V9aQjoe+LuqHisi' +
    '/6y3BWxGJPgQSfZeuZVimlnnLCJpP7pcRJZmSKC4zW9bTbU5s27Sdax3UzIfi8hi4PfA71V1F5LKiE8DE6pE/tMokiudK+tXRaQwSCtWrJs3vlqG6qsZhVBK' +
    '2LAK3Pt/nBp3/Aw4Qpjuojgy+A3gJ5mbwJPB3lcLxwIzVfVnwLfdZFw/D4mpU4Ng2qx44k/POPPl1ct+GXV2WhDV3oqTSNXAMIBcgBQtYUsr8uYKzMtvES9c' +
    'jixZRaFQoDWzRbd6HW8Vm+Tt2oywSqBThNBNN0EUMaKlhbHAPgpm0QqKAoUw4M3mJp5tbuCJ0SO5a1gjzzU30pULkzeLHTkU2fCTzVhyXY3kHt+M2FikBxVI' +
    'ChIEEhYLrdHLr/LRnQ/43Yjbbnvywx/4wB5t06dPNzM8KfTw8KhV93PybGKg9EWtR1GKRaQVmO2OH6vqbsBxwAkkSmJPiWH6zB8KXK+qB4nIY/XyvHcqVqyq' +
    '25HEZpXbY5ctP74MmCEib6aqozu3tg/sLbNxFel1D9zneRb4tqqeB3wCOC1zjeMe9hhmewtPA3ZzrRXPDiZSmCk7PhrYNUPeNlZ2+yBwM/CDEhTFVJk9TlV3' +
    'AJ4fqGpsWMN+EVHVS4AvZCY27w5Jn6iF6fn/OrCTqp4oIsvrYuKYPiUMZsyK3nH+17/xYtuyn0RdXTGI6RGbKbfrQhUCgYY8WCVcshLzymJ03nxk4XIKHZ3/' +
    'Zcup2T3g9I0yZ1Bcm6BZxyyvIkRhSJHEDjZ5vSKqbLa6lW1WruZDby3lG7kczw9p4sGxI/j76GE8PLyZOAwhthibzGf/JfxZQZpiGh7bFLu4EWkqWx1826kx' +
    'JiGF8xcMOfTL3334xttue/JoTwo9PDw8qqYomTWzt8jTwNOqei7wYZIQ+n17SBqCTE/j9ar6XhF5pa8XsSk5dsTtCmB0mX3h6WvfAL4kIn/P9ATaetpEcNc9' +
    'yiqWTsE8X1V/R6IWfh3YogJX1dRYqEBSQnpQpqcwZtC0EKohyeYsxa8v7S38PXCl+7kxG+knFHctG4DTReS0/hrvQm/mEGbIYCNJU+8XKpDGPap7nQ1QJMm1' +
    'uVdV9+q2g9knZJAZs6Ntzzvray+2LftJoa09RqktGVSSksxAoLmBIFZyz7xG/tp74De3UbjpIYqvvJmQQZG3G8akpjBW1/69TDotqhhVAnekT/liENCSC2nJ' +
    'hRTUstPK1Xzxxde5/vHnuf2xFzhz/mK26SpicyE2NIiCyf7uMCbXMgzz1Dg0H/eYDL5t0BgJNW6LFi4qHvTl7z5808yZdw2dMWOGnZ7kQ3p4eHh49JAwuMzg' +
    'NDfYOLWjQ0T+CBxIohY+kymntGU+8yMSQ5s/ujUZfZxflxLSs933i8ogQelrZwMHisjfVTV0m9pxPStiImIzOZGBiKwWkYtIyoS/R1JsFGTyEstBROIXcbmI' +
    'XJgqsINIHbQkBj7vLVEdNMBbwCwRKThiWMq9lSqyH1PVSa5M1XiFcONksBmYRdJQ6/sF6ws5t5u0E3AecKi7RtoXZFBmzI7G/vALX3qxbfnP4q6uGBFTU8dZ' +
    'q2vKQsOWdoIHX0CffIloyYq1s4GRtVESPSB8PX5oqL5tJmsPDW0IosquLavZe8UqvtTUwO3jRnPlZmN4eHhzstUVxUnvYF5oeGICtjWoSB1cx8MstHF7tHDR' +
    'kCnfO//F61X1iPTh5t01PTw8PKpDGrp5L0TAn1T1BhIV49skil85SlLai7k/cK6InNFX6pFbPFtVfQfwnRIW73RTBkO3rvxUJmM56odqcZy5xsuA6ar6FxL3' +
    '/aPKVAvT8/IQcIZ738H0TE6/65klkrpUHfw/EWlx5+vXJCW3TSWohGnf5mdEZEaqTOMVwvWSwdHAnZ4MUs9ubnlgGfBlt0NCXymD25935idapXhR3NUZS/WC' +
    'XNdvLtzcQNjWSf6OJ5FLb6Z4x6MUlqxI3D7FxUjY3iWC670xlTUKYntoWJ4LaSoU+fhrb3H9o89x9bOvcEBLGzYIsY3KkLdGYF4YiTZUjwy+jRRGbdH8N4qH' +
    '7HXwFX9MenxmmT7ebfbw8PAYkMphRk3qEJEfkzhVPpFRkiizp/B0VT3avXfQh4Toh8CwEi3/ySiDM4ETMmQwHiDXOBSRZ0TkaOBk4M0S1cKUUC8kiRnpcGWp' +
    'OsiijPZwfGNjMRPpv7cAv017PJ0j7V9KJJQp4f6iqo7NkHtPCLvt/KhTBq8liZXwZLA+d1PSJuRPulrzXu8pmDJ9esiM2dFeF3/nsPntK6/saG+zoiJaCzKY' +
    'fuO8RaKI3D3PIL+5neI9T1Nsbcem5aBaHyRwY+QwFqElF1JEOerNJfzt8ee59N+vsktrzOpHtqFQEEJTmy9hAgmjYlvxpVe7Prrf+39/Xi6cFh900DnBOhPv' +
    'PTw8PDyqSRoeISmLu6ZMUph1UbxAVYeztu+qV0v7VPVdJP2RtkwF7DYSMxY7kEoi3TWOXLmwuMiVd5PkKG6oTDhd2RQdGXwlUz45mEwTIXH+zPH21OcNmcn8' +
    'QUQWZIxiIHGpLZTAh4x7n/HAJxz5HlBlo6ZKDlo5t4NzmCeDdUsG0zKEr4rIre4hY3s7WmL2jBnRwZd9b+cXWhb+qaOr04gKNXETVYHAQi6m8ZXxDP/HDujt' +
    'L1BcuRo15u1qYH+yjVVFgJW5kC6UaW8s4h9z5jE9foqhTREriw0EaNXZtSoEgeQKXa3Ri692nrHX+674yuzZMyL2uszf6x4eHh61JQ2BiLSKyKeAC8okhca9' +
    'dmsSl3Fb09aM9Zf2/b9uC3FKUMBeJtnAjpwCZgdiubDrIw1F5BUR+SBwliN8Zh0RLOla7vRM1mQ8iILo0/LjySTOvKWqg53AhZnzHrsNhseBOzJloaWohF9W' +
    '1Qb3OWTQE8JMHbQlyRg8ypPBukW603ahazwOe72PQBGmzbIfuv7cYY8tfu3a1cXOUSi2NmQQaCgStjUzYvaO5G/dErticxrHH7V2z0379wVNiWFLLiSMI84a' +
    '8SA3TLyOD454hZVxnhghqHL1iCOFQWdHe/TyK+2/Ovr4a4/gsVOLU6fO9O7BHh4eHrUjDXHGeOYM4OeZMPpS9xOtKx2d3FumGJnSvl2Aw92TNyiRQFrgZBFZ' +
    'OhgUsIxaaETklyRlwi92y+VM13KXisj/9clari5OlSjwZdb21cpG1r8C3CAiz3dTmdOf+1WJYfWpSrgtcPxAUwkr+SJp/sdPgE+V6Rjl0ftk8FbgzLSpvNdr' +
    'zWdNNaEYnfPcK1e3SrSrFGz1x4tKkvuQixny0gSG3LAT8dyRxDmLlVaCxv3JN25RQuxM/yKGVoRlUSOTgyX8bvxN/Hzz+2gKYlbHOYLqP0PFGDWtbV3y9LwV' +
    'V5/9nRu3nDVrWuydRz08PDxqbjxjnSL0dZKN+FIJQarMNQFnu+d/bygb6e/4FNBY4mdNH9AXicg9g0kBc2pheo3vY20JaUiiGKZOq2f02VqOulAHN3VjqhRC' +
    'lpq/nN+d9KUbLcDdJNmEpgyCfboj5ANGJTQV1IRHqnoS8I0MGfT9RNSdiUwAzCWpwVcX/qu9biIzbVY84adf/MZS23mMbeuK1FRZSVaBMCKwIcPv357w9q2J' +
    '2w00RogKgiW2IQ0jjkREBlwxfShKh+ZoiwM+P/Qx/rb59ewzZAkr46ZalJAaY2K7dHk05vpb3/iT6gsNM2bsLL6f0MPDw6PXnCpPAx4oo3w0JYUnquq2mcVw' +
    'zXIH3e9oIintK2XNmZLBhcD3UwIwCK9zWia8CDgG+AVJa9brOHOdPlnL1Y86+FmS/MCN7e6n6uBs4KH19KCKK0m+qESVMCWYewFHuM8TDEpCmJ5QVd0PuDRD' +
    'OvxisP7IoADLSaTt5ZkS397jgtOnG2bMjva65BsHLelq/1Hc3hVjpPrKYD6iYdVwht68E/rUWKKwCIFmHDcN2A6kYRcahu4+oFTCtTezYgSWRY3sGC5i5uZ/' +
    '56TR81gV59w2WjWfHRIIXdGSpbr/ngfP/hlMi5k6y6uEHh4eHrUnhSIiReAzJDl2UqJLYgwMAT5f4uK3GuvLd5GU2JWi5qTK5UUuyF0GmVkK61CvVES+RhKv' +
    'cKKIvDUITWTSNjWrqsOAL5Y4ntLx/fMNqOKpwncd8EKmLLSUsuY07sMOOkKYcRQdA/yBJMIATwbr1lEUkobsuX1SdqHIDGDqzEtHPLds8eUdxYIhuXmqN16s' +
    'QEORpjfG0vSPHYkXNKINRUTlv/sERbA2pmHEEZiggYEa2ROKpU3zmLjAeWNu53ubPkSBkKKaqpJCEQmjQmu0YEHxK0ef8KcPMmtaPHXqVF827uHh4VHj0kJH' +
    'Cp4nyfUrdS2Xvu7jqjosdTKtcbnoBzLGdhtbtwTASuCKQZirt6F8SiMi54vI3anyOghPR+BI3ceBzUuILkl3/R8Hbl8fcUv7AF10x8XdCN/GVMJDgAMdLwoG' +
    'm0KYnvzLgcnuBveqAHVbKnq2iNziyGDvh7hOm2pkxgx738tPXNAhui1RnIbPV08ZbCzS8O/NyN+yHcV2hQYX1L6+4atdqJlIw7ADS9xg6qczJ4rFsCrOcfqI' +
    'OVy++Z0EBgpqCKr4jDWBmNa2Tn3m2eWX/PCH92wya9ZOCr6f0MPDw6PWz3m3Sf9r4MkS+59S9WMicFiax0Zt1JxU4dq/W/zFhtYtALeKyJt9UdFUx06zVlUD' +
    'RwwHHUnOjKcGkqiJUs5B+pqL3fp3Q+cuHWdXA4tKdMNN/z3tydVBQwgzCtNpJFky3kSmPpE2Hl8iIr9M+z17/VPMnBowa1a83flnHrM06jzRtnfGSBVLRRWk' +
    'IaLpiS3I37U1scZIABtvYxNi20V+2CGEuZFl5OP2x97CtSWkxzbN44+b38gwE9GhQTVJoQlMbJet1M1n3vr8+cbMsEzd2VcMeHh4ePRO6WhMEvhearVW6rN9' +
    'rHsPW8PPNxLYtcz15g3+6q67hHQQE+SUzH0YeEcJu/mpOvgS8OeNlXW62I9ARFYAvyuxBDtVCY9wLrq9mu/ZZ4TQ7UpEqroD8KMygkX7e8mlZibP7EEdO4rm' +
    'SDJVvuIkbNsH2znC3J106sxLRyxY2fKrYrGoQhWdXBRoiGl8fAvCByaiYVx6uhGCEGFlJE2jPlBVQigiaw7Sow7IZijKsqiBKQ2v8vuJtzA8KNKhYdVIoYgE' +
    'cdQWv7mwcMJRU689mlnT4unT1auEHh4eHtRcJRTgehLzuFJUwtTz4TBVHe3UJ6lRueh2wKgSyGpaLroamFNi2Z4Hg0kkVAOcXuLYSBd2l4pI20bUwezvEOAy' +
    'oLVEldACDST53v1eXTAlSrXiLsZFwPABJqukte0xieoZZ8obxJ0j6XZY99oo87O2DshgADxP4ihq+8yFatY0Y2bMsA+9/Pj/dARsRWSrlzeoguQtzY9vQfjg' +
    '5mgu6sGjw2DjDkzTfjQ0uRiKMipZRQRjDEEQEAQBYRgSBMn+SGwVVUXjGOI4+WDGQBBCEIAJkv/uZafTUJRlcRMH5Odz5ea3MCLookuDqvQUqkIYGGlrK+iz' +
    'z6/41aWX3jFixoxzQL3rqIeHhwe1VQnTKqDfl7hYTtcw44B9MiSxFmvL7bqV5G2sXHS+O/Dloh6ZVAMLHEpiULQxQSpVB5cAV5Zq+uJ+hxGRV4GZZaiECkxT' +
    '1a17K9+zLxXC1Kb1syQNlPEAUAdthsilNfSBy3pJv1sH0Aa8BSxz/92eGWxh5vVBZjchfV/t5e9j3OecKiJL6Ct3rqlTA6bNiht//r09X+8onm47OmNjtGpk' +
    'kIYiDc9MIHhwczQf9XhfQsQS2zyNo45y76AbJYEpAVRVrLXEcUwcx0RRRBzHqCqNDXmampoIm5qRpmZQRdvbsSuWYle2YFtXou1tEEeOHDqC2EtmM8vjRg7M' +
    'v8blE+4gNEpUJaauihGJ7LIVTL78z6+fLcywU6d511GPflcR4o/6r4TxWDeZ+qtbp4SUpmwA7FsjNS59MG9VIiFM8WoaueAvq0e3sXNmiWM1ddj/rYgsLlEd' +
    '7C6CXUAi+GxMJUxJ41Dg1P6uEoZlhED+OHOi6cch7d13w1aRqGpPAs+63alFJE5XsdtlaCKphY+BEe7vY4BtgO2BHYBJwKbd3jvOEG+p8WJGgJNE5Jk+M5EB' +
    'pu+0k87A8PDkv577s8Wb5q58bXxsiSUIYqxKz586jgw2/mdTGh7YgigXIxWdUoPadjS3E43Dd6dj1VPrdBteo/w58peSw2222YZtttmGPfbYg8mTJzNhwgSG' +
    'DRvGqFGjyOVyTGwIGRKGNK1cgXa0E69YTvzWGxRffYniqy8SL3qTaMmi5P3CHNLYmBBDaxPJrUbIiWVZ3MTBja9wwYS7+cKCQzBESBVWBCJiomKHXbBAv/rF' +
    's//521//4pD5oAb8Tq8H9R7l6fH2Z5XfzOlfjqMiIq+o6hPAASWoKJKJhKgFIUzfb0yZP/eqv6IeWXXQcZB9gcNK6B1MS4/bgMvKdapNoz5E5ClVvQX4oCOG' +
    'YQn5np9V1V8Ci939qAOKEKYqk6p+393Y/VUdTN1Q08/+BnAXcCPwmIi8VMJ7LNjIwB1PUh6RDtw9SUoyugdkmhp8t5CkhvnGviSDOnNqINNmxMV7D/xgGL90' +
    '6O+bXos/OmxiMH3+tjy+cjiYiMDY8omhyxlsWjiGxnu2oSBxUnGplff82TimYcSRdLX9GxsX31YSmiWBY8eO5YADDuDII4/kne98JzvvvDPNzc1QQj3BuhC9' +
    '8RqFl56na869dD75KMWXn0cLBaSpGcnna0oMc2JZFjXwkaa5zN9kKOcsfBfDw65qVHiKEWtXtzN09gMv/tAIn7TqVUIP6n33uehJ4dueJ3l3TjzoR8bSycL1' +
    'bkcItcRNkHeoaoOIdFV5EZu+z+gyf67VX0qPt63+EsOXszL9sUEJ6+G/uA2SnjjVpvfG+Y4QmhLzPceSiDLnOiIbDxhCmGHmewIn9dMkb9ttXT4b+A1wmyur' +
    'zErEJnNxsyUz2m2QyDpepyKyiERZvA84T1UnAO8BPga8n0RSzn6mapzLdOfiYhH5VZ+SQUU4Z5bqo5fmoiU//L7NRRSjUI4e/QaHjFzEZQu34idvTGZhex7C' +
    'AoFAXAoBUYEgJlzdTMO/tqHQZZGcluAmWqIPpxawwSSaR76b1mX/IghzxFFxDRF83/vex6c+9SkOOeQQJk2a9PbBZW3SL6iaGMk4MgndPLZTYifuf4whnLgl' +
    '4cQtaZ5yGNrZSdezT9B+50103HMH0VtvIE1NSENjzYhhIMqKqIGvDH+EV4ojuXL5jow0XU4rrIhlmzhut4uXNp7w4ZOv/9Vff3fso0ydGTBr2mDMTfKob+IT' +
    'uGfClyjDlmoQlM8GJO0Rvo+rf103gCdKXF+kE/0mJNVNL2bWNLX4XNQoCs1j4KqDae75DsAxZaiDReCXPTVKSrM5ReSfqnq/22CJS1Tcv6iqFwNt/VElDEtg' +
    '5j9wr+tPmYParWTiZuDnInJXN8Kbfk9bYmjqxuqOTeY93wT+TGJ5u5Ujhp8mKS+tBjFMd0LuBM5wN0/cp7bAM4j1PRdMC5u6do9bNQ5FgkKUo0EsZ2z+AseP' +
    'WciPFmzLZW9tTlcEJoiSsPgNVmgrBsOQ+yYTLc8hjVESRk/Vym2I404ahr2f3OrHKRZaCMOQ448/nq985Svst99+a094pmQ0VRF7PkLXEj1pbKRx73fRuPe7' +
    'iD93Om23XEfr3/5A8bWX1yqGcVz9GjmBDhswY+x9zO0ayxNtoxlqIuLKSKEERuL2DsJnn1n43cBwbDxrrl9oe9QrWkTk3/40eAwQQvgMUCBRebUEZ89hJK0u' +
    'L9aJSu43IDy6VyieCTSWQMrSNf9truSzkhzLdD19PknwvJSY77kl8AkRubQ/qoRmQ64+qnoIcEQ/UwdtxijmMeCDInKUiNylquLCPcVlulQt18WFh655T1U1' +
    'mSDRV0XkJ8DewOeAp935ND00oEkH/nPACc70hz7ejbB66Sm5uLj6W0Sxpi6agSgWoauYZ9NcGxdMfpy7d3uYD2zSgrV5bGwIRNd9t6lALqb5iS3Ql4dBQ3XJ' +
    'YErucoFlVfsQgiHvZ+pHj+XBh+ZwzTXXsN9++6GqxHGMtXaNqYwxZo0SWEFx5VpTGdVECbQxwdhxDP/UqWx65T8YdcZ3CUaMxK5qSVxJq2w+IygRhiG2nZ+O' +
    'u5vhYUxRTTVWBYHaLru8pXj0h0786z4wQ5k605sEeNQjQjdXp3/6wx1+aPRLQriAxBeBEsvcIPFEqJde2gZ/KT0y/iVbAMeXoA5mx+8vqzCeU7fQG4F5JTqO' +
    'phWDp6lqPhMJ0+9dRtPJ5buZMgLpR72CReB7wLtcX504YpaSNu2NRu/u5FBE2kTktyR9hp8DXs5kAsVlTPxC4ij6URFZmrHlpc96BwVl+8eOCZqKu0Wdqtmd' +
    'HHGxB0UNKBTz7D90Mbfu+CB/3vEpdhnaQRzlk+iCLDFUgVxEw1ujCZ/clDhXrFKZaGbwG0EVWpZ3ss8eI7nphp8zc9Z17L3XO9eQwNRd1NTSCTQleyk5jGPM' +
    '8BEM//QXGP/bvzH0wx+Hri60qzOJrqjqBKCs1gb2yi3gm2Pn0K45TOW3hxij2t5BMG/u0m8bg+JVQo/67VGxgHVztj/c4YdGv0QXSetKOeWaE2uY+1fuQ3tT' +
    'fwk9nDqowOfdhsXGDC1Tj477gbtS0afCOBcjIh3AJSWWUwfuNbsBH0ojYfo1IcyogweS9MD1lxD6yH3OecD7RGS6iBTd99G+fMCl5NAR01BEujLE8CckJR5B' +
    'CWphWgqrwMkiMte9X9/K0lNnWSQg6lz2VeKish7CbVACUYpxjsgK0zZ5lYd2u58fbvMiI3MQFfOoew1iCYp5Gh7Ykqhoy4kJLAlhaOjojIhj5ZzvTuGuv3+c' +
    '971nS6y1a9RAY0xfDJaE9DliGG42kTHf/Sljf/Ebwk03x65cWXVSGGJpifKcPOwpDh/+GquifHINKvsigdou27IqOmLqyX/bEWYoPqzew8PDoyZ5hG4RXOwB' +
    'IQxrSARbyvwsE/zVxKuDibo2CvhMGeqgABekZK4KHyV2Ct8fSeLnTIkqIcCZqQ9Lf1cI0y/0NUdSbD9RBkPgOmCKiNyXLQ2tp0nbZeykxHCZiHwL2I/EHSzY' +
    'iDSd1lCfJSL/6EsTmbXqYLJZULhr9/eYfNf+cYeqbGQDwTglsCvK0yQR3540l0f2uJ9Pb74AyBEXQ8jHND65OSxsgrytqjoYhoaWlg4mbzWSm2dOY/r/ezcN' +
    'DSFxbDHG9A0R3BAxtJamAw9m/OV/YchhR2NXuhLSKobbqwiqlu+OfYDRDV0UVSouCRDBtnfQ8OzcZV8ClHnTBA8PDw8P6qgPr5bK4MoyXz9eVRvTDXR/KQe1' +
    'Ovhpt0GwMXUw/fd/AzeUGkRfhkq4nMSMslSV0JL0HU5x4lrQLwlh2oSpqjsDR2Zce+q5bj4lSRcCH8mUUMb16vDTjRgGIvIkiRPpN51auC6DmNRR9CIROb8e' +
    'yCAAUxMuEXS0fMEERaNlZM6Frr+wEOXZtmE1v9/uMWbv8hhTxq2geekowmfGJaWiVewbDANDy7IO3n/w1vzrho9z0Lu3IIoUVQgCU4+DJSknjZP+wrE/uYSR' +
    'p56FdrSDjavWV2hEaSfHLrqILzY/TXucr7h0VESDOOrUllVdH/v5pY+OZdYs/5D38PDwYFD1NJbjerqFO3w+6OBUB8Wpg0OAr5Q4DtI2qotFpKvcIPqNfyQV' +
    '4HK3uVGKG3X672fXcMOlVxTC9MR/jsSlKq7zmzItZz1XRE4H0l7BuL+UeaRBmK6H5VxgCvBUtxLSVAG9HTi7XtyLVKcbEWz7/cdtqabwIduuZW8giDOeKdqQ' +
    'QpTjvSPe5J87z2GPf4+hrT2oanVkEAgtKzo46cTd+ccfp7LZpkOJYyUMpZpiW20QBC6CwjLi1LMY/Z1zwSpExcpJoQGNQTqEzgkhXz3lAfbYfDHtXWGFpFBE' +
    'JLat7WbMn659elry//hcQg8PD49eIGP18Bnml0EIY6AJ2Nstwj0hHHxIydxHgW1KMLRMOcCbwB+qpQ5m273cZ3qdJDWglPdPSePhqvpORypNvyKEaXmlqo4m' +
    'cfWp90yYOEMGv+lIkvbHZvj0MzvV7yFHCq/OkMLUUfQTIlJII0H6+nPfffcMA5Bvf+4jQWNxqLXE0sNKQ0OSLWhzltue3IEnntmUxqYitkrqYBAIK5d38IXP' +
    'vpMrLjqKxsYQa5Ug6EfPHGMSxTCOGXrM8Yz90cXJtBNFPSOF7kdsuxAMNYw6pouRJ65m9D6L+H9HPkgxDqlCLCFRsciS5e2fTibFqd6swsPDw6N2Cku+xsYv' +
    '5RDC/2SEhVLXLB/sb/ltHlVVB0Pg9G554BsbZ5eKSAsQ1GLsuM92EYlh5cZUQskQ2bP701g26/j74cBmdR41kRrI/D5DBm1/nkQyZaSBiKwUkROBs0iUwdXA' +
    'VFcOa+qF9B50ELE+ekpOo9ZPUYyoNIshMBaiHL+45QA6I6gWVwtDYeWKTr7wub245LzDsTYJkzemP25Aut7COKJpyqGM/fHFiXIYR6X3FEpy2A5ADcMOjBj3' +
    '+RaGvauFwBSJljfx0QOe5j07vkFbR8UGM4FqQds7eOfhx/15DxAfQeHh4eFR5QWrW/+EwLgyid7SGpeMvlqicpmuNw9R1fH90bbfoyrq4JHAO0toWUvNY1YA' +
    'v6VGOZau4lBE5BngljJVwmNVdXunEgb9iRCmN+vHS2Tm9LGBzN3AKZlySx0g3bRxJibjl8BU4FMi8mxfx0t0N5MRQVn97O4SFHeLOqnI2Sm2hqCxk1ue3Jl7' +
    '5k1iWFOBuArqYBgaWpZ3Mu0jO3HJeYejujZYvl8jCBNS+N5DGfXNH6BdXRt//IsrDy2CdglNO1g2+exqRn1wBcGQTmy7uJnOkMt3ctYRc7BIxX4+xmA7uyR8' +
    'c9HqEwCY5Z98Hh4eHjVAEzC+REKY/vvyaiuFzvU0te1/qsTFelo2ugnwsf5o2+9Rcb+eAc4ocQMhNZP5k4gsqPH6OL03fl5iK11KGpuBL/QXfmK6mclMAt67' +
    'dulIPfYMGhIL2BOdxTIDrbwgjclwA/wvInJDvfZGRvGK44KG2IBYqeCBEhhLVGzgl7fth1VblZ6+IDCsWtXFAe+axG8uOBJVUFVkoOw5OlI49EPHM+IzX3GR' +
    'FOH67/Q4KQ/NbQKjj29n7CdayG/ejm0Hjc2aOz4wlrgjzxF7zmP/7RbQ3llZNqEgYuMiLas7j7rttieHwDRV9f0hHh4eHlVesG4JDC9RwQtctdXSGvUepmvI' +
    'h8ognGlp6ddUdWQmINxjYDPBNMPvAOB9JRpaGpLczQudkqy1FmpE5F6SrENTgo9HqhJ+RlUn9oexbLrdqB8AhtWpmYxmjs+JyOv1pJjVcBAGdfc9BZiL6gtf' +
    'aaCw+kiKFipIKYhVCBoL3DP3Hdz770kMaaxcHTRGKHRFbDK2mSt/fTTDhuaxtr+WiW7MbCZmxKln03zw4dhVLW/PKUzLQ9sFaRRGfKDIJp9fwZDdVqNFixYk' +
    'mQW6nZbIBjQ0tfO5g54migMq3HMx1ha0q0t2PPeSuTsDdtq0mf4h7+Hh4VHdtdzOJBVUtsQ13ErKzy2kzPiLm8vIs06z3iYC/+vWPV4lHASc0Ak7XytRTU45' +
    'yvUi8m9X0ml76R47vwwF3gIjHGfRejdKMt0mgmPruFQ0nRh+IyI310Ugey+Rwnr7nmoxMgNbeP3eHSS0u0adqlKBoiwKqHD5PXtSiKTiuIMUhULMxT87jG23' +
    'GUUc2/5lIFMOOxcDAqO/8xNyk7ZCOzudAQ1oFxAZhu5jGff5VYw4eAUSRNgOszbKdZ2KrWI783x472fZdrMVdBZ6rhJqYupj2zuF5cu6PgQwy5eNenh4eFS7' +
    'Z2+fzIK5lNcvAhY69cPWoARQgBeAxzOO6aWsS2PgDFU9QkSKzmjEY+AG0auq7kbpcXfi1O0LeiuiJJONeSPwbJm9hJ9T1eH1nq9pMuWim5LItfVYLpqWir4B' +
    'fCftG/S3Uh9hVnLzBRTeF+QiQwUPEqtCLl/gpQWb8c9ntqK5oQtboaoeBoZVLZ189sQ9+MiHdnBk0AzkXYMkp3DMJoz66v9AHKGRYjsN+a2UsSe1Muq45YQj' +
    'O7DtAiXQd0GJopBRo1r4yD7P0VUIK1QJBaxl2fK2Q5LykLl1v1vm4eHh0V82jt1f38PagOxSCOGzqWlGLVpfnOtjkbWW/aXWIKV1K1ep6k7OcM+TwoEdRH8m' +
    'kCtRHTTAPSLyQJqQ0IvGNwXg1yU656akcXPg5HpPb8gWi+0PjCqj1KC3d78EOEdElvaSPOyxMRRWH0aFap6qQD7musd2ZElLE/nAolrRzEJHZ5GtthrJD77z' +
    '3qRn0AwC3hEEEMc0TTmMIUd+BBOuYszUApuctIKGrVvRDkUjU9ZUJKIQGY7ffx7NTUViayryRo3jTiLLntM+P2sLmGGnT5/uCaGHh4dH5QoLqroDsFtmvVQK' +
    'IXy0xgpLulC/lsS8xpRYhZYutscC16nq1p4UDtixa1V1MomBopaYWQnwyz4gWKnz7bUkDrpBiWZJAF9W1aZ6ds/NEsJD3MWwdZo3+BhwpVcH+/gGno6RacT6' +
    '4MfGg91LO2PQnt+QgbFEnU3c8PgOmCDCqlQc1dfVFfPdrx/IJmObk75BGSS8wwioMvJLX2X86U0MeedSsIp2mXX2CW787ZSoK8cuWy5g38lv0d6VIzAVlI0a' +
    'se3t0rBgfse+ADPm7ewJoYeHh0d1Wn+mAg0leEBoZiE7hxob5DkPhAVuEV1OcHhaOro9cLeq7pVGc/k4CgaaOvgFYGgJYzetFnwcuK3aQfQlqt7GZR5eXkac' +
    'igW2BT6Svke9TiSxc/jZhw12FfW5e9aPRSTKDCCPvsDOyfUornxgcpCLNoki0Z6G0VsVgnyBp1+bwJOvjae5oTJCaIzQ2lrggP0mcuLxuzgTmUHkXSLJvBNs' +
    'MpFw989gV7at6S+kkpLehg6O3et5bBxUKvNbxbB8ZeehACye6x/qHh4eHpUFZseq2gh8qkTFJFUQ3yDZaKfGi+q0l/A8kkzlchwhA0cStgD+paqfdL4K/SLX' +
    'zaOkIPpxlF5OmY6bC10psukDPpCO58vdeC5F9U4NMb/iVG6t5yDITUlKDeqtvjWtFZ4L3OjVwTrAJlOSRXx+9PsJVUV6fj1UBULL7XPfQWtbSGi0GoY3nPWl' +
    'fcnlgoEVMVEOKVRFJn0Rhm8LcWdFezwCEBmm7PgqQ4cUiG1FrY4SRxErV3XtrKp5Zs+IfR+hh4eHR48RuDXcscB2mTVTKYvqf4pIm1PwamnZb91a82XgZyVa' +
    '9ncnhZYkTuNqVb1cVcdnMps9MaRfB9F/BhhTwthNjSVfBmb2tjq4jvH8JnB1iap3GquxL/D+NFauXksNdiUJNK1Xo4dLRaSrj3YDPLJYMlsBTNfiXREE7fn1' +
    'MGKJu/L885lJSGAr2jIxRmhvK7LPXpvxwcO3RXWQqYPde5jzI5GJH4e43SmHPS/BjQs5dp60iJ0nLqG9ArdREYy1BYLA7PnpL9y4CaD4PkIPDw8PKlBYGoHv' +
    'lJn1B/BXerf3ypCohM+QRGPEZa5V05amzwFznFqoWWLoS0n73dgdBpxWZt/rJSLS3sd8IP29vybJQjRl/MzXUmfVeiWE+1KaVXFvn/AAaMlMXLY3B+xgOzZ+' +
    'ThCZRrzo2elDMcEudMUgPVOUrQphrsj8JeN4+o3NaMwVsBVkD4pAVIz53Kf2IJ8LsHYQqoPd+vHNFp+Gxk3BFirY51Fia8g1tPPu7RdgK8gkVEWMUV21Kmp4' +
    '/JlFWwAwY55/gHv06c3iHs5GVQfd4S8//V1hscCpwC4lqoNpD9bLwF3dHEpr3XuFiLQBpwCFHmQfpu6jEbAliVp4t6oenBJDV0oa+rHdb9TBjwOTMuNyQ3zA' +
    'AEuAK2uUm1mWSugSGuYCN7mxWWpQ/fuA/epRJUwvwPbUZ+4gwK0i8mZvh7O7CWZQHRs9KeckrGLcihtHY+22tqj0NH8wLRd9cv44FrfkyYXa47tbBDo7I7ba' +
    'ehQfPnp7p2wN4ueBKxulaRIy7nCIXS9hRVmH8O53zAettIRAYmNyjBnV8H6AKVNO84TQoy8RiYgVkfTPQXX4y0+/dWd0ytjWwPQSFtTd11VXiUh7by5I0wWw' +
    'iDwEfIu1/YHlInTfwwJTSHoLb1fVY1w+dZT+Lq8a1r2y/aUSle20veQqEVnS23xgI0r7z0tst5NMisPZfU1q13ljqWouQwhNHZrJzOqjAVu3jZ813ByINniT' +
    'OUMZWl/fPBAbRmp6bCiT1J1aHnxpMqhBKqhWNkbo6og49KCtGDO6yZnJiM8pBmTCh9E3/ljRUBZRKBp23Gwx40Z30NpuCAJ6Fg8iiSntcy+u2AxgdusL/mHt' +
    '0ZfPl7Gqug+l5V8NtO8fA0+LSKcfDv1uQZ1a9v+W0uPCNFN1dXkfLUhTUniei8n4PFB0919PxIzUhf5QdzyuqlcDM12PV3rO0vWc9W1HdaEOxqp6NEm7Winq' +
    'YAC0ARe58a/1kP3p7sE5JGr7wZnxyEZ6CY9S1V1E5Nk0C74uCCEwAtimxlk0PVnNGpLcmgd6q1w0c2H2JakNHiwTR0xiV30tcO56B+gmUwRmEzdu8+6AVyEu' +
    'WpCgR7XAYtFCA8+8Ohyk8uhLExg+dMR2qPaQqAxIx1GQMQfCkMnQ/goETYnrDuXHT8SFkO02W8qk0S08sWocQ4Mi2oNrZkCKxSJNDbptEihLBKcI+Ie0R59U' +
    'x7wHeHiQnoNOYGfg5XpalHhsfN0mIkVV/WmJi9Duphy/zVRdxb28iFZVTUvlTnM5gx/uISkk873Tctl3uuN/VfVmt6Z5QERWZNZ56c+oH/N9pg4GwFfLWJ+G' +
    'wF9E5NU6m6uMi0K5wN2LUuJ9mKqjX6wn35aQpH53ZJ0RwnTiekJEFvbiAEi//yg3qQw2PLLBcfBCa7IzWVwykSYF7REnABXCsMiSVWN5cekE8mGxx3ETxggd' +
    'nRGTtxnFgftNRCQxQvEQ0BjC4cjod6Gtz0PQXMENacgFXWw3fjmPvbxp0p/ZMwpnrC0yZEjTTnfe+fJwmLwSfEmPh0cvb7hKnXkGeJS2oM45Mvgl4OtlkMHs' +
    'Jvsv+lJlSUmh+/NTwB+AY0h6A4MerkODzNpR3RruE+54VVX/CfwNmCMiy7oRFOMJYq+rg1OAA0osdU5Liy+sw/Lf2H2mG4GnSNIaNvad0l7CT6rqucBr9UJy' +
    'DUlYYr3a9t7TR0Q1chc1ztSqD+Sj4P7s2uBZGfVYMmCLK0YlSpP0vJgxUBa3hLy5LE8+1B6reiJQ6IrZdedNGDWy0ZnJeH7xtnM09qAeKYPdDGEgtOy//XKI' +
    'TY+NZZBEcWxrK4654LfPNvqr4+Hh4VGSyV2qDH4OuLBEExkyREmAH4rIWxlDGvqQFIozmTkO+H2mTcdWuKZNy/LS9dtWwGdJzD8eV9WZqnqSqu6YMaOJXd9h' +
    '6lYaOuMlv5iojTvn10osWU57B28Skcf6etxuIKg+Ai4uMWMz7SUcCpzq3kPqpWxms9528CxDqXuwD3+/GYSHbMxhVFUDCYduS8H2uOdUNekffHHxODoLpscx' +
    'BmsuVay8512T1r63x9tvoxG7QX4MaFQBiU+qOscPXVQxsTRGWN1ayN3+z+eHJv/vOf6h6+Hh4bH+VhZ1pWlnsbb/z5RRohaQ9DpdWC95zo4UGqfMnQx8N7MW' +
    'iavw8Avce2U397cApgJXOHL4iKqer6rHqerkDEFMTaY0QxID715a2Th2oe57A4dlegNLKe2/oI6/mnUbB38G5mfG3Mat4OFzqjoqjU6pB0K4eZ0RwrS0oQ14' +
    'tR6deAY1nvtps5LbnLgSu8mEXLzWMgG7ZjOvx5MMQT5gz13H+2uzLvkUkOZtoGkLsF30NItDUIgMm49upbm5iyiWCmz+reZy+eBd+2y2A8DUqTt7Qujh4eHx' +
    '38+30ClXDar6K+AXmbWalKHIdJGoEcVsDEQdkEKbIb0/BD4EvJEpE7RVWud2J4cxSR/X3sDpJNFmj6vqo6r6a1X9lKrurqr57ipi+nm9itiTyy0KnFWiw2yq' +
    'Dj4I3F0vGxkbUAlXuc2aUlTC9LuMJTFWqgtTTwNsWoeGMrhJ4XVPCOsLrfMfaoLiSFepLz1XCJX5S/IQCz01BBURioWYzTYdytZbjMxyII81fYQWgkakeRLY' +
    'niuEIkBk2Gp8J6OHxUSx9PxcK1ZMSK7BTARYvHiuv2oeHh4eGeMTV1IZqeqOwO3AGZlFcqlkMO1n+pqIPFUndv3rivhK3Uf/AbwLmJkhcVEV14ApOQwy5ycl' +
    'iMOBvUiMPq4iMZt6TlVvUtX/VdVjVXW7tN+rm4roCeJGxrNTwd5B0i+qZbSqnefMj6SOHWLVXfffASsyfYKlqISnqeqQjNLYp4RwWJ3WGC8Rkc60XMLfUvWB' +
    'ocX7DFFHo6rp8RaCCGANi1tyFcYhQDGyjB7VyKbjh6wxmfFYx+00bKeKNtdEQK0wqrmd5nwBq6bCZ7RhRUvX6OTvB/nL5OHh4fsE1xLBOKmm0DNJFJL3stZA' +
    'RsrwQkhdRS9yzo62juWj2BGHN0TkeOAE4D8kvYVSZWKYbQ1aF0GMgDywNXAkMAO4DngCmKuqv1PVL6nq3qrauA6CGPoMxHXiy0BzCTEpaZnzc8BNqTtpHY9d' +
    '6wjrm8A1mT7BUlTCLYGPpUpjXxPC8XWmEJJRCOvxcw1OuFB6GqK8oKYiKiAKxZBVHQ1gKgikB6LYMm5sM/l8gPoGwvWfq6ZJVGIEJCiqAY1BK4YCqqaSimEF' +
    'wVo7BKDVZxF6eHgM4t4qR4TS0kRV1SOBe4FfkkSDxWWa/0UkMQ53Al9MyWC9b66n2W5OCPgTiVr4Y6A1QwzjGlWNZQliuA6CaIEhwA7AycBFJH2Zz6nqH1X1' +
    'y6q6s3OCjTLXMhjM5DAt9VTVCcAnM21hpQhDF4lIhyvJ1H4Sq/F/JJE+5ZC701U139cqoamzMPos3vSPiroihAmKZrwRQk1aCKUn5iTGWIrFRlo6RmJMTI/H' +
    'vxPcN9t0qDeU2di82jCuKu8UiGV4U1ePY0LWFLJaZdGSjhzAY/4ieXh4DEISmJZwpuqYqh6pqreROGIekCE/5ZLB0BHKaSmZ6S+VVu58WNc/uUxEvg3sR9Kf' +
    '1Z5RSaMaq0bdCaLJkMTIHYZE4TmBxPn1KeBhVf2Vqh6uqiMz/YeDVTlMydznSSLuSlEHDUnL2DX1rg6uQyWcB/w9M0bZSKSGJYmrOMqdp6AvCWFQpyWjy/1j' +
    'Y+CSlFhDCrYhEYsqohbK2DHNvtF0Y06j+dEQDkmyCSsJLzPKyOZ2VC1Iz5NObGxZvqwj8NfHw8NjEJSCmqxSlJJARwQnulzB+xwRPCxDPMrN5StmyOAHXSC7' +
    '9Me2G9c/KY40zxORU4B9HPFamiFptoaq4fpIYsjbVcQoo+LuQdLveQvwpKperarHODfJ7sqhDIIg+lhVRwCnlVj1l8YwXCEiK/uLOtjtu52fIbZawvdV4Kvp' +
    '+aIPg+nrtWR0hX+UDGxSKFWav33fYKl7P1KlK9cI0oyYEOnJe6oiwRByeejwF8bDw2ONA7EawPRDe3/h7UYRdAs7124L5W2AA0kMNt5HEqROBUQw/bkccCtw' +
    'vIisqpfA6wodHGM3HlL15XRV/RnwMeAkYCfe7kxZ3Qfexq/728Ltu13DLd3xSeBVVb0V+CNwn+sTxZXzan++TiUE0Z8EjCuh9DktJ10OXN5f1MFuJc8iIg+o' +
    '6l3AISV851QlfDcwRUTuTk14+oIQ1uvE6/NePDb+BLbKBGco4yXC3jnrtutltKudSIpYKz2SGsU0orbT/R++aNTDw4PILYoLDCyVZJgjBdsD7yEpf9yVJJi6' +
    'u8V+T6q24owxyqXAl526ZgYKycjGPThi+DrwMxfFcSjwcffnuG6lh9qL5HBdBNFmlKKtgC+44xFVvRr4i4i8NRCJYUrmVLWRRB0sJYA9JdLXisgbfUWMqsBd' +
    'YpL+30PKcAQ2wNeAu/tqNRt64uXRr7vjRFi1uuBPRi8Sws6Wv6IroWNllbbuHrvMn1YPj0Ff184Ip5w1lNB7Uy+f2zpiN9StpUaTZIttAUwEtiXJep5I4lrJ' +
    'etSsoIePwHQBvRr4uohcmpaoDkTFKUMMxalPReBm4GZnWnIEcJwj3sO6nass6ZY+8OnIEtR93PFtVb0GuExE/pMhhnYAuOun6uBH3WZIqepgF/Brd4374zlI' +
    'jWFuAx4H3lnCd09LSw9T1XcCT/TFPRwCLcCEejyp/jnpUcojeVVrwfvR9uYsb/JAhFQcE6te1vXw8EgXSoc6W//+tEltgSaSUk1KUPKq5d+QVQUfIVEFH3YK' +
    '2kAtP1xXKekaNc5Z/v8W+K2qbgEcDBxNUoq3qVvvsg7lrtRcx2pWvaXkcFMSVehUVb2SxFXz+Wx2Xz++TFZVc8DpZdxLAXCDiMzrr98/NQ9yKv2vgd+UuLkU' +
    'u3nkyyLymb7oL00JISXKub2J0f45WZe3uKHOevY6OyN/XTbm0RSvhrgDcg0VGcsAFCOtyn6NiHhnWA8Pj+x6ZHj/nmjXkD5ZRxlhNUy04gyZbAXOBc4VkWK6' +
    'CB1MAyYlhtlyUkeI5wNXAleq6hgSleYDJH2be5Ko0Kbb9Yu6EUTpBXKYPkyHuYy+k1X1d+6aLnCkQPobwc8E0R9KooTaEsZ/SorOHwBDM92suBb4LknJuN3I' +
    'ZleqEk5T1XNF5PneVglNt12TeiofGeWfj9RjdfRqq1iRnj83VQ35sJMRDS1YDejxe6mCEd5a2OoFwo2hazloVNFZMoCNlcUtttKYDwnDkMmTJxcA9tprL399' +
    'PDw8smUD/e1IH0Gp+2SQOSotUdRu8RNCEpJ+oIj8wJFBM9jI4HriKmIXWZGN9VgmIneIyNdIojx2IOk5vJBEXW115zTX7XrFGfdQS+2yD4MMIR0CfAWYo6qn' +
    'uWxKq6phP7scKYn5GqU5PKTlvLOdIYv0Z3U0DZkXkXbgsnWYTW2oBH0IcGpfmH0aYBX1ackxDo/62wG1ncsVjd3o1h41XahgwiLDGjpQ2/MycXUOo28takU1' +
    'UZw81rO/0vVWiQ7IG/KBVoo2R9FWp6LLWtsFMHToUK8Tenh40E2d6W9HLRbVcYY0CHA7cJiIHCciT2djLPzQWSc5jNPoCqegqoi8KiLXisjpJAY/7wA+RJK2' +
    'fAPwGkmweJAh9yaTK1cLgiiZGIuIpO/0YlW9W1X3TE2C+kNMhSPhqqoHAO8tQx0U4FcDyFQy7SW8AliWIf6UoBKepKrj3XuY3iSE9RrvMAHvHVl/aNxVMQ1F' +
    '6REdTImAQD5i9LBOsIZKBMIwMCxv6WRFSycioL4Gcd3nqvUFkqa/nm8HiFFWd+XpioJKb0wREUaMGLHaXxkPDw+P/yKB2dLQLhJF8DAR+YCI3JExjokHgPlI' +
    'zdUad56ibpmQKUF8U0T+ISIzRORYYDuSMsfjgR8As4G3WFvW3F1FjKvoeZElhjEwBbhXVb/kSK72o0iWr5VIgtKx/gRwa39XB9ehEi4ErirRGyVVCUcBp7r3' +
    'kN4khMvrjHilX34zVW1wcrmXfuoF495ZQPKtFe3fuCE/YawFU8nAU/J5w6LFbby+YJXbkvGX6O3n2m04tb4IElSkEBIKby0rsLo9rkbeGMaYhQCzZ8/2V83D' +
    'w4NBWnmTJRUmU2r6KvBzYH+nCN6RCWpXrwr2mBzabgRxjYLoyEhRRJ4VkZki8j8ichCwI4na9WVgJvAiaw2RgkzUQLXIYaoKxyQlhBe5gPshbk0c1Kk6aJyq' +
    'tRtwZMY5tJQ1/4XONTYYeCYO/B+J6mxKLB1V4BRVHZGq3L1FCBfVWTD9GkJI4sDk28PqCbt+qQ10kStg0R5fYBW2GL0CMXGPe9FUIQgCVq3o5PkXl3k9eT2F' +
    'nnQuQjsXgMn3uPFPFcgZ/vN6Kx2dRYypqIfQRFGkCxYseMFXAXh4eAyiCdl2Iw7SjVS8AfwBOBbYVUS+LiJPpqpWqnb5U1lVgrhGQXQKXKoihpmS3JUicq+I' +
    'XCwixwM7A+8CziCJvVjY7TraKpHDbH/hJ4E7VXULRxKCOlbGvkxi3GM3sn5P//0VYKYjPvFAKl129+0LwN8yCuBG7RpIyoY/2c2JueaEcGGd1eymJ2wkSZaP' +
    'J4R1MbBRnY4R2aUgcdvL5EyPF/KCgjVsO/Z1AhOjlfbbG7h/zhv+Iv3XqXHmL6v/DR1vJISwpwqhM/BZ1tboAoYq2zELgiBeuHDhAn+RPDw8BlF/pOlGHNqB' +
    'OcB5JC6Ye4jIJ0XkBhFpdYTEpKqWP4W9qiJGaUluRkVMr0dBRB4SkQtE5ChgD5KIi98A/85c5yw51ArLSCNgf+AuVd3JkcKwntRBR4C2AD5WojqYlkReIiJt' +
    'rsRyoG4QX5Bxsi1VGPuSqjZlXEtrTghfq8PIiXRAvNNPT/WDxyYkuxQqwUICAe3hBCdALEwa28no4UocS4+dRlXBhIaHH3uLYmQxgd87+C+smAO2UNEtLq6d' +
    '/tnXbEV7NKnxz4gRI1afcsopRa8Qenh49DOX0Z6uZ1qAF4AbgZ+SGJnsJiL7i8jZInK7iCzLEA9JXTP9sKibPsTUxbQ7QVwkIjeJyOeBvYGDgItIlC+TMQWq' +
    'hBiG7ue3AW5R1R1d2WtQZ9V9XyCJ0ShFHTTAUhLjlQG5FnDE3YjIHOBfmXFQikq4I3BM2o/YG4TwRaBeF2YH+qmofrDX9lMUwOTHL6ECd1ABbBywybBWthqz' +
    'jK4o6Gn1KWqV5qYc855bynMvLEve2zcSru0f1Bhd8i8wuYozA4mVOXNXrlUMK9jssda+dOmll670F8nDw6OfuYyWu1ZKX/sY8E4R+aCIfMMZmbyUOjN2I4He' +
    'LKafEkQRaReR2SLyFSdqHA/cQqIOVUoM077CLYDrVXV8Sjj6WB0U1zs4jrWRCaYEAyUBrhCRpe7c2YFt9855ZeyopxtQZznSb3uDEC52DL0eT95+vd1U6bEB' +
    'HDQuWcxr15MULEjPbCtFlCgOaRq6kh0mLCOOc/T02adAGAqrWjq57Z8vV5qPx8AqFxVofR5d+RQEzWtKSHt0jgPLitU53lieq+gcqyYfoqWlZZ5rIA+9Qujh' +
    '4ZHplbJ1fEQ9KJFIDUcOIemtQlUbU3XJk8CBRRC7xVy0OHOaI4G9SLIPl2eIYdSD519KCrcn6bvLZ0hZXyEt9TwJGJ2JS9nQvR4AbcD/uc8+kMd+Gh/xL7cx' +
    'ZEpQCdP+0X2A97vS5ZqqwSGwmsTNakIdlY6mTjxbAHuq6uwST6BHLXHOrMRssrDsGTUGodJdKWGfbRZx1eydKxp21kKQN9xwywuc8YV9CEO/d7AmNnLhjVBc' +
    'DvmxLpi+Z+c3bA548ukO3lzahZHK3FyDIGCrrbZa9NJLL/nL5OHhEbvFzx0kJh1NdfqsF5JqqonAtSTW8KWSw7QE7Meq+qSI3DbAFZFBTQ7T8euIjgFURJ4G' +
    'TlfVn5KUVX6JxCsjWz5ZDikskjif/lREznRkIe5DdTANVC+FR6TZhDNF5OW0/3Agjwn3HYuqegFwZRkqISQRHrfVWiUM3Y7Gc8ABPRiUtX5IhMCxInJ3L+fL' +
    'aUbSl14gv/2LwWx28Ip48ZylQdA2No5ERXrw+UXBCvtu8woNDYqtYJhbqzQ353jk8YU8/PibHLjfROJYCQZ1P6GBuAN96zowjT1WB9fcECI89WqAqhIEYHv+' +
    '2DFxHFMsFh/2/YMeHh6ZOWC5iDzXDz7vPFX9gosfiEt8hktmPXGVqu4tIq8P9IWwJ4dvI4fGZfC+AXxXVa8EvgN82o2hyK15yxF0IuAMVb1LRG5wmwxxH6iD' +
    'saqeQNLfGG/EFTPthyuSKKaDxTgyjdD7C/A/wOQSOFdaKnqQqu4PzKnlNU4/yLN1eFHSz3aMy17pzbLRnLsQYcYRrFZHv7kRZAZWp2PYc+ZSiTuekgYD0rMd' +
    'C4NiCyE7bLaU7ccvpaMYYiqoljHG0NVR5Io/PL3WBGXQLq/ixBZ26V2w8ikImyvaWBJArHDTnNXVKMk1DQ0NdHR0POkJoYeHR3aB60oo8+7Pej1yIjKLxBim' +
    'HFUmrXIaB1ydOkT6dphBQw5ttqRURP4jIicBh5E4k4ZlPqglU033S1UdmQyn3htPGXWwEfhKic/ztHfwNhF5wm2KxINkcyAQkXbg8swmUUldO8DptS4pT3cj' +
    'Hq+z6IlsicVW7oa5rhfKRtOb8WUSi9haK4QKfJikNFb7BTk8aIoRkah4x3YvYFYeglrtCfsSgSgOGT5iJfttt4hn5m+CNEQ9pgfWWpqH5rn+phf41lffxTZb' +
    'jcRaxRgZfJvtIqAWffmiioeUVQjzysJF8NQruub/qyCTxzQ0NLxy9tlnL/nmN7/pCaGHh0emEEGsqtp6Vs00QQB8l6Qv7JASVBEyO/4RMAX4hYic4Yhh5C//' +
    '4FINM4rhHar6buBXwKcyhKnUUuQI2Bo4S0T+t5dLR1N18Ahgt0wpaClq+a8GYaxcqhL+Dvg6MLYElTAl/R9R1Z1JKhRqohKmhHAesBIYUWfEJF0snqaq19d6' +
    '8ZiybxF5nqSXoTceLu9whND2VvhkRVgyO7kGcdc/ifSLKlJpJB1H7v48v71r1wrPI+RzAcuWtnHBZY9y/o8PxaodfBGWakECdMnt6JLZkBtaUbmoKkjecO88' +
    'y5IVBYyhx+W9bqFnCoXC49/85jdXlrm77uFRy7Dwwfadxd97FfUDqesHOhl4iMSDodSWm5QAnq6qj4nIVX1U6ufRx4ph6jArIsuBE1X138CPyihFzpYVfkVV' +
    'Lwfe6I1S5FQddP95domxLOnGyRzgHrcZonUUndEbCJ2r6jXAmSXMG+lcnQe+JCKn1aqFzriLugx4optKVg9IXXbeR2LXbHtj4HTLmKnVEbrvkutXQ3lqcsPH' +
    'ZvTTcSEXmQqMZYyAFkLes92rbD1uJR2FgEoU8Uhjhgxp4vdXzuWpeYsIjCEeVBEUbp2nMfriL9yjRKoi1s+6t6PkLcsNdo6qMn78+EcH4c6gR/3agQeD7Ehb' +
    'IYbXWVVQv1rMu4X86yQ9YLbMnMJ0EX+Rqu7qVJbAn9lBOZayZaQ/Bj6XGR9a4hymJAY1X3TChvRWW5eqHszaiLigxEq874tIUUSijMPuYDkK7jz8GFiR4Tml' +
    'GG1+XFUn1ipqJHQ1rZGqPkwSpllvSJWzbwEf7e1G4FqSznSnsb+xDlWEx/Z9NVp0/dNho3ln1KFWpPyFhYgSFUPGjl3GQTu+xu/u2pWmfEysPTCoUYGOkPzo' +
    'iBXv+A/ffOhqbtnpa/2mEreq6uD8K9Eld0N+VNJPWIE6mMvBwkVw15OdiZRSYf9gPp+nUCjcXoebTx4MSpVsKUnLxGCKP0m/eyeJ7bsv3e75Qj4UkTtV9Zsk' +
    'PYWlGoOki/hhwB9V9V1AmzeZGdSqs3Xj6bcuz+9HZZQip+PpU87FdGW6xqxxibeq6te6rdU3tpZf6Eon3z+I5x4DFEh6Rw/IlAlvTCUcAZwGfLsWC9vsQ/BO' +
    '4P/V4eo57SX8iKq+V0Tu8eUVfTlxoXoXoRx8WbF4+zYPEqzes8ep8ungUzh+v2e55r5dXOB5iUNQ3A93BUiDYt+5mNW7v4kZ3smtLzzAVU/ey4l7vIfYWgJj' +
    'BgEZNNC5EPv8DyBsqqhUdE3/YKNw62MxS1uiispF0/7BMAxfPvHEE18699xzxS9CPej7jcb7ROTDfl73+Xc9ROzWIz9T1X1JNq1LJYWpJ8IuwOUicoKrHlJ/' +
    'PQYtKUw3GX6sqjsAJ5ZICtN18kSSzLq/1LI3NV2Dq+pewKEZ59BSjCLHATf7K/42MmzKIP2fVdXzgGXVJv0ms0v/CLAgI03WW0g9wE/TsgrvzNWHWOLGh8iN' +
    'aCBUcC2MUWxnnvfs8DK7bLGE9kIOY7QEby1Fi4IUQ8y2qygc+xxt736JqKETOkLE5Dj75qtYsGoFxhjsgE6r1zWb/nbet6Dj9SRqosLb2IgSF4Urbm2ruFzU' +
    'KeHa2Nj44LnnnruyDucZj8GJ1DkycGVbg+rwl78qRFpd+dbngefLdItMTWY+pqpfF5GoX3gJeNRyPKXGI6eTZISbEsdTWmJ6XC8ob+l7n0HS9hSXsUQwmUXL' +
    'YD+kB3xtHPBpN1ZMtR2C1LH9FuBB6rPJPt1J24+kqTL2vQ/0ZR+hBQjtuMfjThYFOTHawzEjQGQDmoa28okD5hJFuQ0LjkYhTspDg3EF4iNfpu0Dz9M1eiV0' +
    'hGANViwml2dpy1JOueE3ybaK6sBlHxqDBNj5V6Fv/AlyIysqFQWIbaIOPjIX7pvbBZL8f5U864IgkKFDh97gewc96tDcQUVk0B3+6lfPHMStoT5O+WW4qbnW' +
    'j1T1/a6Fx5PCwT2ejIisJHGylTLGkQAHq+qoWkW1uc0PVdXtgI+4cR70JM3KHz1aMivwBVUdltk8qGrWX4ob63ixljoa/UhVd/JN2H1cNjqTQD7w4GKR3F2S' +
    'F61kN8oYi3blOGH/J5m0yWq6igH/ZV2arl06QqTRou9dQMcxc2nfchFxAYjChCxKSmhigqYh3PzM/Zxz11+dwUzMwCSDIbriYfTZryWZg2qrs/8XBlxycyfW' +
    'WgKpuDzP5HK5Zbvvvvs9g9TZ0cPDY2CbzIQi8jhJHpspY45LF4ch8DtV3axWphEe/ao/1QCzgKdLHE8pWdgU2LWGUXJpmeJpQHMJ/W8eVL2Fblvgw9VWCU23' +
    'naw7gJYSXW/6Kqh+iJs0G+nlEE6Pdaz0TW4WYioqPxKgWMyx2bjFnPTep+nsasAYm3lUKhQCRA2661K6jptH2x7zKWoEhXDta9aRTRg0NjPjtmv5w9MPEJqA' +
    'aCCRQqcM0vEG9onPgu0EyVV861qFXCO8+LLy13uSctEK1UEFdMiQIbP/8Y9/LKrT+cXDw8OjklVy5KqtrgD+r4eh9ZOAq9KMOr++GdyLf+dIeUkZinP6pD6g' +
    'Fk7eaYi8qm4GnFRi76BHbdrozlLVXDVVQpM1fBCRN4F6dgDMlo5e6KT1wE+a9FnZaEc0/N643SwOKygbTR1HtRDyhYMfZvNNWukqBohRiAQphMgWbRQ+9Dzt' +
    'B79Iobk9KQ9F1kkE3x4wJpgg5DOzLuKuV+YRmoDiQCCFKRksLMc+egK0vgTBkIpLRRN/GkUaAs67roO2zhgTVMzeJAgCaWxsvNbfOB4eHgzs4GlDki/2SJmk' +
    'MO0nfD9wrmuN8VVQg9v4CuAmEqGmlL779N93r1EfYbrWPoUk5sKrg32nEu4OHF5NldCs40L/oc4zwtJJ83Oq+m3fhN13ZaMzZxIMP/LJJWLyf5cGAe05ITSi' +
    'FIt5Jmy6iM9MeYqO9kaCgsGMLBIf9iptR82ja/wKtMNAbJLy0BIzMggCCjbmQ1edy92v/Jtcf1cKUzIYdxA/fhK6fA7kRoBWbigWW8g3CS+8AFfd0Y6RnjuL' +
    'ZstFwzB8a++9977Tx014eHgMdLdWEeki6SdcUmb5aLq++ZqqnuD7CQd9GbIB3iDJCZcSxlG6pt864wQq1QyiV9WRLitRPRnscyfBr2c2oqSahDB9w38BL5c5' +
    'ifUFKYyBH6rqZ9ykGfoxQi+LhKAgcZi/ykbGilTW82BEsV05vvi+OWy9zQoKey2h67h5tG/3FrYIFMNkVErZW7aYIEdrVwcfuupcbn7hSVc+avtf3aJGCRns' +
    'WoR96IOw+HbIj6kKGUxbNePQ8NWrVtHWGRMaoUKDVgvQ3Nz8lxtuuKHFl4t6eHgMktD6F0mUFMoMGU/nyP9T1Z19P+FgH06iwENlKngTgaFUv4RVgU+697e+' +
    'XLRPORDAgao6pVoqoem2s2VEpBW4ps4DIyVDWH+rqp9Ld9L8xNmLF2FaUgpz/fI9HtCCeSJoFKNaWdloFIVsNnIZZ516C+17L6AYdELX+vsESyeFFhPmWd3V' +
    'wQev/Am/f+IeQpNUYMT9IpJCHRkMYfVzxA99CF12H+RGVY0MqoWwyVJ4oYkd3hjN0HxIIdbkZpMebz4FuVwuGj9+/O/9HePh4THIQuuvB35IYhgTl+kkOBy4' +
    'RlWH+KitQY/Hy3z9JkBTFXsHU3WwkcRMplR10EdL9OwoufqKJJ6kJi6j6Qe5gsQ62dQ5KUwl9MtV9bsiEqe7c37+6DWeYqZNmxUTNF1OYCreRDCiRFGOz23x' +
    'PO9sXI0t5gmMrVJzh8WEOVSEk/90Pt+67VpACETqu4RUXcSPhOjCG4kfPBxWza0qGQQQo9goz8p/NvE/m4/ilr0nc8xmY9BUZZWyxdkYkHw+f/8LL7zwuLtf' +
    'Y3/TeHh4MEhC64H/BW4tkxSmfgl7AL/2fgmDHq+W2K+X/nueJK+uWu1fgRONPgzsWIaZjI+W6NmhZeQ5fkhV96xG8kK4nlKHV1V1FomLUNT9dXXotmOB76vq' +
    'VsCZItLqSkjjes5acpO7DITG58CM+lPc3n5OGNrxUYSK9Ox7iTOCaaTIBZP/zUFP74Nq6XdIKaRQjCFoaOQnd/yJhxe8xIUfPJmdNtkcRbGqBGLqSBW0a/oF' +
    '9YWfYF/6FYiBcGhVySAWzBBh1exmul41dDYW2d4IV+y4GXdOGMnPX1nCw8tXpU8GbIm5jkEQMGbMmIvnz5+fXeR4eHh4MND7CVVV3Z8nAXOALcsotUv7CU9U' +
    '1cdF5Hy3ron82WUw9YpBYirTQeKyX6o611hls6QccFYZKpa6sdrmL2NZyJPEeZSyXI4dP/sK8JlKl8kbInoXA5/oB4YtkjkxnwX2VNVTROQxR7oC59ZVbwhc' +
    'mWs0IDIJD31sZfHWLX5Hk/02q2PnekKPVcJCnOPA4Qs5a+Jr/PTVbQhyncRVqgZWVWIgGDKMfz3/OAcueInvH/oxvrT/YQRisJpsxFVQJll57SaanEIJ0GX3' +
    'oP+eji67PwmdF6mKm2h22pa8pbCgmVWzG5G8xSB0KHQUihwyrIEDdpvEHxat4vzXlvBme+caYriBcts0e/C5Y4455u8XXnihVwc9PDwGaz/hIlX9FIlHgylj' +
    'UZ/6JfxcVR8TkfucI7w35hpchHC1O4b04GcrXS+l5jSHAXuXGESfju+PkSQXBP75X3Kp+CTgQWBECfNEOpccr6rfA16rZH4I1xeIKSKPquqNJBJxPauE3SfO' +
    'dwJ3qeoPgfNEpJhm+tQDMXSSrjoy2Ex1Zf2+wdxk4gmDoZfajsJXjImHWttzlXBN6Wgccs6k57m9ZSxPrmwmCGPiKlbMxC6nsKWzna/87f/40zMPMv19H+HQ' +
    'ybuuMaNRVYwRpDcuT5YIArTPx774C/T1q8AW15rHVLvnURTVPC03D0U7LNLoFEPH+FdFlgDlC5sO4+gxQ7ng9WVc+cYyOuPYvSbJLuz+bYwxZtSoUT+/8MIL' +
    'u9z8MaB2tlOFX1UH7cOrniswPDzqrJ/wXlU9Gzi/jDWVZIxmrlHV/UVkoSeFHn1ASs9m7WZvUEJv26PADXUqyNQz/q2qfyDp1Yw3Mk+Im0uaga+IyNmV+KiY' +
    'jZRi/tD9MtNPnAEDNxiHAT8B5qjqh0TEpva7znhGenvhmP7eTJ/jccDDwJ79PdxTZmATlXDe/MiGV5ghRhy7qXCrxNBkCvxm22dozglqq0/LYmuRIMQ0DeH+' +
    'F5/hsN/9kKnX/ooHX/8PRoTAGAQhtpZYLdVd/LuS0FTtE+OC5l9H532X+N73oq/+X2IkU+0S0WypaKOw6l9D6XxR1pDBt0vZCTFcVowZZZSfTt6EW/bahiPG' +
    'j8K6IPsg018o7oEwZMiQl84555xrB2jvoIqIurlFB+FhPRn08CgrtD4UkQuAq3vYT7gl8Ps123i+n9CjFwQMt149ADi4DHUQkqzwWFVDtwb2x8aPlJ9cDHSV' +
    '6MqevuYkVR1XSQRFuIEdrUBEHlPVPwInugkp6CehjeqWtXsCN6jq7cAvROT2dBJOVUO3sLM1uJG6v3/6ez8AfI0kfJYBk+UyF1VFOu4c/ouoY/nJJrBDbVyh' +
    'SkhSOrrX0CVcOHken31uF8KgQIxUdXdCnRIYNDRh1fKXx+/mL/Pm8P7Ju3LK3u/jA9vtzvCGJmoismTKUrXlUfSNa9EFf4XONxMSmBuVEMZqlohmyWCz0j53' +
    'OKvvzWMa7QaDZkIRigrLChE7N4VcvdMEbt5sJD97ZRHPrGzP9heqMcYMGzbsR6eeemr7AC0XybnJ1wzSGA0DFERkmV82eXiU3IclwJdJzGJ27UE/4QdU9Uci' +
    '8m3fTzgoc+eqIfj0RB08MzMGwxLUwZeBv7nxHvvNQ8oxojIiMs9VaH6kBO6VbriPBj4vIj90lYhxNXsI1V3M77sP1dSPyItk1EKAw4DDVPUhEgfVm0XkjXWY' +
    'u5is9evGBnE3U5j05rNu99xmXjcJOAr4NLB/t3DuARGTITOwujNB87R584u3bXWBabbfsasq6yVMCIZSiPJ8ZvzLPN0+kvPnTyIMO4lqkC4SO1EzaB5KbC13' +
    'znuUO//9KJPHT+KQybvykZ33Y5/Nt2FU05Dq/EJbQFc9C8vuRhfdhq54BKLWhAjmx9SOCLrRJw2WwoIGVlzXAMaW5Nwjjhi2W4U44uiRTRy0x1b8fuFKLp6/' +
    'lEUdXTFgmhobn99tt93+8Oabb8oAC6JPB962wJODNJg3LRmaq6pHiEjBVT/4h76Hx0aCxkVklap+nMRkpqkHpPBbqvqoiPytjj0SPKrbV9ZIeSYxStJzWKmo' +
    'oaq6E3BMGeqgAS5x5o5+fPakiSfhFr8CjsuMASnBYPPzqnohsLonz+SwlHBVVf05ML0fqYTdF2+x+/v+7liqqv8CbgTuF5GXM6piWS5imSW07UYUdwL2IenB' +
    'PAAYm7lhbD87j5SYVG91OgazyS+j1tc/Y3J2UxthpULSm/QTBvxyq6d5sbOJmxaNIcx11YQUpmWkAEFjYvT00pI3eemt17jsgZvZfsLW3HHSt9lixBgXxSA9' +
    '6xUUg336dHT+VY6dBRA0Q360KyONarrXKDmLbW9i+d+GYzsUyZe3/5j2F66MLKEoZ0wYyTGbjOCC+Uvlr4tXypBRo7576623dg3gZvIQ2GyQP7iWD1JC7OFR' +
    'qcnMs6p6Cknmc1yGhX9aHnaZqs4Vkef7Qz+h73msGKNJcik39pROiUMHsKRCcxlx4/XLJM6XG1v/p2RwMXBVml3oL12Peo4NcD9wN0mp7sbOfbas/AQRubQn' +
    'KqEpocTBAD8HXuymuvUnBBlZNXbkbBpwFfCEqj6hqpeq6imq+n5V3UFVh22oOdPV+zaq6iRV3VtVP6yqZ7sS23nAIyRq5Ifc70t/twxIMugcR9kZkUMfWaZB' +
    '4zmmIZBqNN2l/YSqlmu2fYT9RrYQRXnCGgsSsSZ9gyaXJ2weStDQxAsLX2NR68rK5llxGz6r5yb/nR+TqIJrMgdr+L00yRtUbWD5X4ZRWKBIQ89/ZSBJTMjy' +
    'YsQmYuNfbz/e/GHfd9y9YMEbf9VkfhnIDwQ7SENz00Fa8I9vD48em8z8AbigTMOtdJE9BviDM6ar69D6lAz6nseKotU2z6y/SzmPbwHtFaqDVlW3IGkZK8Xn' +
    'Il3fXiMiiwHjq0YqmSZESQyoylWTT1fVpp70EoYl5OgYJ/2eAdyUWRRIPyWGdFMDh5PU8++ReV0HsAroVNWF69kJ2YTE2aeZxAp4XecyypSiBoNiGE9NhDMe' +
    'O+yKePGNnw2b4n2LHVgjFaqEKLEGjAyKzNrxMQ5/dl/mtQ4hDCOiGj9nrLp8QmMw1rK8o9VNmj25C9wPRavQuANMDrRYfefQ9ZFBsRA0sPzPI+l4TjFDKqds' +
    'kvQOaqzK0pjCkdtv/VXuEZ01daph1iw7wPvoBusiZSBkqHp40Meh9V8DdgemlFGBle7870Vi3PFZZ0ZRd0ZPGTK4p4g8kS5QPVEoG/uUWc4/H2ivgISn6uAX' +
    '3Pq2FHUwcCT01+73+mtc2aaRkFQxPk3Sb1yKSmhJqhOPFpFZ5aqEpsQPFojIza68IRgAu/6pShdkyGHsCJyS1PWPJ5Ff91vHsT8wmaRkbIQjg9b9fJxRDkLW' +
    'qpODZCCjzEJk78uKNsifHtsgNkZVqzA5GJSiDZmUb+fWXR5lx6FtRFFYc6WwOzl8vWVZ5S3axeVQWJ6UivbGx1fAKORCll83hPanqQoZXFsFq/GIfC6IGpvP' +
    'l9/c8KROnRpMmzXL9w54eHh4rKfdRESKJArM4jLXVmk/4WdU9VTXpxXUGRkMHan4EPCgqv4gJYKVWOMzOCMf3lXm61905zool3ynpZ6qOho4uUQBKFUH/yYi' +
    'L6WE0l++ypa87r6+qAwOsSYiJI24q8UOd2owcwbw2gAhhVlymCp4YTdHJ1vCoRk5PSWAZjDvnss0Yp1JkP/Aq3O0mLs4GBoEaHXGixGlKw6ZlG/l9l0eZaeh' +
    'bUTFHGFvzT2qvL5qWcXzuxZWQXFlEilRa0aoIIEF08CymaNpeyzEDNHqkUHFNgUSrjThy0O23fcHCgNdGfTw8PCoVj/hfOCkbuuJcrKXz3P5hJFbBNZLXEGk' +
    'qvuRxGzkge+o6qXZ7+5HQUnq6hYZQrixNXv6709QiZdfQiJPBjYt0fTIkLQQnN/vc7WpO1fiax3vKqUFJ+Vm+wLvK/c+M6VOXI7xLwc+U4ENbn8rhzIlHL50' +
    'ivUbzISjJ/xP3Ba8GDQQaJVIYShKIQ6ZmG/j9l0e5t2jWoiKDb1GCuevXFr5hl9hGcRtSfZgjbvcJLTYuIFl1w6n/UnBNFd3O0fUKrkcOnrkaWMvvHDVrKlT' +
    'RXy5iIeHh0ep/YS3AOeUacKVrj2aSfoJx2d8H/qayMSqOhn4K0lbTlpBdQpJFNiItPrMj4KNrs8/QJKtHZew1kyd8h/obnZYhjoYq+ow4ItlqIMGuFNEHk2v' +
    'v798VakiCESkFfgNJfnAv81Y6MxyzS5MD3az/gX8YAC7B3pU02Bm/4dXqTSfohqoVKl0dE0cRRywea6Dm3aew3GbLiGKGjFozdn5m6tWVP4mnQtqfxFiME2W' +
    'aFUzS68cRcc8MEO1qmTQWo1HNeaDrlzjRVvMvPs2Xyrq4eHhUX4/oYh8H7iBnoXWbwP8xi0i+yy0PqNqjQL+RmKGEmcqsCLgg8Bdqrp9Soj9EFhv2aYBPltG' +
    '/yDAC8B/euh8l6qDx5G0RdkyVMnzu0WxeVTHuA7gt8CKMoLqLUnU3n7lqISmBxJmQLKTdVuZ7lgeg7R0NHf4S3fZqPGHwdAgwFZvEyEQpWgDhpmIWe94mG9s' +
    '9RrW5lBN/q0G1aJgApa2t64xmenpb9FaEkJNPqwZCp0vDWXJb4dRmG8TZTCu6kxlhwYSrMQ8bfbb8xs63ZeKenh4ePSkn9Atpj9D+Y7uaT/h0ap6Tl/1E6Yk' +
    'VFVzwCxgN/e5gm5GhhGwJzBbVQ91paXGu5D+V/+YJcmv3q/EqLK05PhuEWl3yrP2YHMiBL5aZu/gHODOVPX2l6/qZeVvkZRel6r6ph4mZ9TMJc8NLusu+Ilu' +
    '4gq9UujBhkpHZxKER5w0I2rN3RsOJVSt3ngxokQaoBZ+suWTXLPDs4zKCXEUEoit8laVQhCwvKOVVV0dGZbYA3S8WZuKawsEijQYVj8wkqVXDyNepUhjdctE' +
    'LWgOKObznYwe/+nNZ1zW7mqYfKmoh4eHR5kLP0cClgOfADrLVHhSUjhdVY/u7X5CR+YC9z1+Axzi1oXrUv/SNeOmwE2q+mURsc7VPvDqYOLQ6dTB75QxDtIW' +
    'pr/0RB10xEMdCd29xKiJdIl1QTqG/d1ciyGhAlxC0qdpSlQJFThOVbcrtZTc9GQ3yw2cxcDxwGoGft6YRyWlo3NRkRlRmBvxybiYWxLkqtdPmLqPKkIhzvGJ' +
    'cS9z324PMmX0KuKooapq4VqFcDUrOtoqSnyla2ENVMGkRNR2NbL8L2NY8fcQJEZy1b87jWrcHAammMufNnHWHU/q1KmBzPBzgIeHh0eF/YQPA2dnykEpM7T+' +
    'd6o6ORNw3Vu5aZGqziARC4obUbRSBTQHXKiqV6rqKN9XuKZs0wKfI1EH4xLVQSERaR7oYSh8SjzOLpFQpr/zJeA6H0Rf882i50jKsEs9zzHQAJyZlpLXJEcr' +
    'E0XxOHBCZuB4dcDjv8fLDKzOnBrIofPmqx12ogahlUBVtXrjJXkaKl1Rnp2aVnDnzg/yo21fZkgQOLVQK966UhQRQ1t7Ky2dbT0Y8prETKAucqJKDqMWJExU' +
    'wPZ5I1ly2TDanhBMU23uSlUtjmrIhSubh166xS2PXnHXlCmh+L5BDw8Pj0oXf5Ejhb8GfkfPQus3ITGZaeyN0PpM3+Bngf91C9EcpSlaqZv7icDdqrpPSmQH' +
    'YzSFO5eRqm4D/KiMzO/0dVeJSHu5ofBuPW9J8jDfnckVLOV3XiwiHT6IvldwYcbEp9Tc9U+p6sRSNohMFXazbgI+n1EJ/YDo/5k3NegnnBXrXYS5w1+4NS7m' +
    'vxo0BoGIVp1EhKIU4xyiyrcmPsPduz3EIWNaiKM81gqBVGY6IyJoHLFwdUvPT1hxFVpYlhBCrbA8VBTTrMSrm1n+l7Es+2MDUQuYJq3JXp1VjUeEYW5VkPvX' +
    'll/6+Bk6dWpw0OzZngx6eHh4UDWTGUPS//N4JueYMqIo9gN+VesyvgwZPJCkVDQq8/elbu4RSc/hPar6VVdCalU1HCy9hZkezAbg98CYEss209esAn7fw1D4' +
    '9PVfLVGBSsfVYuBqH0TfK9UDBngQuMddo7iEeysmcag9pZQ4EFOl3azfkcjMgSeF/ZYI2hJ39XqOg4n1rilh/oj5F9jOhguDYUEIWqTq3diJ9NhVzLP3kKXc' +
    'udODXLPjs2w/pEAc5VErhKIY6ZkSCfDGquU9EAjdi6OVUFyxVi3ske+UYpoUtXlW3TOSxZcNp+0xkLxNhEdbkwjGeIiRoDUIn9PxW06TI8/oYqed1PcNenh4' +
    'eFTVZAZnN38CsLzMDdu01PRUVT25xk6eaZnhC8BVjrz2JJIsfWo1kuQq3qaqO4lINBh6C91iPw1zvxR4TxlKUFq6eYWIvJ4xpClLHVTV3YHDyyCh6e9cWu7v' +
    '9OhxWbYC55WR9ZgS9c+q6uiN9RKaKlomnwd8K1PH7heJ/YcMprt0b9Y44FE5aHasSmAOn39m3NF4fTAsyKnVqBZhkqlaGKnwifEvMWf3+/jx5BcZ1xATFfPY' +
    'OFEMy1INBbCW11cu77FCqMVVUFgBpoySUc0qghYkoO2JESz5zWhabs4Tt8eJi2iN6JlVbIMhiPP5JTJx0ocnXn39Mp0+3ciMGf4h4OHh4VEbd8EXgFPLrMCS' +
    'DCm8SFX3qpXJTIa8LhGRT5OUOZqeZOBlSkhj4DDgPlU9w52HWFWDgVhGmn4nd81/AXya/3Zn3dj6bSlwboVK3RlAvoS8w5QwrgYu9e6wva4S3g48VWKPcTpv' +
    'TAA+tbFeQlOlCSGdvH4C/L8KJgSP3kV644duIj/XDThbU5OZpOtN31w54eNxW3hPONyEtSCFqVooJGrhCFPkm5Pm8sQe9/Pjbf/D1kOKxFGeOApREmK4MdXQ' +
    '1XRkwunL7CEE6FoMWtj4Bk9KAlWRnMU0Kxo10PrIaJb8djTLZzVQXBRhmjURG2t01axi86KGfGNbvPmWH978yhufu2vKlNCTQQ8PD4+aLgADEfkLcG6ZURTZ' +
    '0Po/qurYWoXWOwVPXPnod0jMUIplmuJ0N8eJgVHAr4D7VfV9IhJnykjNACGDae8eqvpb4CxHBsMy6oUM8AMXTVCuOmjcuJjMWj+QoMR1499E5BX3O33bSO+p' +
    'hAXgojLvKQW+pKrN7npLrRRCREQzPYU/A07OyN1+0VifSHegVgIfF5HviEhnav9cc+fRc5Atpj3UEYSNH7Jdwf21JIU4tTBWoVDMMyHXzjcnzeOJ3e/jdzvO' +
    '492jVyGSIy7msLHBOHK4LuXQbYeyqHWlI5zl30LascCVj8oGSCBIoJgmizQERMuGsvKuMSy+fATL/5ajsACkUZGc1LRIWxWbF4zJNRQ6GpqnbX7lP+7XqVOD' +
    'g2fP9vmjHh4eHrVFmv38XeCuDFmiRMUtArYHLq9laL1bA1q3BvwtcCSwIBOHUS6CjFq4H/BP50S6gysjtf1ZMXQEOnTr5k2AG0gyKOMyyGDqPjoHuKSHm/lp' +
    'GeJpJOW6toRSxHQMnu97B/tkPhDgWuCVEjlW+prtgI+4621qRgjX0VP4e+A41kZS+N2DOhpQmdDK+4H9ReTa3m7elhlYnY6RQ19eubKl+ai4K7g/HB7UlBSK' +
    'C7OP1CSKoRQ4edx/uHeXB3hotzl8favX2WFoF1ZzxFEuUQ5V304QFQiS6IlYFeMkz7LQuWBtpUeGAGaVQGkU4rZG2p4exbI/j2bxZUNZeVtAtDTpHZR87Quz' +
    'VbGhqAnz+a7OoUOO2/qmB25W7yjq4eHh0auh9SISAZ8iaesoRylMM/+OVdXv1Dq0PrMG/CeJW+XsTH+g9lAtTH/2ROAhVf1lGqvhiKFx5FD6ERFUd64+ADwA' +
    'HF1GmWi2NKkL+KJTjSjTWTRVB8eRlKmW0juYqoO3AU9m+h49em8+MCLSRtJrWk7UhwJnbWjjwNRoQghE5B/A+x2L7ekukQdVLxFNr/m5wCEi8py7XlFvWwbL' +
    'DKwqZvS0l1cGLc1H2YK5LxxhQtXqG82sq78wQihEeSIL+w5dzE+3eoJHd7uf2bvO4Rtbvc6Bo1bREAbYOFxTWhrZJDpieftqWssOp8+WjMZJRmDeYoaANCgS' +
    '5ikuGULrY6NZ9udEDVz2pzwdT4NGcUIUc71j22SdMpjL5zs7G5qP3ervD96kU6aE4pVBDw8Pj77oJ1zgSFFc5nZguin/PVU9tNah9Zk14KskvYAXZULT4x5F' +
    'Da/92RHAmcBjqvprVd3DVTXFqflMPZLDdRDBTVX1AuAWYNsylcGsOvgNEXkiW3paVkdNsub7PImjaVyCOpgqgr8qNdvOo2ZGTlcCSzJqOiUo7nsAR67PqCms' +
    'dcCqqr4buMJNDLZWRNSjJBeqAPgP8FUXF5LaRsd9GFxvE6Ht5ZV63ZYftBT+Eg6PD4lWxZGIhLUmhmlofdHmUIVmKfDekUt476hFEDfwYmcTT3WM4r5Vo5nX' +
    'luc/xbHMbwt4o7WNlq4uRjQ2U/qsmLxKokWoBGhxBIXXu4iWhxQXNVN4LSZaGRKvjJAAJIgxTU5FVOm14mtVjZqNhNrQuKK9eeTUrW64+593eTLo4eHh0deh' +
    '9f9U1W8AP6f0XjPJHFer6n4i8loaGVFjA4yiiHxFVR8gyVAbk9mYlh6WkVpHDL9I4p54i1tj3umUkzX9eVkvi97e8HaLdkOi8FogUtURJC1VZwMTM58vKLPd' +
    'JwR+JyLnp6Y7Pfhssfs8ny9RHUz7FR8iKeH1QfR9u0G0UFX/4DZI4hJzI3Fj78Z1kciwF3aJ3lTVw0kUqa93G9AevRMnkQ6UXwP/IyLL3WRp60HuX0sKX2vR' +
    'mw8/Kta514TDuz4arY5jVIxI7XehDAoCMYKNwqSmVizbNq1i2+aVfGTsy2BztMTNLCsI/+loYISuAEYhJVFCF0pvLS1/L9Lx0DgImolXNWA7YjAWMSBhETMk' +
    'dQqVXp9uVTUaFpqwGDa80jV0zPFbXffPR7wy6OHh4UE95BMGIvILVd0PmFriQjCrEo4HrlHVQ4GiqkqtiJJbuKZmM9eq6lPAJcB7M/2BQQ/LSNO1TR44xh2v' +
    'qOoNwM3APSLS1e3ZFnZrm6kaScwokikJTNdWsfv3icDHgC8Ak7tVbJkekMF/kZiE9NSnI3Br9I8BW5ZJKC7MkBLfPtK3KuElbkw1ZBxnN9ZL+F5Vfa+I3NP9' +
    'GppesklFRP6fu2lfz9SU+92F2hHBKDN5Pg4cKiJfSslgWmJRP7sejhQeeWtXeNgbU21bwy/CJhOIQVR7b5ykqmHosgyLNqQQ5egqNhBZYaS0MbmpjcNHvc7I' +
    '4qvuZ7TkalHb0U7HMy0Ul+SJWgpAhBnC2r5AkzGJ0V4dMKpWo1G5MGzP5R/tGLXJIVtc989HvDLo4eHhUT/9hG4heArwXJn9hGnrzruBn9a6n3AdZjPzgIOB' +
    '/80QkKiHTzrpZjxjga1J1JLbgbmqerGqHq+qkxwpjVJDGve5UnfUMHMEmcOs58i+JsyUgqp779T0ZoSqflhVrwKeAX7myGCccfOUHpDBp4CPiUhnT0htRh1s' +
    'cOerlB3tVB18HrjBq4N9rxK6/s0XgL+W2EsoGSX49HXZ5Jte+uCpve7fgXcBMzM7IxHepYgaRUmsIHEnO1BE7nSTmdTrro4jhaKqEhzx+tfizoYvSZiLwjxG' +
    'tfd7UMUphylBFCAioKghhaLBdpYf26jtbWjbckxTgISyVgW0fZfeqWBFVUc05MK25iGz2sdtdshWs+54Rafi3UQ9PDw86m8h2EJiMtNWZv5RSsK+oqqfSE1g' +
    'euFzR04cUBH5PolKOMetU6QC48GUGKbqR7qenEzinPknR2Iecj2Hp6nqAao6XlUb0p6+zBFnDrueI/uayBn+oKqjVXVfVf2qqv7JEfa/ues00n022wMimCWD' +
    'TwKHi8iSCkp+097BY4Adygyiv9SV5Qb1JCgM1unAEfMLMoS91LLrD6rqLqnSS61LRtexs5XWwC8AjnfS/rmsraOu+W7VIDGMSS2BrwZ+JCL/yRDyuP4feKgq' +
    'oncRysFv/Fpv3fnf1iz7XTg03ipqtRFI0BslpOt/+qRRFBGyhhBqSZadiGBbV2NXrYQgBNv386lVjRuMBCbM0d7Y9N0JNz/6Q9Si0zEyw7sDe3h4eNRhD1Eo' +
    'Io+q6pdJ+ufK6SdMVcX/U9VnReSp3lgfdBMHHlTVg4GvAd8kyUus1GPCZMLtbWaR3ATs444UbSQlpq+TOLcuBhYCy93fY/dnZ7ffkQPGAUOBzUjKLbcAtgLe' +
    '4f6tO5FK17ZhBW0/IfBP4ARHBiu5Xul5/lqJ29DpeVwI/D5VGP2dWB9B9c6r5V8kJp6l8Ki01PpMksxQepUQrmOXCBH5o6reRaJgnZIpI/WmMz0nggA3Ad8X' +
    'kTmZxmrbn2q9XZJDpDMJ5PC5d7X+dYsDhoywl4fDCkfZ1phYxRrpyzEioDHa+VbZzDRe/BYax0iYK8OdlJqUiKJqR4ZB0CHBAjts6KkT/v7gTZo2wc/w5SAe' +
    'Hh4edboYTD0afq+q+5IYrJS6qS6OBAwlCa0/EFhZy37CdSxkAxHpAL6vqn8BZpD0RGarnEwFqmH25zVDrFJCPATYxR21WJNlS0LDCohbura7GjhVRDoqMQJM' +
    'iaTz9di7xCD6VEH8jYis8L2D9TUVuD9/6QihlLhxosDHVPWHwKup2mz6Yncr05D6loh8CTgQuDWzw2P9DsRGb9Duk86tJH2CR4vInLQGvt56BcsaK9OIdSbB' +
    '0I/Mf0ve/+bRxbbct0w+LOQaMaoaqfZVqbEziOla6j6oKU0hBOIliyGOQaQPu5GJQ5Dh+VzQkW+8oTh2k/02+/uDN+nUqYGAFV/C7eHh4UE/Ca0/k6T8sieh' +
    '9TsBl7k1Qq/FNThSIm4d+G8RmQZ8mKQkMsiY4NiqdX8kxCzoprzF7jxEmd+3MdUsq0Bmf1YzZXlhBZEMqQeEAQrA2SJyYoYM2grXjgBnZDYGSiGDq4HfdFMY' +
    'PeonqP524Ikyegmt2xT5YjY+xPSx3JlOCA+LyBHAR4CHM7sinhj+945RnNnlSongYSJyRKZPMCWC/f7GlWnEqohiJX/kgp8U45EHx3H+sXB4EBqjotoX40NB' +
    'QrTg8gTXbLhsHNHShWgc90l8jyaTRzwslCDIhS2tuaYzNrvjiWO3mPWvBTp1auAD5z08PDz6XWh9AfgESSaZKTO0PgKmqurZrhfO9ObnT8ve3JrleuAA4MvA' +
    'SzUghusiiSl5CzO/TzbygJaMeJH9WamyB8RTJFnR52X8H2wFtpSBE2P2AQ4tM4h+ZiaqxG8Y19ccELh79/wyxmC6aD1RVcc5YmlMX3+ZzIQgIvI3NyF8rBsx' +
    'ZBCbz2TVwPR8tAJXkZjFHCEid2TItR0IRLB7CamA6l1Twvzhzz/wev7Qd8eFxnPIBW3hEAkUjXvTiTTpBwyhawnE7SVexIxCaHtXIVRQqxo3CGZ4Phd05Ztu' +
    'jpuHvWvSbY9coKoyHYwngx4eHh79NpPsJZLWG8nGKlCayYQFzlXV96XlnH1YNdYhIhcDe5GoWP/JEDXtpsQxwFp/UsOZTuDHbn13n+sXtVUgYunPn5m57rKR' +
    '16cmRBc4JcoH0ddnHI2QuI2+UuKmUDpPjAdOdmPLmHqZ1JwFcBqH8GdHDI8jUcDo5kYVD3ByqJnvmVUDnwOmA7uLyKdF5IEMEdSBXtctB8+OVDFbH3xlZ/j+' +
    '+TOiaNh746787WFTGIQNGFXiXisjNSEUlpZMCMUkz1i7bAkEQa/0D7o+wShAZXQ+DEyYe6m1sfHEze544qjNb3zwubumTAkFdIYvAfHw8PDo76H11wM/cGul' +
    'uMwepAC4UlU3z8aF9WHV2EoRucARw1OBx7qthaIyiW9/aP0xwD+A94jIt0WkLY3LqEJonXGRJTsCHy0jiF6Am0Xkaedu6zeO61clbAUuK8N1OC0ZPk1VhwOx' +
    'qcOJTTLE8DpXSroviRy6wN042UlhIJDDbD17lgQGwCrgz8CxwF4i8j0ReTnTI6iD6SZdE01xF2HDES89Hh6+4ANx3PQxK7lnw2EmCHOIqka2psTQzaVRGxSW' +
    'va1HcEMOo1hL3LIMCcKaDllNJv5YUBmWC0IJc63tDU0/aZu0zd6Tbn70alUVBeMjJTw8PDwYMKH1JBl/t5RJCtOyzIkkofVhxtK+r6rG0nXgahG5jCSu7EPA' +
    '9UCX+36mn5JD2y0nWoC7gWNE5EPOPTaotET0v0+tKEk5br4EdTC7WfCrbv/tUb+9hL8FlpXYx5S+ZgtgqoioqUe2m50Q3E3xiIicCewKnATcSGIbnK3djvvR' +
    'xNC9oZlMOWhKAv8OfB7YSUQ+JiI3iEi7C0IdMD2CPS4hPZhIp2NUkfDQV/9sXt9+HwoNZ1lyb4TDgjCXQ1SJtGbql4BGaBlZhLazHbtiuVMIa0cEjaoMzwVB' +
    'EITR6iB/TWHUmH02veXRb2195Q0tqSoo/UsVzCrm/qivoyc90PV0eHW8d+7fjR0e1eknVOBk4FXebjKzsfOflgYeBPzYbTKbelkHikhRRP4hIh8Gdge+TWJA' +
    'Y9dBDuM6Wwdqt4zEtPewAFxHkit4sIj83X3fqpoBOnXQqurmwMczmYIbGg8pYX0QmF3P+dUeayJdjIgsIYmhkTLufQVOV9VcWOcTXJwZ0CIiK4ArSUobtgE+' +
    'ABwF7A+MWUdNdncbYunjh2H63+tyoHrD7RLdAfxLRN7odkOLi4/wqk56UWdgmQGqBCKzO4Ffrrxjn6uGdC4+RbTztHCYTqRgiQprxoKRao0BMWCLsIYQlpAL' +
    '2tlJvHxpohCqrXawvA1FwiG5MGhHujqDcJY0DP3VFjfd9xiATiVgFlb6pyrYkNks8eh7pNdhRJk/N6SOrmP6GYb6y1nz5181X+ex8X7CRap6IkluXViiGpQl' +
    'hV9T1UdEZGZfRwxkMqxTIxcVkeeBH6vqucB+wNHAEcDOJOoX3QLdpZfXgd0X22G3GIy5jgjOFJFnukdC1OBeEDc2TgVGZjIrtQSF8IJMeLknhHU+17r75FLg' +
    'CyTZnlpiD/FuwEfDfsR+cV82AGIReRm4BLjEueS8G5gCHEwSEjqMdTfuri+zpqeSuHabBNZ1wtf1vm8AzwB3AY8Cc0SkPXNls9/V72JvWDGMVRFmYeTQR5YB' +
    'P9Zbd7q02L7yUwY9NWyKdgTFdlisSowgUvHuZ6oQLtr4oHElo/GK5WhHe1Vad5P+QCyoNAXG5IPAdFhZ1pHL/dkOG/abiX+95wn3uiT3c1a/nMzTcf8U8Hug' +
    '6DNK62aRHwDz0zl1I7vZ6b/dQlL90FUHpNCShEw/5glJzWBKzGELK8yd8/jvfsJ7VfVrlOc8mM2mvkpV/yMiT1Qh6qAWAkHaW/egO76jqruTeE9MIQmh33I9' +
    'Yy/eSIkkJZitrG8jQzLjPkUXif/DzY6k3yMixW5iR1wL4p2qjao63pGE7DWWjYyDecB1bi3q16D9Z0PoRVX9K/DpMuZpgO9IP6bCqe3vf0nrqrotSeDo/iTh' +
    'm1sDm5MoDaXs7GxsgSDdTuTGFh5vuuMJtwCZBzwjIqtK/U4eJRuAJsRwmnt4PDs1H73+wNFG7GeR+BDTqA0UlKigFkRRRHoSci8hFJYgk8/E7PJz0Cj5/9Y5' +
    'AmIwAZ0P3cPir34Gyed7ZCqThskD5I0EjcYQiaFTZG7Y2HhNftioP4z58+2vryGC052K6uHh4dF7z2ZxJnFbuWdvsYQFdh54S0T+3VsB6YPkGrzLbXyUcz4V' +
    'aATmi8gL9Xo9Mq6X/1XOqKoNJC1GO5GoiDs7grip+261xDISv4tHgXuAx7NKYKoGOrXT9tI4GAXs6e7FUq5/3l3/F/392L/ue/fXsY4DlVMRFsgAOgkm3SFb' +
    'x78PdZPBFsBkYHtgO2A0SanpCBJFsaEHv76NJLRzNbDCTQYvAy+6YwHwmogsXw+pTa+B9Tdd7YghgN79jl1t1D6VqHisCXRXchYiJepUJZ2YFSNSwo6qBFBs' +
    'QSZMxex99VrjmHUhjiEIaLvxLyybcTYyZChYW2pahQVVBZMXMY1hMmQ6VN6yYfhPMcFVE277xr9EpsVrSkN3QgcSEfR219R99UYZm3j9+jt4eHjUvUiwzugt' +
    'VR0GTAI2c2vBbUiEgoluDdjk1oF5V8Ewcj0B7Z0k/X8r3fGWW/O9QJKfOF9E5q8rB9Cv9TzqGSEDp6E6XsfEkDZat5LUbc9dx0063E0CQ0l6XBrcn2M3UHu/' +
    'wP2+NqCdJBew1f2eDU1W2feyfiFSW+MZIFYQZmKYi8pBzz8DPKOPnvL94pI79g/i4keR4nvCkD1psAECdFqiSBRRi0r6EJD/JomZcHpSMqgb5C3x8qVoFLEu' +
    'vqm4rMWE/aiKBCYpBw1CE1BE6II3V4vcnwvDv5rRo+6e8Kd/LUq+7DR06tSAWbNsPy0NLckwwY/qwUMePQbWRm2pP+LHSNWvQSWl2f2KuLixY7ttImbXgatJ' +
    'qrPmredc5dw6MMwQQu1WGdZKUgJaAFZvaLxmzr26aLW4H92L/n4cXHPvwCGEG5oYupcWrGPCW0XS11Kri6D+xurDsQBKWj6qGGYhsvdlReBe4F7V6WHhpst3' +
    'yZumD9i4891Ww3eF+WgMeRMQAF0WiopVwVpVBAsCVgUCobAMog4lbJb1EUKrigGNly4WtRYEVUXFKX8iYgKQUJCmMEDE0BlbOo0pdqh9VHKNj4Rwo9l8mycn' +
    'XjFryZqBNZUAppIQQR8s7+HhUb8btR5901M4mF1XS1wHpmvBIkmVV4qFPSTcfU4A/b3o596eXG/xTPq/ytGEnhnK4MsA+lc5qRPX3t57cM+7N6H9P1vHMuyg' +
    'IF65XUS4B7Cd2MKQoCEMk24MC1agWAQZAofNY90eRm/Hiv85nbab/kbDyFGEajEiRCK0FyNUpMM0NLwlHZ2PMWzoSyaW2bapce7Ev9/3erbfUKdOTR5As2ZZ' +
    '8aqZh4eHh4dHNfuvSjaV8Ws+D3zJqC9H8+j/5aRryCEId2M4CCty3xJgCSx6GEAfvTRH18WjWPXaxDgYv7d0dW5NvHJsbM0EEw6drASbmJUvvWZG7BGCHQPG' +
    'rmPTpQgsKrSs2EKHjYi7jHm5o7PwuuTyi82IMW/pqmVPBkV9rn2H96zc/sIL/0ut1ilTQsaN03NmzVKvBHp4eHh4eNRkLehjUDwGLf4/biMkeUn3TaAAAAAA' +
    'SUVORK5CYII=';

function b64decode(s) {
    var k = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
        var c = k.indexOf(s.charAt(i));
        if (c < 0) continue;
        buf = (buf << 6) | c; bits += 6;
        if (bits >= 8) { bits -= 8; out.push(String.fromCharCode((buf >> bits) & 255)); }
    }
    return out.join('');
}

function placeFooterLogo() {
    try {
        var f = new File(Folder.temp + '/golfrsa_footer_logo.png');
        f.encoding = 'BINARY'; f.open('w'); f.write(b64decode(GOLFRSA_LOGO_B64)); f.close();
        var d = new ActionDescriptor();
        d.putPath(cTID('null'), f);
        executeAction(cTID('Plc '), d, DialogModes.NO);
        doc.activeLayer.name = 'FOOTER LOGO';
        return doc.activeLayer;
    } catch (e) { return null; }
}

// ---------- build ----------
function glbBuildCard() {
    var C = CFG.colors, m = data.meta;
    var nR = data.rounds.length;
    var rows = data.rows;
    var nRows = Math.max(1, rows.length);
    var docW = doc.width.as('px'), docH = doc.height.as('px');
    var S = CFG.scale * docW / 1080;                  // one scale factor for everything
    function z(v) { return Math.round(v * S); }

    // --- widths driven by round count ---
    var roundW = z(nR <= 2 ? CFG.roundW2 : CFG.roundW);
    var nameW = z(Math.max(CFG.nameMin, CFG.nameW - 15 * Math.max(0, nR - 2)));
    var pad = z(CFG.pad), posW = z(CFG.posW), gap = z(CFG.nameGap), totW = z(CFG.totW), parW = z(CFG.parW);
    var cardW = pad * 2 + posW + gap + nameW + nR * roundW + totW + parW;
    cardW = Math.min(cardW, docW - 40);
    var R = docW - z(CFG.rightMargin), X = R - cardW;

    // --- heights driven by row count ---
    var headerH = z(CFG.headerH), colHeadH = z(CFG.colHeadH), footerH = z(CFG.footerH);
    var avail = docH - z(80) - headerH - colHeadH - footerH;
    var rowH = Math.min(z(CFG.maxRowH), Math.floor(avail / nRows));
    var rs = rowH / CFG.maxRowH;                      // row text scale (already includes S)
    var cardH = headerH + colHeadH + rowH * nRows + footerH;
    var Y = Math.round((docH - cardH) / 2);           // centred vertically
    var radius = z(CFG.radius);

    // --- column anchors (from the right edge in) ---
    var parR = R - pad;
    var totC = parR - parW - totW / 2;
    var roundC = [];
    var firstRoundRight = totC - totW / 2;
    for (var i = 0; i < nR; i++) roundC.push(firstRoundRight - (nR - i - 0.5) * roundW);
    var posC = X + pad + posW / 2;
    var nameX = X + pad + posW + gap;

    // --- type sizes driven by row height and column widths ---
    var fRound = Math.min(21 * rs, roundW * 0.44);
    var fName = 24 * rs, fClub = 16 * rs, fPos = 28 * rs, fTot = 26 * rs;

    // --- remove previous build ---
    var old = findTop('LEADERBOARD');
    if (old) old.remove();

    var userLogo = findTop('LOGO');
    var footLogo = findTop('FOOTER LOGO');
    var G = doc.layerSets.add(); G.name = 'LEADERBOARD';

    if (CFG.shadow) {
        var sh = roundRect(G, 'Card Shadow', X, Y + z(10), cardW, cardH, radius, '000000');
        sh.applyGaussianBlur(Math.max(4, z(18)));
        sh.opacity = 45;
        // cut the shadow out from under the card so it doesn't show through the see-through green
        doc.activeLayer = sh;
        roundRectSel(X, Y, cardW, cardH, radius);
        doc.selection.clear();
        doc.selection.deselect();
    }
    var cardBg = roundRect(G, 'Card Background', X, Y, cardW, cardH, radius, C.green);
    cardBg.opacity = CFG.cardOpacity;

    // header: event logo lockup, venue + dates, round line
    var H = G.layerSets.add(); H.name = 'Header';
    var logoX = X + z(24), logoY = Y + z(22), logoW = cardW - z(48), logoH = z(140);
    if (!userLogo) rect(H, 'Logo Placeholder (add a layer named LOGO)', X + Math.round(cardW / 2) - z(230), logoY, z(460), logoH, C.dark);
    var vd = String(m.VENUE).toUpperCase() + (m.DATES ? '  \u2022  ' + m.DATES : '');
    txt(H, 'VENUE + DATES', vd, X + cardW / 2, Y + z(196), 18 * S, C.sub, false, 'center', cardW - z(56));
    var halfW = (cardW - z(56)) / 2 - z(8);
    txt(H, 'ROUND', String(m.ROUND).toUpperCase(), X + z(28), Y + z(250), 36 * S, C.white, true, 'left', halfW);
    txt(H, 'ROUND TAG', String(m.TAG).toUpperCase(), R - z(28), Y + z(250), 36 * S, C.gold, true, 'right', halfW);

    // column headers
    var ty = Y + headerH;
    var CH = G.layerSets.add(); CH.name = 'Column Headers';
    rect(CH, 'Column Header Bar', X, ty, cardW, colHeadH, C.grey);
    var lb = ty + Math.round(colHeadH * 0.66), lf = 14 * S;
    txt(CH, 'Label POS', 'POS', posC, lb, lf, C.muted, true, 'center');
    txt(CH, 'Label PLAYER', 'PLAYER', nameX, lb, lf, C.muted, true, 'left');
    for (i = 0; i < nR; i++) txt(CH, 'Label ' + data.rounds[i], data.rounds[i], roundC[i], lb, Math.min(lf, roundW * 0.32), C.muted, true, 'center');
    txt(CH, 'Label TOT', 'TOT', totC, lb, lf, C.muted, true, 'center');
    txt(CH, 'Label PAR', 'PAR', parR, lb, lf, C.muted, true, 'right');

    // rows
    var RG = G.layerSets.add(); RG.name = 'Rows';
    var rowGroups = [];
    for (var r = 0; r < rows.length; r++) {
        var d = rows[r], y = ty + colHeadH + r * rowH, lead = (r === 0);
        var g = RG.layerSets.add();
        g.name = 'Row ' + (r < 9 ? '0' : '') + (r + 1);
        rect(g, 'Row BG', X, y, cardW, rowH, lead ? C.cream : (r % 2 ? C.alt : C.white));
        if (lead) rect(g, 'Leader Bar', X, y, Math.max(4, z(7)), rowH, C.gold);
        var base = y + rowH * 0.636;
        txt(g, 'POS', d.POS || '', posC, base, fPos, C.dark, true, 'center', posW - 4);
        txt(g, 'NAME', String(d.NAME || '').toUpperCase(), nameX, y + rowH * 0.5, fName, C.dark, true, 'left', nameW - z(8));
        txt(g, 'CLUB', d.CLUB || '', nameX, y + rowH * 0.795, fClub, C.muted, false, 'left', nameW - z(8));
        for (i = 0; i < nR; i++) {
            var v = d[data.rounds[i]];
            txt(g, data.rounds[i], v ? v : '\u2013', roundC[i], base, fRound, C.muted, false, 'center', roundW - z(6));
        }
        txt(g, 'TOT', d.TOT || '', totC, base, fTot, C.dark, true, 'center', totW - 4);
        var par = d.PAR || '';
        txt(g, 'PAR', par, parR, base, fTot, par.charAt(0) == '-' ? C.red : C.dark, true, 'right', parW - 2);
        rect(g, 'Divider', X, y + rowH - 1, cardW, 1, C.line);
        rowGroups.push(g);
    }
    for (r = 1; r < rowGroups.length; r++) rowGroups[r].move(rowGroups[r - 1], ElementPlacement.PLACEAFTER);

    // footer: GolfRSA logo (built into this script; override with your own FOOTER LOGO layer)
    var fy = ty + colHeadH + rowH * nRows;
    var footBoxH = Math.round(footerH * 0.46), footBoxW = cardW - z(80);
    if (footLogo) {
        fitLayer(footLogo, X + z(40), fy + Math.round((footerH - footBoxH) / 2), footBoxW, footBoxH, false);
        footLogo.move(G, ElementPlacement.PLACEBEFORE);
    } else {
        var F = G.layerSets.add(); F.name = 'Footer';
        txt(F, 'FOOTER TEXT', m.FOOTER, X + cardW / 2, fy + footerH / 2 + z(11), 30 * S, C.white, true, 'center', cardW - z(80));
    }

    if (userLogo) {
        fitLayer(userLogo, logoX, logoY, logoW, logoH, false);
        userLogo.move(G, ElementPlacement.PLACEBEFORE);
    }

    return { rounds: nR, rows: rows.length, width: cardW };
}

function glbRunBuild() {
    if (!app.documents.length) {
        doc = app.documents.add(CFG.docW, CFG.docH, 72, 'GolfRSA Leaderboard', NewDocumentMode.RGB, DocumentFill.WHITE);
    } else {
        doc = app.activeDocument;
    }
    if (!findTop('PHOTO')) placePhoto();
    if (!findTop('LOGO')) placeFile('STEP 3 of 3: Choose the tournament LOGO (Cancel to skip)', 'LOGO');
    if (!findTop('FOOTER LOGO')) placeFooterLogo();
    RESULT = glbBuildCard();
}

var RESULT = null;
(function () {
    var f = pickFile('STEP 1: Choose the leaderboard SCORES CSV (not the script)', ['csv', 'txt', 'tsv']);
    if (!f) return;
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) {
        alert('That file is "' + decodeURI(f.name) + '", not a CSV.\nRun the script again and pick your scores .csv file in the second window.');
        return;
    }
    try { data = processData(readCSV(f)); } catch (e) { alert('Could not read CSV:\n' + e.message); return; }
    if (!data.rows.length) { alert('The CSV has a header but no players with a NAME filled in.\nCheck there are player lines under the POS,NAME,CLUB... header.'); return; }

    var oldRuler = app.preferences.rulerUnits, oldType = app.preferences.typeUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.PIXELS;
    try {
        if (app.documents.length) app.activeDocument.suspendHistory('Build Leaderboard', 'glbRunBuild()');
        else glbRunBuild();
        if (RESULT) alert('Leaderboard built: ' + RESULT.rows + ' players, ' + RESULT.rounds + ' round(s), card ' + Math.round(RESULT.width) + 'px wide.');
    } catch (e) {
        alert('Build failed at line ' + e.line + ':\n' + e.message);
    } finally {
        app.preferences.rulerUnits = oldRuler;
        app.preferences.typeUnits = oldType;
    }
})();
