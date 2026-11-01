const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./accounts.js");

const DEFAULTS = [
  { name: "Bank", type: "asset", colour: "#4f8df7", icon: "🏦" },
  { name: "Cash", type: "asset", colour: "#2e9e5b", icon: "💵" },
  { name: "Credit card", type: "credit", colour: "#a78bfa", icon: "💳", limit: 500 },
];

test("slugId lowercases and joins word runs with underscores", () => {
  assert.equal(A.slugId("PayNow/PayLah", []), "paynow_paylah");
  assert.equal(A.slugId("  Bank  ", []), "bank");
});

test("slugId suffixes _2, _3 on collision and falls back to acct for empty names", () => {
  assert.equal(A.slugId("Cash", ["cash"]), "cash_2");
  assert.equal(A.slugId("Cash", ["cash", "cash_2"]), "cash_3");
  assert.equal(A.slugId("", []), "acct");
  assert.equal(A.slugId("!!!", ["acct"]), "acct_2");
});

test("fromDefaults builds a keyed map, start 0, exactly one default and it is an asset", () => {
  const m = A.fromDefaults(DEFAULTS, 1000);
  assert.deepEqual(Object.keys(m), ["bank", "cash", "credit_card"]);
  assert.equal(m.bank.start, 0);
  assert.equal(m.bank.mtime, 1000);
  assert.equal(m.credit_card.credit, true);
  assert.equal(m.credit_card.limit, 500);
  assert.equal(m.cash.credit, false);
  const defaults = Object.values(m).filter((a) => a.default);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].id, "bank");
  assert.equal(m.bank.archived, false);
});

test("visible hides archived rows and orders default first, then assets, then credits by name", () => {
  const m = A.fromDefaults(DEFAULTS, 1);
  m.wise = { id: "wise", name: "Wise", credit: false, archived: true, mtime: 1 };
  m.aaa = { id: "aaa", name: "Aaa", credit: false, archived: false, mtime: 1 };
  const ids = A.visible(m).map((a) => a.id);
  assert.deepEqual(ids, ["bank", "aaa", "cash", "credit_card"]);
});

test("defaultAccount returns the flagged row, else the first visible asset, else null", () => {
  const m = A.fromDefaults(DEFAULTS, 1);
  assert.equal(A.defaultAccount(m).id, "bank");
  m.bank.archived = true;
  assert.equal(A.defaultAccount(m).id, "cash");
  m.cash.archived = true;
  assert.equal(A.defaultAccount(m), null); // only a credit account left
});

test("canArchive refuses a non-zero balance with the exact reason and accepts sub-cent dust", () => {
  const acct = { id: "wise", name: "Wise" };
  assert.deepEqual(A.canArchive(acct, { wise: 12.5 }), { ok: false, reason: "Balance is $12.50. Transfer it out first." });
  assert.deepEqual(A.canArchive(acct, { wise: -40 }), { ok: false, reason: "Balance is $-40.00. Transfer it out first." });
  assert.deepEqual(A.canArchive(acct, { wise: 0.004 }), { ok: true });
  assert.deepEqual(A.canArchive(acct, {}), { ok: true });
});

test("setDefault moves the flag and bumps mtime only on rows that changed", () => {
  const m = A.fromDefaults(DEFAULTS, 1);
  const out = A.setDefault(m, "cash", 50);
  assert.equal(out.cash.default, true);
  assert.equal(out.bank.default, false);
  assert.equal(out.cash.mtime, 50);
  assert.equal(out.bank.mtime, 50);
  assert.equal(out.credit_card.mtime, 1);
  assert.notEqual(out, m); // returns a new map
});

test("upsert adds or replaces one row with a bumped mtime", () => {
  const m = A.fromDefaults(DEFAULTS, 1);
  const out = A.upsert(m, { id: "wise", name: "Wise", colour: "#37d3a0", icon: "W", credit: false, start: 40 }, 7);
  assert.equal(out.wise.mtime, 7);
  assert.equal(out.wise.archived, false);
  assert.equal(out.wise.default, false);
  const out2 = A.upsert(out, { ...out.bank, name: "DBS" }, 9);
  assert.equal(out2.bank.name, "DBS");
  assert.equal(out2.bank.mtime, 9);
  assert.equal(out2.bank.default, true);
});

test("archive and restore flip archived and bump only that row", () => {
  const m = A.fromDefaults(DEFAULTS, 1);
  const a = A.archive(m, "cash", 20);
  assert.equal(a.cash.archived, true);
  assert.equal(a.cash.mtime, 20);
  assert.equal(a.bank.mtime, 1);
  const r = A.restore(a, "cash", 30);
  assert.equal(r.cash.archived, false);
  assert.equal(r.cash.mtime, 30);
});

test("normalize repairs rows that lack id/name/icon/flags (e.g. a StudyTracker-shaped backup)", () => {
  const m = A.normalize({ posb_main: { start: 100, mtime: 5, topUpLine: 80 }, cash: { id: "cash", name: "Cash", icon: "💵", credit: false, start: 0, default: true, archived: false, mtime: 1 } });
  assert.equal(m.posb_main.id, "posb_main");
  assert.equal(m.posb_main.name, "posb_main");
  assert.equal(m.posb_main.icon, "P");
  assert.equal(m.posb_main.credit, false);
  assert.equal(m.posb_main.archived, false);
  assert.equal(m.posb_main.default, false);
  assert.equal(m.posb_main.start, 100);
  assert.equal(m.posb_main.topUpLine, 80);
  assert.deepEqual(m.cash, { id: "cash", name: "Cash", icon: "💵", credit: false, start: 0, default: true, archived: false, mtime: 1 });
  assert.equal(A.normalize({ x: { name: "", start: "12.5" } }).x.start, 12.5);
  assert.equal(A.normalize(null) && Object.keys(A.normalize(null)).length, 0);
});

test("usable returns the id when it is a visible account, else the default, else empty string", () => {
  const m = A.fromDefaults([{ name: "Bank", type: "asset" }, { name: "Cash", type: "asset" }, { name: "Card", type: "credit" }], 1);
  assert.equal(A.usable(m, "cash"), "cash");
  assert.equal(A.usable(m, "card"), "card");
  m.cash.archived = true;
  assert.equal(A.usable(m, "cash"), "bank");
  assert.equal(A.usable(m, "ghost"), "bank");
  assert.equal(A.usable(m, ""), "bank");
  m.bank.archived = true;
  assert.equal(A.usable(m, "cash"), "");
});

test("yieldToRemote zeroes mtime on local rows whose id the remote also has, so the remote wins the merge", () => {
  const local = A.fromDefaults([{ name: "Bank", type: "asset" }, { name: "Wise", type: "asset" }], 500);
  const remote = { bank: { id: "bank", name: "DBS", start: 100, mtime: 10 } };
  const out = A.yieldToRemote(local, remote);
  assert.equal(out.bank.mtime, 0);
  assert.equal(out.wise.mtime, 500);
  assert.equal(local.bank.mtime, 500); // input untouched
  assert.deepEqual(A.yieldToRemote(local, {}), local);
});
