# Fintom — Claude Code Context

This file is read by Claude Code at the start of every session.
Do not delete it. Update it when conventions change.

---

## Project Overview

**Fintom** is a personal finance iOS app replacing Spendee for one user (Hayder Ali, Munich).
It is also a portfolio project demonstrating Analytics Engineering skills.

- **Stack:** React Native + Expo SDK 54 + TypeScript + SQLite
- **Routing:** Expo Router (file-based — a file in `app/` = a screen)
- **Database:** `expo-sqlite` — on-device SQLite, offline-first, source of truth
- **State:** React Context + custom hooks (no Redux, no Zustand — keep it simple)
- **Theme:** Light mode, EUR (€) primary currency, colorful vibrant category icons
- **Target device:** iPhone 12, iOS 26

---

## Non-Negotiable Rules

1. **Never commit personal data.** Files matching `data/personal/`, `*.db`, `*_real.csv`, `transactions_export*.csv` are gitignored. Never suggest committing them.
2. **Never use `npm install` for Expo packages.** Always use `npx expo install package-name`. This preserves Expo's version compatibility matrix.
3. **Never use `npm audit fix --force`.** Use `npx expo install --fix` instead.
4. **Always use `npx expo` not `expo`.** The global legacy CLI is removed.
5. **Money is always stored as integers (cents).** €12.50 = 1250 in the DB. Never store floats for currency. Display layer handles formatting.
6. **All SQL queries use parameterized statements.** Never string-interpolate user input into SQL.
7. **Transfers always create paired records.** One outgoing + one incoming row, linked by `transfer_group_id`. Deleting one prompts to delete both.
8. **TypeScript strict mode is on.** No `any` types. No `// @ts-ignore` without a comment explaining why.

---

## Project Structure

App code lives under `src/`. The `@/*` path alias resolves to `./src/*`
(see `tsconfig.json`). Screens are the only thing outside `src/` — Expo
Router requires them in `app/`.

```
fintom/
├── app/                      # Expo Router — a file here = a route
│   ├── (tabs)/               # Bottom tab navigation
│   │   ├── _layout.tsx       # Tab bar layout
│   │   ├── index.tsx         # Timeline (transaction feed)
│   │   ├── wallets.tsx       # Wallets + balances
│   │   ├── budgets.tsx       # Monthly budgets
│   │   ├── goals.tsx         # Goals tracker
│   │   └── settings.tsx      # Settings + management
│   ├── manage/
│   │   ├── recurring.tsx     # Recurring rules management
│   │   └── tags.tsx          # Tags management
│   ├── settings/
│   │   ├── categories.tsx    # Category management
│   │   ├── import.tsx        # CSV import (Spendee format)
│   │   └── wallets.tsx       # Wallet management
│   ├── transaction/
│   │   └── add.tsx           # Add transaction screen
│   └── _layout.tsx           # Root layout + DB initialization
├── src/
│   ├── db/
│   │   ├── schema.ts         # Table + index definitions (single source of truth)
│   │   ├── migrations.ts     # Schema versioning
│   │   ├── queries/          # One file per table
│   │   │   ├── transactions.ts
│   │   │   ├── wallets.ts
│   │   │   ├── categories.ts
│   │   │   ├── budgets.ts
│   │   │   ├── goals.ts
│   │   │   └── transfers.ts
│   │   └── seed.ts           # Seed wallets, categories, tags (synthetic-safe)
│   ├── components/
│   │   ├── ui/               # Atomic: Button, Card, Badge, Amount
│   │   └── finance/          # Domain: TransactionRow, WalletCard, GoalProgress
│   ├── constants/
│   │   └── theme.ts          # Color tokens + theme (the colors source of truth)
│   ├── context/
│   │   ├── DatabaseContext.tsx  # DB connection provider
│   │   └── AppContext.tsx       # Global app state
│   ├── hooks/
│   │   ├── useTransactions.ts
│   │   ├── useWallets.ts
│   │   ├── useBudgets.ts
│   │   └── useGoals.ts
│   ├── utils/
│   │   ├── currency.ts       # formatEur(1250) → "12,50 €"  (de-DE)
│   │   ├── date.ts           # Date helpers
│   │   └── csv.ts            # Spendee CSV import parser
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── data/
│   ├── personal/             # ⛔ GITIGNORED — real exports + real seed values
│   └── sample/               # ✅ Synthetic data for dev
├── docs/                     # Architecture, schema, decisions
├── CLAUDE.md                 # This file
└── README.md                 # Public portfolio README
```

