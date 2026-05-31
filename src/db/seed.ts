// Initial reference data. This runs once, on a fresh database.
//
// IMPORTANT — privacy: only NON-sensitive structural data is seeded here
// (wallet names, the 23 categories, tags). Recurring-rule amounts and goal
// targets are personal finances and are intentionally NOT hardcoded — they
// are entered by the user or loaded at dev time from the gitignored
// data/personal/seed.local.md. Keep it that way; this file is committed.
//
// All inserts are parameterized. Wallets seed with a zero opening balance
// (balance_cents) — the user sets their real opening balance in-app.

import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CategoryPriority,
  CategoryType,
  WalletType,
} from '@/types';

interface SeedWallet {
  name: string;
  type: WalletType;
  color: string;
  icon: string;
}

interface SeedCategory {
  name: string;
  type: CategoryType;
  priority: CategoryPriority;
  color: string;
  icon: string;
}

interface SeedTag {
  name: string;
  color: string;
}

const SEED_WALLETS: readonly SeedWallet[] = [
  { name: 'Cash', type: 'cash', color: '#66BB6A', icon: '💵' },
  { name: 'Giro Comdirect', type: 'checking', color: '#1565C0', icon: '🏦' },
  { name: 'Trade Republic', type: 'savings', color: '#212121', icon: '📈' },
  { name: 'Monefit', type: 'p2p', color: '#7E57C2', icon: '🔄' },
];

const SEED_CATEGORIES: readonly SeedCategory[] = [
  // Expenses — need
  { name: 'Home', type: 'expense', priority: 'need', color: '#FF7043', icon: '🏠' },
  { name: 'Utilities', type: 'expense', priority: 'need', color: '#FFCA28', icon: '⚡' },
  { name: 'Internet', type: 'expense', priority: 'need', color: '#29B6F6', icon: '🌐' },
  { name: 'Phone', type: 'expense', priority: 'need', color: '#26C6DA', icon: '📱' },
  { name: 'Transportation', type: 'expense', priority: 'need', color: '#5C6BC0', icon: '🚌' },
  { name: 'Groceries', type: 'expense', priority: 'need', color: '#66BB6A', icon: '🛒' },
  { name: 'Medical', type: 'expense', priority: 'need', color: '#EF5350', icon: '💊' },
  { name: 'Bills & Fees', type: 'expense', priority: 'need', color: '#8D6E63', icon: '🧾' },
  { name: 'Investment', type: 'expense', priority: 'need', color: '#FFB300', icon: '💰' },
  { name: 'Education', type: 'expense', priority: 'need', color: '#7E57C2', icon: '📚' },
  // Expenses — want
  { name: 'Food & Drink', type: 'expense', priority: 'want', color: '#FF8A65', icon: '🍽️' },
  { name: 'Shopping', type: 'expense', priority: 'want', color: '#EC407A', icon: '🛍️' },
  { name: 'Travel', type: 'expense', priority: 'want', color: '#42A5F5', icon: '✈️' },
  { name: 'Sport & Hobbies', type: 'expense', priority: 'want', color: '#9CCC65', icon: '⚽' },
  { name: 'Entertainment', type: 'expense', priority: 'want', color: '#AB47BC', icon: '🎭' },
  { name: 'Clothes', type: 'expense', priority: 'want', color: '#F06292', icon: '👗' },
  { name: 'Personal Care', type: 'expense', priority: 'want', color: '#BA68C8', icon: '💈' },
  { name: 'Misc', type: 'expense', priority: 'want', color: '#78909C', icon: '🔧' },
  // Expenses — savings
  { name: 'Savings', type: 'expense', priority: 'savings', color: '#26A69A', icon: '💾' },
  // Income
  { name: 'Salary', type: 'income', priority: 'none', color: '#43A047', icon: '💼' },
  { name: 'Other Income', type: 'income', priority: 'none', color: '#9CCC65', icon: '📊' },
  { name: 'Gifts Received', type: 'income', priority: 'none', color: '#FFA726', icon: '🎁' },
  { name: 'Refund', type: 'income', priority: 'none', color: '#4DB6AC', icon: '🔁' },
];

const SEED_TAGS: readonly SeedTag[] = [
  { name: 'Master', color: '#1A1F71' },
  { name: 'Amex', color: '#2E77BC' },
];

/** True when the DB has never been seeded (no wallets yet). */
async function isEmpty(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM wallets;');
  return (row?.n ?? 0) === 0;
}

/**
 * Seed reference data on a fresh database. Idempotent — does nothing if the
 * DB already has wallets. Runs in one transaction so a partial seed can't
 * leave the DB half-populated.
 */
export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  if (!(await isEmpty(db))) {
    return;
  }

  await db.execAsync('BEGIN;');
  try {
    let sort = 0;
    for (const w of SEED_WALLETS) {
      await db.runAsync(
        'INSERT INTO wallets (name, type, color, icon, sort_order) VALUES (?, ?, ?, ?, ?);',
        w.name,
        w.type,
        w.color,
        w.icon,
        sort++,
      );
    }

    sort = 0;
    for (const c of SEED_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO categories (name, type, priority, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?);',
        c.name,
        c.type,
        c.priority,
        c.color,
        c.icon,
        sort++,
      );
    }

    for (const t of SEED_TAGS) {
      await db.runAsync('INSERT INTO tags (name, color) VALUES (?, ?);', t.name, t.color);
    }

    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw new Error(`Seeding the database failed: ${String(error)}`);
  }
}
