import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useDatabase } from '@/context/DatabaseContext';
import { createGoal } from '@/db/queries/goals';
import type { CreateGoalInput } from '@/db/queries/goals';
import { useGoals } from '@/hooks/useGoals';
import { useWallets } from '@/hooks/useWallets';
import type { Goal, GoalType } from '@/types';
import { formatEur } from '@/utils/currency';

// ─── Constants ────────────────────────────────────────────────────────────────

const TINT = Colors.light.tint;

const TYPE_META: Record<GoalType, { label: string; color: string }> = {
  savings:     { label: 'Savings',   color: '#2DC98E' },
  debt_payoff: { label: 'Debt',      color: '#FF6B6B' },
  milestone:   { label: 'Milestone', color: '#AF52DE' },
  fi:          { label: 'FI',        color: '#FF9F0A' },
};

const PRESET_COLORS = [
  '#2DC98E', '#FF6B6B', '#AF52DE', '#FF9F0A',
  '#007AFF', '#FF375F', '#34C759', '#5AC8FA',
];

const GOAL_TYPES: GoalType[] = ['savings', 'debt_payoff', 'milestone', 'fi'];

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
  return <Animated.View style={[{ backgroundColor: '#E0E0E0', borderRadius: 8 }, style, { opacity }]} />;
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: GoalType }) {
  const meta = TYPE_META[type];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: `${meta.color}20` }]}>
      <Text style={[badgeStyles.text, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  text:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── Goal progress bar ────────────────────────────────────────────────────────

function GoalProgressBar({ goal }: { goal: Goal }) {
  const pct = goal.target_cents > 0
    ? Math.min(goal.current_cents / goal.target_cents, 1)
    : 0;

  return (
    <View style={pbStyles.track}>
      <View style={[pbStyles.fill, { width: `${pct * 100}%`, backgroundColor: goal.color }]} />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: { height: 6, backgroundColor: '#F2F2F7', borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  fill:  { height: 6, borderRadius: 3 },
});

// ─── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: Goal }) {
  const pct = goal.target_cents > 0
    ? Math.min(goal.current_cents / goal.target_cents, 1)
    : 0;
  const pctDisplay = Math.round(pct * 100);
  const isDebt = goal.type === 'debt_payoff';

  return (
    <View style={cardStyles.card}>
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={[cardStyles.iconBox, { backgroundColor: `${goal.color}20` }]}>
          <Text style={cardStyles.icon}>{goal.icon}</Text>
        </View>
        <View style={cardStyles.titleBlock}>
          <Text style={cardStyles.name} numberOfLines={1}>{goal.name}</Text>
          <TypeBadge type={goal.type} />
        </View>
        <Text style={[cardStyles.pct, { color: goal.color }]}>{pctDisplay}%</Text>
      </View>

      {/* Progress bar */}
      <GoalProgressBar goal={goal} />

      {/* Amount row */}
      <View style={cardStyles.amountRow}>
        <View>
          <Text style={cardStyles.amountLabel}>{isDebt ? 'Paid off' : 'Saved'}</Text>
          <Text style={[cardStyles.amountValue, { color: goal.color }]}>
            {formatEur(goal.current_cents)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={cardStyles.amountLabel}>Target</Text>
          <Text style={cardStyles.amountValue}>{formatEur(goal.target_cents)}</Text>
        </View>
      </View>

      {/* Target date */}
      {goal.target_date && (
        <Text style={cardStyles.targetDate}>
          🎯 {new Date(goal.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 22 },
  titleBlock: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  pct: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  amountLabel: { fontSize: 11, fontWeight: '600', color: '#AEAEB2', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 },
  amountValue: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  targetDate: { fontSize: 12, color: '#AEAEB2', marginTop: 8 },
});

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ goals }: { goals: Goal[] }) {
  const totalTarget  = goals.reduce((s, g) => s + g.target_cents, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current_cents, 0);
  const overallPct = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

  return (
    <View style={stripStyles.strip}>
      <View style={stripStyles.item}>
        <Text style={stripStyles.label}>GOALS</Text>
        <Text style={stripStyles.value}>{goals.length}</Text>
      </View>
      <View style={stripStyles.divider} />
      <View style={stripStyles.item}>
        <Text style={stripStyles.label}>TOTAL SAVED</Text>
        <Text style={[stripStyles.value, { color: TINT }]}>{formatEur(totalCurrent)}</Text>
      </View>
      <View style={stripStyles.divider} />
      <View style={stripStyles.item}>
        <Text style={stripStyles.label}>OVERALL</Text>
        <Text style={stripStyles.value}>{overallPct}%</Text>
      </View>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  item: { flex: 1, alignItems: 'center' },
  label: { fontSize: 10, fontWeight: '700', color: '#AEAEB2', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', letterSpacing: -0.3 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginVertical: 4 },
});

// ─── Add Goal Modal ───────────────────────────────────────────────────────────

interface AddGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AddGoalModal({ visible, onClose, onSaved }: AddGoalModalProps) {
  const db = useDatabase();
  const { wallets } = useWallets();

  const [name, setName]           = useState('');
  const [icon, setIcon]           = useState('🎯');
  const [color, setColor]         = useState(PRESET_COLORS[0]);
  const [type, setType]           = useState<GoalType>('savings');
  const [targetRaw, setTargetRaw] = useState('');
  const [currentRaw, setCurrentRaw] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes]         = useState('');
  const [autoTrack, setAutoTrack] = useState(false);
  const [linkedWalletId, setLinkedWalletId] = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function reset() {
    setName(''); setIcon('🎯'); setColor(PRESET_COLORS[0]);
    setType('savings'); setTargetRaw(''); setCurrentRaw('');
    setTargetDate(''); setNotes(''); setAutoTrack(false);
    setLinkedWalletId(null); setError(null);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return; }
    const targetCents = Math.round(parseFloat(targetRaw.replace(',', '.')) * 100);
    if (!targetRaw || isNaN(targetCents) || targetCents <= 0) {
      setError('Target amount must be greater than 0');
      return;
    }
    const currentCents = currentRaw
      ? Math.round(parseFloat(currentRaw.replace(',', '.')) * 100)
      : 0;

    const input: CreateGoalInput = {
      name: name.trim(),
      icon,
      color,
      type,
      target_cents: targetCents,
      current_cents: currentCents,
      target_date: targetDate.trim() || null,
      notes: notes.trim() || null,
      is_auto_tracked: autoTrack ? 1 : 0,
      linked_wallet_id: linkedWalletId,
    };

    setSaving(true);
    try {
      await createGoal(db, input);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save goal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={modalStyles.root} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={handleClose} style={modalStyles.cancelBtn}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={modalStyles.title}>New Goal</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={modalStyles.saveBtn}>
              <Text style={[modalStyles.saveText, saving && { opacity: 0.5 }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={modalStyles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {error && <Text style={modalStyles.errorText}>{error}</Text>}

            {/* Icon + Name row */}
            <Text style={modalStyles.sectionLabel}>NAME</Text>
            <View style={modalStyles.iconNameRow}>
              <TextInput
                style={modalStyles.iconInput}
                value={icon}
                onChangeText={setIcon}
                maxLength={2}
              />
              <TextInput
                style={[modalStyles.input, { flex: 1 }]}
                placeholder="Goal name"
                placeholderTextColor="#AEAEB2"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Type */}
            <Text style={modalStyles.sectionLabel}>TYPE</Text>
            <View style={modalStyles.typeRow}>
              {GOAL_TYPES.map(t => {
                const meta = TYPE_META[t];
                const selected = type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      modalStyles.typePill,
                      selected && { backgroundColor: meta.color, borderColor: meta.color },
                    ]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[modalStyles.typePillText, selected && { color: '#fff' }]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Color */}
            <Text style={modalStyles.sectionLabel}>COLOR</Text>
            <View style={modalStyles.colorRow}>
              {PRESET_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[modalStyles.colorDot, { backgroundColor: c }, color === c && modalStyles.colorDotSelected]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            {/* Amounts */}
            <Text style={modalStyles.sectionLabel}>TARGET AMOUNT (€)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="0.00"
              placeholderTextColor="#AEAEB2"
              keyboardType="decimal-pad"
              value={targetRaw}
              onChangeText={setTargetRaw}
            />

            <Text style={modalStyles.sectionLabel}>CURRENT AMOUNT (€)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="0.00"
              placeholderTextColor="#AEAEB2"
              keyboardType="decimal-pad"
              value={currentRaw}
              onChangeText={setCurrentRaw}
            />

            {/* Target date */}
            <Text style={modalStyles.sectionLabel}>TARGET DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="2027-12-31"
              placeholderTextColor="#AEAEB2"
              value={targetDate}
              onChangeText={setTargetDate}
            />

            {/* Linked wallet */}
            <Text style={modalStyles.sectionLabel}>LINKED WALLET (OPTIONAL)</Text>
            <View style={modalStyles.walletRow}>
              <TouchableOpacity
                style={[
                  modalStyles.walletPill,
                  linkedWalletId === null && { backgroundColor: '#1C1C1E', borderColor: '#1C1C1E' },
                ]}
                onPress={() => setLinkedWalletId(null)}
              >
                <Text style={[modalStyles.walletPillText, linkedWalletId === null && { color: '#fff' }]}>
                  None
                </Text>
              </TouchableOpacity>
              {wallets.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={[
                    modalStyles.walletPill,
                    linkedWalletId === w.id && { backgroundColor: '#1C1C1E', borderColor: '#1C1C1E' },
                  ]}
                  onPress={() => setLinkedWalletId(w.id)}
                >
                  <Text style={[modalStyles.walletPillText, linkedWalletId === w.id && { color: '#fff' }]}>
                    {w.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Auto-track */}
            <View style={modalStyles.switchRow}>
              <View>
                <Text style={modalStyles.switchLabel}>Auto-track from wallet</Text>
                <Text style={modalStyles.switchSub}>Sync progress with linked wallet balance</Text>
              </View>
              <Switch
                value={autoTrack}
                onValueChange={setAutoTrack}
                trackColor={{ true: TINT }}
                thumbColor="#fff"
              />
            </View>

            {/* Notes */}
            <Text style={modalStyles.sectionLabel}>NOTES</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.notesInput]}
              placeholder="Optional notes…"
              placeholderTextColor="#AEAEB2"
              multiline
              value={notes}
              onChangeText={setNotes}
            />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { fontSize: 16, color: '#AEAEB2' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  saveBtn: { minWidth: 60, alignItems: 'flex-end' },
  saveText: { fontSize: 16, fontWeight: '700', color: TINT },

  content: { padding: 16, gap: 0 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AEAEB2',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 16,
  },

  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },

  iconNameRow: { flexDirection: 'row', gap: 10 },
  iconInput: {
    width: 50,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    fontSize: 22,
    textAlign: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#fff',
  },
  typePillText: { fontSize: 13, fontWeight: '600', color: '#6C6C70' },

  colorRow: { flexDirection: 'row', gap: 10 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: '#1C1C1E' },

  walletRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  walletPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#fff',
  },
  walletPillText: { fontSize: 13, fontWeight: '600', color: '#6C6C70' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginTop: 16,
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', marginBottom: 2 },
  switchSub: { fontSize: 12, color: '#AEAEB2' },

  errorText: { fontSize: 13, color: '#FF3B30', marginBottom: 4, textAlign: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { goals, loading, error, refetch } = useGoals();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();

  const hasMounted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasMounted.current) { hasMounted.current = true; return; }
      refetch();
    }, [refetch]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  async function handleGoalSaved() {
    setModalVisible(false);
    await refetch();
  }

  const header = (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>Goals</Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        {header}
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonPulse style={{ height: 68, borderRadius: 14 }} />
          {[0, 1, 2].map(i => (
            <SkeletonPulse key={i} style={{ height: 140, borderRadius: 16 }} />
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TINT} />
        }
      >
        {error && (
          <Text style={styles.errorText}>{error.message}</Text>
        )}

        {goals.length > 0 && <SummaryStrip goals={goals} />}

        {goals.map(g => <GoalCard key={g.id} goal={g} />)}

        {goals.length === 0 && !loading && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptyBody}>Tap the button below to add your first financial goal.</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating add button */}
      <View style={[styles.fabWrap, { bottom: tabBarHeight + 16 }]}>
        <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
          <Text style={styles.fabText}>+ Add Goal</Text>
        </TouchableOpacity>
      </View>

      <AddGoalModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSaved={handleGoalSaved}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  errorText: { fontSize: 13, color: '#FF3B30', textAlign: 'center', margin: 16 },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#AEAEB2', textAlign: 'center', lineHeight: 20 },

  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    backgroundColor: TINT,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 14,
    shadowColor: TINT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
});
