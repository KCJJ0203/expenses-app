const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("./expenses-capture.js");

test("amount — bare decimal", () => {
  assert.equal(C.parseCapture("Lunch\n12.50").amount, 12.50);
});
test("amount — $ and S$ prefixes", () => {
  assert.equal(C.parseCapture("Paid $8.90 to stall").amount, 8.90);
  assert.equal(C.parseCapture("Total S$4.20").amount, 4.20);
});
test("amount — SGD prefix and thousands separator", () => {
  assert.equal(C.parseCapture("Amount SGD 1,234.56").amount, 1234.56);
});
test("amount — prefers the 'total/paid' line over other figures", () => {
  const text = "Item A 3.00\nItem B 5.00\nTotal 8.00";
  assert.equal(C.parseCapture(text).amount, 8.00);
});
test("amount — falls back to largest when no keyword", () => {
  assert.equal(C.parseCapture("2.00 then 9.90 then 1.10").amount, 9.90);
});
test("amount — ignores integers without 2 decimals (e.g. a year)", () => {
  assert.equal(C.parseCapture("Order 2026 receipt\nPaid 6.50").amount, 6.50);
});
test("amount — null when none present", () => {
  assert.equal(C.parseCapture("no numbers here").amount, null);
});
test("never throws on empty / non-string", () => {
  assert.equal(C.parseCapture("").amount, null);
  assert.equal(C.parseCapture(null).amount, null);
  assert.equal(C.parseCapture(undefined).amount, null);
});

test("date — ISO", () => {
  assert.equal(C.parseCapture("txn 2026-07-11 ok").date, "2026-07-11");
});
test("date — DD/MM/YYYY (SG order)", () => {
  assert.equal(C.parseCapture("Date 11/07/2026").date, "2026-07-11");
});
test("date — D Mon YYYY", () => {
  assert.equal(C.parseCapture("on 5 Jul 2026 at cafe").date, "2026-07-05");
});
test("date — Mon D, YYYY", () => {
  assert.equal(C.parseCapture("Jul 5, 2026").date, "2026-07-05");
});
const NOW = new Date(2026, 6, 11);   // 2026-07-11, fixed reference for relative/year-less dates
test("date — year-less 'D Mon' resolves to current year", () => {
  assert.equal(C.parseCapture("11 Jul\nTotal 6.50", NOW).date, "2026-07-11");
});
test("date — 'yesterday' resolves against today", () => {
  assert.equal(C.parseCapture("paid yesterday\n6.50", NOW).date, "2026-07-10");
});
test("date — 'today' resolves against today", () => {
  assert.equal(C.parseCapture("today\n6.50", NOW).date, "2026-07-11");
});
test("date — a future year-less date rolls back a year", () => {
  assert.equal(C.parseCapture("28 Dec\n6.50", NOW).date, "2025-12-28");
});
test("date — year-less 'Mon D' also works", () => {
  assert.equal(C.parseCapture("Jul 5\n6.50", NOW).date, "2026-07-05");
});
test("date — still null when there is no date at all", () => {
  assert.equal(C.parseCapture("no date here\nTotal 6.50", NOW).date, null);
});
test("description — picks the merchant-ish line, not the amount/label", () => {
  const text = "Kopitiam Ang Mo Kio\nTotal\n$4.20";
  assert.equal(C.parseCapture(text).description, "Kopitiam Ang Mo Kio");
});
test("description — empty when nothing suitable", () => {
  assert.equal(C.parseCapture("$4.20").description, "");
});
test("date — picks the valid date past a non-month noise line", () => {
  assert.equal(C.parseCapture("Order 5, 2026\nVisit Jul 20, 2026 kopitiam").date, "2026-07-20");
});
test("pendingCaptures — hides captures already imported", () => {
  const files = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const txns = [{ id: "t1", capId: "b" }];
  assert.deepEqual(C.pendingCaptures(files, txns).map((f) => f.id), ["a", "c"]);
});
test("pendingCaptures — no txns keeps all", () => {
  const files = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(C.pendingCaptures(files, []).map((f) => f.id), ["a", "b"]);
});
test("pendingCaptures — handles empty / missing inputs", () => {
  assert.deepEqual(C.pendingCaptures([], []), []);
  assert.deepEqual(C.pendingCaptures(undefined, undefined), []);
  assert.deepEqual(C.pendingCaptures([{ id: "a" }], [{ id: "t" }]).map((f) => f.id), ["a"]);
});

