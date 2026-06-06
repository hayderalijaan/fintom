import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useWallets, type WalletWithBalance } from '@/hooks/useWallets';
import { formatEur } from '@/utils/currency';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WALLET_TYPE_LABEL: Record<string, string> = {
  checking: 'Checking account',
  savings: 'Savings account',
  cash: 'Cash wallet',
  investment: 'Investment account',
  p2p: 'P2P account',
};

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

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonPulse style={styles.skeletonIcon} />
      <View style={styles.cardBody}>
        <SkeletonPulse style={{ height: 16, width: 120, marginBottom: 6 }} />
        <SkeletonPulse style={{ height: 12, width: 80 }} />
      </View>
      <SkeletonPulse style={{ height: 16, width: 72, borderRadius: 4 }} />
    </View>
  );
}

function SkeletonHeader() {
  return (
    <View style={styles.header}>
      <SkeletonPulse style={{ height: 14, width: 90, marginBottom: 10, alignSelf: 'center' }} />
      <SkeletonPulse style={{ height: 40, width: 180, marginBottom: 4, alignSelf: 'center', borderRadius: 6 }} />
    </View>
  );
}

// ─── Wallet card ─────────────────────────────────────────────────────────────

function WalletCard({ wallet }: { wallet: WalletWithBalance }) {
  const bal = wallet.current_balance_cents;
  const isNegative = bal < 0;

  return (
    <View style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: wallet.color + '22' }]}>
        <Text style={styles.iconEmoji}>{wallet.icon}</Text>
        <View style={[styles.colorDot, { backgroundColor: wallet.color }]} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.walletName} numberOfLines={1}>{wallet.name}</Text>
        <Text style={styles.walletType}>{WALLET_TYPE_LABEL[wallet.type] ?? wallet.type}</Text>
      </View>

      <View style={styles.cardRight}>
        <Text style={[styles.balanceText, isNegative && styles.balanceNegative]}>
          {formatEur(bal)}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WalletsScreen() {
  const { wallets, loading, error, refetch } = useWallets();
  const [refreshing, setRefreshing] = useState(false);

  const totalCents = wallets.reduce((sum, w) => sum + w.current_balance_cents, 0);
  const totalNegative = totalCents < 0;

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>My Wallets</Text>
        </View>
        <SkeletonHeader />
        <View style={styles.listContainer}>
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>My Wallets</Text>
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>Failed to load wallets</Text>
          <Text style={styles.errorDetail}>{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>My Wallets</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.light.tint}
          />
        }
      >
        {/* Total balance banner */}
        <View style={styles.header}>
          <Text style={styles.totalLabel}>Total Balance</Text>
          <Text style={[styles.totalAmount, totalNegative && styles.balanceNegative]}>
            {formatEur(totalCents)}
          </Text>
          <Text style={styles.walletCount}>
            {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
          </Text>
        </View>

        {/* Wallet list */}
        <View style={styles.listContainer}>
          {wallets.map((w) => <WalletCard key={w.id} wallet={w} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F5F5F5',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // ── Total balance header ──
  header: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9E9E9E',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  walletCount: {
    fontSize: 13,
    color: '#BDBDBD',
    marginTop: 6,
  },

  // ── Wallet list ──
  listContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },

  // ── Icon ──
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    position: 'relative',
  },
  iconEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
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

  // ── Card body ──
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  walletType: {
    fontSize: 13,
    color: '#9E9E9E',
  },

  // ── Card right ──
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  balanceText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  balanceNegative: {
    color: '#EF5350',
  },
  chevron: {
    fontSize: 20,
    color: '#BDBDBD',
    lineHeight: 22,
    marginTop: 1,
  },

  // ── Skeleton ──
  skeletonIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    marginRight: 14,
  },

  // ── Error ──
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF5350',
    marginBottom: 6,
  },
  errorDetail: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
  },
});
