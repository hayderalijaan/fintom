import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useDatabase } from '@/context/DatabaseContext';
import {
  createTransaction,
  createTransfer,
  addTagToTransaction,
} from '@/db/queries/transactions';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useWallets } from '@/hooks/useWallets';
import type { Category, TransactionType } from '@/types';
import type { WalletWithBalance } from '@/hooks/useWallets';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<TransactionType, { label: string; color: string }> = {
  income:   { label: 'Income',   color: '#2DC98E' },
  expense:  { label: 'Expense',  color: '#FF6B6B' },
  transfer: { label: 'Transfer', color: '#5C6BC0' },
};

const WALLET_TYPE_LABEL: Record<string, string> = {
  checking: 'Checking', savings: 'Savings',
  cash: 'Cash', investment: 'Investment', p2p: 'P2P',
};

const DAYS_OF_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ─── Amount parsing ───────────────────────────────────────────────────────────

function parseAmountCents(raw: string): number {
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(ymd: string): string {
  const [y, m, day] = ymd.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  if (ymd === todayYmd()) return 'Today';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCalendarHeader(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function calendarCells(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const offset = (firstWeekday + 6) % 7; // Mon=0 … Sun=6
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Date Picker Modal ────────────────────────────────────────────────────────

interface DatePickerModalProps {
  visible: boolean;
  current: string; // YYYY-MM-DD
  onSelect: (ymd: string) => void;
  onClose: () => void;
}

function DatePickerModal({ visible, current, onSelect, onClose }: DatePickerModalProps) {
  const [curYear, setCurYear] = useState(() => parseInt(current.slice(0, 4), 10));
  const [curMonth, setCurMonth] = useState(() => parseInt(current.slice(5, 7), 10));
  const selected = current;

  useEffect(() => {
    if (visible) {
      setCurYear(parseInt(current.slice(0, 4), 10));
      setCurMonth(parseInt(current.slice(5, 7), 10));
    }
  }, [visible, current]);

  function prevMonth() {
    if (curMonth === 1) { setCurYear(y => y - 1); setCurMonth(12); }
    else setCurMonth(m => m - 1);
  }
  function nextMonth() {
    if (curMonth === 12) { setCurYear(y => y + 1); setCurMonth(1); }
    else setCurMonth(m => m + 1);
  }

  const cells = calendarCells(curYear, curMonth);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={dpStyles.overlay} />
      </TouchableWithoutFeedback>
      <View style={dpStyles.cardWrap} pointerEvents="box-none">
        <View style={dpStyles.card}>
          {/* Month navigation */}
          <View style={dpStyles.navRow}>
            <TouchableOpacity onPress={prevMonth} style={dpStyles.navBtn}>
              <Text style={dpStyles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={dpStyles.monthTitle}>{formatCalendarHeader(curYear, curMonth)}</Text>
            <TouchableOpacity onPress={nextMonth} style={dpStyles.navBtn}>
              <Text style={dpStyles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day-of-week labels */}
          <View style={dpStyles.weekRow}>
            {DAYS_OF_WEEK.map(d => (
              <Text key={d} style={dpStyles.weekLabel}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={dpStyles.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={dpStyles.dayCell} />;
              }
              const ymd = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = ymd === selected;
              const isToday = ymd === todayYmd();
              return (
                <TouchableOpacity
                  key={ymd}
                  style={[dpStyles.dayCell, isSelected && dpStyles.daySelected]}
                  onPress={() => { onSelect(ymd); onClose(); }}
                >
                  <Text style={[
                    dpStyles.dayText,
                    isToday && dpStyles.dayToday,
                    isSelected && dpStyles.daySelectedText,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose} style={dpStyles.cancelBtn}>
            <Text style={dpStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  cardWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  navBtn: { padding: 4 },
  navArrow: { fontSize: 24, color: Colors.light.tint, lineHeight: 28 },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#AEAEB2' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  daySelected: { backgroundColor: Colors.light.tint },
  dayText: { fontSize: 14, color: '#1C1C1E' },
  dayToday: { color: Colors.light.tint, fontWeight: '700' },
  daySelectedText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 15, color: Colors.light.tint, fontWeight: '600' },
});

// ─── Wallet Picker Modal ──────────────────────────────────────────────────────

interface WalletPickerModalProps {
  visible: boolean;
  wallets: WalletWithBalance[];
  selectedId: number | null;
  title: string;
  onSelect: (id: number) => void;
  onClose: () => void;
}

function WalletPickerModal({ visible, wallets, selectedId, title, onSelect, onClose }: WalletPickerModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={wpStyles.overlay} />
      </TouchableWithoutFeedback>
      <View style={[wpStyles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={wpStyles.handle} />
        <Text style={wpStyles.title}>{title}</Text>
        {wallets.map((w) => {
          const isSelected = w.id === selectedId;
          return (
            <TouchableOpacity
              key={w.id}
              style={[wpStyles.row, isSelected && wpStyles.rowSelected]}
              onPress={() => { onSelect(w.id); onClose(); }}
            >
              <View style={[wpStyles.walletIcon, { backgroundColor: `${w.color}22` }]}>
                <Text style={wpStyles.walletEmoji}>{w.icon}</Text>
              </View>
              <View style={wpStyles.walletInfo}>
                <Text style={wpStyles.walletName}>{w.name}</Text>
                <Text style={wpStyles.walletType}>{WALLET_TYPE_LABEL[w.type] ?? w.type}</Text>
              </View>
              {isSelected && <Text style={wpStyles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

const wpStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: 10,
  },
  rowSelected: { backgroundColor: `${Colors.light.tint}12` },
  walletIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  walletEmoji: { fontSize: 18 },
  walletInfo: { flex: 1 },
  walletName: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  walletType: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  check: { fontSize: 16, color: Colors.light.tint, fontWeight: '700', marginLeft: 8 },
});

// ─── Type Segment ─────────────────────────────────────────────────────────────

function TypeSegment({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (t: TransactionType) => void;
}) {
  return (
    <View style={segStyles.wrap}>
      {(['income', 'expense', 'transfer'] as TransactionType[]).map((t) => {
        const active = value === t;
        const { label, color } = TYPE_META[t];
        return (
          <TouchableOpacity
            key={t}
            style={[segStyles.btn, active && { backgroundColor: color }]}
            onPress={() => onChange(t)}
            activeOpacity={0.75}
          >
            <Text style={[segStyles.label, active && segStyles.labelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: '#EFEFF4',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  btn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  labelActive: { color: '#fff' },
});

// ─── Category Grid ────────────────────────────────────────────────────────────

function CategoryGrid({
  categories,
  selectedId,
  onSelect,
  error,
}: {
  categories: Category[];
  selectedId: number | null;
  onSelect: (cat: Category) => void;
  error?: string;
}) {
  return (
    <View style={cgStyles.section}>
      <Text style={cgStyles.sectionLabel}>Category</Text>
      {error && <Text style={cgStyles.errorText}>{error}</Text>}
      <View style={cgStyles.grid}>
        {categories.map((cat) => {
          const isSelected = cat.id === selectedId;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                cgStyles.cell,
                isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}18` },
              ]}
              onPress={() => onSelect(cat)}
              activeOpacity={0.7}
            >
              <View style={[cgStyles.iconWrap, { backgroundColor: `${cat.color}25` }]}>
                <Text style={cgStyles.icon}>{cat.icon}</Text>
              </View>
              <Text style={[cgStyles.name, isSelected && { color: cat.color }]} numberOfLines={1}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cgStyles = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6C6C70', marginBottom: 8 },
  errorText: { fontSize: 12, color: '#FF3B30', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: {
    width: '25%',
    paddingHorizontal: 4,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  icon: { fontSize: 20, lineHeight: 24 },
  name: { fontSize: 10, color: '#3C3C43', textAlign: 'center', fontWeight: '500' },
});

// ─── Form field wrappers ──────────────────────────────────────────────────────

function FieldRow({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <View style={fStyles.row}>
      <View style={fStyles.rowInner}>
        <Text style={fStyles.label}>{label}</Text>
        {children}
      </View>
      {error && <Text style={fStyles.error}>{error}</Text>}
    </View>
  );
}

function SelectButton({ value, placeholder, onPress, error }: {
  value?: string; placeholder: string; onPress: () => void; error?: string;
}) {
  return (
    <TouchableOpacity
      style={[fStyles.selectBtn, error && fStyles.selectBtnError]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[fStyles.selectText, !value && fStyles.placeholder]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <Text style={fStyles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const fStyles = StyleSheet.create({
  row: { paddingHorizontal: 16, marginBottom: 2 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  label: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  error: { fontSize: 12, color: '#FF3B30', marginTop: 4, marginLeft: 4 },
  selectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  selectBtnError: {},
  selectText: { fontSize: 15, color: '#1C1C1E', textAlign: 'right', flexShrink: 1 },
  placeholder: { color: '#C7C7CC' },
  chevron: { fontSize: 18, color: '#C7C7CC', marginLeft: 4 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AddTransactionScreen() {
  const db = useDatabase();
  const insets = useSafeAreaInsets();

  const { wallets } = useWallets();
  const { tags } = useTags();

  // Form state
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayYmd);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [walletId, setWalletId] = useState<number | null>(null);
  const [toWalletId, setToWalletId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [isTaxRelevant, setIsTaxRelevant] = useState(false);
  const [note, setNote] = useState('');
  const [noteExpanded, setNoteExpanded] = useState(false);

  // UI state
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [walletPickerFor, setWalletPickerFor] = useState<'from' | 'to' | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  // Categories filtered by current type (never load transfer categories)
  const categoryType = txType === 'income' ? 'income' : 'expense';
  const { categories } = useCategories(txType === 'transfer' ? undefined : categoryType);

  // Auto-select wallet when only one exists
  useEffect(() => {
    if (wallets.length === 1 && walletId === null) {
      setWalletId(wallets[0].id);
    }
  }, [wallets, walletId]);

  // Clear category when type changes (income ≠ expense category sets)
  const handleTypeChange = useCallback((t: TransactionType) => {
    setTxType(t);
    setCategoryId(null);
    if (t !== 'transfer') setToWalletId(null);
    setErrors({});
  }, []);

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {};
    if (parseAmountCents(amountText) <= 0) errs.amount = 'Enter an amount greater than 0';
    if (txType === 'transfer') {
      if (walletId === null) errs.fromWallet = 'Select a source wallet';
      if (toWalletId === null) errs.toWallet = 'Select a destination wallet';
      if (walletId !== null && toWalletId !== null && walletId === toWalletId) {
        errs.toWallet = 'Wallets must be different';
      }
    } else {
      if (categoryId === null) errs.category = 'Select a category';
      if (walletId === null) errs.wallet = 'Select a wallet';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      const cents = parseAmountCents(amountText);
      const desc = description.trim() || null;
      const noteVal = note.trim() || null;

      if (txType === 'transfer') {
        const { outgoingId } = await createTransfer(db, {
          date,
          amount_cents: cents,
          from_wallet_id: walletId!,
          to_wallet_id: toWalletId!,
          description: desc,
          note: noteVal,
        });
        for (const tagId of selectedTagIds) {
          await addTagToTransaction(db, outgoingId, tagId);
        }
      } else {
        const txId = await createTransaction(db, {
          date,
          amount_cents: cents,
          type: txType,
          wallet_id: walletId!,
          category_id: categoryId,
          description: desc,
          note: noteVal,
          is_tax_relevant: isTaxRelevant ? 1 : 0,
        });
        for (const tagId of selectedTagIds) {
          await addTagToTransaction(db, txId, tagId);
        }
      }

      router.back();
    } catch (e) {
      console.error('[AddTransaction] save failed:', e);
      setErrors({ _general: e instanceof Error ? e.message : 'Save failed. Please try again.' });
      setSaving(false);
    }
  }

  const walletName = (id: number | null) => wallets.find(w => w.id === id)?.name;
  const activeColor = TYPE_META[txType].color;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Transaction</Text>
          <View style={styles.closeBtnPlaceholder} />
        </View>
      </View>

      {/* Type selector */}
      <TypeSegment value={txType} onChange={handleTypeChange} />

      {/* Amount */}
      <View style={[styles.amountWrap, { borderColor: errors.amount ? '#FF3B30' : 'transparent' }]}>
        <Text style={[styles.currencySymbol, { color: activeColor }]}>€</Text>
        <TextInput
          style={[styles.amountInput, { color: activeColor }]}
          value={amountText}
          onChangeText={t => { setAmountText(t); if (errors.amount) setErrors(e => ({ ...e, amount: undefined })); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#C7C7CC"
          selectTextOnFocus
          autoFocus
        />
      </View>
      {errors.amount && <Text style={styles.amountError}>{errors.amount}</Text>}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 120}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Date */}
          <FieldRow label="Date">
            <TouchableOpacity
              style={fStyles.selectBtn}
              onPress={() => setDatePickerVisible(true)}
            >
              <Text style={fStyles.selectText}>{formatDateDisplay(date)}</Text>
              <Text style={fStyles.chevron}>›</Text>
            </TouchableOpacity>
          </FieldRow>

          {/* Category grid — hidden for transfers */}
          {txType !== 'transfer' && (
            <CategoryGrid
              categories={categories}
              selectedId={categoryId}
              onSelect={cat => {
                setCategoryId(cat.id);
                if (cat.is_tax_relevant_default === 1) setIsTaxRelevant(true);
                setErrors(e => ({ ...e, category: undefined }));
              }}
              error={errors.category}
            />
          )}

          {/* Wallet(s) */}
          {txType === 'transfer' ? (
            <>
              <FieldRow label="From Wallet" error={errors.fromWallet}>
                <SelectButton
                  value={walletName(walletId)}
                  placeholder="Select wallet"
                  onPress={() => setWalletPickerFor('from')}
                  error={errors.fromWallet}
                />
              </FieldRow>
              <FieldRow label="To Wallet" error={errors.toWallet}>
                <SelectButton
                  value={walletName(toWalletId)}
                  placeholder="Select wallet"
                  onPress={() => setWalletPickerFor('to')}
                  error={errors.toWallet}
                />
              </FieldRow>
            </>
          ) : (
            <FieldRow label="Wallet" error={errors.wallet}>
              <SelectButton
                value={walletName(walletId)}
                placeholder="Select wallet"
                onPress={() => setWalletPickerFor('from')}
                error={errors.wallet}
              />
            </FieldRow>
          )}

          {/* Description */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor="#C7C7CC"
              returnKeyType="next"
              maxLength={120}
            />
          </View>

          {/* Tags */}
          {tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagsWrap}>
                {tags.map(tag => {
                  const active = selectedTagIds.has(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      style={[
                        styles.tagChip,
                        active
                          ? { backgroundColor: `${tag.color}25`, borderColor: tag.color }
                          : { backgroundColor: '#F2F2F7', borderColor: '#E5E5EA' },
                      ]}
                      onPress={() => toggleTag(tag.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.tagChipText, { color: active ? tag.color : '#8E8E93' }]}>
                        {tag.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tax relevant — hidden for transfers */}
          {txType !== 'transfer' && (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Tax relevant</Text>
              <Switch
                value={isTaxRelevant}
                onValueChange={setIsTaxRelevant}
                trackColor={{ false: '#E5E5EA', true: `${activeColor}80` }}
                thumbColor={isTaxRelevant ? activeColor : '#fff'}
              />
            </View>
          )}

          {/* Note — collapsed by default */}
          <View style={styles.noteSection}>
            {noteExpanded ? (
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note…"
                placeholderTextColor="#C7C7CC"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            ) : (
              <TouchableOpacity onPress={() => setNoteExpanded(true)}>
                <Text style={styles.notePrompt}>＋ Add a note</Text>
              </TouchableOpacity>
            )}
          </View>

          {errors._general && (
            <Text style={styles.generalError}>{errors._general}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: activeColor }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Transaction</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Date picker modal */}
      <DatePickerModal
        visible={datePickerVisible}
        current={date}
        onSelect={setDate}
        onClose={() => setDatePickerVisible(false)}
      />

      {/* Wallet picker modal */}
      <WalletPickerModal
        visible={walletPickerFor !== null}
        wallets={walletPickerFor === 'to'
          ? wallets.filter(w => w.id !== walletId)   // exclude "from" wallet
          : wallets
        }
        selectedId={walletPickerFor === 'to' ? toWalletId : walletId}
        title={walletPickerFor === 'to' ? 'To Wallet' : walletPickerFor === 'from' && txType === 'transfer' ? 'From Wallet' : 'Wallet'}
        onSelect={id => {
          if (walletPickerFor === 'to') {
            setToWalletId(id);
            setErrors(e => ({ ...e, toWallet: undefined }));
          } else {
            setWalletId(id);
            setErrors(e => ({ ...e, fromWallet: undefined, wallet: undefined }));
          }
        }}
        onClose={() => setWalletPickerFor(null)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },

  // Header
  header: { backgroundColor: '#F2F2F7', paddingTop: 4, paddingBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  closeBtn: { minWidth: 64 },
  closeBtnText: { fontSize: 16, color: Colors.light.tint },
  closeBtnPlaceholder: { minWidth: 64 },

  // Amount
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  currencySymbol: { fontSize: 32, fontWeight: '300', marginRight: 6, lineHeight: 48 },
  amountInput: { fontSize: 48, fontWeight: '700', flex: 1, textAlign: 'center', letterSpacing: -1, lineHeight: 56, padding: 0 },
  amountError: { fontSize: 12, color: '#FF3B30', textAlign: 'center', marginBottom: 6 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 10, gap: 2 },

  // Text input row
  inputRow: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 2,
  },
  textInput: { fontSize: 15, color: '#1C1C1E', height: 44 },

  // Tags
  tagsSection: { paddingHorizontal: 16, marginTop: 6, marginBottom: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6C6C70', marginBottom: 8 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1.5,
  },
  tagChipText: { fontSize: 13, fontWeight: '600' },

  // Tax toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  toggleLabel: { flex: 1, fontSize: 15, color: '#1C1C1E' },

  // Note
  noteSection: { paddingHorizontal: 16, marginTop: 4 },
  notePrompt: { fontSize: 15, color: Colors.light.tint, paddingVertical: 12 },
  noteInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1C1C1E',
    minHeight: 88,
  },

  // General error
  generalError: {
    fontSize: 13, color: '#FF3B30',
    textAlign: 'center', marginHorizontal: 16, marginTop: 8,
  },

  // Footer / Save
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
