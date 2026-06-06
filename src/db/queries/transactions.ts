import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Transaction, TransactionType, TransactionSource, SqliteBool } from '@/types';

export interface CreateTransactionInput {
  date: string;
  amount_cents: number;
  type: TransactionType;
  wallet_id: number;
  category_id?: number | null;
  description?: string | null;
  note?: string | null;
  is_tax_relevant?: SqliteBool;
  transfer_group_id?: string | null;
  is_recurring?: SqliteBool;
  recurring_rule_id?: number | null;
  source?: TransactionSource;
  external_id?: string | null;
}

export interface UpdateTransactionInput {
  date?: string;
  amount_cents?: number;
  type?: TransactionType;
  wallet_id?: number;
  category_id?: number | null;
  description?: string | null;
  note?: string | null;
  is_tax_relevant?: SqliteBool;
  is_recurring?: SqliteBool;
  recurring_rule_id?: number | null;
}

export interface TransactionFilters {
  wallet_id?: number;
  category_id?: number;
  type?: TransactionType;
  year_month?: string; // 'YYYY-MM'
  is_tax_relevant?: SqliteBool;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getTransactions(
  db: SQLiteDatabase,
  filters: TransactionFilters = {},
): Promise<Transaction[]> {
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters.wallet_id !== undefined) {
    conditions.push('t.wallet_id = ?');
    values.push(filters.wallet_id);
  }
  if (filters.category_id !== undefined) {
    conditions.push('t.category_id = ?');
    values.push(filters.category_id);
  }
  if (filters.type !== undefined) {
    conditions.push('t.type = ?');
    values.push(filters.type);
  }
  if (filters.year_month !== undefined) {
    conditions.push("strftime('%Y-%m', t.date) = ?");
    values.push(filters.year_month);
  }
  if (filters.is_tax_relevant !== undefined) {
    conditions.push('t.is_tax_relevant = ?');
    values.push(filters.is_tax_relevant);
  }
  if (filters.search !== undefined && filters.search.trim() !== '') {
    conditions.push('(t.description LIKE ? OR t.note LIKE ?)');
    const term = `%${filters.search.trim()}%`;
    values.push(term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit !== undefined ? `LIMIT ${filters.limit}` : '';
  const offset = filters.offset !== undefined ? `OFFSET ${filters.offset}` : '';

  return db.getAllAsync<Transaction>(
    `SELECT t.* FROM transactions t ${where} ORDER BY t.date DESC, t.id DESC ${limit} ${offset}`,
    values,
  );
}

export async function getTransactionById(
  db: SQLiteDatabase,
  id: number,
): Promise<Transaction | null> {
  const q = sql`SELECT * FROM transactions WHERE id = ${id}`;
  return db.getFirstAsync<Transaction>(q.statement, [...q.params]);
}

export async function getTransactionsByTransferGroup(
  db: SQLiteDatabase,
  transferGroupId: string,
): Promise<Transaction[]> {
  const q = sql`SELECT * FROM transactions WHERE transfer_group_id = ${transferGroupId}`;
  return db.getAllAsync<Transaction>(q.statement, [...q.params]);
}

export async function createTransaction(
  db: SQLiteDatabase,
  input: CreateTransactionInput,
): Promise<number> {
  const q = sql`
    INSERT INTO transactions (
      date, amount_cents, type, wallet_id, category_id,
      description, note, is_tax_relevant, transfer_group_id,
      is_recurring, recurring_rule_id, source, external_id
    ) VALUES (
      ${input.date},
      ${input.amount_cents},
      ${input.type},
      ${input.wallet_id},
      ${input.category_id ?? null},
      ${input.description ?? null},
      ${input.note ?? null},
      ${input.is_tax_relevant ?? 0},
      ${input.transfer_group_id ?? null},
      ${input.is_recurring ?? 0},
      ${input.recurring_rule_id ?? null},
      ${input.source ?? 'manual'},
      ${input.external_id ?? null}
    )
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

/**
 * Creates a paired transfer atomically: one outgoing (negative) + one incoming
 * (positive) row, linked by a shared UUID transfer_group_id.
 *
 * The signed convention is load-bearing for the wallet balance query:
 *   outgoing (source)      → amount_cents < 0 → subtracts from source balance
 *   incoming (destination) → amount_cents > 0 → adds to destination balance
 */
export async function createTransfer(
  db: SQLiteDatabase,
  input: {
    date: string;
    amount_cents: number; // positive magnitude
    from_wallet_id: number;
    to_wallet_id: number;
    description?: string | null;
    note?: string | null;
  },
): Promise<{ outgoingId: number; incomingId: number; transferGroupId: string }> {
  const transferGroupId = crypto.randomUUID();
  let outgoingId!: number;
  let incomingId!: number;

  await db.withTransactionAsync(async () => {
    outgoingId = await createTransaction(db, {
      date: input.date,
      amount_cents: -Math.abs(input.amount_cents),
      type: 'transfer',
      wallet_id: input.from_wallet_id,
      description: input.description ?? null,
      note: input.note ?? null,
      transfer_group_id: transferGroupId,
    });

    incomingId = await createTransaction(db, {
      date: input.date,
      amount_cents: Math.abs(input.amount_cents),
      type: 'transfer',
      wallet_id: input.to_wallet_id,
      description: input.description ?? null,
      note: input.note ?? null,
      transfer_group_id: transferGroupId,
    });
  });

  return { outgoingId, incomingId, transferGroupId };
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: number,
  input: UpdateTransactionInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.date !== undefined) { setClauses.push('date = ?'); values.push(input.date); }
  if (input.amount_cents !== undefined) { setClauses.push('amount_cents = ?'); values.push(input.amount_cents); }
  if (input.type !== undefined) { setClauses.push('type = ?'); values.push(input.type); }
  if (input.wallet_id !== undefined) { setClauses.push('wallet_id = ?'); values.push(input.wallet_id); }
  if ('category_id' in input) { setClauses.push('category_id = ?'); values.push(input.category_id ?? null); }
  if ('description' in input) { setClauses.push('description = ?'); values.push(input.description ?? null); }
  if ('note' in input) { setClauses.push('note = ?'); values.push(input.note ?? null); }
  if (input.is_tax_relevant !== undefined) { setClauses.push('is_tax_relevant = ?'); values.push(input.is_tax_relevant); }
  if (input.is_recurring !== undefined) { setClauses.push('is_recurring = ?'); values.push(input.is_recurring); }
  if ('recurring_rule_id' in input) { setClauses.push('recurring_rule_id = ?'); values.push(input.recurring_rule_id ?? null); }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  values.push(id);
  await db.runAsync(
    `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}

export async function deleteTransaction(db: SQLiteDatabase, id: number): Promise<void> {
  const q = sql`DELETE FROM transactions WHERE id = ${id}`;
  await db.runAsync(q.statement, [...q.params]);
}

/** Deletes both legs of a transfer by transfer_group_id. */
export async function deleteTransfer(
  db: SQLiteDatabase,
  transferGroupId: string,
): Promise<void> {
  const q = sql`DELETE FROM transactions WHERE transfer_group_id = ${transferGroupId}`;
  await db.runAsync(q.statement, [...q.params]);
}

export async function addTagToTransaction(
  db: SQLiteDatabase,
  transactionId: number,
  tagId: number,
): Promise<void> {
  const q = sql`
    INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
    VALUES (${transactionId}, ${tagId})
  `;
  await db.runAsync(q.statement, [...q.params]);
}

export async function removeTagFromTransaction(
  db: SQLiteDatabase,
  transactionId: number,
  tagId: number,
): Promise<void> {
  const q = sql`
    DELETE FROM transaction_tags WHERE transaction_id = ${transactionId} AND tag_id = ${tagId}
  `;
  await db.runAsync(q.statement, [...q.params]);
}

// ─── Enriched feed row ────────────────────────────────────────────────────────

/**
 * Like Transaction but with category + wallet names/icons joined in, and tags
 * as a pipe-separated "name::color" string (e.g. "Master::#1A1F71|Amex::#2E77BC").
 * Null when there are no tags.
 */
export interface TransactionFeedRow {
  id: number;
  date: string;
  amount_cents: number;
  type: TransactionType;
  wallet_id: number;
  category_id: number | null;
  description: string | null;
  note: string | null;
  is_tax_relevant: SqliteBool;
  transfer_group_id: string | null;
  is_recurring: SqliteBool;
  recurring_rule_id: number | null;
  source: TransactionSource;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  wallet_name: string;
  tags_raw: string | null;
}

/**
 * Like getTransactions but JOINs categories, wallets, and tags so the UI can
 * render everything from a single query. Tags come back as a pipe-separated
 * string; use parseFeedTags() to split them.
 */
export async function getTransactionFeed(
  db: SQLiteDatabase,
  filters: TransactionFilters = {},
): Promise<TransactionFeedRow[]> {
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters.wallet_id !== undefined) {
    conditions.push('t.wallet_id = ?');
    values.push(filters.wallet_id);
  }
  if (filters.category_id !== undefined) {
    conditions.push('t.category_id = ?');
    values.push(filters.category_id);
  }
  if (filters.type !== undefined) {
    conditions.push('t.type = ?');
    values.push(filters.type);
  }
  if (filters.year_month !== undefined) {
    conditions.push("strftime('%Y-%m', t.date) = ?");
    values.push(filters.year_month);
  }
  if (filters.is_tax_relevant !== undefined) {
    conditions.push('t.is_tax_relevant = ?');
    values.push(filters.is_tax_relevant);
  }
  if (filters.search !== undefined && filters.search.trim() !== '') {
    conditions.push('(t.description LIKE ? OR t.note LIKE ?)');
    const term = `%${filters.search.trim()}%`;
    values.push(term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = filters.limit !== undefined ? `LIMIT ${filters.limit}` : '';
  const offsetClause = filters.offset !== undefined ? `OFFSET ${filters.offset}` : '';

  return db.getAllAsync<TransactionFeedRow>(
    `SELECT
       t.id, t.date, t.amount_cents, t.type, t.wallet_id, t.category_id,
       t.description, t.note, t.is_tax_relevant, t.transfer_group_id,
       t.is_recurring, t.recurring_rule_id, t.source, t.external_id,
       t.created_at, t.updated_at,
       c.name  AS category_name,
       c.icon  AS category_icon,
       c.color AS category_color,
       w.name  AS wallet_name,
       GROUP_CONCAT(tg.name || '::' || tg.color, '|') AS tags_raw
     FROM transactions t
     LEFT JOIN categories c  ON c.id  = t.category_id
     JOIN  wallets      w  ON w.id  = t.wallet_id
     LEFT JOIN transaction_tags tt ON tt.transaction_id = t.id
     LEFT JOIN tags             tg ON tg.id = tt.tag_id
     ${where}
     GROUP BY t.id
     ORDER BY t.date DESC, t.id DESC ${limitClause} ${offsetClause}`,
    values,
  );
}

/** Splits the tags_raw string from TransactionFeedRow into typed tag objects. */
export function parseFeedTags(raw: string | null): Array<{ name: string; color: string }> {
  if (!raw) return [];
  return raw.split('|').map((t) => {
    const idx = t.indexOf('::');
    return idx === -1
      ? { name: t, color: '#9E9E9E' }
      : { name: t.slice(0, idx), color: t.slice(idx + 2) };
  });
}
