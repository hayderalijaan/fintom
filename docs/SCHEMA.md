# Fintom — Database Schema

SQLite via `expo-sqlite`. All tables defined in `src/db/schema.ts`.

## Design Principles

1. **Money is always integers (cents).** €12.50 = 1250. Never floats.
2. **Soft deletes via `is_active`.** Never hard-delete wallets or categories.
3. **Transfers are paired rows.** One outgoing + one incoming, linked by `transfer_group_id`.
4. **Dates are ISO 8601 strings.** `YYYY-MM-DD` for dates, `datetime('now')` for timestamps.
5. **All foreign keys are enforced.** `PRAGMA foreign_keys = ON` on every connection.

---

## Entity Relationship
wallets ──────────────────────── transactions │ │ │ │ categories tags │ (via transaction_tags) │ recurring_rules ──────────── transactions
goals ──────────── wallets (optional link)
budgets ─────────── categories
net_worth_snapshots (standalone)

---

## Tables

### `wallets`
Your 4 accounts. Soft-deleted via `is_active`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | "Giro Comdirect", "Cash", etc. |
| `type` | TEXT | checking, savings, cash, investment, p2p |
| `currency` | TEXT | Default 'EUR'. Future multi-currency support. |
| `balance_cents` | INTEGER | Starting/reference balance in cents |
| `color` | TEXT | Hex color for UI |
| `icon` | TEXT | Emoji or icon name |
| `is_active` | INTEGER | 1=active, 0=archived |
| `sort_order` | INTEGER | User-defined display order |
| `created_at` | TEXT | ISO datetime |

**Seed data:** Cash · Giro Comdirect · Trade Republic · Monefit

---

### `categories`
23 categories seeded from real Spendee usage. User can add/edit/archive.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT UNIQUE | "Groceries", "Home", etc. |
| `type` | TEXT | income or expense |
| `priority` | TEXT | need, want, savings, none |
| `color` | TEXT | Hex color |
| `icon` | TEXT | Emoji |
| `is_tax_relevant_default` | INTEGER | 1 = pre-flag new tx in this category |
| `is_active` | INTEGER | Soft delete |
| `sort_order` | INTEGER | Display order |
| `created_at` | TEXT | ISO datetime |

**Seed categories:**

| Name | Type | Priority | Tax? |
|---|---|---|---|
| Home | expense | need | ✅ |
| Utilities | expense | need | ✅ |
| Internet | expense | need | ✅ |
| Phone | expense | need | — |
| Transportation | expense | need | ✅ |
| Groceries | expense | need | — |
| Medical | expense | need | ✅ |
| Bills & Fees | expense | need | — |
| Investment | expense | savings | — |
| Education | expense | need | ✅ |
| Food & Drink | expense | want | — |
| Shopping | expense | want | — |
| Travel | expense | want | ✅ |
| Sport & Hobbies | expense | want | — |
| Entertainment | expense | want | — |
| Clothes | expense | want | ✅ |
| Personal Care | expense | want | — |
| Misc | expense | none | — |
| Savings | expense | savings | — |
| Salary | income | none | — |
| Other Income | income | none | — |
| Gifts Received | income | none | — |
| Refund | income | none | — |

---

### `tags`
Free-form labels applied to transactions. Replaces Spendee's "Labels" system.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT UNIQUE | "💳 Master", "💳 Amex", etc. |
| `color` | TEXT | Hex color |
| `created_at` | TEXT | ISO datetime |

**Seed tags:** 💳 Master · 💳 Amex

---

### `transactions`
The heart of the app. Every income, expense, and transfer.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `date` | TEXT | YYYY-MM-DD |
| `amount_cents` | INTEGER | Always positive. Sign from `type`. |
| `type` | TEXT | income, expense, transfer |
| `wallet_id` | INTEGER FK | References wallets(id) |
| `category_id` | INTEGER FK | NULL for transfers |
| `description` | TEXT | Short label (e.g. "Rewe") |
| `note` | TEXT | Optional longer note |
| `is_tax_relevant` | INTEGER | 1 = include in tax export |
| `transfer_group_id` | TEXT | UUID shared by paired transfer rows |
| `is_recurring` | INTEGER | 1 = created by recurring rule |
| `recurring_rule_id` | INTEGER FK | References recurring_rules(id) |
| `source` | TEXT | manual, csv_import, shortcut |
| `external_id` | TEXT UNIQUE | For future bank API dedup |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

**Key constraints:**
- `category_id` must be NULL when `type = 'transfer'`
- `transfer_group_id` must be set when `type = 'transfer'`
- `amount_cents` must be > 0

---

### `transaction_tags`
Junction table — many transactions to many tags.

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | INTEGER FK | ON DELETE CASCADE |
| `tag_id` | INTEGER FK | ON DELETE CASCADE |
| PK | — | (transaction_id, tag_id) |

---

### `budgets`
Monthly planned amounts per category.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `year` | INTEGER | e.g. 2026 |
| `month` | INTEGER | 1–12 |
| `category_id` | INTEGER FK | References categories(id) |
| `planned_cents` | INTEGER | Must be > 0 |
| `created_at` | TEXT | ISO datetime |
| UNIQUE | — | (year, month, category_id) |

---

