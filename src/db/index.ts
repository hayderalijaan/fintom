// Database entry point.
//
// Call initializeDatabase() once at app startup (DatabaseContext does this).
// Every subsequent module that needs the connection gets it from useDatabase().

import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrations';
import { seedDatabase } from './seed';

export const DATABASE_NAME = 'fintom.db';

/**
 * Open (or create) the on-device SQLite DB, apply pending migrations, and
 * seed reference data on first install. Returns the ready-to-use connection.
 *
 * Pragmas set on every open:
 *   WAL       — better concurrent read/write throughput.
 *   foreign_keys — SQLite disables FK enforcement by default; we need it for
 *                  ON DELETE CASCADE on transaction_tags and FK integrity checks.
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await runMigrations(db);
  await seedDatabase(db);

  return db;
}

// Re-export the sql tag so query files have one import path.
export { sql, type SQLTemplate } from './sql';
export { runMigrations } from './migrations';
export { seedDatabase } from './seed';
export { SCHEMA_VERSION } from './schema';
