# Expenses vault

Your private expense ledger. **Keep this repo private.**

The Expenses app (the GitHub Pages site you set up) reads and writes `expenses-data.json` here
through the GitHub API with the token you pasted into the app. Nothing else needs to be in this repo.

- `expenses-data.json` is the ledger: transactions, accounts, budgets, bills, IOUs.
- `captures/` is an inbox for the optional iPhone Shortcut; the app empties it.
- `CLAUDE.md` tells Claude Code how to edit the ledger safely, so you can ask your own Claude to
  add, fix or summarise entries.
