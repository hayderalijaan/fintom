import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Tag } from '@/types';

export interface TagWithCount extends Tag {
  transaction_count: number;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export async function getTags(db: SQLiteDatabase): Promise<Tag[]> {
  const q = sql`SELECT * FROM tags ORDER BY name ASC`;
  return db.getAllAsync<Tag>(q.statement, [...q.params]);
}

export async function getTagsWithCount(db: SQLiteDatabase): Promise<TagWithCount[]> {
  return db.getAllAsync<TagWithCount>(`
    SELECT
      t.*,
      COUNT(tt.transaction_id) AS transaction_count
    FROM tags t
    LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
    GROUP BY t.id
    ORDER BY t.name ASC
  `);
}

export async function createTagIfAbsent(
  db: SQLiteDatabase,
  name: string,
  color = '#9E9E9E',
): Promise<number> {
  await db.runAsync(
    'INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)',
    [name, color],
  );
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE name = ?',
    [name],
  );
  if (!row) throw new Error(`[DB] tag not found after insert: "${name}"`);
  return row.id;
}

export async function createTag(
  db: SQLiteDatabase,
  name: string,
  color: string,
): Promise<number> {
  const q = sql`INSERT INTO tags (name, color) VALUES (${name}, ${color})`;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function updateTag(
  db: SQLiteDatabase,
  id: number,
  input: UpdateTagInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (input.name  !== undefined) { setClauses.push('name = ?');  values.push(input.name); }
  if (input.color !== undefined) { setClauses.push('color = ?'); values.push(input.color); }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE tags SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}

export async function deleteTag(db: SQLiteDatabase, id: number): Promise<void> {
  const q = sql`DELETE FROM tags WHERE id = ${id}`;
  await db.runAsync(q.statement, [...q.params]);
}
