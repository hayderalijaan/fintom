import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  SectionList,
  SectionListData,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useMonthlyFlow, type MonthlyFlow } from '@/hooks/useMonthlyFlow';
import { useTransactionFeed, parseFeedTags, type TransactionFeedRow } from '@/hooks/useTransactionFeed';
import { formatEur } from '@/utils/currency';

// ─── Palette ─────────────────────────────────────────────────────────────────

const INCOME_COLOR = '#2DC98E';
const EXPENSE_COLOR = '#FF6B6B';
const TRANSFER_COLOR = '#78909C';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function offsetMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDayHeader(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return 'Today';

  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yest = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dateStr === yest) return 'Yesterday';

  const [y, mo, day] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

type DaySection = {
  date: string;
  title: string;
  total: number;
  data: TransactionFeedRow[];
};

function buildSections(rows: TransactionFeedRow[]): DaySection[] {
  const map = new Map<string, TransactionFeedRow[]>();
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    const bucket = map.get(date);
    if (bucket) bucket.push(row);
    else map.set(date, [row]);
  }
  return Array.from(map.entries()).map(([date, txns]) => ({
    date,
    title: formatDayHeader(date),
    total: txns.reduce((sum, t) => {
      if (t.type === 'income') return sum + t.amount_cents;
      if (t.type === 'expense') return sum - t.amount_cents;
      return sum;
    }, 0),
    data: txns,
  }));
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

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
  return <Animated.View style={[{ backgroundColor: '#E0E0E0', borderRadius: 8 }, style, { opacity }]} />;
}