> ⚠️ Real seed amounts (salary, rent, debt/goal targets) are **not** stored
> in this file — it is committed to a public repo. They live in the
> gitignored `data/personal/seed.local.md`. The seed values below use
> synthetic placeholders so the structure is documented without leaking
> personal finances.

---

## Database Schema

**Golden rule: money is stored in cents (integer). Never floats.**

### Table: `wallets`

```sql
CREATE TABLE wallets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('checking','savings','cash','investment','p2p')),
  currency     TEXT NOT NULL DEFAULT 'EUR',
  balance_cents INTEGER NOT NULL DEFAULT 0,
  color        TEXT NOT NULL DEFAULT '#4CAF50',
  icon         TEXT NOT NULL DEFAULT 'wallet',
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> `balance_cents` is the **immutable opening balance** only. Never mutate it
> per transaction — the live balance is `balance_cents + SUM(transactions)`
> (see [Wallet balance](#wallet-balance)). Updating it on each write would
> double-count.

**Seed wallets:**

- Cash (type: cash, icon: 💵)
- Giro Comdirect (type: checking, icon: 🏦)
- Trade Republic (type: savings, icon: 📈)
- Monefit (type: p2p, icon: 🔄)

### Table: `categories`

```sql
CREATE TABLE categories (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL UNIQUE,
  type                  TEXT NOT NULL CHECK(type IN ('income','expense')),
  priority              TEXT NOT NULL DEFAULT 'need'
                          CHECK(priority IN ('need','want','savings','none')),
  color                 TEXT NOT NULL DEFAULT '#9E9E9E',
  icon                  TEXT NOT NULL DEFAULT '📦',
  is_tax_relevant_default INTEGER NOT NULL DEFAULT 0,
  is_active             INTEGER NOT NULL DEFAULT 1,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**23 seed categories (from real Spendee usage):**

Expenses — need:

- 🏠 Home, ⚡ Utilities, 🌐 Internet, 📱 Phone, 🚌 Transportation,
  🛒 Groceries, 💊 Medical, 🧾 Bills & Fees, 💰 Investment, 📚 Education

Expenses — want:

- 🍽️ Food & Drink, 🛍️ Shopping, ✈️ Travel, ⚽ Sport & Hobbies,
  🎭 Entertainment, 👗 Clothes, 💈 Personal Care, 🔧 Misc

Expenses — savings:

- 💾 Savings

Income:

- 💼 Salary, 📊 Other Income, 🎁 Gifts Received, 🔁 Refund

### Table: `tags`

```sql
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#9E9E9E',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed tags:** 💳 Master, 💳 Amex

### Table: `transactions`

```sql
CREATE TABLE transactions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  date              TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  type              TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id),
  category_id       INTEGER REFERENCES categories(id),
  description       TEXT,
  note              TEXT,
  is_tax_relevant   INTEGER NOT NULL DEFAULT 0,
  transfer_group_id TEXT,
  is_recurring      INTEGER NOT NULL DEFAULT 0,
  recurring_rule_id INTEGER REFERENCES recurring_rules(id),
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK(source IN ('manual','csv_import','shortcut')),
  external_id       TEXT UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Table: `transaction_tags` (junction)

```sql
CREATE TABLE transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
```

### Table: `budgets`

```sql
CREATE TABLE budgets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  year            INTEGER NOT NULL,
  month           INTEGER NOT NULL,
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  planned_cents   INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(year, month, category_id)
);
```

### Table: `recurring_rules`

```sql
CREATE TABLE recurring_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('income','expense')),
  wallet_id       INTEGER NOT NULL REFERENCES wallets(id),
  category_id     INTEGER REFERENCES categories(id),
  frequency       TEXT NOT NULL
                    CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  frequency_day   INTEGER,
  start_date      TEXT NOT NULL,
  end_date        TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed recurring rules** — shape only; real amounts live in the gitignored
`data/personal/seed.local.md`. Placeholders below:

- Salary €X,XXX income, Comdirect, monthly 24th
- Rent €X,XXX expense, Comdirect, monthly 1st (Home)
- Strom €XX expense, Comdirect, monthly 1st (Utilities)
- Internet €XX expense, Comdirect, monthly (Bills & Fees)
- Investment €XX expense, Trade Republic, monthly 2nd
- Education €XX expense, Trade Republic, monthly 6th
- Radio Tax €XX expense, Comdirect, quarterly 15th
- Sport €XX expense, Comdirect, weekly Friday (ends June 30)

### Table: `goals`

```sql
CREATE TABLE goals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL
                    CHECK(type IN ('savings','debt_payoff','milestone','fi')),
  target_cents    INTEGER NOT NULL,
  current_cents   INTEGER NOT NULL DEFAULT 0,
  linked_wallet_id INTEGER REFERENCES wallets(id),
  is_auto_tracked INTEGER NOT NULL DEFAULT 0,
  target_date     TEXT,
  notes           TEXT,
  color           TEXT NOT NULL DEFAULT '#4CAF50',
  icon            TEXT NOT NULL DEFAULT '🎯',
  is_active       INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed goals** — shape only; real targets live in the gitignored
