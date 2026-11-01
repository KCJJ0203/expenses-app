// Pure money math for StudyTracker's Expenses tab.
// Dual-target: Node (require, for tests) + browser (window.ExpensesCalc). No dependencies.
// Amounts are positive; sign comes from `type`. Transfers move money between own accounts
// and are excluded from spent/income/net and from net worth.
(function (root) {
  "use strict";

  const ym = (d) => String(d || "").slice(0, 7);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  function balances(accounts, txns) {
    const b = {};
    for (const a of accounts) b[a.id] = Number(a.start) || 0;
    for (const t of txns) {
      const amt = Number(t.amount) || 0;
      if (t.type === "income") { if (t.account in b) b[t.account] += amt; }
      else if (t.type === "expense") { if (t.account in b) b[t.account] -= amt; }
      else if (t.type === "transfer") {
        if (t.account in b) b[t.account] -= amt;
        if (t.toAccount in b) b[t.toAccount] += amt;
      }
    }
    for (const k in b) b[k] = round2(b[k]);
    return b;
  }

  function netWorth(accounts, txns) {
    const b = balances(accounts, txns);
    let sum = 0;
    for (const k in b) sum += b[k];
    return round2(sum);
  }

  function monthTotals(txns, yearMonth) {
    let spent = 0, income = 0;
    for (const t of txns) {
      if (ym(t.date) !== yearMonth) continue;
      const amt = Number(t.amount) || 0;
      if (t.type === "expense") spent += amt;
      else if (t.type === "income") income += amt;
    }
    spent = round2(spent); income = round2(income);
    return { spent, income, net: round2(income - spent) };
  }

  // Spending per category, NET of paybacks. A reimbursement (income with an `offset`
  // category — e.g. friends repaying a shared meal) cancels spend in that category,
  // so a $71.20 meal with $62.50 paid back counts as $8.70 of Food. Returns
  // { category, amount:net, gross, paidBack } per category that had spending.
  function categoryTotals(txns, yearMonth) {
    const gross = {}, back = {};
    for (const t of txns) {
      if (ym(t.date) !== yearMonth) continue;
      if (t.type === "expense") {
        const c = t.category || "Others";
        gross[c] = (gross[c] || 0) + (Number(t.amount) || 0);
      } else if (t.type === "income" && t.offset) {
        back[t.offset] = (back[t.offset] || 0) + (Number(t.amount) || 0);
      }
    }
    return Object.keys(gross)
      .map((category) => {
        const g = round2(gross[category]);
        const paidBack = round2(back[category] || 0);
        return { category, amount: round2(g - paidBack), gross: g, paidBack };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  function dayTotals(txns, yearMonth) {
    const out = {};
    for (const t of txns) {
      if (ym(t.date) !== yearMonth) continue;
      const day = Number(String(t.date).slice(8, 10));
      if (!out[day]) out[day] = { spent: 0, income: false };
      if (t.type === "expense") out[day].spent += (Number(t.amount) || 0);
      else if (t.type === "income") out[day].income = true;
    }
    for (const d in out) out[d].spent = round2(out[d].spent);
    return out;
  }

  // Month glance-insights: spend pace + streak + same-window month-over-month comparison.
  // For the current month "to date" means up to todayIso's day; for past months, the whole month.
  // Returns { dailyAvg, noSpendStreak, spentToDate, prevSpentToDate, prevYm, upto }.
  function monthInsights(txns, yearMonth, todayIso) {
    const parts = yearMonth.split("-").map(Number);
    const y = parts[0], m = parts[1];
    const daysInMonth = new Date(y, m, 0).getDate();
    const isCur = String(todayIso || "").slice(0, 7) === yearMonth;
    const upto = isCur ? Math.min(Number(String(todayIso).slice(8, 10)) || daysInMonth, daysInMonth) : daysInMonth;
    const spentByDay = {};
    let spent = 0;
    for (const t of txns) {
      if (t.type !== "expense" || ym(t.date) !== yearMonth) continue;
      const d = Number(String(t.date).slice(8, 10));
      spentByDay[d] = (spentByDay[d] || 0) + (Number(t.amount) || 0);
      if (d <= upto) spent += Number(t.amount) || 0;
    }
    const dailyAvg = upto > 0 ? round2(spent / upto) : 0;
    let streak = 0;
    for (let d = upto; d >= 1; d--) { if ((spentByDay[d] || 0) > 0.005) break; streak++; }
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const prevYm = `${py}-${String(pm).padStart(2, "0")}`;
    const prevUpto = Math.min(upto, new Date(py, pm, 0).getDate());
    let prevSpent = 0;
    for (const t of txns) {
      if (t.type !== "expense" || ym(t.date) !== prevYm) continue;
      if (Number(String(t.date).slice(8, 10)) <= prevUpto) prevSpent += Number(t.amount) || 0;
    }
    return { dailyAvg, noSpendStreak: streak, spentToDate: round2(spent), prevSpentToDate: round2(prevSpent), prevYm, upto };
  }

  function accountsBelowLine(accounts, txns) {
    const b = balances(accounts, txns);
    return accounts
      .filter((a) => a.topUpLine != null && b[a.id] < Number(a.topUpLine))
      .map((a) => a.id);
  }

  // "Who still owes me": per person, outstanding = what they owe (their IOU shares from meals
  // KC fronted) MINUS what they've paid back (income tagged "Pay back", matched by name).
  // No paid flag anywhere — it's derived, so it always tracks the ledger. People fully paid drop off.
  function owedByPerson(owed, txns) {
    const owedBy = {}, mealsBy = {}, paidBy = {};
    for (const o of (owed || [])) {
      const p = o.person; if (!p) continue;
      owedBy[p] = (owedBy[p] || 0) + (Number(o.amount) || 0);
      (mealsBy[p] = mealsBy[p] || []).push({ id: o.id, amount: round2(Number(o.amount) || 0), meal: o.meal || "", date: o.date || "" });
    }
    for (const t of (txns || [])) {
      if (t.type === "income" && t.category === "Pay back" && t.item) {
        paidBy[t.item] = (paidBy[t.item] || 0) + (Number(t.amount) || 0);
      }
    }
    const out = [];
    for (const p in owedBy) {
      const ow = round2(owedBy[p]);
      const pd = round2(Math.min(paidBy[p] || 0, ow));   // cap paid at owed so overpayment just = settled
      const rem = round2(ow - pd);
      if (rem > 0.005) out.push({ person: p, owed: ow, paid: pd, outstanding: rem, meals: mealsBy[p] });
    }
    return out.sort((a, b) => b.outstanding - a.outstanding);
  }

  // Market value for accounts the server values (today: the moomoo "invest" account). The ledger
  // balance stays the COST; this swaps the value in for display + net worth only. Never touches txns,
  // so monthly Income/Spent cannot move with the market.
  function valuedBalances(balances, valuations, today) {
    const out = { ...(balances || {}) }, valued = {};
    const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    for (const id in (valuations || {})) {
      const v = valuations[id];
      if (!(id in out) || !v || !isFinite(Number(v.sgd))) continue;
      const cost = round2(out[id]), value = round2(Number(v.sgd)), gain = round2(value - cost);
      const asOf = String(v.asOf || "");
      const stale = !asOf || (day(today) - day(asOf)) / 864e5 > 4;
      out[id] = value;
      valued[id] = { cost, value, gain, pct: cost ? round2(gain / cost * 100) : 0, asOf, stale };
    }
    return { balances: out, valued };
  }

  const api = { ym, balances, netWorth, monthTotals, categoryTotals, dayTotals, accountsBelowLine, owedByPerson, monthInsights, valuedBalances };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExpensesCalc = api;
})(typeof self !== "undefined" ? self : this);
