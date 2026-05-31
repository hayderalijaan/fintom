import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Budget } from '@/types';

export interface BudgetVsActual {
  category_id: number;
  name: string;
  color: string;
  icon: string;
  planned_cents: number;
  actual_cents: number;
  transaction_count: number;
}

export interface CreateBudgetInput {
  year: number;
  month: number;
  category_id: number;
  planned_cents: number;
}

export async function getBudget(
  db: SQLiteDatabase,
  year: number,
  month: number,
  categoryId: number,
): Promise<Budget | null> {
  const q = sql`
    SELECT * FROM budgets
    WHERE year = ${year} AND month = ${month} AND category_id = ${categoryId}
  `;
  return db.getFirstAsync<Budget>(q.statement, [...q.params]);
}

export async function getBudgetsForMonth(
  db: SQLiteDatabase,
  year: number,
  month: number,
): Promise<Budget[]> {
  const q = sql`
    SELECT * FROM budgets WHERE year = ${year} AND month = ${month}
  `;
  return db.getAllAsync<Budget>(q.statement, [...q.params]);
}

/**
 * Budget vs actual for every active expense category in a given month.
 * Categories with no budget entry appear with planned_cents = 0.
 * Results ordered by actual spend descending.
 */
export async function getBudgetVsActual(
  db: SQLiteDatabase,
  year: number,
  month: number,
): Promise<BudgetVsActual[]> {
  const yearMonthStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const q = sql`
    SELECT
      c.id AS category_id,
      c.name,
      c.color,
      c.icon,
      COALESCE(b.planned_cents, 0) AS planned_cents,
      COALESCE(SUM(t.amount_cents), 0) AS actual_cents,
      COUNT(t.id) AS transaction_count
    FROM categories c
    LEFT JOIN budgets b
      ON b.category_id = c.id AND b.year = ${year} AND b.month = ${month}
    LEFT JOIN transactions t
      ON t.category_id = c.id
      AND strftime('%Y-%m', t.date) = ${yearMonthStr}
      AND t.type = 'expense'
    WHERE c.type = 'expense' AND c.is_active = ${1}
    GROUP BY c.id
    ORDER BY actual_cents DESC
  `;
  return db.getAllAsync<BudgetVsActual>(q.statement, [...q.params]);
}

/**
 * Net carry-forward for a month: total income minus total expenses.
 * Positive = surplus, negative = deficit.
 */
export async function getCarryForward(
  db: SQLiteDatabase,
  year: number,
  month: number,
): Promise<number> {
  const yearMonthStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const q = sql`
    SELECT
      SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) -
      SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)
      AS carry_forward_cents
    FROM transactions
    WHERE strftime('%Y-%m', date) = ${yearMonthStr}
      AND type IN ('income', 'expense')
  `;
  const row = await db.getFirstAsync<{ carry_forward_cents: number | null }>(
    q.statement,
    [...q.params],
  );
  return row?.carry_forward_cents ?? 0;
}

/** Upserts a budget entry (INSERT OR REPLACE). */
export async function upsertBudget(
  db: SQLiteDatabase,
  input: CreateBudgetInput,
): Promise<number> {
  const q = sql`
    INSERT INTO budgets (year, month, category_id, planned_cents)
    VALUES (${input.year}, ${input.month}, ${input.category_id}, ${input.planned_cents})
    ON CONFLICT(year, month, category_id) DO UPDATE SET planned_cents = excluded.planned_cents
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function deleteBudget(
  db: SQLiteDatabase,
  year: number,
  month: number,
  categoryId: number,
): Promise<void> {
  const q = sql`
    DELETE FROM budgets WHERE year = ${year} AND month = ${month} AND category_id = ${categoryId}
  `;
  await db.runAsync(q.statement, [...q.params]);
}
