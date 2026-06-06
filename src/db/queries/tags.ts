import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Tag } from '@/types';

export async function getTags(db: SQLiteDatabase): Promise<Tag[]> {
  const q = sql`SELECT * FROM tags ORDER BY name ASC`;
  return db.getAllAsync<Tag>(q.statement, [...q.params]);
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
