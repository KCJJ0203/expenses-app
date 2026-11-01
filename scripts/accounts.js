// Account definitions as synced DATA (not public config): ids, first-run defaults, archive
// rules and the default-account flag. Dual-target: Node (require, for tests) + browser
// (window.Accounts). No dependencies. Every mutator returns a NEW map and bumps `mtime`
// only on the rows it touched, so the sync merge (newest mtime per id) carries exactly
// those changes and nothing else.
(function (root) {
  "use strict";

  function slugId(name, existingIds) {
    const base = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "acct";
    const taken = new Set(existingIds || []);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) { const id = base + "_" + n; if (!taken.has(id)) return id; }
  }

  function fromDefaults(defaults, now) {
    const map = {};
    let hasDefault = false;
    for (const d of defaults || []) {
      const id = slugId(d.name, Object.keys(map));
      const credit = d.type === "credit" || d.credit === true;
      const row = { id, name: d.name, colour: d.colour, icon: d.icon, credit, start: 0, default: false, archived: false, mtime: now };
      if (credit) row.limit = Number(d.limit) || 0;
      if (!credit && !hasDefault) { row.default = true; hasDefault = true; }
      map[id] = row;
    }
    return map;
  }

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));

  function visible(map) {
    const rows = Object.values(map || {}).filter((a) => !a.archived);
    const def = rows.filter((a) => a.default && !a.credit);
    const assets = rows.filter((a) => !a.credit && !a.default).sort(byName);
    const credits = rows.filter((a) => a.credit).sort(byName);
    return def.concat(assets, credits);
  }

  function defaultAccount(map) {
    const rows = visible(map);
    return rows.find((a) => a.default && !a.credit) || rows.find((a) => !a.credit) || null;
  }

  function canArchive(acct, balances) {
    const bal = Number((balances || {})[acct.id]) || 0;
    if (Math.abs(bal) < 0.005) return { ok: true };
    return { ok: false, reason: "Balance is $" + bal.toFixed(2) + ". Transfer it out first." };
  }

  function setDefault(map, id, now) {
    const out = {};
    for (const k of Object.keys(map)) {
      const a = map[k];
      const want = k === id;
      out[k] = a.default === want ? a : { ...a, default: want, mtime: now };
    }
    return out;
  }

  function upsert(map, acct, now) {
    const prev = map[acct.id] || {};
    return { ...map, [acct.id]: { archived: false, default: false, start: 0, ...prev, ...acct, mtime: now } };
  }

  function archive(map, id, now) { return { ...map, [id]: { ...map[id], archived: true, mtime: now } }; }
  function restore(map, id, now) { return { ...map, [id]: { ...map[id], archived: false, mtime: now } }; }


  // Repair rows that arrive without the full shape (a StudyTracker-shaped backup, a hand-edited
  // vault, an older device): id = key, name falls back to the id, icon to the first letter.
  function normalize(map) {
    const out = {};
    for (const k of Object.keys(map || {})) {
      const a = map[k] || {};
      const name = String(a.name || k);
      out[k] = { ...a, id: k, name, icon: a.icon || name[0].toUpperCase(), credit: !!a.credit, archived: !!a.archived, default: !!a.default,
        start: Number(a.start) || 0, mtime: Number(a.mtime) || 0 };
    }
    return out;
  }

  // An account id that is safe to write on a txn right now: the given one if it is visible,
  // else the default asset account, else "" (caller must refuse the save).
  function usable(map, id) {
    const a = id && map[id];
    if (a && !a.archived) return id;
    const d = defaultAccount(map);
    return d ? d.id : "";
  }

  // A device that has never synced (setup rows only) must not overwrite the vault's accounts:
  // zero the mtime of every local row whose id the remote also has, so newest-wins picks remote.
  function yieldToRemote(local, remote) {
    const out = { ...local };
    for (const id of Object.keys(remote || {})) if (out[id]) out[id] = { ...out[id], mtime: 0 };
    return out;
  }

  const api = { normalize, usable, yieldToRemote, slugId, fromDefaults, visible, defaultAccount, canArchive, setDefault, upsert, archive, restore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Accounts = api;
})(typeof window !== "undefined" ? window : globalThis);