`data/personal/seed.local.md`. Placeholders below:

- 🆘 Emergency Fund — savings — €X,XXX target
- 👨‍👩‍👦 Family Debt — debt_payoff — €XX,XXX target
- ☁️ Coast FI — milestone — €XXX,XXX target
- 🏝️ Financial Independence — fi — €X,XXX,XXX target
- 💍 Marriage Budget — savings — €XX,XXX target

### Table: `net_worth_snapshots`

```sql
CREATE TABLE net_worth_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  asset_type   TEXT NOT NULL,
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  is_liability INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Key Calculations

### Wallet balance

```sql
SELECT
  w.id,
  w.name,
  w.balance_cents + COALESCE(SUM(
    CASE
      WHEN t.type = 'income'  THEN t.amount_cents
      WHEN t.type = 'expense' THEN -t.amount_cents
      WHEN t.type = 'transfer' AND t.amount_cents > 0 THEN t.amount_cents
      ELSE 0
    END
  ), 0) AS current_balance_cents
FROM wallets w
LEFT JOIN transactions t ON t.wallet_id = w.id
WHERE w.id = ?
GROUP BY w.id;
```

### Monthly carry-forward

```sql
SELECT
  SUM(CASE WHEN type='income' THEN amount_cents ELSE 0 END) -
  SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END)
  AS carry_forward_cents
FROM transactions
WHERE strftime('%Y-%m', date) = ?  -- e.g. '2026-04'
  AND type IN ('income','expense');
```

### Budget vs actual (one month)

```sql
SELECT
  c.name,
  c.color,
  c.icon,
  COALESCE(b.planned_cents, 0) AS planned_cents,
  COALESCE(SUM(t.amount_cents), 0) AS actual_cents,
  COUNT(t.id) AS transaction_count
FROM categories c
LEFT JOIN budgets b
  ON b.category_id = c.id AND b.year = ? AND b.month = ?
LEFT JOIN transactions t
  ON t.category_id = c.id
  AND strftime('%Y-%m', t.date) = printf('%04d-%02d', ?, ?)
  AND t.type = 'expense'
WHERE c.type = 'expense' AND c.is_active = 1
GROUP BY c.id
ORDER BY actual_cents DESC;
```

---

## Currency Formatting

Always use the `formatEur` utility. Never format money inline.

```typescript
// src/utils/currency.ts
export const formatEur = (cents: number): string => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
};

// Usage
formatEur(1250); // → "12,50 €"
formatEur(-8034); // → "-80,34 €"
```

Note: German locale formats as `12,50 €` not `€12.50`. This is correct for a Munich user.

---

## Coding Conventions

### File naming

- Screens: `kebab-case.tsx` (Expo Router convention)
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` starting with `use`
- Utilities: `camelCase.ts`
- DB queries: `camelCase.ts` named after the table

### Component structure

```typescript
// 1. Imports (React, then Expo, then local)
// 2. Types/interfaces
// 3. Component function
// 4. Styles (StyleSheet.create at the bottom)
// 5. Export default
```

### Git commit format

type: short description (max 72 chars)
Optional longer explanation. Reference issues or decisions if relevant.
Types: feat, fix, docs, style, refactor, test, chore

### Error handling philosophy

- Fail loudly — never silently swallow errors
- Log clearly — include context (which query, which wallet ID)
- Never corrupt data — if a write fails, roll back cleanly
- Show the user something useful — not "An error occurred"

### Data validation rules

- Amount (income/expense): user enters a positive value; the `type` field
  carries the meaning. Store `amount_cents` as a positive integer.
