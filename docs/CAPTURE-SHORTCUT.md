# Snap a receipt with Back Tap (optional)

An iPhone Shortcut: **double-tap the back of the phone** on a payment or receipt screen, and the
amount, merchant and date land in your vault's `captures/` inbox. The app adds the entry on its
next open (default account, category guessed), or shows a review card when it can't read an amount.

Two ways to get it. The import link is faster.

## A. Import the shared Shortcut

1. On your iPhone, open https://www.icloud.com/shortcuts/f297988e8593439399681a21356fd5fb
   (a copy of the maintainer's Shortcut with the token removed).
2. Tap **Add Shortcut**.
3. Open it in the Shortcuts app and fix two things:
   - the **Text** action that builds the upload URL: replace `KCJJ0203` with your GitHub username
     (the repo part stays `expenses-vault` unless you named yours differently);
   - the **Get Contents of URL** action: tap **Show More**, and under Headers set `Authorization`
     to `Bearer ` followed by the same token you pasted into the app (the shared copy has it blank).
4. Settings → Accessibility → Touch → **Back Tap → Double Tap** → pick the Shortcut.

## B. Build it by hand

Open **Shortcuts → +** and add these actions in order.

### Capture and read
1. **Take Screenshot** (must be first; it grabs the current screen).
2. **Extract Text from Image** — input: Screenshot.
3. **Random Number** — 1 to 999999999. **Set Variable → CaptureID**.

### Amount
4. **Match Text** — pattern `\d+\.\d{2}` on Text from Image.
5. **Get Item from List → Last Item** from Matches. **Set Variable → Amount**.

### Merchant and category guess
6. **Change Case → lowercase** on Text from Image. **Set Variable → OCRlower**.
7. **Text** (blank) → **Set Variable → Category**; again → **Set Variable → Merchant**.
8. **Dictionary** of keyword → category (edit to where you spend):

   | key | value | key | value |
   |---|---|---|---|
   | mcdonald | Food | grab | Transport |
   | kfc | Food | smrt | Transport |
   | koufu | Food | ntuc | Groceries |
   | kopitiam | Food | fairprice | Groceries |
   | starbucks | Tea/Coffee | shopee | Shopping |
   | koi | Tea/Coffee | taobao | Shopping |
   | liho | Tea/Coffee | | |

   **Set Variable → KW**. **Get Dictionary Value → All Keys** in KW.
9. **Repeat with Each** over the keys: **If OCRlower contains Repeat Item** → Get Dictionary Value
   (Repeat Item in KW) → Set Variable Category; Change Case (Repeat Item, Capitalize Every Word) →
   Set Variable Merchant. End If. End Repeat.

### Type and date
10. **Text** `expense` → **Set Variable → Type**.
11. **Get Dates from Input** on Text from Image (finds a date printed on the receipt, if any).
12. **If** Dates has any value → **Format Date** (custom `yyyy-MM-dd`) → **Set Variable → Date**;
    **Otherwise** → **Format Date** (Current Date, `yyyy-MM-dd`) → **Set Variable → Date**. End If.

### Confirm card
13. **Text**: `🧾 ` Merchant, new line, `$` Amount ` · ` Category ` · ` Date (insert the variables).
14. **Choose from Menu** with that text. Items: **Expense**, **Income**, **Edit**, **Cancel**.
    - **Expense**: nothing (Type stays `expense`).
    - **Income**: **Text** `income` → **Set Variable → Type**.
    - **Edit**: **Ask for Input** (Number, "Amount?", default Amount) → Set Variable Amount;
      **Ask for Input** (Text, "Item?", default Merchant) → Set Variable Merchant;
      **Ask for Input** (Date, "Date?") → Format Date `yyyy-MM-dd` → Set Variable Date.
    - **Cancel**: **Stop This Shortcut**.

### Upload
15. **Dictionary** with 8 rows: `id` CaptureID · `ts` Current Date (ISO 8601) · `text` Text from Image ·
    `amount` Amount · `merchant` Merchant · `category` Category · `type` Type · `date` Date.
16. **Base64 Encode** the Dictionary, **Line Breaks: None** (GitHub rejects wrapped base64).
17. **Text**: `https://api.github.com/repos/YOUR-GITHUB-USERNAME/expenses-vault/contents/captures/` then
    CaptureID then `.json`. (Build the URL in a Text action; a mixed string straight into the next
    action fails with "couldn't convert to URL".)
18. **Get Contents of URL**: URL = that Text · Method **PUT** · Headers `Authorization` = `Bearer YOUR_TOKEN`,
    `Accept` = `application/vnd.github+json` · Request Body **JSON**: `message` = `capture`,
    `content` = Base64 Encoded, `branch` = `main`.

### Notify
19. **Get Dictionary Value → commit** from Contents of URL. **If** it has any value →
    **Show Notification** "Captured 📸", **Otherwise** → "Capture failed, try again".

### Assign
Settings → Accessibility → Touch → **Back Tap → Double Tap** → this Shortcut.

## Notes

- `YOUR_TOKEN` is the token from `SETUP.md` step 4. It lives only inside this Shortcut on your phone.
- Captures sit in your private vault until the app drains them. Nothing touches the public app repo.
- If the screenshot catches a banner instead of the app, add a 1-second **Wait** before Take Screenshot.
- Amounts like `1,234.56` may read as `234.56`; tap **Edit**.
