import type { SQLiteDatabase } from 'expo-sqlite';

import { sql } from '@/db/sql';
import type { Wallet, WalletType, SqliteBool } from '@/types';

export interface WalletWithBalance extends Wallet {
  current_balance_cents: number;
}

export interface CreateWalletInput {
  name: string;
  type: WalletType;
  currency?: string;
  balance_cents: number;
  color: string;
  icon: string;
  sort_order?: number;
}

export interface UpdateWalletInput {
  name?: string;
  type?: WalletType;
  currency?: string;
  color?: string;
  icon?: string;
  is_active?: SqliteBool;
  sort_order?: number;
}

export async function getWallets(db: SQLiteDatabase): Promise<Wallet[]> {
  const q = sql`SELECT * FROM wallets WHERE is_active = ${1} ORDER BY sort_order ASC`;
  return db.getAllAsync<Wallet>(q.statement, [...q.params]);
}

export async function getWalletById(
  db: SQLiteDatabase,
  id: number,
): Promise<Wallet | null> {
  const q = sql`SELECT * FROM wallets WHERE id = ${id}`;
  return db.getFirstAsync<Wallet>(q.statement, [...q.params]);
}

/** Live balance = opening balance_cents + SUM of all transactions. */
export async function getWalletWithBalance(
  db: SQLiteDatabase,
  id: number,
): Promise<WalletWithBalance | null> {
  const q = sql`
    SELECT
      w.id,
      w.name,
      w.type,
      w.currency,
      w.balance_cents,
      w.color,
      w.icon,
      w.is_active,
      w.sort_order,
      w.created_at,
      w.balance_cents + COALESCE(SUM(
        CASE
          WHEN t.type = 'income'   THEN  t.amount_cents
          WHEN t.type = 'expense'  THEN -t.amount_cents
          WHEN t.type = 'transfer' THEN t.amount_cents
          ELSE 0
        END
      ), 0) AS current_balance_cents
    FROM wallets w
    LEFT JOIN transactions t ON t.wallet_id = w.id
    WHERE w.id = ${id}
    GROUP BY w.id
  `;
  return db.getFirstAsync<WalletWithBalance>(q.statement, [...q.params]);
}

export async function getAllWalletsWithBalances(
  db: SQLiteDatabase,
): Promise<WalletWithBalance[]> {
  const q = sql`
    SELECT
      w.id,
      w.name,
      w.type,
      w.currency,
      w.balance_cents,
      w.color,
      w.icon,
      w.is_active,
      w.sort_order,
      w.created_at,
      w.balance_cents + COALESCE(SUM(
        CASE
          WHEN t.type = 'income'   THEN  t.amount_cents
          WHEN t.type = 'expense'  THEN -t.amount_cents
          WHEN t.type = 'transfer' THEN t.amount_cents
          ELSE 0
        END
      ), 0) AS current_balance_cents
    FROM wallets w
    LEFT JOIN transactions t ON t.wallet_id = w.id
    WHERE w.is_active = ${1}
    GROUP BY w.id
    ORDER BY w.sort_order ASC
  `;
  return db.getAllAsync<WalletWithBalance>(q.statement, [...q.params]);
}

export async function createWallet(
  db: SQLiteDatabase,
  input: CreateWalletInput,
): Promise<number> {
  const q = sql`
    INSERT INTO wallets (name, type, currency, balance_cents, color, icon, sort_order)
    VALUES (
      ${input.name},
      ${input.type},
      ${input.currency ?? 'EUR'},
      ${input.balance_cents},
      ${input.color},
      ${input.icon},
      ${input.sort_order ?? 0}
    )
  `;
  const result = await db.runAsync(q.statement, [...q.params]);
  return result.lastInsertRowId;
}

export async function updateWallet(
  db: SQLiteDatabase,
  id: number,
  input: UpdateWalletInput,
): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) { setClauses.push('name = ?'); values.push(input.name); }
  if (input.type !== undefined) { setClauses.push('type = ?'); values.push(input.type); }
  if (input.currency !== undefined) { setClauses.push('currency = ?'); values.push(input.currency); }
  if (input.color !== undefined) { setClauses.push('color = ?'); values.push(input.color); }
  if (input.icon !== undefined) { setClauses.push('icon = ?'); values.push(input.icon); }
  if (input.is_active !== undefined) { setClauses.push('is_active = ?'); values.push(input.is_active); }
  if (input.sort_order !== undefined) { setClauses.push('sort_order = ?'); values.push(input.sort_order); }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE wallets SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );
}

/** Soft-delete: sets is_active = 0. */
export async function deleteWallet(db: SQLiteDatabase, id: number): Promise<void> {
  const q = sql`UPDATE wallets SET is_active = ${0} WHERE id = ${id}`;
  await db.runAsync(q.statement, [...q.params]);
}
