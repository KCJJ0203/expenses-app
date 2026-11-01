// Pure sync/merge logic for StudyTracker's Expenses tab (Phase 2).
// Dual-target: Node (require, tests) + browser (window.ExpensesSync). No dependencies.
// State shape: { txns:[{id,mtime,...}], tombstones:{id:mtime}, accounts:{id:{...,mtime}},
//               categories:[str], tags:[str], updatedAt:ms }
(function (root) {
  "use strict";
  const DAY = 86400000;

  function emptyState() {
    return { txns: [], owed: [], budgets: {}, bills: {}, tombstones: {}, accounts: {}, valuations: {}, categories: [], tags: [], updatedAt: 0 };
  }

  function pruneTombstones(tomb, now, maxAgeDays) {
    const maxAge = (maxAgeDays == null ? 90 : maxAgeDays) * DAY;
    const out = {};
    for (const id in tomb) if (now - Number(tomb[id]) <= maxAge) out[id] = tomb[id];
    return out;
  }

  const mt = (t) => Number(t && t.mtime) || 0;

  function merge(local, remote, now) {
    local = local || emptyState();
    remote = remote || emptyState();

    // 1. tombstones: union, newest per id
    const tomb = {};
    for (const src of [local.tombstones || {}, remote.tombstones || {}])
      for (const id in src) tomb[id] = Math.max(tomb[id] || 0, Number(src[id]) || 0);

    // 2. transactions: union by id, larger mtime wins on conflict
    const byId = {};
    for (const t of (local.txns || [])) byId[t.id] = t;
    for (const t of (remote.txns || [])) {
      const cur = byId[t.id];
      if (!cur || mt(t) > mt(cur)) byId[t.id] = t;
    }
    // 3. apply tombstones: deleted unless the txn was edited AFTER the delete (M>T)
    const txns = [];
    for (const id in byId) {
      const t = byId[id], T = tomb[id];
      if (T != null && T >= mt(t)) continue; // stays deleted
      txns.push(t);
    }
    // 3b. one screenshot capture = one txn. Two devices can each auto-post the same capture under
    // different ids before its file is deleted; keep the newest (tie -> smaller id), drop the rest.
    const byCap = {};
    for (const t of txns) {
      if (!t.capId) continue;
      const cur = byCap[t.capId];
      if (!cur || mt(t) > mt(cur) || (mt(t) === mt(cur) && String(t.id) < String(cur.id))) byCap[t.capId] = t;
    }
    for (let i = txns.length - 1; i >= 0; i--) { const t = txns[i]; if (t.capId && byCap[t.capId] !== t) txns.splice(i, 1); }

    // 2b/3b. IOUs ("owed" records) — same union-by-id + shared tombstones as txns
    const owedById = {};
    for (const o of (local.owed || [])) owedById[o.id] = o;
    for (const o of (remote.owed || [])) { const cur = owedById[o.id]; if (!cur || mt(o) > mt(cur)) owedById[o.id] = o; }
    const owed = [];
    for (const id in owedById) {
      const o = owedById[id], T = tomb[id];
      if (T != null && T >= mt(o)) continue;
      owed.push(o);
    }

    // 4. accounts: newest mtime per id
    const accounts = {};
    for (const src of [local.accounts || {}, remote.accounts || {}])
      for (const id in src) {
        const cur = accounts[id];
        if (!cur || (Number(src[id].mtime) || 0) > (Number(cur.mtime) || 0)) accounts[id] = src[id];
      }

    // 4b. budgets: per-category monthly caps {category:{amount,mtime}} — newest mtime per key,
    // same shape/rules as accounts. amount<=0 or missing = no budget for that category.
    const budgets = {};
    for (const src of [local.budgets || {}, remote.budgets || {}])
      for (const k in src) {
        const cur = budgets[k];
        if (!cur || (Number(src[k].mtime) || 0) > (Number(cur.mtime) || 0)) budgets[k] = src[k];
      }

    // 4c. bills: upcoming BNPL/credit bills {id:{label,account,amount,due,paid,...,mtime}} —
    // newest mtime per id, same rules again.
    const bills = {};
    for (const src of [local.bills || {}, remote.bills || {}])
      for (const k in src) {
        const cur = bills[k];
        if (!cur || (Number(src[k].mtime) || 0) > (Number(cur.mtime) || 0)) bills[k] = src[k];
      }

    // 4d. valuations: market value per account {id:{sgd,usd,asOf,mtime}}, written by the Jarvis
    // server (moomoo total assets). Newest mtime per id. MUST be carried here: merge() rebuilds the
    // state from known keys only, so an unknown key would be dropped on the browser's next push.
    const valuations = {};
    for (const src of [local.valuations || {}, remote.valuations || {}])
      for (const k in src) {
        const cur = valuations[k];
        if (!cur || (Number(src[k].mtime) || 0) > (Number(cur.mtime) || 0)) valuations[k] = src[k];
      }

    // 5. categories/tags: union + dedupe
    const uniq = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));

    return {
      txns,
      owed,
      budgets,
      bills,
      valuations,
      tombstones: pruneTombstones(tomb, now, 730), // long: a device offline longer than this would resurrect deletes
      accounts,
      categories: uniq(local.categories, remote.categories),
      tags: uniq(local.tags, remote.tags),
      updatedAt: Math.max(Number(local.updatedAt) || 0, Number(remote.updatedAt) || 0, now),
    };
  }

  // Structural equality of syncable fields (ignores updatedAt). Used to skip needless pushes.
  function sameState(a, b) {
    const sortObj = (o) => { const r = {}; for (const k of Object.keys(o || {}).sort()) r[k] = o[k]; return r; };
    const norm = (s) => JSON.stringify({
      txns: (s.txns || []).slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
      owed: (s.owed || []).slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)),
      budgets: sortObj(s.budgets),
      bills: sortObj(s.bills),
      valuations: sortObj(s.valuations),
      tombstones: sortObj(s.tombstones),
      accounts: sortObj(s.accounts),
      categories: (s.categories || []).slice().sort(),
      tags: (s.tags || []).slice().sort(),
    });
    return norm(a) === norm(b);
  }

  // Pull -> merge -> push, with bounded 409 retry. pull/push are injected (real GitHub I/O in the app).
  async function syncOnce(opts) {
    const { local, pull, push, now } = opts;
    const maxRetries = opts.maxRetries == null ? 3 : opts.maxRetries;
    let attempt = 0;
    for (;;) {
      const { data: remote, sha } = await pull();
      // a file that EXISTS (has a sha) but did not parse must never be overwritten with this device's copy
      if (!remote && sha) throw new Error("vault file unreadable - not overwriting it");
      const merged = merge(local, remote, now);
      if (remote && sameState(merged, remote)) return { merged, sha, pushed: false };
      try {
        const newSha = await push(merged, sha);
        return { merged, sha: newSha, pushed: true };
      } catch (e) {
        if (e && e.status === 409 && attempt < maxRetries) { attempt++; continue; }
        throw e;
      }
    }
  }

  const api = { emptyState, pruneTombstones, merge, sameState, syncOnce };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExpensesSync = api;
})(typeof self !== "undefined" ? self : this);
