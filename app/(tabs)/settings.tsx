import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, type Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useDatabase } from '@/context/DatabaseContext';
import { useCategories } from '@/hooks/useCategories';
import { useTags } from '@/hooks/useTags';
import { useWallets } from '@/hooks/useWallets';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsRowProps {
  icon: string;
  iconBg: string;
  label: string;
  badge?: number | null;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function SettingsRow({ icon, iconBg, label, badge, right, onPress, disabled }: SettingsRowProps) {
  const content = (
    <View style={[rowStyles.row, disabled && rowStyles.rowDisabled]}>
      <View style={[rowStyles.iconWrap, { backgroundColor: iconBg }]}>
        <Text style={rowStyles.icon}>{icon}</Text>
      </View>
      <Text style={rowStyles.label} numberOfLines={1}>{label}</Text>
      <View style={rowStyles.rightSlot}>
        {badge != null && (
          <Text style={rowStyles.badge}>{badge}</Text>
        )}
        {right ?? (onPress && !disabled ? <Text style={rowStyles.chevron}>›</Text> : null)}
      </View>
    </View>
  );

  if (!onPress || disabled) return content;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      {content}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#fff',
    minHeight: 52,
  },
  rowDisabled: { opacity: 0.45 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  icon: { fontSize: 16, lineHeight: 20 },
  label: { flex: 1, fontSize: 16, color: '#1C1C1E' },
  rightSlot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  badge: { fontSize: 15, color: '#8E8E93' },
  chevron: { fontSize: 20, color: '#C7C7CC', lineHeight: 22 },
});

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.header}>{title}</Text>
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

function Separator() {
  return <View style={sectionStyles.separator} />;
}

const sectionStyles = StyleSheet.create({
  wrap: { marginBottom: 28 },
  header: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C6C70',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 62,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

const LOCK_KEY = 'face_id_lock_enabled';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const db = useDatabase();
  const { wallets } = useWallets();
  const { categories } = useCategories();
  const { tags } = useTags();

  const [recurringCount, setRecurringCount] = useState<number>(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  useEffect(() => {
    db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM recurring_rules WHERE is_active = 1',
    ).then(row => { if (row) setRecurringCount(row.count); }).catch(() => {});
  }, [db]);

  useEffect(() => {
    async function init() {
      const [hasHW, enrolled, stored] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        SecureStore.getItemAsync(LOCK_KEY),
      ]);
      setBiometricAvailable(hasHW && enrolled);
      setLockEnabled(stored === '1');
    }
    init();
  }, []);

  const toggleLock = useCallback(async (value: boolean) => {
    if (lockLoading) return;
    setLockLoading(true);
    try {
      if (value) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable Face ID lock',
          fallbackLabel: 'Use Passcode',
        });
        if (!result.success) return;
      }
      await SecureStore.setItemAsync(LOCK_KEY, value ? '1' : '0');
      setLockEnabled(value);
    } catch {
      Alert.alert('Error', 'Could not update Face ID lock setting.');
    } finally {
      setLockLoading(false);
    }
  }, [lockLoading]);

  const walletCount = wallets.length;
  const categoryCount = categories.length;
  const tagCount = tags.length;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Account ──────────────────────────────────────────────── */}
        <Section title="Account">
          <SettingsRow
            icon="💳"
            iconBg="#007AFF22"
            label="Wallets"
            badge={walletCount}
            onPress={() => router.push('/manage/wallets' as Href)}
          />
          <Separator />
          <SettingsRow
            icon="🏷️"
            iconBg="#FF950022"
            label="Categories"
            badge={categoryCount}
            onPress={() => router.push('/manage/categories' as Href)}
          />
          <Separator />
          <SettingsRow
            icon="🔖"
            iconBg="#AF52DE22"
            label="Tags"
            badge={tagCount}
            onPress={() => router.push('/manage/tags' as Href)}
          />
          <Separator />
          <SettingsRow
            icon="🔁"
            iconBg="#34C75922"
            label="Recurring Rules"
            badge={recurringCount}
            onPress={() => router.push('/manage/recurring' as Href)}
          />
        </Section>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <Section title="Data">
          <SettingsRow
            icon="📥"
            iconBg="#30B0C722"
            label="Import CSV"
            onPress={() => router.push('/import' as Href)}
          />
          <Separator />
          <SettingsRow
            icon="📤"
            iconBg="#8E8E9322"
            label="Export Data"
            disabled
            onPress={() => Alert.alert('Coming Soon', 'Export is planned for Phase 2.')}
          />
        </Section>

        {/* ── App ──────────────────────────────────────────────────── */}
        <Section title="App">
          <SettingsRow
            icon="🔒"
            iconBg="#1C1C1E22"
            label="Face ID Lock"
            disabled={!biometricAvailable}
            right={
              <Switch
                value={lockEnabled}
                onValueChange={toggleLock}
                disabled={!biometricAvailable || lockLoading}
                trackColor={{ false: '#E5E5EA', true: Colors.light.tint }}
                ios_backgroundColor="#E5E5EA"
              />
            }
          />
          <Separator />
          <SettingsRow
            icon="ℹ️"
            iconBg="#60798B22"
            label="Version"
            right={<Text style={styles.versionText}>{APP_VERSION}</Text>}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#F2F2F7',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  versionText: {
    fontSize: 15,
    color: '#8E8E93',
  },
});
