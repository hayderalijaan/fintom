import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useBudgets, type BudgetVsActual } from '@/hooks/useBudgets';
import { useMonthTransferTotals } from '@/hooks/useMonthTransferTotals';
import { useWallets } from '@/hooks/useWallets';
import { formatEur } from '@/utils/currency';

// ─── Colours ─────────────────────────────────────────────────────────────────

const INCOME_COLOR  = '#2DC98E';
const EXPENSE_COLOR = '#FF6B6B';
const OVER_COLOR    = '#FF3B30';
const UNDER_COLOR   = '#2DC98E';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function nowYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric',
  });
}

// ─── Donut maths ─────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArc(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startDeg: number, sweepDeg: number,
  gapDeg: number,
): string {
  const half = gapDeg / 2;
  const s = startDeg + half;
  const e = startDeg + sweepDeg - half;
  if (e - s < 0.5) return '';           // segment too thin to render
  const large = (e - s) > 180 ? 1 : 0;
  const o1 = polar(cx, cy, outerR, s);
  const o2 = polar(cx, cy, outerR, e);
  const i1 = polar(cx, cy, innerR, s);
  const i2 = polar(cx, cy, innerR, e);
  return (
    `M${o1.x},${o1.y}` +
    `A${outerR},${outerR},0,${large},1,${o2.x},${o2.y}` +
    `L${i2.x},${i2.y}` +
    `A${innerR},${innerR},0,${large},0,${i1.x},${i1.y}Z`
  );
}

// ─── Skeleton pulse ───────────────────────────────────────────────────────────

function SkeletonPulse({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ backgroundColor: '#E0E0E0', borderRadius: 8 }, style, { opacity }]}
    />
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

interface DonutSlice { color: string; cents: number; }

const D_SIZE = 200;
const D_CX   = D_SIZE / 2;
const D_CY   = D_SIZE / 2;
const D_OUTER = 84;
const D_INNER = 54;
const D_GAP   = 2.5;          // degrees between segments

function DonutChart({
  slices,
  totalCents,
}: {
  slices: DonutSlice[];
  totalCents: number;
}) {
  const nonEmpty = slices.filter(s => s.cents > 0);

  if (totalCents === 0 || nonEmpty.length === 0) {
    return (
      <View style={donutStyles.wrap}>
        <Svg width={D_SIZE} height={D_SIZE}>
          <Path
            d={donutArc(D_CX, D_CY, D_OUTER, D_INNER, 0, 359.99, 0)}
            fill="#EFEFEF"
          />
        </Svg>
        <View style={donutStyles.centerLabel} pointerEvents="none">
          <Text style={donutStyles.centerSub}>No spending</Text>
          <Text style={donutStyles.centerSub}>this month</Text>
        </View>
      </View>
    );
  }

  // Single segment edge-case: cap sweep to avoid degenerate full circle.
  const gap = nonEmpty.length === 1 ? 0 : D_GAP;
  let cursor = 0;

  return (
    <View style={donutStyles.wrap}>
      <Svg width={D_SIZE} height={D_SIZE}>
        {nonEmpty.map((s, i) => {
          const sweep = Math.min((s.cents / totalCents) * 360, 359.99);
          const path = donutArc(D_CX, D_CY, D_OUTER, D_INNER, cursor, sweep, gap);
          cursor += sweep;
          return path ? <Path key={i} d={path} fill={s.color} /> : null;
        })}
      </Svg>
      <View style={donutStyles.centerLabel} pointerEvents="none">
        <Text style={donutStyles.centerSub}>SPENT</Text>
        <Text style={donutStyles.centerAmount}>{formatEur(totalCents)}</Text>
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerSub: { fontSize: 10, fontWeight: '600', color: '#AEAEB2', letterSpacing: 0.5 },
  centerAmount: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', marginTop: 2 },
});

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  label,
  amount,
  positive,
  active,
  onPress,
}: {
  label: string;
  amount: number;
  positive?: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const color = positive === undefined
    ? Colors.light.text
    : positive ? INCOME_COLOR : EXPENSE_COLOR;

  return (
    <TouchableOpacity
      style={[tileStyles.tile, active && tileStyles.tileActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={tileStyles.label}>{label}</Text>
      <Text style={[tileStyles.amount, { color }]}>{formatEur(amount)}</Text>
    </TouchableOpacity>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  tileActive: { borderColor: Colors.light.tint },
  label: { fontSize: 11, fontWeight: '600', color: '#AEAEB2', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 },
  amount: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ actual, planned }: { actual: number; planned: number }) {
  if (planned === 0) {
    // No budget set — show flat gray indicator proportional to max spend
    return (
      <View style={pbStyles.track}>
        <View style={[pbStyles.fill, { width: '100%', backgroundColor: '#C7C7CC' }]} />
      </View>
    );
  }
  const pct = Math.min(actual / planned, 1);
  const over = actual > planned;
  return (
    <View style={pbStyles.track}>
      <View
        style={[
          pbStyles.fill,
          { width: `${pct * 100}%`, backgroundColor: over ? OVER_COLOR : UNDER_COLOR },
        ]}
      />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: { height: 4, backgroundColor: '#F2F2F7', borderRadius: 2, overflow: 'hidden', marginTop: 5 },
  fill:  { height: 4, borderRadius: 2 },
});

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({ row }: { row: BudgetVsActual }) {
  const hasSpend   = row.actual_cents > 0;
  const over       = row.planned_cents > 0 && row.actual_cents > row.planned_cents;
  const dimmed     = !hasSpend;

  return (
    <View style={[catStyles.row, dimmed && catStyles.rowDimmed]}>
      {/* Icon */}
      <View style={[catStyles.iconBox, { backgroundColor: `${row.color}22` }]}>
        <Text style={catStyles.icon}>{row.icon}</Text>
      </View>

      {/* Body */}
      <View style={catStyles.body}>
        <View style={catStyles.topLine}>
          <Text style={catStyles.name} numberOfLines={1}>{row.name}</Text>
          <View style={catStyles.rightCol}>
            <Text style={[catStyles.actual, over && catStyles.actualOver]}>
              {formatEur(row.actual_cents)}
            </Text>
          </View>
        </View>

        <View style={catStyles.bottomLine}>
          <Text style={catStyles.txCount}>
            {row.transaction_count > 0
              ? `${row.transaction_count} transaction${row.transaction_count === 1 ? '' : 's'}`
              : 'No transactions'}
          </Text>
          {row.planned_cents > 0 && (
            <Text style={catStyles.planned}>{formatEur(row.planned_cents)}</Text>
          )}
        </View>

        <ProgressBar actual={row.actual_cents} planned={row.planned_cents} />
      </View>
    </View>
  );
}

const catStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rowDimmed: { opacity: 0.45 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
    marginTop: 2,
  },
  icon: { fontSize: 19, lineHeight: 24 },
  body: { flex: 1, minWidth: 0 },
  topLine: { flexDirection: 'row', alignItems: 'baseline' },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  rightCol: { marginLeft: 8 },
  actual: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  actualOver: { color: OVER_COLOR },
  bottomLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  txCount: { flex: 1, fontSize: 12, color: '#AEAEB2' },
  planned: { fontSize: 12, color: '#AEAEB2' },
});

