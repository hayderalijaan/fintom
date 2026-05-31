// Shared TypeScript types — these mirror the DB schema in src/db/schema.ts.
// Fields use snake_case to match SQLite columns 1:1 (queries return raw rows).
//
// GOLDEN RULE: all money is integer cents. Never floats. €12.50 = 1250.

export type WalletType = 'checking' | 'savings' | 'cash' | 'investment' | 'p2p';

export type CategoryType = 'income' | 'expense';
export type CategoryPriority = 'need' | 'want' | 'savings' | 'none';

export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionSource = 'manual' | 'csv_import' | 'shortcut';

export type RecurringType = 'income' | 'expense';
export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export type GoalType = 'savings' | 'debt_payoff' | 'milestone' | 'fi';

/** SQLite has no boolean; columns store 0 | 1. */
export type SqliteBool = 0 | 1;

export interface Wallet {
  id: number;
  name: string;
  type: WalletType;
  currency: string;
  /** Immutable opening balance. Live balance = balance_cents + SUM(transactions). */
  balance_cents: number;
  color: string;
  icon: string;
  is_active: SqliteBool;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  priority: CategoryPriority;
  color: string;
  icon: string;
  is_tax_relevant_default: SqliteBool;
  is_active: SqliteBool;
  sort_order: number;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  date: string;
  /** For income/expense: positive. For transfers: signed (outgoing -, incoming +). */
  amount_cents: number;
  type: TransactionType;
  wallet_id: number;
  category_id: number | null;
  description: string | null;
  note: string | null;
  is_tax_relevant: SqliteBool;
  transfer_group_id: string | null;
  is_recurring: SqliteBool;
  recurring_rule_id: number | null;
  source: TransactionSource;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: number;
  year: number;
  month: number;
  category_id: number;
  planned_cents: number;
  created_at: string;
}

export interface RecurringRule {
  id: number;
  name: string;
  amount_cents: number;
  type: RecurringType;
  wallet_id: number;
  category_id: number | null;
  frequency: RecurringFrequency;
  frequency_day: number | null;
  start_date: string;
  end_date: string | null;
  is_active: SqliteBool;
  created_at: string;
}

export interface Goal {
  id: number;
  name: string;
  type: GoalType;
  target_cents: number;
  current_cents: number;
  linked_wallet_id: number | null;
  is_auto_tracked: SqliteBool;
  target_date: string | null;
  notes: string | null;
  color: string;
  icon: string;
  is_active: SqliteBool;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface NetWorthSnapshot {
  id: number;
  snapshot_date: string;
  asset_type: string;
  label: string;
  amount_cents: number;
  is_liability: SqliteBool;
  notes: string | null;
  created_at: string;
}
