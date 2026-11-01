// Where the private vault lives and how to address it. Dual-target: Node (require, for
// tests) + browser (window.Vault). No dependencies. The vault owner defaults to the GitHub
// Pages host (`<owner>.github.io`); anything else (localhost, custom domain) leaves it blank
// so the settings dialog asks for it.
(function (root) {
  "use strict";

  const REPO = "expenses-vault";

  // The template author's own account holds his real ledger. The public demo copy of this app
  // runs on that same github.io host, so it must never read or write a vault under that owner.
  const BLOCKED_OWNERS = ["kcjj0203"];
  function isBlocked(cfg) {
    return !!cfg && BLOCKED_OWNERS.indexOf(String(cfg.owner || "").trim().toLowerCase()) >= 0;
  }

  function defaultsFromHost(hostname) {
    const h = String(hostname || "").toLowerCase();
    const m = /^([a-z0-9-]+)\.github\.io$/.exec(h);
    const owner = m && !isBlocked({ owner: m[1] }) ? m[1] : "";
    return { owner, repo: REPO };
  }

  function contentsUrl(cfg, path) {
    if (isBlocked(cfg)) throw new Error("vault owner " + cfg.owner + " is not allowed in this app");
    return "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;
  }

  function isConfigured(cfg) {
    return !!(cfg && String(cfg.owner || "").trim() && String(cfg.repo || "").trim()) && !isBlocked(cfg);
  }

  // Seed texts for a brand-new vault. Byte-for-byte copies of vault-seed/README.md and
  // vault-seed/CLAUDE.md (scripts/vault.test.js fails if they drift). Edit the files, then
  // paste them back here.
  const SEED_README = `# Expenses vault

Your private expense ledger. **Keep this repo private.**

The Expenses app (the GitHub Pages site you set up) reads and writes \`expenses-data.json\` here
through the GitHub API with the token you pasted into the app. Nothing else needs to be in this repo.

- \`expenses-data.json\` is the ledger: transactions, accounts, budgets, bills, IOUs.
- \`captures/\` is an inbox for the optional iPhone Shortcut; the app empties it.
- \`CLAUDE.md\` tells Claude Code how to edit the ledger safely, so you can ask your own Claude to
  add, fix or summarise entries.
`;
  const SEED_CLAUDE = `# CLAUDE.md

This repo is a personal expense ledger used by the Expenses app (a GitHub Pages PWA). The app and
this file are the only writers. Edit \`expenses-data.json\` directly when the owner asks you to add,
fix, delete or summarise entries. Commit to \`main\`; the app pulls on its next open.

## expenses-data.json

Top-level keys:

| key | shape | notes |
|---|---|---|
| \`txns\` | array of transactions | the ledger |
| \`accounts\` | \`{ [id]: account }\` | definitions and starting balances |
| \`owed\` | array | IOUs from split meals |
| \`budgets\` | \`{ [category]: { amount, mtime } }\` | monthly caps |
| \`bills\` | \`{ [id]: { label, amount, due, account, payFrom, paid, removed, note, mtime } }\` | upcoming bills |
| \`tombstones\` | \`{ [txnId]: mtime }\` | deleted transaction ids (see rules) |
| \`valuations\` | object | reserved, leave as is |
| \`categories\`, \`tags\` | arrays of strings | custom additions only |
| \`updatedAt\` | number | written by the app, never by hand |

A transaction:

\`\`\`json
{ "id": "x1729750000000ab3d", "type": "expense", "amount": 12.4, "account": "cash",
  "item": "Lunch at Koufu", "category": "Food", "date": "2026-10-23", "tags": [], "mtime": 1729750000000 }
\`\`\`

- \`type\` is \`expense\`, \`income\` or \`transfer\`. A transfer also has \`toAccount\` and moves money
  between the owner's own accounts; it is not spending.
- \`amount\` is always positive. \`date\` is \`YYYY-MM-DD\`. \`account\` and \`toAccount\` are account ids.
- \`category\` is a category name (\`Food\`, \`Transport\`, \`Salary\` ...). Income uses the income categories.
- \`capId\` may appear on entries that came from the iPhone Shortcut. Leave it alone.

An account (\`accounts[id]\`):

\`\`\`json
{ "id": "cash", "name": "Cash", "colour": "#2e9e5b", "icon": "💵", "credit": false,
  "start": 50, "topUpLine": 20, "default": true, "archived": false, "mtime": 1729750000000 }
\`\`\`

- Current balance is never stored. It is \`start\` plus every transaction on that account.
- \`topUpLine\` (optional) is the "warn me when below" balance. \`default\` marks the account new
  entries go to. \`archived: true\` hides an account without deleting its history. Credit accounts
  carry \`credit: true\` and a \`limit\`.

## Rules

1. **Ids are stable strings and are never regenerated.** New transaction ids: \`"x" + Date.now() +
   4 random base36 chars\`. Never renumber, never reuse an id.
2. **Every edit bumps \`mtime\`** on that row to the current \`Date.now()\`. The app merges by newest
   \`mtime\` per id, so an edit without a bump may be overwritten by a phone that synced later.
3. **Deleting a transaction or an IOU = remove the row AND add \`tombstones[id] = Date.now()\`.**
   Without the tombstone the phone's copy re-adds the row on the next sync. Bills and accounts
   are never removed: a bill is deleted by setting \`removed: true\` (+ \`mtime\`), an account is
   hidden by setting \`archived: true\` (+ \`mtime\`), and its history stays.
4. Do not hand-edit \`updatedAt\`, \`valuations\` or anything in \`captures/\`.
5. Do not change account ids. Renaming an account means editing its \`name\`.
6. Keep the file valid JSON, 2-space indented, one trailing newline.

## Worked examples

**Add a transaction** ("add $12.40 lunch at Koufu yesterday from Cash"): append to \`txns\` with
\`type: "expense"\`, \`amount: 12.4\`, \`account: "cash"\`, \`item: "Lunch at Koufu"\`, \`category: "Food"\`,
yesterday's date, \`tags: []\`, a fresh id and \`mtime\`.

**Fix an amount** ("the 23 Oct Grab was 8.90"): find the txn by date + item, set \`amount: 8.9\`,
set \`mtime: Date.now()\`.

**Monthly summary** ("how much did I spend on Transport this month"): sum \`amount\` over \`txns\` with
\`type === "expense"\`, \`category === "Transport"\` and \`date\` in the month. Transfers never count.

Full format reference: the app repo's \`docs/DATA-FORMAT.md\`.
`;

  function seedFiles() {
    return [{ path: "README.md", text: SEED_README }, { path: "CLAUDE.md", text: SEED_CLAUDE }];
  }

  const api = { defaultsFromHost, contentsUrl, isConfigured, isBlocked, seedFiles };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Vault = api;
})(typeof window !== "undefined" ? window : globalThis);
