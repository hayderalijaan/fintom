import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Goal, GoalType, SqliteBool } from '@/types';

export interface CreateGoalInput {
  name: string;
  type: GoalType;
  target_cents: number;
  current_cents?: number;
  linked_wallet_id?: number | null;
  is_auto_tracked?: SqliteBool;
  target_date?: string | null;
  notes?: string | null;
  color: string;
  icon: string;
  sort_order?: number;
}

export interface UpdateGoalInput {
  name?: string;
  type?: GoalType;
  target_cents?: number;
  current_cents?: number;
  linked_wallet_id?: number | null;
  is_auto_tracked?: SqliteBool;
  target_date?: string | null;
  notes?: string | null;
  color?: string;
  icon?: string;
  is_active?: SqliteBool;
  sort_order?: number;
}

export async function getGoals(db: SQLiteDatabase): Promise<Goal[]> {
  const q = sql`SELECT * FROM goals WHERE is_active = ${1} ORDER BY sort_order ASC`;
  return db.getAllAsync<Goal>(q.statement, [...q.params]);
}

export async function getGoalById(
  db: SQLiteDatabase,
  id: number,
): Promise<Goal | null> {
  const q = sql`SELECT * FROM goals WHERE id = ${id}`;
  return db.getFirstAsync<Goal>(q.statement, [...q.params]);
}

export async function createGoal(
  db: SQLiteDatabase,
  input: CreateGoalInput,
): Promise<number> {
  const q = sql`
    INSERT INTO goals (
      name, type, target_cents, current_cents,
      linked_wallet_id, is_auto_tracked, target_date,
      notes, color, icon, sort_order
    ) VALUES (
      ${input.name},
      ${input.type},
      ${input.target_cents},
      ${input.current_cents ?? 0},
      ${input.linked_wallet_id ?? null},
      ${input.is_auto_tracked ?? 0},
      ${input.target_date ?? null},
      ${input.notes ?? null},
      ${input.color},
      ${input.icon},
      ${input.sort_order ?? 0}
    )
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function updateGoal(
  db: SQLiteDatabase,
  id: number,
  input: UpdateGoalInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined) { setClauses.push('name = ?'); values.push(input.name); }
  if (input.type !== undefined) { setClauses.push('type = ?'); values.push(input.type); }
  if (input.target_cents !== undefined) { setClauses.push('target_cents = ?'); values.push(input.target_cents); }
  if (input.current_cents !== undefined) { setClauses.push('current_cents = ?'); values.push(input.current_cents); }
  if ('linked_wallet_id' in input) { setClauses.push('linked_wallet_id = ?'); values.push(input.linked_wallet_id ?? null); }
  if (input.is_auto_tracked !== undefined) { setClauses.push('is_auto_tracked = ?'); values.push(input.is_auto_tracked); }
  if ('target_date' in input) { setClauses.push('target_date = ?'); values.push(input.target_date ?? null); }
  if ('notes' in input) { setClauses.push('notes = ?'); values.push(input.notes ?? null); }
  if (input.color !== undefined) { setClauses.push('color = ?'); values.push(input.color); }
  if (input.icon !== undefined) { setClauses.push('icon = ?'); values.push(input.icon); }
  if (input.is_active !== undefined) { setClauses.push('is_active = ?'); values.push(input.is_active); }
  if (input.sort_order !== undefined) { setClauses.push('sort_order = ?'); values.push(input.sort_order); }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  values.push(id);
  await db.runAsync(
    `UPDATE goals SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}

/** Adds amount_cents to the goal's current_cents (negative to subtract). */
export async function adjustGoalProgress(
  db: SQLiteDatabase,
  id: number,
  deltaCents: number,
): Promise<void> {
  const q = sql`
    UPDATE goals
    SET current_cents = current_cents + ${deltaCents}, updated_at = datetime('now')
    WHERE id = ${id}
  `;
  await db.runAsync(q.statement, [...q.params]);
}

/** Soft-delete: sets is_active = 0. */
export async function deleteGoal(db: SQLiteDatabase, id: number): Promise<void> {
  const q = sql`UPDATE goals SET is_active = ${0} WHERE id = ${id}`;
  await db.runAsync(q.statement, [...q.params]);
}
