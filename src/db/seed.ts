// Reference data seeded once on first install.
//
// PRIVACY NOTE: amount_cents on recurring rules and target_cents on goals are
// 0 here because this file is committed to a public repo. Real values live in
// the gitignored data/personal/seed.local.md and are set by the user in-app.
//
// FIRST-RUN GUARD: isEmpty() checks the wallets table — if any wallet exists,
// all tables were already seeded and we return immediately.
//
// TRANSACTION: the whole seed runs inside withExclusiveTransactionAsync, so a
// failure at any point rolls back completely; the next launch retries cleanly.

import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  CategoryPriority,
  CategoryType,
  GoalType,
  RecurringFrequency,
  RecurringType,
  WalletType,
} from '@/types';

// ---------------------------------------------------------------------------
// Seed shape types
// ---------------------------------------------------------------------------

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

interface SeedRecurringRule {
  name: string;
  amount_cents: number;
  type: RecurringType;
  /** Resolved to wallet_id after wallets are inserted. */
  walletName: string;
  /** Resolved to category_id after categories are inserted. */
  categoryName: string;
  frequency: RecurringFrequency;
  /**
   * monthly / quarterly → day of month (1–31)
   * weekly             → ISO weekday (1 = Mon … 5 = Fri … 7 = Sun)
   * daily / yearly     → null
   */
  frequency_day: number | null;
  start_date: string;
  end_date: string | null;
}

