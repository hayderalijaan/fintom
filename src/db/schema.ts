// Single source of truth for the database structure.
//
// Every DDL statement is written with the sql tag so all SQL in the project
// uses a consistent format. Bump SCHEMA_VERSION and add a migration block in
// migrations.ts whenever you change a table or index here.
//
// GOLDEN RULE: money is stored as integer cents. Never floats. €12.50 = 1250.

import { sql, type SQLTemplate } from './sql';

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Tables — ordered so FK targets exist before the tables that reference them.
// ---------------------------------------------------------------------------

export const createWalletsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS wallets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    type          TEXT    NOT NULL CHECK(type IN ('checking','savings','cash','investment','p2p')),
    currency      TEXT    NOT NULL DEFAULT 'EUR',
    balance_cents INTEGER NOT NULL DEFAULT 0,
    color         TEXT    NOT NULL DEFAULT '#4CAF50',
    icon          TEXT    NOT NULL DEFAULT 'wallet',
    is_active     INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

export const createCategoriesTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS categories (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT    NOT NULL UNIQUE,
    type                    TEXT    NOT NULL CHECK(type IN ('income','expense')),
    priority                TEXT    NOT NULL DEFAULT 'need'
                              CHECK(priority IN ('need','want','savings','none')),
    color                   TEXT    NOT NULL DEFAULT '#9E9E9E',
    icon                    TEXT    NOT NULL DEFAULT '📦',
    is_tax_relevant_default INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

export const createTagsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    color      TEXT    NOT NULL DEFAULT '#9E9E9E',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

// recurring_rules references wallets + categories, so those tables come first.
export const createRecurringRulesTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS recurring_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    amount_cents  INTEGER NOT NULL,
    type          TEXT    NOT NULL CHECK(type IN ('income','expense')),
    wallet_id     INTEGER NOT NULL REFERENCES wallets(id),
    category_id   INTEGER REFERENCES categories(id),
    frequency     TEXT    NOT NULL
                    CHECK(frequency IN ('daily','weekly','monthly','quarterly','yearly')),
    frequency_day INTEGER,
    start_date    TEXT    NOT NULL,
    end_date      TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

// transactions references wallets, categories, recurring_rules.
export const createTransactionsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS transactions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT    NOT NULL,
    amount_cents      INTEGER NOT NULL,
    type              TEXT    NOT NULL CHECK(type IN ('income','expense','transfer')),
    wallet_id         INTEGER NOT NULL REFERENCES wallets(id),
    category_id       INTEGER REFERENCES categories(id),
    description       TEXT,
    note              TEXT,
    is_tax_relevant   INTEGER NOT NULL DEFAULT 0,
    transfer_group_id TEXT,
    is_recurring      INTEGER NOT NULL DEFAULT 0,
    recurring_rule_id INTEGER REFERENCES recurring_rules(id),
    source            TEXT    NOT NULL DEFAULT 'manual'
                        CHECK(source IN ('manual','csv_import','shortcut')),
    external_id       TEXT UNIQUE,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

export const createTransactionTagsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id         INTEGER NOT NULL REFERENCES tags(id)         ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
  )
`;

export const createBudgetsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    planned_cents INTEGER NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(year, month, category_id)
  )
`;

export const createGoalsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS goals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    type             TEXT    NOT NULL CHECK(type IN ('savings','debt_payoff','milestone','fi')),
    target_cents     INTEGER NOT NULL,
    current_cents    INTEGER NOT NULL DEFAULT 0,
    linked_wallet_id INTEGER REFERENCES wallets(id),
    is_auto_tracked  INTEGER NOT NULL DEFAULT 0,
    target_date      TEXT,
    notes            TEXT,
    color            TEXT    NOT NULL DEFAULT '#4CAF50',
    icon             TEXT    NOT NULL DEFAULT '🎯',
    is_active        INTEGER NOT NULL DEFAULT 1,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

export const createNetWorthSnapshotsTable: SQLTemplate = sql`
  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT    NOT NULL,
    asset_type    TEXT    NOT NULL,
    label         TEXT    NOT NULL,
    amount_cents  INTEGER NOT NULL,
    is_liability  INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

/** All table definitions in FK-safe creation order. */
export const ALL_TABLES: readonly SQLTemplate[] = [
  createWalletsTable,
  createCategoriesTable,
  createTagsTable,
  createRecurringRulesTable,
  createTransactionsTable,
  createTransactionTagsTable,
  createBudgetsTable,
  createGoalsTable,
  createNetWorthSnapshotsTable,
];

// ---------------------------------------------------------------------------
// Indexes — covering the hot query paths.
// ---------------------------------------------------------------------------

export const createIndexes: readonly SQLTemplate[] = [
  // Timeline screen — ordered by date descending.
  sql`CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date)`,
  // Per-wallet balance calculation.
  sql`CREATE INDEX IF NOT EXISTS idx_transactions_wallet   ON transactions(wallet_id)`,
  // Budget vs actual — join on category.
  sql`CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)`,
  // Transfer-pair lookups.
  sql`CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_group_id)`,
  // Tag filter on the junction table.
  sql`CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag  ON transaction_tags(tag_id)`,
  // Budget period queries.
  sql`CREATE INDEX IF NOT EXISTS idx_budgets_period        ON budgets(year, month)`,
  // Recurring rule scheduler.
  sql`CREATE INDEX IF NOT EXISTS idx_recurring_active      ON recurring_rules(is_active)`,
];
