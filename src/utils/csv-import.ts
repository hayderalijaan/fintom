// Spendee CSV import.
//
// Real export column order (positional):
//   Date, Wallet, Type, Category name, Amount, Currency, Note, Labels, Author
//
// Type values: Income | Expense | Incoming Transfer | Outgoing Transfer
// Amount sign: negative for expenses and outgoing transfers in Spendee format.
// Date format: ISO 8601 with timezone — "2026-01-01T10:23:29+00:00".
//
// The whole import runs inside a single withExclusiveTransactionAsync so it
// is all-or-nothing. UNIQUE violations on external_id are caught row-by-row
// and counted as skipped duplicates; they do not abort the transaction.

import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImportSummary {
  imported: number;
  skipped_duplicates: number;
  unmatched_categories: string[];
  unmatched_wallets: string[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type SpendeeType =
  | 'Income'
  | 'Expense'
  | 'Incoming Transfer'
  | 'Outgoing Transfer';

interface SpendeeRow {
  date: string;
  amount: string;
  currency: string;
  note: string;
  categoryName: string;
  type: SpendeeType;
  walletName: string;
  labels: string;
}

interface TransferPair {
  outgoing: SpendeeRow;
  incoming: SpendeeRow;
}

interface UnpairedTransfer {
  row: SpendeeRow;
  side: 'outgoing' | 'incoming';
}

interface InsertInput {
  date: string;
  amount_cents: number;
  type: 'income' | 'expense' | 'transfer';
  wallet_id: number;
  category_id: number | null;
  note: string | null;
  transfer_group_id: string | null;
  external_id: string;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

const EXPECTED_HEADER = 'Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author';

const SPENDEE_TYPES = new Set<string>([
  'Income',
  'Expense',
  'Incoming Transfer',
  'Outgoing Transfer',
]);

/**
 * Maps Spendee category names that differ from Fintom seed names.
 * Aliases are folded into the categoryMap before the import loop runs,
 * so no lookup code needs to change.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  'Transport':         'Transportation',
  'Healthcare':        'Medical',
  'Self care':         'Personal Care',
  'Gifts':             'Gifts Received',
  'Receivables':       'Refund',
  'Strom':             'Utilities',
  'Other':             'Other Income',
  'Interest payout':   'Other Income',
  'Insurance Payout':  'Other Income',
  'Family & Personal': 'Misc',
};

/**
 * Maps Spendee wallet names to Fintom seed wallet names.
 * "Bargeld" is German for cash — the seed wallet is named "Cash".
 */
const WALLET_ALIASES: Record<string, string> = {
  'Bargeld': 'Cash',
};

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // escaped double-quote inside a quoted field
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCSV(text: string): SpendeeRow[] {
  const normalised = text
    .replace(/^﻿/, '')    // strip UTF-8 BOM (common in Spendee exports)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = normalised.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  // Validate header so a wrong file fails loudly instead of silently misaligning.
  const headerFields = parseCSVLine(lines[0]).map((f) => f.trim()).join(',');
  if (headerFields !== EXPECTED_HEADER) {
    throw new Error(
      `CSV header mismatch.\nExpected: ${EXPECTED_HEADER}\nGot:      ${headerFields}`,
    );
  }

  const rows: SpendeeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 8) continue;

    // Real column positions: 0=Date 1=Wallet 2=Type 3=Category 4=Amount 5=Currency 6=Note 7=Labels 8=Author
    const type = fields[2].trim();
    if (!SPENDEE_TYPES.has(type)) continue;

    rows.push({
      date:         fields[0].trim(),
      walletName:   fields[1].trim(),
      type:         type as SpendeeType,
      categoryName: fields[3].trim(),
      amount:       fields[4].trim(),
      currency:     fields[5].trim(),
      note:         fields[6].trim(),
      labels:       fields[7].trim(),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalizeDate(raw: string): string {
  // Handles ISO 8601 "2026-05-31T10:23:29+00:00" and plain "2026-05-31".
  return raw.split('T')[0].split(' ')[0];
}

function toCents(rawAmount: string): number {
  // multiply-then-round avoids float drift (e.g. 3004.78 * 100 = 300477.99…)
  return Math.round(parseFloat(rawAmount) * 100);
}

/**
 * 64-bit deduplication hash (two independent djb2 passes over the same key).
 * Not cryptographic — the only goal is idempotent import detection.
 * With 64 effective bits the collision probability is negligible even for
 * tens of thousands of rows.
 */
function makeExternalId(
  date: string,
  rawAmount: string,
  walletName: string,
  categoryName: string,
): string {
  const key = `${date}|${rawAmount}|${walletName}|${categoryName}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = (((h1 << 5) + h1) ^ c) >>> 0;
    h2 = (((h2 << 5) + h2) ^ c) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Transfer pairing
// ---------------------------------------------------------------------------

/**
 * Pairs Outgoing Transfer rows with Incoming Transfer rows that share the same
 * date and absolute amount (the two legs of a single Spendee transfer).
 *
 * Pairing is greedy within each (date, |cents|) bucket. Leftovers — when only
 * one side appears in the batch (e.g. single-wallet export) — are returned as
 * unpaired and inserted as solo transfer legs.
 */
function pairTransfers(rows: SpendeeRow[]): {
  paired: TransferPair[];
  unpaired: UnpairedTransfer[];
} {
  const buckets = new Map<
    string,
    { outgoing: SpendeeRow[]; incoming: SpendeeRow[] }
  >();

  for (const row of rows) {
    const key = `${normalizeDate(row.date)}|${Math.abs(toCents(row.amount))}`;
    if (!buckets.has(key)) buckets.set(key, { outgoing: [], incoming: [] });
    const b = buckets.get(key)!;
    if (row.type === 'Outgoing Transfer') b.outgoing.push(row);
    else b.incoming.push(row);
  }

  const paired: TransferPair[] = [];
  const unpaired: UnpairedTransfer[] = [];

  for (const b of buckets.values()) {
    while (b.outgoing.length > 0 && b.incoming.length > 0) {
      paired.push({
        outgoing: b.outgoing.shift()!,
        incoming: b.incoming.shift()!,
      });
    }
    for (const row of b.outgoing) unpaired.push({ row, side: 'outgoing' });
    for (const row of b.incoming) unpaired.push({ row, side: 'incoming' });
  }

  return { paired, unpaired };
}

// ---------------------------------------------------------------------------
// Transaction-scoped helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a transaction row via `conn` (either the bare db or a txn object).
 * Returns the new row ID, or null if the external_id already exists (duplicate).
 * All other errors are re-thrown to abort the enclosing transaction.
 */
async function insertRow(
  conn: SQLiteDatabase,
  input: InsertInput,
): Promise<number | null> {
  try {
    const result = await conn.runAsync(
      `INSERT INTO transactions
         (date, amount_cents, type, wallet_id, category_id, note,
          transfer_group_id, source, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'csv_import', ?)`,
      [
        input.date,
        input.amount_cents,
        input.type,
        input.wallet_id,
        input.category_id,
        input.note,
        input.transfer_group_id,
        input.external_id,
      ],
    );
    return result.lastInsertRowId;
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE')) return null;
    throw e;
  }
}

async function getOrCreateTag(
  conn: SQLiteDatabase,
  cache: Map<string, number>,
  name: string,
): Promise<number> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;

  const existing = await conn.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE name = ?',
    [name],
  );
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }

  const result = await conn.runAsync(
    'INSERT INTO tags (name, color) VALUES (?, ?)',
    [name, '#9E9E9E'],
  );
  cache.set(name, result.lastInsertRowId);
  return result.lastInsertRowId;
}

async function attachLabels(
  conn: SQLiteDatabase,
  cache: Map<string, number>,
  transactionId: number,
  labelsStr: string,
): Promise<void> {
  if (!labelsStr) return;
  const names = labelsStr
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const name of names) {
    const tagId = await getOrCreateTag(conn, cache, name);
    await conn.runAsync(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      [transactionId, tagId],
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function importSpendeeCSV(
  db: SQLiteDatabase,
  csvText: string,
  fromDate?: string,
): Promise<ImportSummary> {
  const allRows = parseCSV(csvText);
  // fromDate is YYYY-MM-DD; ISO date strings compare correctly as plain strings.
  const rows = fromDate
    ? allRows.filter(r => normalizeDate(r.date) >= fromDate)
    : allRows;

  const summary: ImportSummary = {
    imported: 0,
    skipped_duplicates: 0,
    unmatched_categories: [],
    unmatched_wallets: [],
  };

  if (rows.length === 0) return summary;

  // Build lookup maps before entering the transaction (read-only queries).
  const [categoryRows, walletRows] = await Promise.all([
    db.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM categories WHERE is_active = 1',
    ),
    db.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM wallets WHERE is_active = 1',
    ),
  ]);

  const categoryMap = new Map(categoryRows.map((r) => [r.name, r.id]));
  const walletMap   = new Map(walletRows.map((r) => [r.name, r.id]));

  // Fold aliases into the maps so all downstream get() calls resolve them
  // transparently — no changes needed at the three lookup sites.
  for (const [alias, canonical] of Object.entries(CATEGORY_ALIASES)) {
    const id = categoryMap.get(canonical);
    if (id !== undefined) categoryMap.set(alias, id);
  }
  for (const [alias, canonical] of Object.entries(WALLET_ALIASES)) {
    const id = walletMap.get(canonical);
    if (id !== undefined) walletMap.set(alias, id);
  }

  const unmatchedCategories = new Set<string>();
  const unmatchedWallets    = new Set<string>();

  const normalRows = rows.filter(
    (r) => r.type === 'Income' || r.type === 'Expense',
  );
  const { paired, unpaired } = pairTransfers(
    rows.filter(
      (r) => r.type === 'Incoming Transfer' || r.type === 'Outgoing Transfer',
    ),
  );

  // Populated inside the transaction; passed into helpers to avoid repeated
  // SELECT queries for tags created earlier in the same batch.
  const tagCache = new Map<string, number>();

  await db.withExclusiveTransactionAsync(async (txn) => {
    // ── Income / Expense ────────────────────────────────────────────────────
    for (const row of normalRows) {
      const date     = normalizeDate(row.date);
      const walletId = walletMap.get(row.walletName);

      if (walletId === undefined) {
        unmatchedWallets.add(row.walletName);
        continue;
      }

      const categoryId =
        row.categoryName !== ''
          ? (categoryMap.get(row.categoryName) ?? null)
          : null;

      // Report unmatched category but still import the row (null category).
      if (categoryId === null && row.categoryName !== '') {
        unmatchedCategories.add(row.categoryName);
      }

      const id = await insertRow(txn, {
        date,
        amount_cents: Math.abs(toCents(row.amount)),
        type:         row.type === 'Income' ? 'income' : 'expense',
        wallet_id:    walletId,
        category_id:  categoryId,
        note:         row.note || null,
        transfer_group_id: null,
        external_id:  makeExternalId(date, row.amount, row.walletName, row.categoryName),
      });

      if (id === null) { summary.skipped_duplicates++; continue; }
      summary.imported++;
      await attachLabels(txn, tagCache, id, row.labels);
    }

    // ── Paired transfers ────────────────────────────────────────────────────
    for (const { outgoing, incoming } of paired) {
      const outDate = normalizeDate(outgoing.date);
      const inDate  = normalizeDate(incoming.date);

      const fromWalletId = walletMap.get(outgoing.walletName);
      const toWalletId   = walletMap.get(incoming.walletName);

      if (fromWalletId === undefined) unmatchedWallets.add(outgoing.walletName);
      if (toWalletId   === undefined) unmatchedWallets.add(incoming.walletName);
      if (fromWalletId === undefined || toWalletId === undefined) continue;

      const absCents = Math.abs(toCents(outgoing.amount));
      const groupId  = crypto.randomUUID();

      const outId = await insertRow(txn, {
        date:              outDate,
        amount_cents:      -absCents,
        type:              'transfer',
        wallet_id:         fromWalletId,
        category_id:       null,
        note:              outgoing.note || null,
        transfer_group_id: groupId,
        external_id:       makeExternalId(outDate, outgoing.amount, outgoing.walletName, outgoing.categoryName),
      });

      const inId = await insertRow(txn, {
        date:              inDate,
        amount_cents:      absCents,
        type:              'transfer',
        wallet_id:         toWalletId,
        category_id:       null,
        note:              incoming.note || null,
        transfer_group_id: groupId,
        external_id:       makeExternalId(inDate, incoming.amount, incoming.walletName, incoming.categoryName),
      });

      if (outId === null) {
        summary.skipped_duplicates++;
      } else {
        summary.imported++;
        await attachLabels(txn, tagCache, outId, outgoing.labels);
      }

      if (inId === null) {
        summary.skipped_duplicates++;
      } else {
        summary.imported++;
        await attachLabels(txn, tagCache, inId, incoming.labels);
      }
    }

    // ── Unpaired transfer legs ──────────────────────────────────────────────
    // Inserted as solo rows with their own transfer_group_id. This happens
    // when only one wallet's export is in the batch (e.g. importing Comdirect
    // alone: the outgoing leg is present but Trade Republic's incoming leg
    // is not). A later import of Trade Republic will insert the incoming leg
    // with a different group_id — the pair won't be linked in the DB, but
    // balance calculations remain correct because amounts are signed.
    for (const { row, side } of unpaired) {
      const date     = normalizeDate(row.date);
      const walletId = walletMap.get(row.walletName);

      if (walletId === undefined) {
        unmatchedWallets.add(row.walletName);
        continue;
      }

      const absCents    = Math.abs(toCents(row.amount));
      const amountCents = side === 'outgoing' ? -absCents : absCents;

      const id = await insertRow(txn, {
        date,
        amount_cents:      amountCents,
        type:              'transfer',
        wallet_id:         walletId,
        category_id:       null,
        note:              row.note || null,
        transfer_group_id: crypto.randomUUID(),
        external_id:       makeExternalId(date, row.amount, row.walletName, row.categoryName),
      });

      if (id === null) { summary.skipped_duplicates++; continue; }
      summary.imported++;
      await attachLabels(txn, tagCache, id, row.labels);
    }
  });

  summary.unmatched_categories = [...unmatchedCategories];
  summary.unmatched_wallets    = [...unmatchedWallets];

  return summary;
}
