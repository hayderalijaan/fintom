// Schema versioning. We track the applied version with SQLite's built-in
// PRAGMA user_version (an integer stored in the DB header — no extra table).
//
// To evolve the schema: bump SCHEMA_VERSION in schema.ts, then add an
// `if (from < N)` block below that performs the N-th migration.

import type { SQLiteDatabase } from 'expo-sqlite';

import { CREATE_INDEXES, CREATE_TABLES, SCHEMA_VERSION } from './schema';

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

/**
 * Apply any pending migrations. Idempotent: safe to call on every launch.
 * The whole upgrade runs in one transaction so a failure rolls back cleanly
 * and the DB is never left half-migrated.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const from = await getUserVersion(db);
  if (from >= SCHEMA_VERSION) {
    return;
  }

  await db.execAsync('BEGIN;');
  try {
    if (from < 1) {
      for (const statement of CREATE_TABLES) {
        await db.execAsync(statement);
      }
      for (const statement of CREATE_INDEXES) {
        await db.execAsync(statement);
      }
    }

    // Future migrations go here, e.g.:
    // if (from < 2) { await db.execAsync('ALTER TABLE ...'); }

    // SCHEMA_VERSION is a trusted integer constant (not user input), so
    // interpolating it into this PRAGMA is safe — PRAGMA can't be parameterized.
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw new Error(
      `Migration from version ${from} to ${SCHEMA_VERSION} failed: ${String(error)}`,
    );
  }
}