// ─── Month nav ────────────────────────────────────────────────────────────────

function MonthNav({
  year, month,
  onPrev, onNext, disableNext,
}: {
  year: number; month: number;
  onPrev: () => void; onNext: () => void; disableNext: boolean;
}) {
  return (
    <View style={navStyles.row}>
      <TouchableOpacity onPress={onPrev} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={navStyles.arrow}>‹</Text>
      </TouchableOpacity>
      <Text style={navStyles.label}>{monthLabel(year, month)}</Text>
      <TouchableOpacity onPress={onNext} disabled={disableNext} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={[navStyles.arrow, disableNext && navStyles.arrowOff]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const navStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  arrow: { fontSize: 24, color: Colors.light.tint, lineHeight: 28, paddingHorizontal: 2 },
  arrowOff: { color: '#C7C7CC' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E', paddingHorizontal: 10 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, value, valueColor }: { title: string; value?: string; valueColor?: string }) {
  return (
    <View style={shStyles.row}>
      <Text style={shStyles.title}>{title}</Text>
      {value !== undefined && (
        <Text style={[shStyles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      )}
    </View>
  );
}

const shStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F2F2F7' },
  title: { flex: 1, fontSize: 12, fontWeight: '700', color: '#6C6C70', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 12, fontWeight: '600', color: '#6C6C70' },
});

// ─── Transfer row ─────────────────────────────────────────────────────────────

function TransferRow({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <View style={trStyles.row}>
      <Text style={trStyles.label}>{label}</Text>
      <Text style={[trStyles.amount, { color }]}>{formatEur(amount)}</Text>
    </View>
  );
}

const trStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  label: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  amount: { fontSize: 15, fontWeight: '600' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

type ActiveTile = 'wealth' | 'cashflow';

export default function BudgetsScreen() {
  const now = nowYM();
  const [year, setYear]  = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [activeTile, setActiveTile] = useState<ActiveTile>('cashflow');
  const [refreshing, setRefreshing] = useState(false);

  const { budgetRows, carryForward, loading, error, refetch } = useBudgets(year, month);
  const { wallets } = useWallets();
  const { totals, refetch: refetchTransfers } = useMonthTransferTotals(year, month);
  const tabBarHeight = useBottomTabBarHeight();

  const totalWealth  = useMemo(() => wallets.reduce((s, w) => s + w.current_balance_cents, 0), [wallets]);
  const totalExpense = useMemo(() => budgetRows.reduce((s, r) => s + r.actual_cents, 0), [budgetRows]);

  const donutSlices: DonutSlice[] = useMemo(
    () => budgetRows.map(r => ({ color: r.color, cents: r.actual_cents })),
    [budgetRows],
  );

  const atCurrentMonth = year === now.year && month === now.month;

  // Refetch on focus (e.g. after adding a transaction in Timeline).
  const hasMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasMounted.current) { hasMounted.current = true; return; }
      refetch();
      refetchTransfers();
    }, [refetch, refetchTransfers]),
  );

  function onPrev() {
    const prev = shiftMonth(year, month, -1);
    setYear(prev.year); setMonth(prev.month);
  }
  function onNext() {
    const next = shiftMonth(year, month, 1);
    setYear(next.year); setMonth(next.month);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetch(), refetchTransfers()]);
    setRefreshing(false);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const header = (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>Budgets</Text>
      <MonthNav
        year={year} month={month}
        onPrev={onPrev} onNext={onNext}
        disableNext={atCurrentMonth}
      />
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        {header}
        <View style={styles.skeletonWrap}>
          <View style={styles.tilesRow}>
            <SkeletonPulse style={{ flex: 1, height: 72, borderRadius: 14 }} />
            <View style={{ width: 10 }} />
            <SkeletonPulse style={{ flex: 1, height: 72, borderRadius: 14 }} />
          </View>
          <SkeletonPulse style={{ height: D_SIZE, width: D_SIZE, borderRadius: D_SIZE / 2, alignSelf: 'center', marginVertical: 20 }} />
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={[catStyles.row, { gap: 12 }]}>
              <SkeletonPulse style={{ width: 40, height: 40, borderRadius: 10 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonPulse style={{ height: 14, width: 120 }} />
                <SkeletonPulse style={{ height: 4, width: '100%', borderRadius: 2 }} />
              </View>
              <SkeletonPulse style={{ height: 14, width: 64, borderRadius: 4 }} />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {header}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.light.tint}
          />
        }
      >
        {error && (
          <Text style={styles.errorText}>{error.message}</Text>
        )}

        {/* ── Stat tiles ─────────────────────────────────────────────────── */}
        <View style={styles.tilesRow}>
          <StatTile
            label="Total Wealth"
            amount={totalWealth}
            active={activeTile === 'wealth'}
            onPress={() => setActiveTile('wealth')}
          />
          <View style={{ width: 10 }} />
          <StatTile
            label="Cash Flow"
            amount={carryForward}
            positive={carryForward >= 0}
            active={activeTile === 'cashflow'}
            onPress={() => setActiveTile('cashflow')}
          />
        </View>

        {/* ── Donut chart ────────────────────────────────────────────────── */}
        <View style={styles.chartCard}>
          <DonutChart slices={donutSlices} totalCents={totalExpense} />

          {/* Horizontal legend strip below the donut */}
          {budgetRows.some(r => r.actual_cents > 0) && (
            <View style={styles.legendRow}>
              {budgetRows
                .filter(r => r.actual_cents > 0)
                .slice(0, 6)
                .map((r, i) => (
                  <View key={r.category_id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: r.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1}>{r.name}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* ── Spending list ───────────────────────────────────────────────── */}
        <SectionHeader
          title="Spending"
          value={totalExpense > 0 ? formatEur(totalExpense) : undefined}
          valueColor={EXPENSE_COLOR}
        />
        <View style={styles.listCard}>
          {budgetRows.map((row, i) => (
            <View key={row.category_id}>
              <CategoryRow row={row} />
              {i < budgetRows.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
          {budgetRows.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No expense categories found</Text>
            </View>
          )}
        </View>

        {/* ── Transfers ───────────────────────────────────────────────────── */}
        {(totals.outgoing_cents > 0 || totals.incoming_cents > 0) && (
          <>
            <SectionHeader title="Transfers" />
            <View style={styles.listCard}>
              {totals.outgoing_cents > 0 && (
                <>
                  <TransferRow
                    label="↑ Sent"
                    amount={totals.outgoing_cents}
                    color={EXPENSE_COLOR}
                  />
                  {totals.incoming_cents > 0 && <View style={styles.separator} />}
                </>
              )}
              {totals.incoming_cents > 0 && (
                <TransferRow
                  label="↓ Received"
                  amount={totals.incoming_cents}
                  color={INCOME_COLOR}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },

  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#F2F2F7',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },

  scrollContent: { paddingTop: 8 },

  // Tiles
  tilesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Chart card
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 14,
    gap: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: '#6C6C70', maxWidth: 72 },

  // List card wrapper
  listCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 68,
  },

  // Skeleton
  skeletonWrap: { padding: 16, gap: 12 },

  // Error
  errorText: { fontSize: 13, color: OVER_COLOR, textAlign: 'center', margin: 16 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: '#AEAEB2' },
});