function SkeletonRow() {
  return (
    <View style={[rowStyles.container, { backgroundColor: '#fff' }]}>
      <SkeletonPulse style={{ width: 40, height: 40, borderRadius: 10, marginRight: 12 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonPulse style={{ height: 14, width: 110 }} />
        <SkeletonPulse style={{ height: 11, width: 160 }} />
      </View>
      <SkeletonPulse style={{ height: 14, width: 56, borderRadius: 4 }} />
    </View>
  );
}

// ─── Bar Chart ───────────────────────────────────────────────────────────────

const CHART_BAR_H = 88;

function BarChart({ data, activeMonth }: { data: MonthlyFlow[]; activeMonth: string }) {
  const maxCents = Math.max(...data.flatMap((d) => [d.income_cents, d.expense_cents]), 1);

  return (
    <View style={chartStyles.wrap}>
      {data.map((d) => {
        const [y, m] = d.month.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short' });
        const isCurrent = d.month === activeMonth;
        const incH = d.income_cents > 0
          ? Math.max(Math.round((d.income_cents / maxCents) * CHART_BAR_H), 3) : 0;
        const expH = d.expense_cents > 0
          ? Math.max(Math.round((d.expense_cents / maxCents) * CHART_BAR_H), 3) : 0;
        return (
          <View key={d.month} style={chartStyles.group}>
            <View style={[chartStyles.bars, { height: CHART_BAR_H }]}>
              <View style={[
                chartStyles.bar,
                { height: incH, backgroundColor: INCOME_COLOR, opacity: isCurrent ? 1 : 0.5 },
              ]} />
              <View style={[
                chartStyles.bar,
                { height: expH, backgroundColor: EXPENSE_COLOR, opacity: isCurrent ? 1 : 0.5 },
              ]} />
            </View>
            <Text style={[chartStyles.label, isCurrent && chartStyles.labelActive]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4 },
  group: { flex: 1, alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  label: { fontSize: 10, color: '#BDBDBD', marginTop: 5 },
  labelActive: { color: Colors.light.tint, fontWeight: '600' },
});

// ─── Transaction row ─────────────────────────────────────────────────────────

function TransactionRow({ row }: { row: TransactionFeedRow }) {
  const tags = parseFeedTags(row.tags_raw);
  const isExpense = row.type === 'expense';
  const isIncome = row.type === 'income';

  const amountColor = isExpense ? EXPENSE_COLOR : isIncome ? INCOME_COLOR : TRANSFER_COLOR;

  function formatAmount(): string {
    if (isIncome) return `+${formatEur(row.amount_cents)}`;
    if (isExpense) return `-${formatEur(row.amount_cents)}`;
    // transfer: amount_cents is signed in the DB
    const abs = formatEur(Math.abs(row.amount_cents));
    return row.amount_cents >= 0 ? `+${abs}` : `-${abs}`;
  }

  const icon = row.category_icon ?? '🔄';
  const iconBg = row.category_color ? `${row.category_color}22` : '#F0F0F0';
  const primaryLabel = row.category_name ?? 'Transfer';

  const meta = [row.description, row.wallet_name].filter(Boolean).join(' · ');

  return (
    <View style={rowStyles.container}>
      <View style={[rowStyles.iconBox, { backgroundColor: iconBg }]}>
        <Text style={rowStyles.icon}>{icon}</Text>
      </View>
      <View style={rowStyles.body}>
        <Text style={rowStyles.primary} numberOfLines={1}>{primaryLabel}</Text>
        {!!meta && (
          <Text style={rowStyles.meta} numberOfLines={1}>{meta}</Text>
        )}
        {tags.length > 0 && (
          <View style={rowStyles.tagRow}>
            {tags.map((tag) => (
              <View
                key={tag.name}
                style={[rowStyles.tag, { backgroundColor: `${tag.color}20`, borderColor: `${tag.color}50` }]}
              >
                <Text style={[rowStyles.tagText, { color: tag.color }]}>{tag.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Text style={[rowStyles.amount, { color: amountColor }]}>{formatAmount()}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  icon: { fontSize: 19, lineHeight: 24 },
  body: { flex: 1, minWidth: 0 },
  primary: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  tagText: { fontSize: 10, fontWeight: '600' },
  amount: { fontSize: 14, fontWeight: '600', marginLeft: 10 },
});

// ─── Day section header ───────────────────────────────────────────────────────

function DaySectionHeader({ date, title, total }: DaySection) {
  const signedStr = total === 0
    ? formatEur(0)
    : total > 0
      ? `+${formatEur(total)}`
      : formatEur(total); // negative already includes '-'

  const totalColor = total > 0 ? INCOME_COLOR : total < 0 ? EXPENSE_COLOR : '#9E9E9E';

  return (
    <View style={dayHeaderStyles.row}>
      <Text style={dayHeaderStyles.title}>{title}</Text>
      <Text style={[dayHeaderStyles.total, { color: totalColor }]}>{signedStr}</Text>
    </View>
  );
}

const dayHeaderStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#F2F2F7',
  },
  title: { fontSize: 12, fontWeight: '600', color: '#6C6C70', letterSpacing: 0.2 },
  total: { fontSize: 12, fontWeight: '600' },
});

// ─── Month nav header ─────────────────────────────────────────────────────────

function MonthNav({
  yearMonth,
  onPrev,
  onNext,
  disableNext,
}: {
  yearMonth: string;
  onPrev: () => void;
  onNext: () => void;
  disableNext: boolean;
}) {
  return (
    <View style={navStyles.row}>
      <TouchableOpacity onPress={onPrev} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={navStyles.arrow}>‹</Text>
      </TouchableOpacity>
      <Text style={navStyles.label}>{formatMonthTitle(yearMonth)}</Text>
      <TouchableOpacity
        onPress={onNext}
        disabled={disableNext}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[navStyles.arrow, disableNext && navStyles.arrowDisabled]}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const navStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 2 },
  arrow: { fontSize: 24, color: Colors.light.tint, lineHeight: 28, paddingHorizontal: 2 },
  arrowDisabled: { color: '#C7C7CC' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.light.text, paddingHorizontal: 10 },
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ yearMonth }: { yearMonth: string }) {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.emoji}>📭</Text>
      <Text style={emptyStyles.heading}>No transactions</Text>
      <Text style={emptyStyles.sub}>Nothing recorded in {formatMonthTitle(yearMonth)}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  emoji: { fontSize: 40, marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '600', color: '#6C6C70', marginBottom: 4 },
  sub: { fontSize: 13, color: '#AEAEB2' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TimelineScreen() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [refreshing, setRefreshing] = useState(false);

  const { rows, loading, error, refetch } = useTransactionFeed({ year_month: yearMonth });
  const { data: monthlyFlow, refetch: refetchFlow } = useMonthlyFlow(6);
  const tabBarHeight = useBottomTabBarHeight();

  // Refetch when screen regains focus (e.g. after Add Transaction modal closes).
  // Skip the first focus — hooks already load on mount.
  const hasMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasMounted.current) { hasMounted.current = true; return; }
      refetch();
      refetchFlow();
    }, [refetch, refetchFlow]),
  );

  const sections = useMemo(() => buildSections(rows), [rows]);

  const income = useMemo(
    () => rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount_cents, 0),
    [rows],
  );
  const expenses = useMemo(
    () => rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount_cents, 0),
    [rows],
  );
  const cashFlow = income - expenses;

  const atCurrentMonth = yearMonth === currentYearMonth();

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const listHeader = useMemo(() => (
    <View>
      {/* Cash Flow card */}
      <View style={styles.card}>
        <Text style={styles.cashFlowLabel}>Cash Flow</Text>
        <Text style={[
          styles.cashFlowAmount,
          { color: cashFlow > 0 ? INCOME_COLOR : cashFlow < 0 ? EXPENSE_COLOR : Colors.light.text },
        ]}>
          {cashFlow > 0 ? '+' : ''}{formatEur(cashFlow)}
        </Text>
        <View style={styles.cashFlowMeta}>
          <View style={styles.cashFlowItem}>
            <View style={[styles.dot, { backgroundColor: INCOME_COLOR }]} />
            <Text style={styles.cashFlowValue}>{formatEur(income)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.cashFlowItem}>
            <View style={[styles.dot, { backgroundColor: EXPENSE_COLOR }]} />
            <Text style={styles.cashFlowValue}>{formatEur(expenses)}</Text>
          </View>
        </View>
      </View>

      {/* Bar chart card — only shown once data arrives */}
      {monthlyFlow.length > 0 && (
        <View style={[styles.card, styles.chartCard]}>
          <View style={styles.chartHeaderRow}>
            <Text style={styles.chartTitle}>Last 6 Months</Text>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: INCOME_COLOR }]} />
              <Text style={styles.legendLabel}>Income</Text>
              <View style={[styles.legendDot, { backgroundColor: EXPENSE_COLOR }]} />
              <Text style={styles.legendLabel}>Expenses</Text>
            </View>
          </View>
          <BarChart data={monthlyFlow} activeMonth={yearMonth} />
        </View>
      )}
    </View>
  ), [cashFlow, income, expenses, monthlyFlow, yearMonth]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
        onPress={() => router.push('/transaction/add')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Timeline</Text>
        <MonthNav
          yearMonth={yearMonth}
          onPrev={() => setYearMonth((m) => offsetMonth(m, -1))}
          onNext={() => setYearMonth((m) => offsetMonth(m, 1))}
          disableNext={atCurrentMonth}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Couldn't load transactions</Text>
          <Text style={styles.errorDetail}>{error.message}</Text>
        </View>
      ) : (
        <SectionList<TransactionFeedRow, DaySection>
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <TransactionRow row={item} />}
          renderSectionHeader={({ section }) => (
            <DaySectionHeader
              date={section.date}
              title={section.title}
              total={section.total}
              data={section.data}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<EmptyState yearMonth={yearMonth} />}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.light.tint}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },

  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#F2F2F7',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },

  // Card wrapper shared by cash flow and chart
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  chartCard: { paddingBottom: 14 },

  // Cash flow
  cashFlowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#AEAEB2',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  cashFlowAmount: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  cashFlowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashFlowItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cashFlowValue: { fontSize: 13, color: '#6C6C70' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  divider: { width: 1, height: 14, backgroundColor: '#E5E5EA', marginHorizontal: 14 },

  // Chart header
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: { fontSize: 12, fontWeight: '600', color: '#6C6C70' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 10, color: '#AEAEB2', marginRight: 6 },

  // List
  listContent: { paddingBottom: 32 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 68, // aligns with text column
  },
  sectionGap: { height: 8, backgroundColor: '#F2F2F7' },

  // Skeleton
  skeletonWrap: { gap: 1, marginTop: 8 },

  // Error
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: EXPENSE_COLOR, marginBottom: 6 },
  errorDetail: { fontSize: 13, color: '#9E9E9E', textAlign: 'center' },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 34, marginTop: -2 },
});
