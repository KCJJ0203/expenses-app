const { test } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./expenses-calc.js");

const ACCTS = [
  { id: "main", name: "POSB Main", start: 100, topUpLine: 80 },
  { id: "save", name: "POSB Savings", start: 2000 },
  { id: "paylah", name: "PayLah", start: 50 },
];

const TXNS = [
  { id: "1", date: "2026-07-03", type: "expense", amount: 4.5, account: "paylah", category: "Food" },
  { id: "2", date: "2026-07-03", type: "expense", amount: 8.2, account: "paylah", category: "Transport" },
  { id: "3", date: "2026-07-05", type: "income", amount: 920, account: "main", category: "Salary" },
  { id: "4", date: "2026-07-07", type: "transfer", amount: 200, account: "save", toAccount: "main" },
  { id: "5", date: "2026-06-30", type: "expense", amount: 10, account: "paylah", category: "Food" }, // prior month
];

test("ym extracts YYYY-MM", () => {
  assert.equal(E.ym("2026-07-03"), "2026-07");
  assert.equal(E.ym("2026-12-31"), "2026-12");
});

test("balances apply expense, income, and both sides of a transfer", () => {
  const b = E.balances(ACCTS, TXNS);
  // main: 100 + 920 income + 200 transfer-in = 1220
  assert.equal(b.main, 1220);
  // save: 2000 - 200 transfer-out = 1800
  assert.equal(b.save, 1800);
  // paylah: 50 - 4.5 - 8.2 - 10 = 27.3
  assert.ok(Math.abs(b.paylah - 27.3) < 1e-9);
});

test("netWorth sums all balances (transfers net to zero across accounts)", () => {
  // 1220 + 1800 + 27.3 = 3047.3
  assert.ok(Math.abs(E.netWorth(ACCTS, TXNS) - 3047.3) < 1e-9);
});

test("monthTotals excludes transfers and other months", () => {
  const t = E.monthTotals(TXNS, "2026-07");
  assert.ok(Math.abs(t.spent - 12.7) < 1e-9);   // 4.5 + 8.2 (June 10 excluded)
  assert.equal(t.income, 920);                   // transfer not counted
  assert.ok(Math.abs(t.net - 907.3) < 1e-9);     // 920 - 12.7
});

test("categoryTotals: expenses only, sorted desc", () => {
  const c = E.categoryTotals(TXNS, "2026-07");
  assert.deepEqual(c, [
    { category: "Transport", amount: 8.2, gross: 8.2, paidBack: 0 },
    { category: "Food", amount: 4.5, gross: 4.5, paidBack: 0 },
  ]);
});

test("categoryTotals nets paybacks (income with offset) against their category", () => {
  const txns = [
    { id: "a", date: "2026-07-10", type: "expense", amount: 71.2, account: "m", category: "Food" },
    { id: "b", date: "2026-07-10", type: "income", amount: 62.5, account: "m", category: "Pay back", offset: "Food" },
    { id: "c", date: "2026-07-10", type: "expense", amount: 8.2, account: "m", category: "Transport" },
    { id: "d", date: "2026-07-10", type: "income", amount: 5, account: "m", category: "Pay back" }, // no offset → ignored
  ];
  const c = E.categoryTotals(txns, "2026-07");
  const food = c.find((x) => x.category === "Food");
  assert.ok(Math.abs(food.amount - 8.7) < 1e-9);     // 71.20 - 62.50
  assert.ok(Math.abs(food.gross - 71.2) < 1e-9);
  assert.ok(Math.abs(food.paidBack - 62.5) < 1e-9);
  const tr = c.find((x) => x.category === "Transport");
  assert.equal(tr.amount, 8.2);
  assert.equal(tr.paidBack, 0);                        // income d had no offset
  assert.equal(c[0].category, "Food");                 // 8.70 net sorts above 8.20
});

test("dayTotals marks spend and income days", () => {
  const d = E.dayTotals(TXNS, "2026-07");
  assert.ok(Math.abs(d[3].spent - 12.7) < 1e-9);
  assert.equal(d[3].income, false);
  assert.equal(d[5].income, true);
  assert.equal(d[5].spent, 0);
  assert.equal(d[30], undefined); // June excluded
});

test("accountsBelowLine flags accounts under their topUpLine", () => {
  // main balance 1220 >= 80 → not flagged. Drop it below:
  const drained = TXNS.concat([{ id: "x", date: "2026-07-08", type: "expense", amount: 1180, account: "main", category: "Others" }]);
  assert.deepEqual(E.accountsBelowLine(ACCTS, drained), ["main"]); // 1220-1180=40 < 80
  assert.deepEqual(E.accountsBelowLine(ACCTS, TXNS), []);
});

