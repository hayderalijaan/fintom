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
  createRecurringRule,
  getRecurringRules,
  updateRecurringRule,
  type RichRecurringRule,
} from '@/db/queries/recurring';
import { getWallets } from '@/db/queries/wallets';
import { getCategories } from '@/db/queries/categories';
import { formatEur } from '@/utils/currency';
import type { Category, RecurringFrequency, RecurringType, Wallet } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
];

const FREQUENCIES: { label: string; value: RecurringFrequency }[] = [
  { label: 'Daily',     value: 'daily' },
  { label: 'Weekly',    value: 'weekly' },
  { label: 'Monthly',   value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly',    value: 'yearly' },
];

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function describeFrequency(rule: RichRecurringRule): string {
  switch (rule.frequency) {
    case 'daily':   return 'Every day';
    case 'yearly':  return 'Every year';
    case 'weekly': {
      const day = WEEKDAYS.find(d => d.value === rule.frequency_day)?.label;
      return day ? `Every week, ${day}` : 'Every week';
    }
    case 'monthly': {
      return rule.frequency_day != null
        ? `Every month, ${ordinal(rule.frequency_day)}`
        : 'Every month';
    }
    case 'quarterly': {
      return rule.frequency_day != null
        ? `Every quarter, ${ordinal(rule.frequency_day)}`
        : 'Every quarter';
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Rule card ────────────────────────────────────────────────────────────────

function RuleCard({ rule, onPress }: { rule: RichRecurringRule; onPress: () => void }) {
  const inactive = rule.is_active === 0;
  const typeColor = rule.type === 'income' ? '#34C759' : '#FF3B30';
  const sign = rule.type === 'income' ? '+' : '−';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[cardStyles.card, inactive && cardStyles.cardDim]}
    >
      <View style={cardStyles.iconWrap}>
        <Text style={cardStyles.icon}>{rule.category_icon ?? '🔁'}</Text>
      </View>

      <View style={cardStyles.body}>
        <View style={cardStyles.row}>
          <Text style={cardStyles.name} numberOfLines={1}>{rule.name}</Text>
          <Text style={[cardStyles.amount, { color: typeColor }]}>
            {sign}{formatEur(rule.amount_cents)}
          </Text>
        </View>
        <View style={cardStyles.row}>
          <Text style={cardStyles.freq}>{describeFrequency(rule)}</Text>
          <Text style={cardStyles.wallet} numberOfLines={1}>
            {rule.wallet_icon} {rule.wallet_name}
          </Text>
        </View>
        {rule.end_date != null && (
          <Text style={cardStyles.endDate}>Ends {rule.end_date}</Text>
        )}
      </View>

      {inactive && (
        <View style={cardStyles.pausedBadge}>
          <Text style={cardStyles.pausedTxt}>Paused</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  cardDim: { opacity: 0.55 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  name:   { flex: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  amount: { fontSize: 15, fontWeight: '700', flexShrink: 0 },
  freq:   { flex: 1, fontSize: 12, color: '#8E8E93' },
  wallet: { fontSize: 12, color: '#8E8E93', flexShrink: 0 },
  endDate: { fontSize: 11, color: '#FF9500', marginTop: 1 },
  pausedBadge: {
    marginLeft: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  pausedTxt: { fontSize: 10, color: '#8E8E93', fontWeight: '600' },
});

// ─── Modal ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  amountStr: string;
  type: RecurringType;
  walletId: number | null;
  categoryId: number | null;
  frequency: RecurringFrequency;
  weeklyDay: number;
  monthlyDay: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

const FORM_DEFAULTS: FormState = {
  name: '',
  amountStr: '',
  type: 'expense',
  walletId: null,
  categoryId: null,
  frequency: 'monthly',
  weeklyDay: 5,
  monthlyDay: '',
  startDate: '2026-06-07',
  endDate: '',
  isActive: true,
};

function ruleToForm(rule: RichRecurringRule): FormState {
  const weeklyDay =
    rule.frequency === 'weekly' ? (rule.frequency_day ?? 5) : 5;
  const monthlyDay =
    (rule.frequency === 'monthly' || rule.frequency === 'quarterly') && rule.frequency_day != null
      ? String(rule.frequency_day)
      : '';

  return {
    name: rule.name,
    amountStr: rule.amount_cents === 0 ? '' : (rule.amount_cents / 100).toFixed(2),
    type: rule.type,
    walletId: rule.wallet_id,
    categoryId: rule.category_id,
    frequency: rule.frequency,
    weeklyDay,
    monthlyDay,
    startDate: rule.start_date,
    endDate: rule.end_date ?? '',
    isActive: rule.is_active === 1,
  };
}

function resolveFrequencyDay(form: FormState): number | null {
  if (form.frequency === 'weekly') return form.weeklyDay;
  if (form.frequency === 'monthly' || form.frequency === 'quarterly') {
    const d = parseInt(form.monthlyDay, 10);
    if (isNaN(d)) return null;
    return Math.min(31, Math.max(1, d));
  }
  return null;
}

interface ModalProps {
  visible: boolean;
  rule: RichRecurringRule | null;
  onClose: () => void;
  onSaved: () => void;
}

function RecurringModal({ visible, rule, onClose, onSaved }: ModalProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const isEdit = rule !== null;

  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm(rule ? ruleToForm(rule) : FORM_DEFAULTS);
    setErrors({});
    setSaving(false);
  }, [visible, rule]);

  useEffect(() => {
    if (!visible) return;
    getWallets(db).then(setWallets).catch(() => {});
    getCategories(db).then(setAllCategories).catch(() => {});
  }, [visible, db]);

  const filteredCategories = allCategories.filter(c => c.type === form.type);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function handleTypeChange(type: RecurringType) {
    setForm(f => ({ ...f, type, categoryId: null }));
    setErrors(e => ({ ...e, type: undefined, categoryId: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {};
    if (!form.name.trim())                           errs.name      = 'Name is required';
    if (form.walletId == null)                       errs.walletId  = 'Select a wallet';
    if (!DATE_RE.test(form.startDate))               errs.startDate = 'Use YYYY-MM-DD';
    if (form.endDate && !DATE_RE.test(form.endDate)) errs.endDate   = 'Use YYYY-MM-DD';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);

    const n = parseFloat(form.amountStr.replace(',', '.'));
    const amountCents = isNaN(n) || n < 0 ? 0 : Math.round(n * 100);

    try {
      const payload = {
        name:          form.name.trim(),
        amount_cents:  amountCents,
        type:          form.type,
        wallet_id:     form.walletId!,
        category_id:   form.categoryId,
        frequency:     form.frequency,
        frequency_day: resolveFrequencyDay(form),
        start_date:    form.startDate,
        end_date:      form.endDate || null,
      };

      if (isEdit) {
        await updateRecurringRule(db, rule.id, { ...payload, is_active: form.isActive ? 1 : 0 });
      } else {
        await createRecurringRule(db, payload);
      }
      onSaved();
    } catch (e) {
      setErrors({ _general: e instanceof Error ? e.message : 'Save failed. Please try again.' });
      setSaving(false);
    }
  }

  const showFreqDay =
    form.frequency === 'weekly' ||
    form.frequency === 'monthly' ||
    form.frequency === 'quarterly';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sheetStyles.overlay} />
      </TouchableWithoutFeedback>

      <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={sheetStyles.handle} />

        <View style={sheetStyles.header}>
          <TouchableOpacity onPress={onClose} style={sheetStyles.headerSide}>
            <Text style={sheetStyles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={sheetStyles.title}>{isEdit ? 'Edit Rule' : 'New Rule'}</Text>
          <View style={sheetStyles.headerSide} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={60}
        >
          <ScrollView
            contentContainerStyle={sheetStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Name ─────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Name</Text>
              <View style={[fieldStyles.inputCard, !!errors.name && fieldStyles.inputCardError]}>
                <TextInput
                  style={fieldStyles.input}
                  value={form.name}
                  onChangeText={v => set('name', v)}
                  placeholder="e.g. Salary"
                  placeholderTextColor="#C7C7CC"
                  returnKeyType="done"
                  maxLength={50}
                  autoFocus={!isEdit}
                />
              </View>
              {!!errors.name && <Text style={fieldStyles.error}>{errors.name}</Text>}
            </View>

            {/* ── Amount ───────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Amount</Text>
              <View style={fieldStyles.inputCard}>
                <TextInput
                  style={fieldStyles.input}
                  value={form.amountStr}
                  onChangeText={v => set('amountStr', v)}
                  placeholder="0.00"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* ── Type ─────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Type</Text>
              <View style={fieldStyles.segRow}>
                {(['expense', 'income'] as RecurringType[]).map(t => {
                  const active = form.type === t;
                  const color  = t === 'income' ? '#34C759' : '#FF3B30';
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        fieldStyles.segBtn,
                        active ? { backgroundColor: color } : null,
                      ]}
                      onPress={() => handleTypeChange(t)}
                      activeOpacity={0.7}
                    >
                      <Text style={[fieldStyles.segTxt, active && fieldStyles.segTxtOn]}>
                        {t === 'income' ? 'Income' : 'Expense'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Wallet ───────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={[fieldStyles.label, !!errors.walletId && { color: '#FF3B30' }]}>
                Wallet{errors.walletId ? ` — ${errors.walletId}` : ''}
              </Text>
              <View style={fieldStyles.chipsWrap}>
                {wallets.map(w => {
                  const active = form.walletId === w.id;
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[fieldStyles.chip, active && fieldStyles.chipActive]}
                      onPress={() => set('walletId', w.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={fieldStyles.chipIcon}>{w.icon}</Text>
                      <Text style={[fieldStyles.chipTxt, active && fieldStyles.chipTxtActive]} numberOfLines={1}>
                        {w.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Category ─────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Category</Text>
              <View style={fieldStyles.chipsWrap}>
                <TouchableOpacity
                  style={[fieldStyles.chip, form.categoryId === null && fieldStyles.chipActive]}
                  onPress={() => set('categoryId', null)}
                  activeOpacity={0.7}
                >
                  <Text style={[fieldStyles.chipTxt, form.categoryId === null && fieldStyles.chipTxtActive]}>
                    None
                  </Text>
                </TouchableOpacity>
                {filteredCategories.map(c => {
                  const active = form.categoryId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[fieldStyles.chip, active && fieldStyles.chipActive]}
                      onPress={() => set('categoryId', c.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={fieldStyles.chipIcon}>{c.icon}</Text>
                      <Text style={[fieldStyles.chipTxt, active && fieldStyles.chipTxtActive]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Frequency ────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Frequency</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={fieldStyles.freqScroll}
              >
                {FREQUENCIES.map(f => {
                  const active = form.frequency === f.value;
                  return (
                    <TouchableOpacity
                      key={f.value}
                      style={[fieldStyles.freqBtn, active && fieldStyles.freqBtnActive]}
                      onPress={() => set('frequency', f.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[fieldStyles.freqTxt, active && fieldStyles.freqTxtActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── Frequency day (conditional) ───────────────── */}
            {showFreqDay && (
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>
                  {form.frequency === 'weekly' ? 'Day of Week' : 'Day of Month'}
                </Text>

                {form.frequency === 'weekly' ? (
                  <View style={fieldStyles.weekdayRow}>
                    {WEEKDAYS.map(d => {
                      const active = form.weeklyDay === d.value;
                      return (
                        <TouchableOpacity
                          key={d.value}
                          style={[fieldStyles.weekdayBtn, active && fieldStyles.weekdayBtnActive]}
                          onPress={() => set('weeklyDay', d.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={[fieldStyles.weekdayTxt, active && fieldStyles.weekdayTxtActive]}>
                            {d.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={[fieldStyles.inputCard, { maxWidth: 110 }]}>
                    <TextInput
                      style={fieldStyles.input}
                      value={form.monthlyDay}
                      onChangeText={v => set('monthlyDay', v.replace(/\D/g, ''))}
                      placeholder="1–31"
                      placeholderTextColor="#C7C7CC"
                      keyboardType="number-pad"
                      returnKeyType="done"
                      maxLength={2}
                    />
                  </View>
                )}
              </View>
            )}

            {/* ── Start date ────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Start Date</Text>
              <View style={[fieldStyles.inputCard, !!errors.startDate && fieldStyles.inputCardError]}>
                <TextInput
                  style={fieldStyles.input}
                  value={form.startDate}
                  onChangeText={v => set('startDate', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={10}
                />
              </View>
              {!!errors.startDate && <Text style={fieldStyles.error}>{errors.startDate}</Text>}
            </View>

            {/* ── End date ─────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>End Date (optional)</Text>
              <View style={[fieldStyles.inputCard, !!errors.endDate && fieldStyles.inputCardError]}>
                <TextInput
                  style={fieldStyles.input}
                  value={form.endDate}
                  onChangeText={v => set('endDate', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={10}
                />
              </View>
              {!!errors.endDate && <Text style={fieldStyles.error}>{errors.endDate}</Text>}
            </View>

            {/* ── Active toggle (edit only) ─────────────────── */}
            {isEdit && (
              <View style={fieldStyles.group}>
                <View style={fieldStyles.toggleCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldStyles.toggleLabel}>Active</Text>
                    <Text style={fieldStyles.toggleSub}>
                      Paused rules are excluded from the transaction timeline
                    </Text>
                  </View>
                  <Switch
                    value={form.isActive}
                    onValueChange={v => set('isActive', v)}
                    trackColor={{ false: '#E5E5EA', true: Colors.light.tint }}
                    ios_backgroundColor="#E5E5EA"
                  />
                </View>
              </View>
            )}

            {!!errors._general && (
              <Text style={fieldStyles.generalError}>{errors._general}</Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={sheetStyles.footer}>
          <TouchableOpacity
            style={[sheetStyles.saveBtn, saving && sheetStyles.saveBtnBusy]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={sheetStyles.saveBtnTxt}>
                  {isEdit ? 'Save Changes' : 'Add Rule'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerSide: { minWidth: 70 },
  cancel: { fontSize: 16, color: Colors.light.tint },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  scrollContent: { padding: 16, gap: 20, paddingBottom: 8 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  saveBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnBusy: { opacity: 0.6 },
  saveBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

const fieldStyles = StyleSheet.create({
  group: { gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C6C70',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputCardError: { borderColor: '#FF3B30' },
  input: { fontSize: 15, color: '#1C1C1E', paddingVertical: 11 },
  error: { fontSize: 12, color: '#FF3B30' },
  generalError: { fontSize: 13, color: '#FF3B30', textAlign: 'center' },

  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  segTxt:   { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  segTxtOn: { color: '#fff' },

  // Wallet / category chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: `${Colors.light.tint}18`,
    borderColor: Colors.light.tint,
  },
  chipIcon: { fontSize: 14 },
  chipTxt:       { fontSize: 13, color: '#3C3C43', fontWeight: '500' },
  chipTxtActive: { color: Colors.light.tint, fontWeight: '700' },

  // Frequency horizontal scroll
  freqScroll: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  freqBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  freqBtnActive: {
    backgroundColor: `${Colors.light.tint}18`,
    borderColor: Colors.light.tint,
  },
  freqTxt:       { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  freqTxtActive: { color: Colors.light.tint },

  // Weekday buttons
  weekdayRow: { flexDirection: 'row', gap: 6 },
  weekdayBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  weekdayBtnActive: {
    backgroundColor: `${Colors.light.tint}18`,
    borderColor: Colors.light.tint,
  },
  weekdayTxt:       { fontSize: 11, fontWeight: '600', color: '#8E8E93' },
  weekdayTxtActive: { color: Colors.light.tint },

  // Toggle
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', marginBottom: 2 },
  toggleSub:   { fontSize: 12, color: '#8E8E93' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecurringScreen() {
  const db = useDatabase();

  const [active, setActive]     = useState<RichRecurringRule[]>([]);
  const [paused, setPaused]     = useState<RichRecurringRule[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<Error | null>(null);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<RichRecurringRule | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const all = await getRecurringRules(db);
      setActive(all.filter(r => r.is_active === 1));
      setPaused(all.filter(r => r.is_active === 0));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setModalTarget(null); }
  function openEdit(r: RichRecurringRule) { setModalTarget(r); }
  function closeModal() { setModalTarget(undefined); }

  async function handleSaved() {
    closeModal();
    await load();
  }

  return (
    <SafeAreaView style={screenStyles.root} edges={['top']}>
      <View style={screenStyles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={screenStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={screenStyles.backTxt}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={screenStyles.title}>Recurring Rules</Text>
        <TouchableOpacity
          onPress={openCreate}
          style={screenStyles.addBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={screenStyles.addTxt}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={screenStyles.centerFill}>
          <ActivityIndicator color={Colors.light.tint} />
        </View>
      ) : error ? (
        <View style={screenStyles.centerFill}>
          <Text style={screenStyles.errorTxt}>Failed to load rules</Text>
          <Text style={screenStyles.errorDetail}>{error.message}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {active.length === 0 && paused.length === 0 && (
            <View style={screenStyles.emptyWrap}>
              <Text style={screenStyles.emptyIcon}>🔁</Text>
              <Text style={screenStyles.emptyTitle}>No rules yet</Text>
              <Text style={screenStyles.emptySub}>
                Tap + Add to create your first recurring rule
              </Text>
            </View>
          )}

          {active.map(rule => (
            <RuleCard key={rule.id} rule={rule} onPress={() => openEdit(rule)} />
          ))}

          {paused.length > 0 && (
            <View style={screenStyles.pausedSection}>
              <TouchableOpacity
                onPress={() => setPausedOpen(v => !v)}
                style={screenStyles.pausedToggle}
                activeOpacity={0.7}
              >
                <Text style={screenStyles.pausedHeader}>PAUSED ({paused.length})</Text>
                <Text style={screenStyles.pausedChevron}>{pausedOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {pausedOpen && paused.map(rule => (
                <RuleCard key={rule.id} rule={rule} onPress={() => openEdit(rule)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <RecurringModal
        visible={modalTarget !== undefined}
        rule={modalTarget ?? null}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const screenStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { minWidth: 80 },
  backTxt: { fontSize: 16, color: Colors.light.tint },
  title:   { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  addBtn:  { minWidth: 80, alignItems: 'flex-end' },
  addTxt:  { fontSize: 16, color: Colors.light.tint, fontWeight: '500' },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },

  emptyWrap: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  emptySub:   { fontSize: 14, color: '#8E8E93', textAlign: 'center', paddingHorizontal: 32 },

  pausedSection: { marginTop: 12 },
  pausedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  pausedHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pausedChevron: { fontSize: 10, color: '#8E8E93' },

  centerFill:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTxt:    { fontSize: 15, fontWeight: '600', color: '#FF3B30', marginBottom: 4 },
  errorDetail: { fontSize: 13, color: '#8E8E93', textAlign: 'center' },
});
