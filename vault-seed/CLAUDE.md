# CLAUDE.md

This repo is a personal expense ledger used by the Expenses app (a GitHub Pages PWA). The app and
this file are the only writers. Edit `expenses-data.json` directly when the owner asks you to add,
fix, delete or summarise entries. Commit to `main`; the app pulls on its next open.

## expenses-data.json

Top-level keys:

| key | shape | notes |
|---|---|---|
| `txns` | array of transactions | the ledger |
| `accounts` | `{ [id]: account }` | definitions and starting balances |
| `owed` | array | IOUs from split meals |
| `budgets` | `{ [category]: { amount, mtime } }` | monthly caps |
| `bills` | `{ [id]: { label, amount, due, account, payFrom, paid, removed, note, mtime } }` | upcoming bills |
| `tombstones` | `{ [txnId]: mtime }` | deleted transaction ids (see rules) |
| `valuations` | object | reserved, leave as is |
| `categories`, `tags` | arrays of strings | custom additions only |
| `updatedAt` | number | written by the app, never by hand |

A transaction:

```json
{ "id": "x1729750000000ab3d", "type": "expense", "amount": 12.4, "account": "cash",
  "item": "Lunch at Koufu", "category": "Food", "date": "2026-10-23", "tags": [], "mtime": 1729750000000 }
```

- `type` is `expense`, `income` or `transfer`. A transfer also has `toAccount` and moves money
  between the owner's own accounts; it is not spending.
- `amount` is always positive. `date` is `YYYY-MM-DD`. `account` and `toAccount` are account ids.
- `category` is a category name (`Food`, `Transport`, `Salary` ...). Income uses the income categories.
- `capId` may appear on entries that came from the iPhone Shortcut. Leave it alone.

An account (`accounts[id]`):

```json
{ "id": "cash", "name": "Cash", "colour": "#2e9e5b", "icon": "💵", "credit": false,
  "start": 50, "topUpLine": 20, "default": true, "archived": false, "mtime": 1729750000000 }
```

- Current balance is never stored. It is `start` plus every transaction on that account.
- `topUpLine` (optional) is the "warn me when below" balance. `default` marks the account new
  entries go to. `archived: true` hides an account without deleting its history. Credit accounts
  carry `credit: true` and a `limit`.

## Rules

1. **Ids are stable strings and are never regenerated.** New transaction ids: `"x" + Date.now() +
   4 random base36 chars`. Never renumber, never reuse an id.
2. **Every edit bumps `mtime`** on that row to the current `Date.now()`. The app merges by newest
   `mtime` per id, so an edit without a bump may be overwritten by a phone that synced later.
3. **Deleting a transaction or an IOU = remove the row AND add `tombstones[id] = Date.now()`.**
   Without the tombstone the phone's copy re-adds the row on the next sync. Bills and accounts
   are never removed: a bill is deleted by setting `removed: true` (+ `mtime`), an account is
   hidden by setting `archived: true` (+ `mtime`), and its history stays.
4. Do not hand-edit `updatedAt`, `valuations` or anything in `captures/`.
5. Do not change account ids. Renaming an account means editing its `name`.
6. Keep the file valid JSON, 2-space indented, one trailing newline.

## Worked examples

**Add a transaction** ("add $12.40 lunch at Koufu yesterday from Cash"): append to `txns` with
`type: "expense"`, `amount: 12.4`, `account: "cash"`, `item: "Lunch at Koufu"`, `category: "Food"`,
yesterday's date, `tags: []`, a fresh id and `mtime`.

**Fix an amount** ("the 23 Oct Grab was 8.90"): find the txn by date + item, set `amount: 8.9`,
set `mtime: Date.now()`.

**Monthly summary** ("how much did I spend on Transport this month"): sum `amount` over `txns` with
`type === "expense"`, `category === "Transport"` and `date` in the month. Transfers never count.

Full format reference: the app repo's `docs/DATA-FORMAT.md`.