test("monthInsights: pace, streak, and same-window month-over-month", () => {
  const txns = [
    { id: "a", date: "2026-07-02", type: "expense", amount: 10, account: "m", category: "Food" },
    { id: "b", date: "2026-07-05", type: "expense", amount: 20, account: "m", category: "Food" },
    { id: "c", date: "2026-07-20", type: "expense", amount: 99, account: "m", category: "Food" },  // future of "today" → excluded
    { id: "d", date: "2026-07-05", type: "income", amount: 500, account: "m", category: "Pay" },   // income ignored
    { id: "e", date: "2026-06-03", type: "expense", amount: 12, account: "m", category: "Food" },  // prev month, in window
    { id: "f", date: "2026-06-28", type: "expense", amount: 40, account: "m", category: "Food" },  // prev month, outside day-10 window
  ];
  const r = E.monthInsights(txns, "2026-07", "2026-07-10");
  assert.equal(r.upto, 10);
  assert.ok(Math.abs(r.spentToDate - 30) < 1e-9);          // 10 + 20 (day-20 spend excluded)
  assert.ok(Math.abs(r.dailyAvg - 3) < 1e-9);              // 30 / 10 days
  assert.equal(r.noSpendStreak, 5);                         // days 6..10 clean (day 5 spent)
  assert.equal(r.prevYm, "2026-06");
  assert.ok(Math.abs(r.prevSpentToDate - 12) < 1e-9);      // June 1–10 window only
  // past month: whole-month window, streak measured from month end
  const past = E.monthInsights(txns, "2026-06", "2026-07-10");
  assert.equal(past.upto, 30);
  assert.ok(Math.abs(past.spentToDate - 52) < 1e-9);
  assert.equal(past.noSpendStreak, 2);                      // 29–30 Jun clean
});

test("owedByPerson: outstanding = owed - paybacks, per person, settled ones drop off", () => {
  const owed = [
    { id: "o1", person: "Kishore", amount: 11.87, meal: "Saizeriya", date: "10 Jul" },
    { id: "o2", person: "Kevy", amount: 11.87, meal: "Saizeriya", date: "10 Jul" },
    { id: "o3", person: "Xavier", amount: 11.87, meal: "Saizeriya", date: "10 Jul" },
  ];
  const txns = [
    { id: "p1", date: "2026-07-11", type: "income", amount: 5.90, account: "m", category: "Pay back", item: "Kevy" },   // partial
    { id: "p2", date: "2026-07-11", type: "income", amount: 20.00, account: "m", category: "Pay back", item: "Xavier" }, // overpaid → settled
    { id: "p3", date: "2026-07-11", type: "income", amount: 8.00, account: "m", category: "Salary", item: "Kishore" },   // not a payback → ignored
  ];
  const r = E.owedByPerson(owed, txns);
  // Xavier settled (paid ≥ owed) → gone. Kishore full, Kevy partial remain.
  assert.equal(r.length, 2);
  assert.equal(r[0].person, "Kishore");              // 11.87 outstanding, sorted first
  assert.ok(Math.abs(r[0].outstanding - 11.87) < 1e-9);
  assert.equal(r[0].paid, 0);
  const kevy = r.find((x) => x.person === "Kevy");
  assert.ok(Math.abs(kevy.outstanding - 5.97) < 1e-9); // 11.87 - 5.90
  assert.ok(Math.abs(kevy.paid - 5.90) < 1e-9);
  assert.equal(kevy.meals.length, 1);
});

test("valuedBalances: no valuation → cost", () => {
  const r = E.valuedBalances({ main: 10, invest: 300 }, {}, "2026-10-14");
  assert.deepEqual(r.balances, { main: 10, invest: 300 });
  assert.deepEqual(r.valued, {});
});

test("valuedBalances: value replaces cost, gain and pct reported", () => {
  const r = E.valuedBalances({ main: 10, invest: 300 }, { invest: { sgd: 312.5, usd: 242, asOf: "2026-10-14", mtime: 1 } }, "2026-10-14");
  assert.equal(r.balances.invest, 312.5);
  assert.equal(r.balances.main, 10);
  assert.deepEqual(r.valued.invest, { cost: 300, value: 312.5, gain: 12.5, pct: 4.17, asOf: "2026-10-14", stale: false });
});

test("valuedBalances: loss is negative", () => {
  const r = E.valuedBalances({ invest: 300 }, { invest: { sgd: 290, asOf: "2026-10-14" } }, "2026-10-14");
  assert.equal(r.valued.invest.gain, -10);
  assert.equal(r.valued.invest.pct, -3.33);
});

test("valuedBalances: stale flag after more than 4 days", () => {
  const v = { invest: { sgd: 300, asOf: "2026-10-09" } };
  assert.equal(E.valuedBalances({ invest: 300 }, v, "2026-10-13").valued.invest.stale, false); // 4 days
  assert.equal(E.valuedBalances({ invest: 300 }, v, "2026-10-14").valued.invest.stale, true);  // 5 days
});

test("valuedBalances: valuation for an unknown account is ignored", () => {
  const r = E.valuedBalances({ main: 10 }, { ghost: { sgd: 5, asOf: "2026-10-14" } }, "2026-10-14");
  assert.deepEqual(r.balances, { main: 10 });
  assert.deepEqual(r.valued, {});
});

test("valuedBalances: monthTotals unaffected (pure function, no txns touched)", () => {
  const txns = [{ type: "expense", amount: 5, account: "main", date: "2026-10-01" }];
  const before = E.monthTotals(txns, "2026-10");
  E.valuedBalances({ invest: 300 }, { invest: { sgd: 999, asOf: "2026-10-14" } }, "2026-10-14");
  assert.deepEqual(E.monthTotals(txns, "2026-10"), before);
});
