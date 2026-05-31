// Database entry point: open the connection, set pragmas, migrate, seed.
// Call initializeDatabase() once at app startup (see DatabaseContext).

import * as SQLite from 'expo-sqlite';

import { runMigrations } from './migrations';
import { seedDatabase } from './seed';

export const DATABASE_NAME = 'fintom.db';

/**
 * Open (or create) the on-device SQLite database, bring its schema up to date,
 * and seed reference data on first run. Returns the ready-to-use connection.
 *
 * WAL mode gives us better read/write concurrency; foreign_keys must be enabled
 * per-connection (SQLite defaults it off) for our ON DELETE CASCADE / FK checks.
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await runMigrations(db);
  await seedDatabase(db);

  return db;
}

export { runMigrations } from './migrations';
export { seedDatabase } from './seed';
export { SCHEMA_VERSION } from './schema';
