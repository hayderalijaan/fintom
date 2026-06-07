import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useDatabase } from '@/context/DatabaseContext';
import { importSpendeeCSV, type ImportSummary } from '@/utils/csv-import';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'running' | 'done';

interface RunResult {
  file_count: number;
  imported: number;
  skipped_duplicates: number;
  unmatched_categories: string[];
  unmatched_wallets: string[];
  file_errors: { name: string; message: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Setup view ───────────────────────────────────────────────────────────────

interface SetupProps {
  fromDate: string;
  dateError: string;
  selectedAssets: DocumentPickerAsset[];
  onDateChange: (v: string) => void;
  onPickFiles: () => void;
  onClearFiles: () => void;
  onRun: () => void;
}

function SetupView({
  fromDate,
  dateError,
  selectedAssets,
  onDateChange,
  onPickFiles,
  onClearFiles,
  onRun,
}: SetupProps) {
  const hasFiles = selectedAssets.length > 0;

  return (
    <>
      {/* ── Instructions ─────────────────────────────────── */}
      <View style={setupStyles.infoCard}>
        <Text style={setupStyles.infoTitle}>📋  Spendee CSV Format</Text>
        <Text style={setupStyles.infoBody}>
          Export from Spendee → Settings → Export Data → CSV. The file must have
          these columns in order:
        </Text>
        <Text style={setupStyles.infoCode}>
          Date, Wallet, Type, Category name, Amount, Currency, Note, Labels, Author
        </Text>
        <Text style={setupStyles.infoBody}>
          Wallet and category names are matched to your Fintom data automatically.
          Duplicate transactions are detected by content hash and skipped.
          Labels become tags.
        </Text>
      </View>

      {/* ── Date filter ──────────────────────────────────── */}
      <View style={setupStyles.section}>
        <Text style={setupStyles.label}>Import from date</Text>
        <View style={[setupStyles.inputCard, !!dateError && setupStyles.inputCardError]}>
          <TextInput
            style={setupStyles.input}
            value={fromDate}
            onChangeText={onDateChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#C7C7CC"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            maxLength={10}
          />
        </View>
        {!!dateError
          ? <Text style={setupStyles.fieldError}>{dateError}</Text>
          : <Text style={setupStyles.hint}>
              Only transactions on or after this date will be imported.
            </Text>
        }
      </View>

      {/* ── File picker ──────────────────────────────────── */}
      <View style={setupStyles.section}>
        <View style={setupStyles.pickerRow}>
          <Text style={setupStyles.label}>CSV files</Text>
          {hasFiles && (
            <TouchableOpacity onPress={onClearFiles} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={setupStyles.clearTxt}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={setupStyles.pickBtn}
          onPress={onPickFiles}
          activeOpacity={0.75}
        >
          <Text style={setupStyles.pickBtnIcon}>📂</Text>
          <Text style={setupStyles.pickBtnTxt}>
            {hasFiles ? 'Change Files' : 'Select Files'}
          </Text>
        </TouchableOpacity>

        {hasFiles && (
          <View style={setupStyles.fileList}>
            {selectedAssets.map((asset, i) => (
              <View
                key={`${asset.name}-${i}`}
                style={[
                  setupStyles.fileRow,
                  i < selectedAssets.length - 1 && setupStyles.fileRowBorder,
                ]}
              >
                <Text style={setupStyles.fileIcon}>📄</Text>
                <View style={setupStyles.fileBody}>
                  <Text style={setupStyles.fileName} numberOfLines={1}>{asset.name}</Text>
                  {asset.size != null && (
                    <Text style={setupStyles.fileSize}>{formatBytes(asset.size)}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Run button ────────────────────────────────────── */}
      <TouchableOpacity
        style={[setupStyles.runBtn, !hasFiles && setupStyles.runBtnDisabled]}
        onPress={onRun}
        disabled={!hasFiles}
        activeOpacity={0.85}
      >
        <Text style={[setupStyles.runBtnTxt, !hasFiles && setupStyles.runBtnTxtDisabled]}>
          Run Import
        </Text>
      </TouchableOpacity>
    </>
  );
}

const setupStyles = StyleSheet.create({
  infoCard: {
    backgroundColor: '#EAF9F3',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: `${Colors.light.tint}40`,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  infoBody:  { fontSize: 13, color: '#3C3C43', lineHeight: 18 },
  infoCode:  {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#3C3C43',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    lineHeight: 17,
  },

  section: { gap: 8 },
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
  fieldError: { fontSize: 12, color: '#FF3B30' },
  hint: { fontSize: 12, color: '#8E8E93' },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearTxt: { fontSize: 14, color: '#FF3B30', fontWeight: '500' },

  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    paddingVertical: 14,
  },
  pickBtnIcon: { fontSize: 18 },
  pickBtnTxt:  { fontSize: 16, fontWeight: '600', color: Colors.light.tint },

  fileList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  fileRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  fileIcon: { fontSize: 18, flexShrink: 0 },
  fileBody: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  fileSize: { fontSize: 12, color: '#8E8E93', marginTop: 1 },

  runBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  runBtnDisabled: { backgroundColor: '#E5E5EA' },
  runBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
  runBtnTxtDisabled: { color: '#8E8E93' },
});

// ─── Running view ─────────────────────────────────────────────────────────────

function RunningView({
  progress,
  assets,
}: {
  progress: { current: number; total: number } | null;
  assets: DocumentPickerAsset[];
}) {
  const currentAsset =
    progress != null ? assets[progress.current - 1] : null;

  return (
    <View style={runStyles.wrap}>
      <ActivityIndicator size="large" color={Colors.light.tint} />

      {progress && (
        <>
          <Text style={runStyles.progressTxt}>
            Processing file {progress.current} of {progress.total}
          </Text>
          {currentAsset && (
            <Text style={runStyles.fileName} numberOfLines={2}>
              {currentAsset.name}
            </Text>
          )}
        </>
      )}

      <Text style={runStyles.hint}>
        Please keep the app open while importing.
      </Text>
    </View>
  );
}

const runStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  progressTxt: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  fileName: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  hint: { fontSize: 13, color: '#C7C7CC', textAlign: 'center' },
});

// ─── Done view ────────────────────────────────────────────────────────────────

function DoneView({ result }: { result: RunResult }) {
  const hasWarnings =
    result.unmatched_categories.length > 0 || result.unmatched_wallets.length > 0;
  const hasErrors = result.file_errors.length > 0;
  const allFailed =
    result.imported === 0 && result.skipped_duplicates === 0 && hasErrors;

  return (
    <View style={doneStyles.wrap}>
      {/* ── Hero ─────────────────────────────────────────── */}
      <Text style={doneStyles.heroIcon}>{allFailed ? '❌' : '✅'}</Text>
      <Text style={doneStyles.heroTitle}>
        {allFailed ? 'Import failed' : 'Import complete'}
      </Text>
      {result.file_count > 1 && (
        <Text style={doneStyles.heroSub}>
          {result.file_count} files processed
        </Text>
      )}

      {/* ── Stats card ───────────────────────────────────── */}
      <View style={doneStyles.card}>
        <StatRow
          label="Imported"
          value={result.imported.toLocaleString('de-DE')}
          valueColor={result.imported > 0 ? '#34C759' : '#1C1C1E'}
        />
        <View style={doneStyles.sep} />
        <StatRow
          label="Skipped (duplicates)"
          value={result.skipped_duplicates.toLocaleString('de-DE')}
          valueColor="#8E8E93"
        />
      </View>

      {/* ── Unmatched categories ─────────────────────────── */}
      {result.unmatched_categories.length > 0 && (
        <WarningBox
          icon="🏷️"
          title="Unmatched categories"
          subtitle="These were imported without a category. Create them in Settings → Categories to categorise retroactively."
          items={result.unmatched_categories}
        />
      )}

      {/* ── Unmatched wallets ────────────────────────────── */}
      {result.unmatched_wallets.length > 0 && (
        <WarningBox
          icon="💳"
          title="Unmatched wallets"
          subtitle="Transactions for these wallets were skipped. Add them in Settings → Wallets, then re-import."
          items={result.unmatched_wallets}
          isError
        />
      )}

      {/* ── File errors ──────────────────────────────────── */}
      {result.file_errors.length > 0 && (
        <View style={doneStyles.errorBox}>
          <Text style={doneStyles.errorBoxTitle}>❌  File errors</Text>
          {result.file_errors.map((fe, i) => (
            <View key={i} style={doneStyles.errorItem}>
              <Text style={doneStyles.errorFileName} numberOfLines={1}>{fe.name}</Text>
              <Text style={doneStyles.errorMsg}>{fe.message}</Text>
            </View>
          ))}
        </View>
      )}

      {!hasWarnings && !hasErrors && (
        <Text style={doneStyles.allGoodTxt}>
          Everything looks good.
        </Text>
      )}
    </View>
  );
}

function StatRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View style={doneStyles.statRow}>
      <Text style={doneStyles.statLabel}>{label}</Text>
      <Text style={[doneStyles.statValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function WarningBox({
  icon,
  title,
  subtitle,
  items,
  isError = false,
}: {
  icon: string;
  title: string;
  subtitle: string;
  items: string[];
  isError?: boolean;
}) {
  const bg     = isError ? '#FFF0F0' : '#FFFBF0';
  const border = isError ? '#FFD0D0' : '#FFE5A0';
  const color  = isError ? '#FF3B30' : '#FF9500';

  return (
    <View style={[doneStyles.warnBox, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[doneStyles.warnTitle, { color }]}>{icon}  {title}</Text>
      <Text style={doneStyles.warnSub}>{subtitle}</Text>
      <View style={doneStyles.warnItems}>
        {items.map((item, i) => (
          <View key={i} style={doneStyles.warnChip}>
            <Text style={[doneStyles.warnChipTxt, { color }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const doneStyles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: 16 },

  heroIcon:  { fontSize: 52, textAlign: 'center', marginTop: 8 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  heroSub:   { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginTop: -8 },

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
    marginLeft: 16,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statLabel: { flex: 1, fontSize: 15, color: '#3C3C43' },
  statValue: { fontSize: 20, fontWeight: '700' },

  warnBox: {
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
  },
  warnTitle: { fontSize: 14, fontWeight: '700' },
  warnSub:   { fontSize: 12, color: '#6C6C70', lineHeight: 17 },
  warnItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  warnChip: {
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  warnChipTxt: { fontSize: 12, fontWeight: '600' },

  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  errorBoxTitle: { fontSize: 14, fontWeight: '700', color: '#FF3B30' },
  errorItem: { gap: 2 },
  errorFileName: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  errorMsg: { fontSize: 12, color: '#FF3B30' },

  allGoodTxt: { fontSize: 14, color: '#34C759', textAlign: 'center', fontWeight: '500' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ImportScreen() {
  const db = useDatabase();

  const [phase, setPhase] = useState<Phase>('setup');
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [dateError, setDateError] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<DocumentPickerAsset[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  async function pickFiles() {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!res.canceled) {
      setSelectedAssets(res.assets);
    }
  }

  async function runImport() {
    if (!DATE_RE.test(fromDate)) {
      setDateError('Use YYYY-MM-DD format (e.g. 2026-01-01)');
      return;
    }
    setDateError('');
    setPhase('running');

    let imported = 0;
    let skipped  = 0;
    const unmatchedCats    = new Set<string>();
    const unmatchedWallets = new Set<string>();
    const fileErrors: RunResult['file_errors'] = [];

    for (let i = 0; i < selectedAssets.length; i++) {
      setProgress({ current: i + 1, total: selectedAssets.length });
      const asset = selectedAssets[i];

      try {
        const response = await fetch(asset.uri);
        const text = await response.text();
        const r: ImportSummary = await importSpendeeCSV(db, text, fromDate);

        imported += r.imported;
        skipped  += r.skipped_duplicates;
        r.unmatched_categories.forEach(c => unmatchedCats.add(c));
        r.unmatched_wallets.forEach(w => unmatchedWallets.add(w));
      } catch (e) {
        fileErrors.push({
          name: asset.name,
          message: e instanceof Error ? e.message.split('\n')[0] : 'Unknown error',
        });
      }
    }

    setResult({
      file_count: selectedAssets.length,
      imported,
      skipped_duplicates: skipped,
      unmatched_categories: [...unmatchedCats],
      unmatched_wallets:    [...unmatchedWallets],
      file_errors: fileErrors,
    });
    setPhase('done');
  }

  function handleDone() {
    router.back();
  }

  return (
    <SafeAreaView style={screenStyles.root} edges={['top']}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={screenStyles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={screenStyles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={screenStyles.backTxt}>‹ Settings</Text>
        </TouchableOpacity>
        <Text style={screenStyles.title}>Import CSV</Text>
        <View style={screenStyles.headerSpacer} />
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={screenStyles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'running' ? (
          <RunningView progress={progress} assets={selectedAssets} />
        ) : phase === 'done' && result ? (
          <>
            <DoneView result={result} />
            <TouchableOpacity
              style={screenStyles.doneBtn}
              onPress={handleDone}
              activeOpacity={0.85}
            >
              <Text style={screenStyles.doneBtnTxt}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <SetupView
            fromDate={fromDate}
            dateError={dateError}
            selectedAssets={selectedAssets}
            onDateChange={(v) => { setFromDate(v); setDateError(''); }}
            onPickFiles={pickFiles}
            onClearFiles={() => setSelectedAssets([])}
            onRun={runImport}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn:       { minWidth: 80 },
  backTxt:       { fontSize: 16, color: Colors.light.tint },
  title:         { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  headerSpacer:  { minWidth: 80 },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 20,
  },

  doneBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
