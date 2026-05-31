// Single source of truth for the database structure.
//
// Tables and indexes are plain DDL strings applied by src/db/migrations.ts.
// Bump SCHEMA_VERSION and add a migration step whenever this changes.
//
// GOLDEN RULE: all money is stored as integer cents. Never floats.

export const SCHEMA_VERSION = 1;

/**
 * CREATE TABLE statements, ordered so that foreign-key targets exist first.
 * (SQLite resolves FKs at runtime, but a sensible order keeps this readable.)
 */
export const CREATE_TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS wallets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('checking','savings','cash','investment','p2p')),
    currency      TEXT NOT NULL DEFAULT 'EUR',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    color         TEXT NOT NULL DEFAULT '#4CAF50',
    icon          TEXT NOT NULL DEFAULT 'wallet',
    is_active     INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS categories (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT NOT NULL UNIQUE,
    type                    TEXT NOT NULL CHECK(type IN ('income','expense')),
    priority                TEXT NOT NULL DEFAULT 'need'
                              CHECK(priority IN ('need','want','savings','none')),
    color                   TEXT NOT NULL DEFAULT '#9E9E9E',
    icon                    TEXT NOT NULL DEFAULT '📦',
    is_tax_relevant_default INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT NOT NULL DEFAULT '#9E9E9E',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS recurring_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    amount_cents  INTEGER NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('income','expense')),
    wallet_id     INTEGER NOT NULL REFERENCES wallets(id),
    category_id   INTEGER REFERENCES categories(id),
    frequency     TEXT NOT NULL
                    CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
    frequency_day INTEGER,
    start_date    TEXT NOT NULL,
    end_date      TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS transactions (
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
  );`,

  `CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
  );`,

  `CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    planned_cents INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(year, month, category_id)
  );`,

  `CREATE TABLE IF NOT EXISTS goals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL CHECK(type IN ('savings','debt_payoff','milestone','fi')),
    target_cents     INTEGER NOT NULL,
    current_cents    INTEGER NOT NULL DEFAULT 0,
    linked_wallet_id INTEGER REFERENCES wallets(id),
    is_auto_tracked  INTEGER NOT NULL DEFAULT 0,
    target_date      TEXT,
    notes            TEXT,
    color            TEXT NOT NULL DEFAULT '#4CAF50',
    icon             TEXT NOT NULL DEFAULT '🎯',
    is_active        INTEGER NOT NULL DEFAULT 1,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    asset_type    TEXT NOT NULL,
    label         TEXT NOT NULL,
    amount_cents  INTEGER NOT NULL,
    is_liability  INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
];

/**
 * Indexes for the hot query paths: the timeline (by date), per-wallet balance,
 * budget-vs-actual (by category), and transfer-pair lookups.
 */
export const CREATE_INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_transfer_group ON transactions(transfer_group_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month);`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_rules(is_active);`,
];