- Amount (transfer): the paired rows are **signed** — the outgoing row is
  negative, the incoming row is positive. The wallet-balance query depends on
  this (`transfer AND amount_cents > 0` = incoming). Validate the *magnitude*
  is > 0, not the sign.
- Date: must not be more than 1 year in the future
- Transfer: must have two different wallet IDs
- Budget: planned amount must be > 0

---

## CSV Import Format (Spendee Export)

Real column order from actual Spendee exports (9 columns, positional):

```
Date, Wallet, Type, Category name, Amount, Currency, Note, Labels, Author
```

- **Date** — ISO 8601 with timezone: `2026-01-01T10:23:29+00:00`. The import strips everything after `T` to get `YYYY-MM-DD`.
- **Amount** — float with up to 8 decimal places. Negative for expenses and outgoing transfers. Converted to cents via `Math.round(parseFloat(amount) * 100)`.
- **Author** — always `"Hayder Ali"`, ignored by the importer.

`Type` is one of:

- `Income`
- `Expense`
- `Incoming Transfer`
- `Outgoing Transfer`

**Name aliases** — Spendee uses different names than the Fintom seed. The importer resolves these automatically via `CATEGORY_ALIASES` and `WALLET_ALIASES` in `src/utils/csv-import.ts`:

| Spendee name | Fintom seed name |
|---|---|
| `Bargeld` | `Cash` (wallet) |
| `Transport` | `Transportation` |
| `Healthcare` | `Medical` |
| `Self care` | `Personal Care` |
| `Gifts` | `Gifts Received` |
| `Receivables` | `Refund` |
| `Strom` | `Utilities` |
| `Other` | `Other Income` |
| `Interest payout` | `Other Income` |
| `Insurance Payout` | `Other Income` |
| `Family & Personal` | `Misc` |

Import creates tags from the `Labels` column (comma-separated). Tags are created if they do not already exist.

---

## What NOT To Do

- ❌ Do not add new npm packages without checking Expo compatibility first
- ❌ Do not store money as floats (0.1 + 0.2 ≠ 0.3 in floating point)
- ❌ Do not create screens outside the `app/` directory
- ❌ Do not query the DB directly in components — use hooks
- ❌ Do not hardcode colors — use the tokens in `src/constants/theme.ts`
- ❌ Do not skip the `is_active` filter on wallets/categories queries
- ❌ Do not delete transfers without deleting both sides of the pair
- ❌ Do not store real financial data in `data/sample/` or commit any `.db` files

---

## Phase 1 Scope (current)

In scope:

- Transaction CRUD (add, edit, delete, list, search, filter)
- Wallet management (CRUD, balance calculation)
- Category management (CRUD, reorder)
- Tags (free-form, applied to transactions)
- Transfers between wallets (paired records)
- Recurring transaction rules + scheduling
- Monthly budget tracking (planned vs actual, carry-forward)
- Goal tracking (savings, debt payoff, Coast FI, FI milestones)
- Tax-relevant flagging on transactions
- CSV import (Spendee format, one-time historical migration)
- Search and filter transactions
- Face ID / passcode lock
- iCloud backup of SQLite DB

Out of scope for Phase 1 (do not implement):

- Google Sheets sync (Phase 2)
- Bank API / PSD2 integration (Phase 2)
- Receipt photo attachments (removed from roadmap)
- Multi-device sync (Phase 3+)
- DuckDB analytics (Phase 4)
- Apple Shortcuts integration (Phase 5)
- Multi-user support (never)

---

## 🔑 SSH Key Management

### Set up Mac-specific SSH key for GitHub (one-time)

ssh-keygen -t ed25519 -C "hayder-macbook-pro" -f ~/.ssh/id_ed25519_macbook
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519_macbook
pbcopy < ~/.ssh/id_ed25519_macbook.pub

# Paste key at: github.com → Settings → SSH and GPG keys → New SSH key

### Configure SSH to use Mac key for GitHub

cat >> ~/.ssh/config << 'EOF'

# GitHub — MacBook Pro

Host github.com
HostName github.com
User git
IdentityFile ~/.ssh/id_ed25519_macbook
AddKeysToAgent yes
EOF

### Switch existing repo from HTTPS to SSH

git remote set-url origin git@github.com:USERNAME/REPO.git

### Test SSH connection

ssh -T git@github.com

# Expected: "Hi hayderalijaan! You've successfully authenticated..."

### Best practice: one named key per device

# id_ed25519_macbook → MacBook Pro

# id_ed25519_linuxio → Linux VM

# id_ed25519_work → future work laptop
