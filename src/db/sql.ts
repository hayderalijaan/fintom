// Tagged template literal helper for expo-sqlite.
//
// Usage for parameterized queries (DML):
//   const q = sql`SELECT * FROM wallets WHERE id = ${id} AND is_active = ${1}`;
//   await db.getAllAsync(q.statement, q.params);
//
// Usage for DDL (no interpolated values — just clean multiline formatting):
//   await db.execAsync(createWallets.statement);
//
// WHY: expo-sqlite v16 doesn't ship a sql tag. This gives us a single,
// consistent way to write all SQL in the codebase and prevents accidental
// string interpolation of raw user input (values always go into params).

import type { SQLiteBindValue } from 'expo-sqlite';

export type SQLTemplate = {
  readonly statement: string;
  readonly params: readonly SQLiteBindValue[];
};

/**
 * Tagged template literal that produces a parameterized SQL statement.
 * Interpolated values become `?` placeholders; raw strings are inlined as-is.
 *
 * NEVER inline user-controlled strings into the template — pass them as
 * interpolated values so they land in `params` (bound, not concatenated).
 */
export function sql(
  strings: TemplateStringsArray,
  ...values: SQLiteBindValue[]
): SQLTemplate {
  let statement = strings[0];
  for (let i = 0; i < values.length; i++) {
    statement += '?' + strings[i + 1];
  }
  return { statement, params: values };
}
