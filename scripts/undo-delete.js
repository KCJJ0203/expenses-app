// One-slot undo window for deletes (events, deadlines, expense entries).
// Dual-target: Node (require, for tests) + browser (window.UndoDelete). No dependencies.
// push({commit, restore}) opens an ~8 s window: expiry (or flush) runs commit, undo runs restore.
// Only one delete is pending at a time — a new push commits the previous one first.
(function (root) {
  "use strict";

  function createUndo(opts) {
    const st = (opts && opts.setTimeout) || setTimeout;
    const ct = (opts && opts.clearTimeout) || clearTimeout;
    const ms = (opts && opts.ms) || 8000;
    let cur = null;

    function take() { const c = cur; cur = null; if (c) ct(c.timer); return c; }
    function flush() {
      const c = take(); if (!c) return false;
      if (c.commit) c.commit();
      return true;
    }
    function push(entry) {
      flush();
      const c = { commit: entry.commit, restore: entry.restore };
      c.timer = st(() => { if (cur === c) flush(); }, ms);
      cur = c;
    }
    function undo() {
      const c = take(); if (!c) return false;
      if (c.restore) c.restore();
      return true;
    }
    function pending() { return !!cur; }
    return { push, undo, flush, pending };
  }

  const api = { createUndo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UndoDelete = api;
})(typeof window !== "undefined" ? window : globalThis);