### `recurring_rules`
Templates for auto-creating transactions on a schedule.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | "Rent", "Salary", etc. |
| `amount_cents` | INTEGER | Always positive |
| `type` | TEXT | income or expense |
| `wallet_id` | INTEGER FK | References wallets(id) |
| `category_id` | INTEGER FK | References categories(id) |
| `frequency` | TEXT | daily, weekly, monthly, quarterly, yearly |
| `frequency_day` | INTEGER | Day of week (0–6) or day of month (1–31) |
| `start_date` | TEXT | YYYY-MM-DD |
| `end_date` | TEXT | NULL = no end |
| `is_active` | INTEGER | Soft delete |
| `created_at` | TEXT | ISO datetime |

**Seed recurring rules** (shape only — real amounts in gitignored
`data/personal/seed.local.md`):

| Name | Amount | Type | Wallet | Frequency |
|---|---|---|---|---|
| Salary | €X,XXX | income | Comdirect | Monthly, 24th |
| Rent | €X,XXX | expense | Comdirect | Monthly, 1st |
| Strom | €XX | expense | Comdirect | Monthly, 1st |
| Internet | €XX | expense | Comdirect | Monthly |
| Investment | €XX | expense | Trade Republic | Monthly, 2nd |
| Education | €XX | expense | Trade Republic | Monthly, 6th |
| Radio Tax | €XX | expense | Comdirect | Quarterly, 15th |
| Sport | €XX | expense | Comdirect | Weekly, Friday |

---

### `goals`
Short and long term financial goals. User-created.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | "Emergency Fund", "Coast FI", etc. |
| `type` | TEXT | savings, debt_payoff, milestone, fi |
| `target_cents` | INTEGER | Target amount |
| `current_cents` | INTEGER | Current progress |
| `linked_wallet_id` | INTEGER FK | Auto-track from wallet balance |
| `is_auto_tracked` | INTEGER | 1 = pull from linked wallet |
| `target_date` | TEXT | Optional deadline |
| `notes` | TEXT | Free-form notes |
| `color` | TEXT | Hex color |
| `icon` | TEXT | Emoji |
| `is_active` | INTEGER | Soft delete |
| `sort_order` | INTEGER | Display order |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

**Seed goals** (shape only — real targets in gitignored
`data/personal/seed.local.md`):

| Name | Type | Target |
|---|---|---|
| 🆘 Emergency Fund | savings | €X,XXX |
| 👨‍👩‍👦 Family Debt | debt_payoff | €XX,XXX |
| ☁️ Coast FI | milestone | €XXX,XXX |
| 🏝️ Financial Independence | fi | €X,XXX,XXX |
| 💍 Marriage Budget | savings | €XX,XXX |

---

### `net_worth_snapshots`
Manual quarterly snapshots. Mirrors your Google Sheet Net Worth tab.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `snapshot_date` | TEXT | YYYY-MM-DD (typically Jan 1 or Jul 1) |
| `asset_type` | TEXT | cash, savings, stocks, etf, crypto, property, other |
| `label` | TEXT | "Trade Republic ETF", "Assets (Dad)", etc. |
| `amount_cents` | INTEGER | Positive for assets, positive for liabilities too |
| `is_liability` | INTEGER | 0=asset, 1=liability |
| `notes` | TEXT | Optional |
| `created_at` | TEXT | ISO datetime |

---

## Key SQL Patterns

### Current wallet balance
```sql
SELECT
  w.id, w.name,
  w.balance_cents + COALESCE(SUM(
    CASE
      WHEN t.type = 'income'   THEN  t.amount_cents
      WHEN t.type = 'expense'  THEN -t.amount_cents
      WHEN t.type = 'transfer' AND t.amount_cents > 0 THEN t.amount_cents
      ELSE 0
    END
  ), 0) AS current_balance_cents
FROM wallets w
LEFT JOIN transactions t ON t.wallet_id = w.id
WHERE w.id = ? AND w.is_active = 1
GROUP BY w.id;
```

### Monthly budget vs actual
```sql
SELECT
  c.name, c.color, c.icon,
  COALESCE(b.planned_cents, 0)    AS planned_cents,
  COALESCE(SUM(t.amount_cents), 0) AS actual_cents,
  COUNT(t.id)                      AS tx_count
FROM categories c
LEFT JOIN budgets b
  ON b.category_id = c.id
  AND b.year = ? AND b.month = ?
LEFT JOIN transactions t
  ON t.category_id = c.id
  AND strftime('%Y-%m', t.date) = printf('%04d-%02d', ?, ?)
  AND t.type = 'expense'
WHERE c.type = 'expense' AND c.is_active = 1
GROUP BY c.id
ORDER BY actual_cents DESC;
```

### Monthly carry-forward
```sql
SELECT
  SUM(CASE WHEN type='income'  THEN  amount_cents ELSE 0 END) -
  SUM(CASE WHEN type='expense' THEN  amount_cents ELSE 0 END)
  AS carry_forward_cents
FROM transactions
WHERE strftime('%Y-%m', date) = ?
  AND type IN ('income', 'expense');
```

### Tax-relevant transactions for a year
```sql
SELECT
  t.date, t.description, t.amount_cents,
  c.name AS category,
  GROUP_CONCAT(tg.name) AS tags
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
LEFT JOIN transaction_tags tt ON tt.transaction_id = t.id
LEFT JOIN tags tg ON tg.id = tt.tag_id
WHERE t.is_tax_relevant = 1
  AND strftime('%Y', t.date) = ?
GROUP BY t.id
ORDER BY t.date;
```