interface SeedGoal {
  name: string;
  type: GoalType;
  target_cents: number;
  color: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// 4 wallets (opening balance_cents = 0; user sets real balance in-app)
// ---------------------------------------------------------------------------

const SEED_WALLETS: readonly SeedWallet[] = [
  { name: 'Cash',           type: 'cash',      color: '#66BB6A', icon: '💵' },
  { name: 'Giro Comdirect', type: 'checking',  color: '#1565C0', icon: '🏦' },
  { name: 'Trade Republic', type: 'savings',   color: '#212121', icon: '📈' },
  { name: 'Monefit',        type: 'p2p',       color: '#7E57C2', icon: '🔄' },
];

// ---------------------------------------------------------------------------
// 23 categories
// ---------------------------------------------------------------------------

const SEED_CATEGORIES: readonly SeedCategory[] = [
  // Expenses — need (10)
  { name: 'Home',            type: 'expense', priority: 'need',    color: '#FF7043', icon: '🏠' },
  { name: 'Utilities',       type: 'expense', priority: 'need',    color: '#FFCA28', icon: '⚡' },
  { name: 'Internet',        type: 'expense', priority: 'need',    color: '#29B6F6', icon: '🌐' },
  { name: 'Phone',           type: 'expense', priority: 'need',    color: '#26C6DA', icon: '📱' },
  { name: 'Transportation',  type: 'expense', priority: 'need',    color: '#5C6BC0', icon: '🚌' },
  { name: 'Groceries',       type: 'expense', priority: 'need',    color: '#66BB6A', icon: '🛒' },
  { name: 'Medical',         type: 'expense', priority: 'need',    color: '#EF5350', icon: '💊' },
  { name: 'Bills & Fees',    type: 'expense', priority: 'need',    color: '#8D6E63', icon: '🧾' },
  { name: 'Investment',      type: 'expense', priority: 'need',    color: '#FFB300', icon: '💰' },
  { name: 'Education',       type: 'expense', priority: 'need',    color: '#7E57C2', icon: '📚' },
  // Expenses — want (8)
  { name: 'Food & Drink',    type: 'expense', priority: 'want',    color: '#FF8A65', icon: '🍽️' },
  { name: 'Shopping',        type: 'expense', priority: 'want',    color: '#EC407A', icon: '🛍️' },
  { name: 'Travel',          type: 'expense', priority: 'want',    color: '#42A5F5', icon: '✈️' },
  { name: 'Sport & Hobbies', type: 'expense', priority: 'want',    color: '#9CCC65', icon: '⚽' },
  { name: 'Entertainment',   type: 'expense', priority: 'want',    color: '#AB47BC', icon: '🎭' },
  { name: 'Clothes',         type: 'expense', priority: 'want',    color: '#F06292', icon: '👗' },
  { name: 'Personal Care',   type: 'expense', priority: 'want',    color: '#BA68C8', icon: '💈' },
  { name: 'Misc',            type: 'expense', priority: 'want',    color: '#78909C', icon: '🔧' },
  // Expenses — savings (1)
  { name: 'Savings',         type: 'expense', priority: 'savings', color: '#26A69A', icon: '💾' },
  // Income (4)
  { name: 'Salary',          type: 'income',  priority: 'none',    color: '#43A047', icon: '💼' },
  { name: 'Other Income',    type: 'income',  priority: 'none',    color: '#9CCC65', icon: '📊' },
  { name: 'Gifts Received',  type: 'income',  priority: 'none',    color: '#FFA726', icon: '🎁' },
  { name: 'Refund',          type: 'income',  priority: 'none',    color: '#4DB6AC', icon: '🔁' },
];

// ---------------------------------------------------------------------------
// 2 tags
// ---------------------------------------------------------------------------

const SEED_TAGS: readonly SeedTag[] = [
  { name: 'Master', color: '#1A1F71' },
  { name: 'Amex',   color: '#2E77BC' },
];

// ---------------------------------------------------------------------------
// 8 recurring rules
//
// amount_cents = 0 — real amounts are in gitignored data/personal/seed.local.md.
// All rules start 2023-01-01 to cover the historical CSV import window.
// frequency_day for weekly uses ISO weekday: 1=Mon … 5=Fri … 7=Sun.
// ---------------------------------------------------------------------------

const SEED_RECURRING_RULES: readonly SeedRecurringRule[] = [
  {
    name: 'Salary',
    amount_cents: 0, type: 'income',
    walletName: 'Giro Comdirect', categoryName: 'Salary',
    frequency: 'monthly', frequency_day: 24,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Rent',
    amount_cents: 0, type: 'expense',
    walletName: 'Giro Comdirect', categoryName: 'Home',
    frequency: 'monthly', frequency_day: 1,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Strom',
    amount_cents: 0, type: 'expense',
    walletName: 'Giro Comdirect', categoryName: 'Utilities',
    frequency: 'monthly', frequency_day: 1,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Internet',
    amount_cents: 0, type: 'expense',
    walletName: 'Giro Comdirect', categoryName: 'Bills & Fees',
    frequency: 'monthly', frequency_day: null,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Investment',
    amount_cents: 0, type: 'expense',
    walletName: 'Trade Republic', categoryName: 'Investment',
    frequency: 'monthly', frequency_day: 2,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Education',
    amount_cents: 0, type: 'expense',
    walletName: 'Trade Republic', categoryName: 'Education',
    frequency: 'monthly', frequency_day: 6,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Radio Tax',
    amount_cents: 0, type: 'expense',
    walletName: 'Giro Comdirect', categoryName: 'Bills & Fees',
    frequency: 'quarterly', frequency_day: 15,
    start_date: '2023-01-01', end_date: null,
  },
  {
    name: 'Sport',
    amount_cents: 0, type: 'expense',
    walletName: 'Giro Comdirect', categoryName: 'Sport & Hobbies',
    frequency: 'weekly', frequency_day: 5,
    start_date: '2023-01-01', end_date: '2026-06-30',
  },
];

// ---------------------------------------------------------------------------
// 5 goals
//
// target_cents = 0 — real targets are in gitignored data/personal/seed.local.md.
// current_cents starts at 0 for everyone.
// linked_wallet_id = null — user links wallets in-app.
// ---------------------------------------------------------------------------

const SEED_GOALS: readonly SeedGoal[] = [
  { name: 'Emergency Fund',         type: 'savings',     target_cents: 0, color: '#EF5350', icon: '🆘'  },
  { name: 'Family Debt',            type: 'debt_payoff', target_cents: 0, color: '#FF7043', icon: '👨‍👩‍👦' },
  { name: 'Coast FI',               type: 'milestone',   target_cents: 0, color: '#42A5F5', icon: '☁️'  },
  { name: 'Financial Independence', type: 'fi',          target_cents: 0, color: '#FFB300', icon: '🏝️' },
  { name: 'Marriage Budget',        type: 'savings',     target_cents: 0, color: '#EC407A', icon: '💍'  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isEmpty(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM wallets;');
  return (row?.n ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed all reference data on a fresh database.
 *
 * Does nothing if wallets already exist (first-run guard).
 * The entire seed is atomic — a failure at any step rolls back completely
 * and the next launch retries from scratch.
 */
export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  if (!(await isEmpty(db))) {
    if (__DEV__) {
      console.log('[DB] seed: already seeded, skipping');
    }
    return;
  }

  if (__DEV__) {
    console.log('[DB] seed: seeding reference data…');
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    // ── 1. Wallets ────────────────────────────────────────────────────────
    let sort = 0;
    for (const w of SEED_WALLETS) {
      await txn.runAsync(
        'INSERT INTO wallets (name, type, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        [w.name, w.type, w.color, w.icon, sort++],
      );
    }

    // Read back IDs so recurring_rules can reference them by wallet name.
    const walletRows = await txn.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM wallets',
    );
    const walletId: Record<string, number> = Object.fromEntries(
      walletRows.map((r) => [r.name, r.id]),
    );

    // ── 2. Categories ─────────────────────────────────────────────────────
    sort = 0;
    for (const c of SEED_CATEGORIES) {
      await txn.runAsync(
        'INSERT INTO categories (name, type, priority, color, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [c.name, c.type, c.priority, c.color, c.icon, sort++],
      );
    }

    const categoryRows = await txn.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM categories',
    );
    const categoryId: Record<string, number> = Object.fromEntries(
      categoryRows.map((r) => [r.name, r.id]),
    );

    // ── 3. Tags ───────────────────────────────────────────────────────────
    for (const t of SEED_TAGS) {
      await txn.runAsync(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        [t.name, t.color],
      );
    }

    // ── 4. Recurring rules ────────────────────────────────────────────────
    for (const r of SEED_RECURRING_RULES) {
      const wId = walletId[r.walletName];
      const cId = categoryId[r.categoryName];
      if (wId === undefined) {
        throw new Error(`[DB] seed: wallet not found: "${r.walletName}"`);
      }
      if (cId === undefined) {
        throw new Error(`[DB] seed: category not found: "${r.categoryName}"`);
      }
      await txn.runAsync(
        `INSERT INTO recurring_rules
           (name, amount_cents, type, wallet_id, category_id,
            frequency, frequency_day, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.name, r.amount_cents, r.type, wId, cId,
         r.frequency, r.frequency_day, r.start_date, r.end_date],
      );
    }

    // ── 5. Goals ──────────────────────────────────────────────────────────
    sort = 0;
    for (const g of SEED_GOALS) {
      await txn.runAsync(
        `INSERT INTO goals
           (name, type, target_cents, current_cents, color, icon, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [g.name, g.type, g.target_cents, 0, g.color, g.icon, sort++],
      );
    }
  });

  if (__DEV__) {
    console.log('[DB] seed: done — 4 wallets, 23 categories, 2 tags, 8 recurring rules, 5 goals');
  }
}
