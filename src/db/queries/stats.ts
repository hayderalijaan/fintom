import type { SQLiteDatabase } from 'expo-sqlite';

export interface MonthTransferTotals {
  /** Magnitude of all outgoing transfers (always positive). */
  outgoing_cents: number;
  /** Sum of all incoming transfers (always positive). */
  incoming_cents: number;
}

export async function getMonthTransferTotals(
  db: SQLiteDatabase,
  year: number,
  month: number,
): Promise<MonthTransferTotals> {
  const ym = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const row = await db.getFirstAsync<{ outgoing: number | null; incoming: number | null }>(
    `SELECT
       SUM(CASE WHEN amount_cents < 0 THEN ABS(amount_cents) ELSE 0 END) AS outgoing,
       SUM(CASE WHEN amount_cents > 0 THEN amount_cents           ELSE 0 END) AS incoming
     FROM transactions
     WHERE type = 'transfer' AND strftime('%Y-%m', date) = ?`,
    [ym],
  );
  return {
    outgoing_cents: row?.outgoing ?? 0,
    incoming_cents: row?.incoming ?? 0,
  };
}

export interface MonthlyFlow {
  month: string; // 'YYYY-MM'
  income_cents: number;
  expense_cents: number;
}

/**
 * Returns income + expense totals for each of the last `numMonths` calendar
 * months (oldest first). Months with no transactions are returned as zeros so
 * the caller always gets exactly `numMonths` entries.
 */
export async function getMonthlyFlow(
  db: SQLiteDatabase,
  numMonths = 6,
): Promise<MonthlyFlow[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1), 1);
  const startStr =
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

  const rows = await db.getAllAsync<{
    month: string;
    income_cents: number;
    expense_cents: number;
  }>(
    `SELECT
       strftime('%Y-%m', date)                                     AS month,
       SUM(CASE WHEN type = 'income'  THEN amount_cents ELSE 0 END) AS income_cents,
       SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS expense_cents
     FROM transactions
     WHERE date >= ? AND type IN ('income', 'expense')
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [startStr],
  );

  // Fill every expected month slot; SQL omits months with no data.
  const result: MonthlyFlow[] = [];
  for (let i = 0; i < numMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push(rows.find((r) => r.month === month) ?? { month, income_cents: 0, expense_cents: 0 });
  }
  return result;
}
