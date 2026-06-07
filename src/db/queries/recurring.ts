import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { RecurringFrequency, RecurringRule, RecurringType, SqliteBool } from '@/types';

export interface RichRecurringRule extends RecurringRule {
  wallet_name: string;
  wallet_icon: string;
  category_name: string | null;
  category_icon: string | null;
}

export interface CreateRecurringRuleInput {
  name: string;
  amount_cents: number;
  type: RecurringType;
  wallet_id: number;
  category_id: number | null;
  frequency: RecurringFrequency;
  frequency_day: number | null;
  start_date: string;
  end_date: string | null;
}

export interface UpdateRecurringRuleInput {
  name?: string;
  amount_cents?: number;
  type?: RecurringType;
  wallet_id?: number;
  category_id?: number | null;
  frequency?: RecurringFrequency;
  frequency_day?: number | null;
  start_date?: string;
  end_date?: string | null;
  is_active?: SqliteBool;
}

export async function getRecurringRules(db: SQLiteDatabase): Promise<RichRecurringRule[]> {
  return db.getAllAsync<RichRecurringRule>(`
    SELECT
      r.*,
      w.name  AS wallet_name,
      w.icon  AS wallet_icon,
      c.name  AS category_name,
      c.icon  AS category_icon
    FROM recurring_rules r
    JOIN wallets w ON r.wallet_id = w.id
    LEFT JOIN categories c ON r.category_id = c.id
    ORDER BY r.is_active DESC, r.id ASC
  `);
}

export async function createRecurringRule(
  db: SQLiteDatabase,
  input: CreateRecurringRuleInput,
): Promise<number> {
  const q = sql`
    INSERT INTO recurring_rules
      (name, amount_cents, type, wallet_id, category_id,
       frequency, frequency_day, start_date, end_date)
    VALUES (
      ${input.name},
      ${input.amount_cents},
      ${input.type},
      ${input.wallet_id},
      ${input.category_id},
      ${input.frequency},
      ${input.frequency_day},
      ${input.start_date},
      ${input.end_date}
    )
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function updateRecurringRule(
  db: SQLiteDatabase,
  id: number,
  input: UpdateRecurringRuleInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined)         { setClauses.push('name = ?');          values.push(input.name); }
  if (input.amount_cents !== undefined) { setClauses.push('amount_cents = ?');  values.push(input.amount_cents); }
  if (input.type !== undefined)         { setClauses.push('type = ?');           values.push(input.type); }
  if (input.wallet_id !== undefined)    { setClauses.push('wallet_id = ?');      values.push(input.wallet_id); }
  if ('category_id'   in input)         { setClauses.push('category_id = ?');   values.push(input.category_id   ?? null); }
  if (input.frequency !== undefined)    { setClauses.push('frequency = ?');      values.push(input.frequency); }
  if ('frequency_day' in input)         { setClauses.push('frequency_day = ?'); values.push(input.frequency_day ?? null); }
  if (input.start_date !== undefined)   { setClauses.push('start_date = ?');     values.push(input.start_date); }
  if ('end_date'      in input)         { setClauses.push('end_date = ?');       values.push(input.end_date      ?? null); }
  if (input.is_active !== undefined)    { setClauses.push('is_active = ?');      values.push(input.is_active); }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE recurring_rules SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}
