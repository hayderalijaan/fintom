// Schema versioning via SQLite's built-in PRAGMA user_version.
// No extra table needed — the version is stored in the DB file header.
//
// To evolve the schema:
//   1. Add/change DDL in schema.ts.
//   2. Bump SCHEMA_VERSION in schema.ts.
//   3. Add an `if (from < N)` block below that performs the N-th migration.
//
// Each upgrade runs in one transaction — on failure it rolls back completely
// so the DB is never left in a half-migrated state.

import type { SQLiteDatabase } from 'expo-sqlite';

import { ALL_TABLES, createIndexes, SCHEMA_VERSION } from './schema';

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

/**
 * Run any pending migrations. Safe to call on every app launch — returns
 * immediately when the DB is already at SCHEMA_VERSION.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const from = await getUserVersion(db);
  if (from >= SCHEMA_VERSION) {
    return;
  }

  await db.execAsync('BEGIN;');
  try {
    if (from < 1) {
      for (const tpl of ALL_TABLES) {
        await db.execAsync(tpl.statement);
      }
      for (const tpl of createIndexes) {
        await db.execAsync(tpl.statement);
      }
    }

    // Add future migrations here:
    // if (from < 2) { await db.execAsync(alterSomeTable.statement); }

    // SCHEMA_VERSION is a compile-time integer constant, not user input —
    // interpolating it into PRAGMA is safe (PRAGMA can't be parameterized).
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw new Error(
      `DB migration ${from} → ${SCHEMA_VERSION} failed: ${String(error)}`,
    );
  }
}
