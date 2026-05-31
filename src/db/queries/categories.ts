import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Category, CategoryType, CategoryPriority, SqliteBool } from '@/types';

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  priority?: CategoryPriority;
  color: string;
  icon: string;
  is_tax_relevant_default?: SqliteBool;
  sort_order?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  type?: CategoryType;
  priority?: CategoryPriority;
  color?: string;
  icon?: string;
  is_tax_relevant_default?: SqliteBool;
  is_active?: SqliteBool;
  sort_order?: number;
}

export async function getCategories(
  db: SQLiteDatabase,
  type?: CategoryType,
): Promise<Category[]> {
  if (type !== undefined) {
    const q = sql`
      SELECT * FROM categories
      WHERE is_active = ${1} AND type = ${type}
      ORDER BY sort_order ASC
    `;
    return db.getAllAsync<Category>(q.statement, [...q.params]);
  }
  const q = sql`SELECT * FROM categories WHERE is_active = ${1} ORDER BY sort_order ASC`;
  return db.getAllAsync<Category>(q.statement, [...q.params]);
}

export async function getCategoryById(
  db: SQLiteDatabase,
  id: number,
): Promise<Category | null> {
  const q = sql`SELECT * FROM categories WHERE id = ${id}`;
  return db.getFirstAsync<Category>(q.statement, [...q.params]);
}

export async function createCategory(
  db: SQLiteDatabase,
  input: CreateCategoryInput,
): Promise<number> {
  const q = sql`
    INSERT INTO categories (name, type, priority, color, icon, is_tax_relevant_default, sort_order)
    VALUES (
      ${input.name},
      ${input.type},
      ${input.priority ?? 'none'},
      ${input.color},
      ${input.icon},
      ${input.is_tax_relevant_default ?? 0},
      ${input.sort_order ?? 0}
    )
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  input: UpdateCategoryInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) { setClauses.push('name = ?'); values.push(input.name); }
  if (input.type !== undefined) { setClauses.push('type = ?'); values.push(input.type); }
  if (input.priority !== undefined) { setClauses.push('priority = ?'); values.push(input.priority); }
  if (input.color !== undefined) { setClauses.push('color = ?'); values.push(input.color); }
  if (input.icon !== undefined) { setClauses.push('icon = ?'); values.push(input.icon); }
  if (input.is_tax_relevant_default !== undefined) { setClauses.push('is_tax_relevant_default = ?'); values.push(input.is_tax_relevant_default); }
  if (input.is_active !== undefined) { setClauses.push('is_active = ?'); values.push(input.is_active); }
  if (input.sort_order !== undefined) { setClauses.push('sort_order = ?'); values.push(input.sort_order); }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}

/** Soft-delete: sets is_active = 0. */
export async function deleteCategory(db: SQLiteDatabase, id: number): Promise<void> {
  const q = sql`UPDATE categories SET is_active = ${0} WHERE id = ${id}`;
  await db.runAsync(q.statement, [...q.params]);
}

export async function reorderCategories(
  db: SQLiteDatabase,
  orderedIds: number[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const q = sql`UPDATE categories SET sort_order = ${i} WHERE id = ${orderedIds[i]}`;
      await db.runAsync(q.statement, [...q.params]);
    }
  });
}
