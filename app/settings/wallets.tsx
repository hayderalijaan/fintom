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
  createWallet,
  getAllWalletsWithBalancesAll,
  updateWallet,
  type WalletWithBalance,
} from '@/db/queries/wallets';
import type { WalletType } from '@/types';
import { formatEur } from '@/utils/currency';

// ─── Constants ────────────────────────────────────────────────────────────────

const WALLET_TYPES: { value: WalletType; label: string }[] = [
  { value: 'checking',   label: 'Checking'   },
  { value: 'savings',    label: 'Savings'    },
  { value: 'cash',       label: 'Cash'       },
  { value: 'investment', label: 'Investment' },
  { value: 'p2p',        label: 'P2P'        },
];

const TYPE_LABEL: Record<WalletType, string> = {
  checking:   'Checking account',
  savings:    'Savings account',
  cash:       'Cash wallet',
  investment: 'Investment account',
  p2p:        'P2P account',
};

const PRESET_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
  '#795548', '#F44336', '#3F51B5', '#009688',
];

const DEFAULT_ICON: Record<WalletType, string> = {
  checking:   '🏦',
  savings:    '🏛️',
  cash:       '💵',
  investment: '📈',
  p2p:        '🔄',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBalanceCents(raw: string): number {
  const normalized = raw.replace(',', '.').trim();
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

// ─── Wallet row ───────────────────────────────────────────────────────────────

function WalletRow({ wallet, onEdit }: { wallet: WalletWithBalance; onEdit: () => void }) {
  const archived = wallet.is_active === 0;
  const balNeg = wallet.current_balance_cents < 0;

  return (
    <View style={[rowStyles.row, archived && rowStyles.rowArchived]}>
      <View style={[rowStyles.iconWrap, { backgroundColor: `${wallet.color}22` }]}>
        <Text style={rowStyles.icon}>{wallet.icon}</Text>
        <View style={[rowStyles.colorDot, { backgroundColor: wallet.color }]} />
      </View>

      <View style={rowStyles.body}>
        <Text style={rowStyles.name} numberOfLines={1}>{wallet.name}</Text>
        <Text style={rowStyles.type}>{TYPE_LABEL[wallet.type]}</Text>
      </View>

      <View style={rowStyles.right}>
        <Text style={[rowStyles.balance, balNeg && rowStyles.balanceNeg]}>
          {formatEur(wallet.current_balance_cents)}
        </Text>
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={{ top: 10, bottom: 10, left: 12, right: 4 }}
        >
          <Text style={rowStyles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#fff',
  },
  rowArchived: { opacity: 0.45 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
    position: 'relative',
  },
  icon: { fontSize: 20, lineHeight: 26 },
  colorDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  type: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  right: { alignItems: 'flex-end', marginLeft: 8 },
  balance: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  balanceNeg: { color: '#FF3B30' },
  editBtn: { fontSize: 13, color: Colors.light.tint, fontWeight: '500', marginTop: 4 },
});

// ─── Wallet modal ─────────────────────────────────────────────────────────────

interface ModalProps {
  visible: boolean;
  wallet: WalletWithBalance | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  type: WalletType;
  balanceText: string;
  color: string;
  icon: string;
  isActive: boolean;
}

function WalletModal({ visible, wallet, onClose, onSaved }: ModalProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const isEdit = wallet !== null;

  const [form, setForm] = useState<FormState>({
    name: '',
    type: 'checking',
    balanceText: '0',
    color: PRESET_COLORS[0],
    icon: DEFAULT_ICON.checking,
    isActive: true,
  });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (wallet) {
      setForm({
        name: wallet.name,
        type: wallet.type,
        balanceText: '',
        color: wallet.color,
        icon: wallet.icon,
        isActive: wallet.is_active === 1,
      });
    } else {
      setForm({
        name: '',
        type: 'checking',
        balanceText: '0',
        color: PRESET_COLORS[0],
        icon: DEFAULT_ICON.checking,
        isActive: true,
      });
    }
    setErrors({});
    setSaving(false);
  }, [visible, wallet]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!isEdit) {
      const raw = form.balanceText.replace(',', '.').trim();
      if (raw !== '' && isNaN(parseFloat(raw))) {
        errs.balanceText = 'Enter a valid amount';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateWallet(db, wallet.id, {
          name: form.name.trim(),
          type: form.type,
          color: form.color,
          icon: form.icon || DEFAULT_ICON[form.type],
          is_active: form.isActive ? 1 : 0,
        });
      } else {
        await createWallet(db, {
          name: form.name.trim(),
          type: form.type,
          currency: 'EUR',
          balance_cents: parseBalanceCents(form.balanceText),
          color: form.color,
          icon: form.icon || DEFAULT_ICON[form.type],
        });
      }
      onSaved();
    } catch (e) {
      setErrors({ _general: e instanceof Error ? e.message : 'Save failed. Please try again.' });
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={sheetStyles.overlay} />
      </TouchableWithoutFeedback>

      <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        {/* Drag handle */}
        <View style={sheetStyles.handle} />

        {/* Header */}
        <View style={sheetStyles.header}>
          <TouchableOpacity onPress={onClose} style={sheetStyles.headerSide}>
            <Text style={sheetStyles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={sheetStyles.title}>
            {isEdit ? 'Edit Wallet' : 'New Wallet'}
          </Text>
          <View style={sheetStyles.headerSide} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={60}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={sheetStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Name ─────────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Name</Text>
              <View style={[fieldStyles.inputCard, !!errors.name && fieldStyles.inputCardError]}>
                <TextInput
                  style={fieldStyles.input}
                  value={form.name}
                  onChangeText={v => set('name', v)}
                  placeholder="e.g. Giro Comdirect"
                  placeholderTextColor="#C7C7CC"
                  returnKeyType="done"
                  maxLength={50}
                  autoFocus={!isEdit}
                />
              </View>
              {!!errors.name && <Text style={fieldStyles.error}>{errors.name}</Text>}
            </View>

            {/* ── Type ─────────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Type</Text>
              <View style={fieldStyles.typeRow}>
                {WALLET_TYPES.map(wt => {
                  const active = form.type === wt.value;
                  return (
                    <TouchableOpacity
                      key={wt.value}
                      style={[fieldStyles.typeBtn, active && fieldStyles.typeBtnOn]}
                      onPress={() => {
                        set('type', wt.value);
                        if (Object.values(DEFAULT_ICON).includes(form.icon)) {
                          set('icon', DEFAULT_ICON[wt.value]);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[fieldStyles.typeTxt, active && fieldStyles.typeTxtOn]}>
                        {wt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Opening Balance (create only) ─────────────────── */}
            {!isEdit && (
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>Opening Balance</Text>
                <View style={[fieldStyles.inputCard, fieldStyles.inputCardRow, !!errors.balanceText && fieldStyles.inputCardError]}>
                  <Text style={fieldStyles.currencyPfx}>€</Text>
                  <TextInput
                    style={[fieldStyles.input, { flex: 1 }]}
                    value={form.balanceText}
                    onChangeText={v => set('balanceText', v)}
                    placeholder="0.00"
                    placeholderTextColor="#C7C7CC"
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                </View>
                {!!errors.balanceText && <Text style={fieldStyles.error}>{errors.balanceText}</Text>}
              </View>
            )}

            {/* ── Color ────────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Color</Text>
              <View style={fieldStyles.colorGrid}>
                {PRESET_COLORS.map(c => {
                  const selected = form.color === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        fieldStyles.swatch,
                        { backgroundColor: c },
                        selected && fieldStyles.swatchSelected,
                      ]}
                      onPress={() => set('color', c)}
                      activeOpacity={0.8}
                    >
                      {selected && <Text style={fieldStyles.swatchCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Icon ─────────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <Text style={fieldStyles.label}>Icon</Text>
              <View style={fieldStyles.iconRow}>
                <View style={[fieldStyles.iconPreview, { backgroundColor: `${form.color}22` }]}>
                  <Text style={fieldStyles.iconPreviewEmoji}>
                    {form.icon || DEFAULT_ICON[form.type]}
                  </Text>
                </View>
                <View style={[fieldStyles.inputCard, { flex: 1 }]}>
                  <TextInput
                    style={fieldStyles.input}
                    value={form.icon}
                    onChangeText={v => set('icon', [...v].slice(0, 2).join(''))}
                    placeholder="Tap to enter an emoji"
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>
            </View>

            {/* ── Archive toggle (edit only) ────────────────────── */}
            {isEdit && (
              <View style={fieldStyles.group}>
                <View style={fieldStyles.toggleCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldStyles.toggleLabel}>Active</Text>
                    <Text style={fieldStyles.toggleSub}>
                      Archived wallets are hidden from the main wallets view
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

        {/* ── Save button ─────────────────────────────────────────── */}
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
                  {isEdit ? 'Save Changes' : 'Add Wallet'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '90%',
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
    fontSize: 13,
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
  inputCardRow: { flexDirection: 'row', alignItems: 'center' },
  inputCardError: { borderColor: '#FF3B30' },
  currencyPfx: { fontSize: 16, color: '#6C6C70', marginRight: 4 },
  input: { fontSize: 15, color: '#1C1C1E', paddingVertical: 11 },
  error: { fontSize: 12, color: '#FF3B30' },
  generalError: {
    fontSize: 13,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 4,
  },

  // Type picker
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  typeBtnOn: { backgroundColor: Colors.light.tint },
  typeTxt: { fontSize: 11, fontWeight: '600', color: '#8E8E93' },
  typeTxtOn: { color: '#fff' },

  // Color grid: 6 per row
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  swatchCheck: { fontSize: 16, color: '#fff', fontWeight: '700' },

  // Icon row
  iconRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconPreview: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconPreviewEmoji: { fontSize: 24, lineHeight: 30 },

  // Archive toggle
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
  toggleSub: { fontSize: 12, color: '#8E8E93' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WalletsManageScreen() {
  const db = useDatabase();

  const [wallets, setWallets] = useState<WalletWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [modalWallet, setModalWallet] = useState<WalletWithBalance | null | undefined>(
    undefined, // undefined = modal closed; null = create mode; WalletWithBalance = edit mode
  );

  const load = useCallback(async () => {
    try {
      setWallets(await getAllWalletsWithBalancesAll(db));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  const active = wallets.filter(w => w.is_active === 1);
  const archived = wallets.filter(w => w.is_active === 0);

  function openCreate() { setModalWallet(null); }
  function openEdit(w: WalletWithBalance) { setModalWallet(w); }
  function closeModal() { setModalWallet(undefined); }

  async function handleSaved() {
    closeModal();
    await load();
  }

  return (
    <SafeAreaView style={screenStyles.root} edges={['top']}>
      {/* Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={screenStyles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={screenStyles.backTxt}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={screenStyles.title}>Wallets</Text>
        <TouchableOpacity onPress={openCreate} style={screenStyles.addBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={screenStyles.addTxt}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={screenStyles.centerFill}>
          <ActivityIndicator color={Colors.light.tint} />
        </View>
      ) : error ? (
        <View style={screenStyles.centerFill}>
          <Text style={screenStyles.errorTxt}>Failed to load wallets</Text>
          <Text style={screenStyles.errorDetail}>{error.message}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Active wallets ─────────────────────────────────── */}
          {archived.length > 0 && (
            <Text style={screenStyles.sectionHeader}>ACTIVE</Text>
          )}
          <View style={screenStyles.card}>
            {active.length === 0 ? (
              <View style={screenStyles.emptyWrap}>
                <Text style={screenStyles.emptyTxt}>No active wallets</Text>
              </View>
            ) : (
              active.map((w, i) => (
                <View key={w.id}>
                  <WalletRow wallet={w} onEdit={() => openEdit(w)} />
                  {i < active.length - 1 && <View style={screenStyles.sep} />}
                </View>
              ))
            )}
          </View>

          {/* ── Archived wallets ────────────────────────────────── */}
          {archived.length > 0 && (
            <>
              <Text style={screenStyles.sectionHeader}>ARCHIVED</Text>
              <View style={screenStyles.card}>
                {archived.map((w, i) => (
                  <View key={w.id}>
                    <WalletRow wallet={w} onEdit={() => openEdit(w)} />
                    {i < archived.length - 1 && <View style={screenStyles.sep} />}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Edit / Create modal */}
      <WalletModal
        visible={modalWallet !== undefined}
        wallet={modalWallet ?? null}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  addBtn: { minWidth: 80, alignItems: 'flex-end' },
  addTxt: { fontSize: 16, color: Colors.light.tint, fontWeight: '500' },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 4 },

  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C6C70',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 72,
  },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTxt: { fontSize: 15, fontWeight: '600', color: '#FF3B30', marginBottom: 4 },
  errorDetail: { fontSize: 13, color: '#8E8E93', textAlign: 'center' },

  emptyWrap: { alignItems: 'center', paddingVertical: 28 },
  emptyTxt: { fontSize: 14, color: '#AEAEB2' },
});
