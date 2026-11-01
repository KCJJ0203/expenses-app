const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("./expenses-sync.js");

const base = (o={}) => Object.assign(S.emptyState(), o);
const tx = (id, mtime, extra={}) => Object.assign({id, mtime, date:"2026-07-10", type:"expense", amount:1, account:"paylah"}, extra);

test("emptyState shape", () => {
  assert.deepEqual(S.emptyState(), {txns:[],owed:[],budgets:{},bills:{},tombstones:{},accounts:{},valuations:{},categories:[],tags:[],updatedAt:0});
});

test("bills — newest mtime per id wins, keys union", () => {
  const local = base({bills:{b1:{label:"SPayLater",amount:6.54,due:"2026-08-01",paid:false,mtime:5}}});
  const remote = base({bills:{b1:{label:"SPayLater",amount:6.54,due:"2026-08-01",paid:true,mtime:9}, b2:{label:"Mari",amount:24.51,due:"2026-07-21",paid:false,mtime:1}}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.bills.b1.paid, true);   // remote newer — paid flag wins
  assert.equal(m.bills.b2.amount, 24.51);
});

test("budgets — newest mtime per category wins, keys union", () => {
  const local = base({budgets:{Food:{amount:300,mtime:5}, Transport:{amount:150,mtime:9}}});
  const remote = base({budgets:{Food:{amount:450,mtime:8}, Fun:{amount:100,mtime:1}}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.budgets.Food.amount, 450);       // remote newer
  assert.equal(m.budgets.Transport.amount, 150);  // local only
  assert.equal(m.budgets.Fun.amount, 100);        // remote only
});

test("union by id — adds from both sides survive", () => {
  const local = base({txns:[tx("a",1), tx("b",1)]});
  const remote = base({txns:[tx("c",1)]});
  const m = S.merge(local, remote, 100);
  assert.deepEqual(m.txns.map(t=>t.id).sort(), ["a","b","c"]);
});

test("owed IOUs — union by id, newest mtime wins, shared tombstones delete", () => {
  const o = (id, mtime, extra={}) => Object.assign({id, mtime, person:"Kishore", amount:11.87, meal:"Saizeriya"}, extra);
  const local = base({owed:[o("o1",1), o("o2",5,{amount:5})]});
  const remote = base({owed:[o("o2",9,{amount:9}), o("o3",1)], tombstones:{o1:8}});
  const m = S.merge(local, remote, 100);
  const ids = m.owed.map(x=>x.id).sort();
  assert.deepEqual(ids, ["o2","o3"]);                                   // o1 tombstoned away
  assert.equal(m.owed.find(x=>x.id==="o2").amount, 9);                  // newer mtime wins
});

test("edit conflict — larger mtime wins", () => {
  const local = base({txns:[tx("a",5,{amount:50})]});
  const remote = base({txns:[tx("a",9,{amount:99})]});
  assert.equal(S.merge(local, remote, 100).txns.find(t=>t.id==="a").amount, 99);
  assert.equal(S.merge(remote, local, 100).txns.find(t=>t.id==="a").amount, 99);
});

test("delete after edit — stays deleted (T>=M)", () => {
  const local = base({txns:[tx("a",5)]});
  const remote = base({tombstones:{a:8}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.txns.find(t=>t.id==="a"), undefined);
  assert.equal(m.tombstones.a, 8);
  const m2 = S.merge(remote, local, 100);
  assert.equal(m2.txns.find(t=>t.id==="a"), undefined);
});

test("edit after delete — revives (M>T)", () => {
  const local = base({txns:[tx("a",9,{amount:42})]});
  const remote = base({tombstones:{a:3}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.txns.find(t=>t.id==="a").amount, 42);
  const m2 = S.merge(remote, local, 100);
  assert.equal(m2.txns.find(t=>t.id==="a").amount, 42);
});

test("tombstones unioned newest-per-id", () => {
  const local = base({tombstones:{a:3, b:10}});
  const remote = base({tombstones:{a:7}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.tombstones.a, 7);
  assert.equal(m.tombstones.b, 10);
});

test("tombstone pruning at 90 days", () => {
  const DAY = 86400000, now = 1000*DAY;
  const t = S.pruneTombstones({old:(now-91*DAY), fresh:(now-10*DAY)}, now, 90);
  assert.equal(t.old, undefined);
  assert.equal(t.fresh, now-10*DAY);
});

test("accounts newest-mtime per id", () => {
  const local = base({accounts:{main:{start:80,mtime:5}, save:{start:2000,mtime:1}}});
  const remote = base({accounts:{main:{start:120,mtime:9}}});
  const m = S.merge(local, remote, 100);
  assert.equal(m.accounts.main.start, 120);
  assert.equal(m.accounts.save.start, 2000);
});

test("categories/tags union + dedupe", () => {
  const local = base({categories:["Food","Bills"], tags:["school"]});
  const remote = base({categories:["Food","Fun"], tags:["treat"]});
  const m = S.merge(local, remote, 100);
  assert.deepEqual(m.categories.sort(), ["Bills","Food","Fun"]);
  assert.deepEqual(m.tags.sort(), ["school","treat"]);
});

test("idempotent — merge(a,a) == a (same txns/accounts)", () => {
  const a = base({txns:[tx("a",1), tx("b",2)], accounts:{main:{start:80,mtime:1}}, tags:["x"]});
  const m = S.merge(a, a, 100);
  assert.deepEqual(m.txns.map(t=>t.id).sort(), ["a","b"]);
  assert.deepEqual(m.tags, ["x"]);
  assert.deepEqual(m.accounts, a.accounts);
});

test("syncOnce — first run (no remote) pushes local as seed", async () => {
  const local = base({txns:[tx("a",1)]});
  let pushed = null;
  const r = await S.syncOnce({
    local,
    pull: async () => ({data:null, sha:null}),
    push: async (data, sha) => { pushed = {data, sha}; return "sha1"; },
    now: 100,
  });
  assert.equal(r.pushed, true);
  assert.equal(r.sha, "sha1");
  assert.equal(pushed.sha, null);
  assert.deepEqual(pushed.data.txns.map(t=>t.id), ["a"]);
});

test("syncOnce — merges remote adds and pushes union", async () => {
  const local = base({txns:[tx("a",1)]});
  let pushedData = null;
  const r = await S.syncOnce({
    local,
    pull: async () => ({data: base({txns:[tx("b",1)]}), sha:"s0"}),
    push: async (data, sha) => { pushedData = data; return "s1"; },
    now: 100,
  });
  assert.deepEqual(r.merged.txns.map(t=>t.id).sort(), ["a","b"]);
  assert.deepEqual(pushedData.txns.map(t=>t.id).sort(), ["a","b"]);
});

test("syncOnce — nothing changed → no push", async () => {
  const state = base({txns:[tx("a",1)]});
  let pushCalls = 0;
  const r = await S.syncOnce({
    local: state,
    pull: async () => ({data: base({txns:[tx("a",1)]}), sha:"s0"}),
    push: async () => { pushCalls++; return "s1"; },
    now: 100,
  });
  assert.equal(pushCalls, 0);
  assert.equal(r.pushed, false);
  assert.equal(r.sha, "s0");
});

test("syncOnce — 409 triggers re-pull/merge/push then succeeds", async () => {
  const local = base({txns:[tx("a",1)]});
  let pulls = 0, pushAttempts = 0;
  const r = await S.syncOnce({
    local,
    pull: async () => { pulls++; return {data: base({txns:[tx("b",1)]}), sha:"s"+pulls}; },
    push: async (data, sha) => { pushAttempts++; if (pushAttempts === 1) { const e = new Error("conflict"); e.status = 409; throw e; } return "final"; },
    now: 100, maxRetries: 3,
  });
  assert.equal(pulls, 2);
  assert.equal(pushAttempts, 2);
  assert.equal(r.sha, "final");
});

test("syncOnce — gives up after maxRetries 409s", async () => {
  let pushAttempts = 0;
  await assert.rejects(() => S.syncOnce({
    local: base({txns:[tx("a",1)]}),
    pull: async () => ({data: base({txns:[tx("b", Math.random())]}), sha:"s"}),
    push: async () => { pushAttempts++; const e = new Error("conflict"); e.status = 409; throw e; },
    now: 100, maxRetries: 2,
  }), /conflict/);
  assert.equal(pushAttempts, 3); // initial attempt + 2 retries
});

test("sameState ignores dict key order (tombstones/accounts)", () => {
  const x = base({tombstones:{a:5,b:10}, accounts:{main:{start:1,mtime:1}, save:{start:2,mtime:1}}});
  const y = base({tombstones:{b:10,a:5}, accounts:{save:{start:2,mtime:1}, main:{start:1,mtime:1}}});
  assert.equal(S.sameState(x, y), true);
});

test("emptyState has valuations", () => {
  assert.deepEqual(S.emptyState().valuations, {});
});

test("merge keeps valuations from either side, newest mtime wins", () => {
  const v1 = { sgd: 300, usd: 233, asOf: "2026-10-13", mtime: 1 };
  const v2 = { sgd: 305, usd: 236, asOf: "2026-10-14", mtime: 2 };
  const a = { ...S.emptyState(), valuations: { invest: v1 } };
  const b = { ...S.emptyState(), valuations: { invest: v2 } };
  assert.deepEqual(S.merge(a, b, 10).valuations, { invest: v2 });
  assert.deepEqual(S.merge(b, a, 10).valuations, { invest: v2 });
  assert.deepEqual(S.merge(S.emptyState(), b, 10).valuations, { invest: v2 });
  assert.deepEqual(S.merge(b, S.emptyState(), 10).valuations, { invest: v2 });
});

test("sameState sees a valuation change", () => {
  const a = { ...S.emptyState(), valuations: { invest: { sgd: 1, mtime: 1 } } };
  const b = { ...S.emptyState(), valuations: { invest: { sgd: 2, mtime: 2 } } };
  assert.equal(S.sameState(a, b), false);
  assert.equal(S.sameState(a, { ...a }), true);
});

// ---- audit 1 Nov 2026 ----
test("merge — two devices posting the same capture keep ONE txn (newest)", () => {
  const a = base({ txns: [tx("xa", 5, { capId: "cap1" })] });
  const b = base({ txns: [tx("xb", 7, { capId: "cap1" }), tx("other", 1)] });
  const m = S.merge(a, b, 10);
  assert.deepEqual(m.txns.map((t) => t.id).sort(), ["other", "xb"]);
});
test("merge — tombstones survive well past 90 days", () => {
  const day = 86400000, now = 400 * day;
  const m = S.merge(base({ tombstones: { gone: now - 200 * day } }), base({ txns: [tx("gone", 1)] }), now);
  assert.equal(m.txns.length, 0);
  assert.ok("gone" in m.tombstones);
});
test("syncOnce — an existing but unreadable vault file is never overwritten", async () => {
  let pushed = false;
  await assert.rejects(S.syncOnce({ local: base({ txns: [tx("a", 1)] }), now: 5,
    pull: async () => ({ data: null, sha: "abc" }), push: async () => { pushed = true; return "x"; } }), /unreadable/);
  assert.equal(pushed, false);
});
