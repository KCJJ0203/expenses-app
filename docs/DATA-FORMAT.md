# Data format

Everything lives in one file in your private vault: `expenses-data.json`. The app reads and
writes it through the GitHub Contents API. The same text, condensed, is in the vault's `CLAUDE.md`
so Claude Code can edit it safely.

## Top level

```json
{
  "txns": [], "accounts": {}, "owed": [], "budgets": {}, "bills": {},
  "tombstones": {}, "valuations": {}, "categories": [], "tags": [], "updatedAt": 0
}
```

| key | type | what |
|---|---|---|
| `txns` | array | transactions (the ledger) |
| `accounts` | object keyed by id | account definitions and starting balances |
| `owed` | array | IOUs from "I paid for friends" splits |
| `budgets` | object keyed by category | monthly caps `{ amount, mtime }` |
| `bills` | object keyed by id | upcoming bills |
| `tombstones` | object keyed by id | deleted transaction and IOU ids, value = time of deletion |
| `valuations` | object | reserved; nothing writes it in this app |
| `categories`, `tags` | arrays of strings | custom ones added in-app (the built-in lists are in `expenses.json`) |
| `updatedAt` | number | set by the app on every push |

## Transaction

```json
{ "id": "x1729750000000ab3d", "type": "expense", "amount": 12.4, "account": "cash",
  "item": "Lunch at Koufu", "category": "Food", "date": "2026-10-23", "tags": ["treat"],
  "mtime": 1729750000000 }
```

- `type`: `expense`, `income` or `transfer`. A transfer has `toAccount` too and moves money between
  your own accounts; it never counts as spending or income.
- `amount`: positive number. `date`: `YYYY-MM-DD` local date.
- `account`, `toAccount`: account ids.
- `category`: a category name. Expense categories and income categories are separate lists.
- `capId`: present when the entry came from the capture Shortcut; prevents double-posting.
- `mtime`: milliseconds since epoch, bumped on every edit.

## Account

```json
{ "id": "cash", "name": "Cash", "colour": "#2e9e5b", "icon": "💵", "credit": false,
  "start": 50, "topUpLine": 20, "default": true, "archived": false, "mtime": 1729750000000 }
```

- `start`: the balance when the account was set up. The current balance is never stored; it is
  `start` plus every transaction touching the account.
- `credit: true` makes it a credit account with a `limit`; its balance is what you owe (negative).
- `topUpLine`: optional "warn me when below" balance. `default`: where new entries go.
- `archived: true` hides the account everywhere but keeps its history. The app refuses to archive
  an account whose balance is not zero.
- Ids are slugs of the name at creation (`paynow_paylah`). Renaming never changes the id.

## Owed (IOU)

```json
{ "id": "o1729750000000ab3", "person": "Alex", "amount": 8.5, "meal": "Hotpot", "date": "20 Oct", "mtime": 1729750000000 }
```

## Bill

```json
{ "label": "Phone", "amount": 30, "due": "2026-11-01", "account": "credit_card", "payFrom": "cash",
  "note": "", "paid": false, "removed": false, "mtime": 1729750000000 }
```

`account` is where the bill sits (usually a credit account), `payFrom` the asset account that pays
it. Marking it paid logs a transfer `payFrom → account` with id `billpay-<billId>` (if `payFrom` has been archived, the default account pays). `removed: true`
is a soft delete so other devices learn about it.

## How devices agree (sync rules)

The app on each device keeps a local copy and syncs with the vault. The merge in
`scripts/expenses-sync.js`:

1. `txns`: union by `id`; when both sides have the same id, the newer `mtime` wins.
2. A deleted txn is removed and its id goes in `tombstones` with the deletion time. On merge, a
   tombstone newer than the row's `mtime` wins; an edit newer than the tombstone resurrects the row.
   Tombstones older than 90 days are pruned.
3. `accounts`, `budgets`, `bills`, `valuations`: per key, newer `mtime` wins.
4. `owed`: union by id, newer `mtime` wins.
5. `categories`, `tags`: union.

Push uses the file's last known sha; on a conflict the app re-pulls, re-merges and retries.

## Editing by hand or with Claude

- Never regenerate ids. New txn ids are `"x" + Date.now() + 4 random base36 chars`.
- Bump `mtime` on every row you change, or a phone that synced later may overwrite you.
- Deleting a txn or IOU = remove the row **and** add `tombstones[id] = Date.now()`. Bills use `removed: true`; accounts use `archived: true`; neither is ever removed from the file.
- Don't touch `updatedAt`, `valuations` or `captures/`.
- Keep valid JSON, 2-space indent, trailing newline.
