// Pure capture-parsing for StudyTracker's Expenses tab (Phase 3).
// Dual-target: Node (require, tests) + browser (window.ExpensesCapture). No dependencies.
// parseCapture(ocrText) -> { amount:number|null, date:string|null, description:string }
(function (root) {
  "use strict";

  const KW = /(grand\s*total|subtotal|total|amount|paid|payment|nett?)/i;
  // currency figures: optional $ / S$ / SGD prefix, then a number that HAS 2 decimals.
  // (?<![\d.]) / (?![.\d]) keep a date like 12.10.2026 from reading as $12.10
  const AMT_G = /(?:S\$|SGD\s*|\$)?\s?(?<![\d.])(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?![.\d])/g;
  const TOTAL = /\b(grand\s*total|total)\b/i, NOT_TOTAL = /sub\s*-?\s*total/i;

  const toNum = (s) => Number(String(s).replace(/,/g, ""));

  function parseAmount(lines) {
    const hits = [];
    lines.forEach((line) => {
      AMT_G.lastIndex = 0;
      let m;
      while ((m = AMT_G.exec(line))) hits.push({ val: toNum(m[1]), kw: KW.test(line), total: TOTAL.test(line) && !NOT_TOTAL.test(line) });
    });
    if (!hits.length) return null;
    // a receipt's (last) Total line is the amount, not the subtotal, the cash handed over or the change
    const totals = hits.filter((h) => h.total);
    if (totals.length) return totals[totals.length - 1].val;
    const kwHits = hits.filter((h) => h.kw);
    const pool = kwHits.length ? kwHits : hits;
    return pool.reduce((a, b) => (b.val > a.val ? b : a)).val;
  }

  const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const pad = (n) => String(n).padStart(2, "0");
  // strict: "Jul", "July", "Sept" are months; "Junction" or "Marina" are not
  const FULL = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const monNum = (s) => { const w = String(s).toLowerCase(); if (w.length === 3 || w === "sept") return MON[w.slice(0, 3)]; const i = FULL.indexOf(w); return i >= 0 ? i + 1 : undefined; };
  const validYmd = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? y + "-" + pad(mo) + "-" + pad(d) : null);
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // A year-less "12 Mar" is resolved to the most recent such date not in the future (so a
  // late-December receipt read in January lands last year, not next year).
  function resolveNoYear(mo, day, ref) {
    if (day < 1 || day > 31) return null;
    let d = new Date(ref.getFullYear(), mo - 1, day);
    if (d > ref) d = new Date(ref.getFullYear() - 1, mo - 1, day);
    return ymd(d);
  }

  function parseDate(text, now) {
    const ref = now instanceof Date ? now : new Date();
    let m;
    if ((m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/))) {
      const a = Number(m[1]), b = Number(m[2]);   // SG is day/month; a "month" > 12 means it was US month/day
      const r = b > 12 ? validYmd(m[3], a, b) : validYmd(m[3], b, a); if (r) return r; }
    let mm;
    const reA = /\b(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})\b/g;
    while ((mm = reA.exec(text))) if (monNum(mm[2])) return `${mm[3]}-${pad(monNum(mm[2]))}-${pad(mm[1])}`;
    const reB = /\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g;
    while ((mm = reB.exec(text))) if (monNum(mm[1])) return `${mm[3]}-${pad(monNum(mm[1]))}-${pad(mm[2])}`;
    // --- year-less dates beat "Today"/"Yesterday": a bank screen showing "Yesterday 10 Jul" read a day
    // later must still land on 10 Jul, while the relative word is only right on the day it was taken ---
    const reC = /\b(\d{1,2})\s+([A-Za-z]{3,})\b\.?/g;   // "10 Jul"
    while ((mm = reC.exec(text))) { const mo = monNum(mm[2]); if (mo) { const r = resolveNoYear(mo, Number(mm[1]), ref); if (r) return r; } }
    const reD = /\b([A-Za-z]{3,})\.?\s+(\d{1,2})\b/g;  // "Jul 10"
    while ((mm = reD.exec(text))) { const mo = monNum(mm[1]); if (mo) { const r = resolveNoYear(mo, Number(mm[2]), ref); if (r) return r; } }
    if (/\btoday\b/i.test(text)) return ymd(ref);
    if (/\byesterday\b/i.test(text)) { const d = new Date(ref); d.setDate(d.getDate() - 1); return ymd(d); }
    return null;
  }

  // non-global copies for per-line tests (avoid lastIndex state)
  const AMT_T = /(?:S\$|SGD\s*|\$)?\s?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})/;
  const DATEISH = /\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/;

  function parseDescription(lines, amtIdx) {
    const cand = lines
      .map((l, i) => ({ l: l.trim(), i }))
      .filter((o) =>
        o.l.length >= 2 && o.l.length <= 40 &&
        /[A-Za-z]{2,}/.test(o.l) &&
        !AMT_T.test(o.l) &&
        !DATEISH.test(o.l) &&
        !KW.test(o.l));
    if (!cand.length) return "";
    if (amtIdx != null) cand.sort((a, b) => Math.abs(a.i - amtIdx) - Math.abs(b.i - amtIdx));
    return cand[0].l;   // already ≤40 chars from the filter above
  }

  function parseCapture(ocrText, now) {
    const text = String(ocrText == null ? "" : ocrText);
    const lines = text.split(/\r?\n/);
    const amount = parseAmount(lines);
    let amtIdx = null;
    if (amount != null) {
      const needle = amount.toFixed(2);
      const idx = lines.findIndex((l) => l.replace(/,/g, "").includes(needle));
      amtIdx = idx < 0 ? null : idx;
    }
    return { amount, date: parseDate(text, now), description: parseDescription(lines, amtIdx) };
  }

  function pendingCaptures(files, txns) {
    const used = new Set((txns || []).map((t) => t && t.capId).filter(Boolean));
    return (files || []).filter((f) => f && f.id && !used.has(f.id));
  }

  // ---- confirm-card enrichment: merchant name + category suggestion ----
  // keyword substring -> category id, checked in order (first hit wins). Only a category
  // present in the caller's list can be returned. Tea/Coffee before Food so a cafe chain
  // beats the generic "food" bucket.
  const CAT_KEYWORDS = [
    ["Tea/Coffee", ["starbucks","coffee bean","liho","li ho","koi the","koi thé","gong cha","chagee","playmade","each a cup","each-a-cup","tealive","chicha san","sharetea","arabica","bubble tea","boost juice"]],
    ["Food", ["wingstop","mcdonald","macdonald","kfc","subway","burger king","jollibee","texas chicken","popeyes","pizza","domino","pastamania","saizeriya","ramen","sushi","sakae","genki","ichiban","kopitiam","food court","food republic","koufu","hawker","eating house","chicken rice","nasi","cai fan","mixed rice","noodle","mala","hotpot","dim sum","restaurant","bistro","canteen","bakery","breadtalk","swensen","ya kun","toast box","old chang kee","4fingers","4 fingers","guzman","stuff'd"]],
    ["Transport", ["grab","gojek","tada","comfortdelgro","comfort","taxi","ez-link","ezlink","ez link","transitlink","simplygo","smrt","ryde"]],
    ["Groceries", ["ntuc","fairprice","fair price","giant","cold storage","sheng siong","prime supermarket","don don donki","donki","mustafa","cs fresh","hao mart"]],
    ["Shopping", ["uniqlo","cotton on","zara","h&m","shopee","lazada","amazon","qoo10","decathlon","muji","daiso","popular bookstore","challenger","courts","harvey norman"]],
    ["Entertainment", ["golden village","cathay cineplex","shaw theatre","netflix","spotify","disney+","steam games","playstation","cinema","timezone","karaoke","k-box"]],
    ["Bills", ["singtel","starhub","simba","sp group","sp services","town council","circles.life","great eastern","ntuc income","insurance"]],
  ];
  const MERCHANT_NOISE = new Set(["bat","sg","sgp","sgd","pos","pte","ltd","visa","mastercard","nets","paynow","paylah","txn","ref","sgpore"]);

  function suggestCategory(text, categories) {
    const t = String(text == null ? "" : text).toLowerCase();
    const ids = new Set((categories || []).map((c) => c && c.id));
    for (const [cat, kws] of CAT_KEYWORDS) {
      if (!ids.has(cat)) continue;
      if (kws.some((k) => t.includes(k))) return cat;
    }
    return null;
  }

  // A clean, brand-ish merchant name. If a category keyword matched, take the line
  // containing it and strip transaction noise (digit tokens, bank/country codes).
  function guessMerchant(text, categories) {
    const lines = String(text == null ? "" : text).split(/\r?\n/);
    const tl = String(text == null ? "" : text).toLowerCase();
    let kw = null;
    for (const [, kws] of CAT_KEYWORDS) { const hit = kws.find((k) => tl.includes(k)); if (hit) { kw = hit; break; } }
    if (kw) {
      const line = lines.find((l) => l.toLowerCase().includes(kw));
      if (line) {
        const cleaned = line.split(/\s+/)
          .filter((tok) => tok.length > 1)
          .filter((tok) => !/\d/.test(tok))
          .filter((tok) => !MERCHANT_NOISE.has(tok.toLowerCase().replace(/[^a-z]/g, "")))
          .join(" ").trim();
        if (cleaned) return cleaned.slice(0, 40);
      }
    }
    return parseCapture(text).description;
  }

  // One call for the confirm card: amount + date + merchant + suggested category.
  function describeCapture(text, categories, now) {
    const p = parseCapture(text, now);
    return { amount: p.amount, date: p.date, merchant: guessMerchant(text, categories), categoryId: suggestCategory(text, categories) };
  }

  const api = { parseCapture, pendingCaptures, suggestCategory, guessMerchant, describeCapture };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExpensesCapture = api;
})(typeof self !== "undefined" ? self : this);
