const { test } = require("node:test");
const assert = require("node:assert/strict");
const U = require("./undo-delete.js");

// Fake timer pair so the window can be driven by hand.
function fakeTimers() {
  let next = 1; const live = new Map();
  return {
    setTimeout: (fn) => { const id = next++; live.set(id, fn); return id; },
    clearTimeout: (id) => { live.delete(id); },
    fire: () => { const fns = [...live.values()]; live.clear(); fns.forEach((f) => f()); },
    count: () => live.size,
  };
}
const entry = (log, tag) => ({ commit: () => log.push("commit:" + tag), restore: () => log.push("restore:" + tag) });

test("window expiry commits the delete once", () => {
  const t = fakeTimers(), log = [], q = U.createUndo(t);
  q.push(entry(log, "a"));
  assert.equal(q.pending(), true);
  t.fire();
  assert.deepEqual(log, ["commit:a"]);
  assert.equal(q.pending(), false);
});

test("undo restores and never commits", () => {
  const t = fakeTimers(), log = [], q = U.createUndo(t);
  q.push(entry(log, "a"));
  assert.equal(q.undo(), true);
  t.fire();
  assert.deepEqual(log, ["restore:a"]);
  assert.equal(t.count(), 0);
});

test("a second delete commits the first straight away", () => {
  const t = fakeTimers(), log = [], q = U.createUndo(t);
  q.push(entry(log, "a"));
  q.push(entry(log, "b"));
  assert.deepEqual(log, ["commit:a"]);
  q.undo();
  assert.deepEqual(log, ["commit:a", "restore:b"]);
});

test("flush commits the pending delete (page hidden / closing)", () => {
  const t = fakeTimers(), log = [], q = U.createUndo(t);
  q.push(entry(log, "a"));
  assert.equal(q.flush(), true);
  assert.equal(q.flush(), false);
  assert.equal(q.undo(), false);
  assert.deepEqual(log, ["commit:a"]);
});

test("undo with nothing pending is a no-op", () => {
  const q = U.createUndo(fakeTimers());
  assert.equal(q.undo(), false);
  assert.equal(q.pending(), false);
});

test("missing commit is allowed (delete already persisted, undo = restore only)", () => {
  const t = fakeTimers(), log = [], q = U.createUndo(t);
  q.push({ restore: () => log.push("restore") });
  t.fire();
  assert.deepEqual(log, []);
});