const CATS = [{id:"Food"},{id:"Tea/Coffee"},{id:"Transport"},{id:"Groceries"},{id:"Shopping"},{id:"Entertainment"},{id:"School"},{id:"Bills"},{id:"Others"}];
// a synthetic card-transaction OCR (test card no., made-up merchant; SGD misread as SOD)
const CARD_OCR = "9:42 A\n•ll 5G\n71\n<\nSOD 21.75\nYesterday 8 Jul\nDescription\nBAT Pizza Planet Singapore SG SGP 06JUL\n4111-1111-1111-1111 000000000000000\nTransaction Type\nPoint-of-Sale Transaction\nSHARE";

test("suggestCategory — pizza place → Food", () => assert.equal(C.suggestCategory(CARD_OCR, CATS), "Food"));
test("suggestCategory — cafe chain → Tea/Coffee (beats Food)", () => assert.equal(C.suggestCategory("STARBUCKS COFFEE @ VivoCity", CATS), "Tea/Coffee"));
test("suggestCategory — grab → Transport", () => assert.equal(C.suggestCategory("GRAB* RIDE 10 JUL", CATS), "Transport"));
test("suggestCategory — no keyword → null", () => assert.equal(C.suggestCategory("random blob 12.00", CATS), null));
test("suggestCategory — only returns a category that exists in the list", () => assert.equal(C.suggestCategory("grab ride", [{id:"Food"}]), null));
test("guessMerchant — strips bank/country/date noise", () => assert.equal(C.guessMerchant(CARD_OCR, CATS), "Pizza Planet Singapore"));
test("guessMerchant — falls back to description when no keyword", () => assert.equal(typeof C.guessMerchant("Some Shop\n5.00", CATS), "string"));
test("describeCapture — full card-screen parse", () => {
  const d = C.describeCapture(CARD_OCR, CATS, NOW);
  assert.equal(d.amount, 21.75);
  assert.equal(d.categoryId, "Food");
  assert.equal(d.merchant, "Pizza Planet Singapore");
  assert.equal(d.date, "2026-07-08");   // "Yesterday 8 Jul" → 2026-07-08
});

// ---- audit 1 Nov 2026 ----
const NOV1 = new Date(2026, 10, 1, 12);
test("amount — the Total line beats subtotal, cash paid and change", () => {
  assert.equal(C.parseCapture("Subtotal 20.00\nDiscount 5.00\nTotal 15.00").amount, 15);
  assert.equal(C.parseCapture("Total 12.50\nAmount Paid 20.00\nChange 7.50").amount, 12.5);
});
test("amount — a dotted date is not money", () => {
  assert.equal(C.parseCapture("12.10.2026\nlunch").amount, null);
});
test("date — US month/day is recognised, impossible dates rejected", () => {
  assert.equal(C.parseCapture("10/31/2026", NOV1).date, "2026-10-31");
  assert.equal(C.parseCapture("31/10/2026", NOV1).date, "2026-10-31");
  assert.equal(C.parseCapture("40/40/2026", NOV1).date, null);
});
test("date — a place name is not a month", () => {
  assert.equal(C.parseCapture("Junction 8 kopi", NOV1).date, null);
});
test("date — 'Yesterday 10 Jul' read months later still lands on 10 Jul", () => {
  assert.equal(C.parseCapture("Yesterday 10 Jul\n3.80", NOV1).date, "2026-07-10");
  assert.equal(C.parseCapture("Yesterday\n3.80", NOV1).date, "2026-10-31");
});
