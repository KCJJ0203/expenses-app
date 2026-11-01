# Setup

About 15 minutes. You need a GitHub account and your phone. Everything is free: the app runs on
GitHub Pages and your data lives in a private GitHub repo that only you (and the app) can read.

## 1. Make your copy of the app (public)

1. Open https://github.com/KCJJ0203/expenses-app and click **Use this template → Create a new repository**.
2. Name it `expenses` (any name works). Keep it **Public**: GitHub Pages on a free account only
   serves public repos. The app repo holds no money data, only the code.
3. Click **Create repository**.

## 2. Turn on GitHub Pages

1. In your new repo: **Settings → Pages**.
2. Under **Build and deployment**, Source = **Deploy from a branch**, Branch = `main`, folder `/ (root)`. Save.
3. After a minute or two the page shows your URL, like `https://YOURNAME.github.io/expenses/`. Open it once to check it loads.

## 3. Make your vault (private)

1. https://github.com/new → Repository name `expenses-vault` → **Private** → **Create repository**.
2. Leave it empty. The app fills it in on the first sync (your ledger, a README and a `CLAUDE.md`).

## 4. Make a token for the app

1. https://github.com/settings/personal-access-tokens/new
2. Token name: `expenses app`. Expiration: **1 year** (you'll paste a new one when it expires).
3. **Repository access → Only select repositories → `expenses-vault`**.
4. **Permissions → Repository permissions → Contents → Read and write**. Nothing else.
5. **Generate token** and copy it. You'll paste it into the app in a moment; it is shown only once.

## 5. Install the app on your phone

1. Open your Pages URL in Safari. Tap **Share → Add to Home Screen → Add**.
2. Open **Expenses** from the home screen.
3. First screen: **Already have a vault?** Tap **Connect my vault**, enter your GitHub username,
   leave the repo as `expenses-vault`, paste the token, **Save**. (New device later? Same step
   brings your history back.)
4. **Set up your accounts**: rename Bank if you like, type what's in it right now, tap the chips
   to add Cash, PayNow/PayLah, GrabPay or a credit card, remove what you don't use. **Save & open dashboard**.
5. The pill under the big number should read **synced**. Tap it any time to sync now. Username, repo
   and token live behind the **Vault** button next to Accounts (also where you paste a renewed token).
   If the pill says **sync error**, tap it: it reopens those settings.

That's it. Add expenses as they happen or days later; balances are worked out for you.

## 6. Optional: snap a receipt with Back Tap

An iPhone Shortcut that screenshots a payment screen, reads the amount and drops it into the
app for you to confirm. See [`CAPTURE-SHORTCUT.md`](CAPTURE-SHORTCUT.md).

## 7. Let your Claude manage it

Your ledger is one JSON file in your private vault, and the vault carries a `CLAUDE.md` that
explains the format and the rules. So:

1. Open https://claude.ai/code, connect your GitHub account and pick the `expenses-vault` repo.
2. Ask in plain words. Examples:
   - "add $12.40 lunch at Koufu yesterday from Cash"
   - "how much did I spend on Transport this month"
   - "fix the 23 Oct Grab amount to 8.90"
3. The app picks up the change the next time it opens or syncs.

## Common questions

- **Where is my token stored?** Only in the browser on that device. Each device you use needs it pasted once.
- **Can anyone see my spending?** No. The app repo is public but has no data. The vault is private.
- **I lost my phone.** Install the app on the new one and use **Connect my vault**. Revoke the old token at https://github.com/settings/personal-access-tokens.
- **Backups?** The vault is already a full history (every sync is a commit). **Export** on the dashboard also saves a JSON file.
