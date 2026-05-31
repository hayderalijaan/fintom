// Schema versioning via SQLite's built-in PRAGMA user_version.
// No extra table needed — the integer version is stored in the DB file header.
//
// HOW TO ADD A MIGRATION
//   1. Edit / add DDL constants in schema.ts.
//   2. Bump SCHEMA_VERSION in schema.ts.
//   3. Add an `if (from < N)` block in the switch-ladder below.
//      Use the `txn` object for all statements inside the block.
//
// GUARANTEES
//   • The entire upgrade (tables + indexes + user_version bump) runs inside
//     withExclusiveTransactionAsync, so no other query can interleave and
//     expo-sqlite auto-commits on success / auto-rolls-back on any throw.
//   • user_version is only bumped after all DDL succeeds — if anything
//     throws, the DB stays at `from` and the next launch retries cleanly.
//   • A post-migration table check catches silent DDL failures early.

import type { SQLiteDatabase } from 'expo-sqlite';

import { ALL_TABLES, createIndexes, SCHEMA_VERSION } from './schema';

// Names derived from ALL_TABLES for the post-migration verification.
// We parse the table name out of the CREATE TABLE IF NOT EXISTS … statement.
const EXPECTED_TABLES: readonly string[] = ALL_TABLES.map((tpl) => {
  const match = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.exec(tpl.statement);
  if (!match) throw new Error(`Cannot parse table name from DDL: ${tpl.statement.slice(0, 60)}`);
  return match[1];
});

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

/** Verify every expected table exists in sqlite_master. Called after migration. */
async function verifyTables(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
  );
  const present = new Set(rows.map((r) => r.name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new Error(`Migration completed but tables are missing: ${missing.join(', ')}`);
  }
}

/**
 * Run any pending migrations. Safe to call on every app launch.
 * Returns immediately when the schema is already at SCHEMA_VERSION.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const from = await getUserVersion(db);

  if (from >= SCHEMA_VERSION) {
    if (__DEV__) {
      console.log(`[DB] schema is current (v${from})`);
    }
    return;
  }

  if (__DEV__) {
    console.log(`[DB] migrating schema v${from} → v${SCHEMA_VERSION}`);
  }

  // withExclusiveTransactionAsync opens a dedicated connection with
  // BEGIN EXCLUSIVE, auto-commits when the callback resolves, and
  // auto-rolls-back if it throws — no manual BEGIN/COMMIT/ROLLBACK needed.
  await db.withExclusiveTransactionAsync(async (txn) => {
    // ── v0 → v1: first-run — create all tables and indexes ──────────────
    if (from < 1) {
      for (const tpl of ALL_TABLES) {
        await txn.execAsync(tpl.statement);
      }
      for (const tpl of createIndexes) {
        await txn.execAsync(tpl.statement);
      }
    }

    // ── v1 → v2 (example): add a column ─────────────────────────────────
    // if (from < 2) {
    //   await txn.execAsync(addColumnFoo.statement);
    // }

    // Bump the version last — if any statement above threw, this never runs
    // and the transaction rolls back, leaving user_version at `from`.
    // SCHEMA_VERSION is a compile-time integer constant, not user input, so
    // interpolating it here is safe (PRAGMA cannot be parameterized).
    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });

  // Verify outside the transaction so we read the committed state.
  await verifyTables(db);

  if (__DEV__) {
    console.log(`[DB] migration complete — schema now v${SCHEMA_VERSION}`);
  }
}
