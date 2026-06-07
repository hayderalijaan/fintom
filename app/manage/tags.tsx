import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
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
  createTag,
  deleteTag,
  getTagsWithCount,
  updateTag,
  type TagWithCount,
} from '@/db/queries/tags';

// ─── Constants ────────────────────────────────────────────────────────────────

// Seeded tag colors first, then a broad palette
const PRESET_COLORS = [
  '#1A1F71', '#2E77BC', '#2196F3', '#03A9F4',
  '#4CAF50', '#009688', '#8BC34A', '#00BCD4',
  '#FF9800', '#FFC107', '#FF5722', '#E91E63',
  '#9C27B0', '#673AB7', '#F44336', '#9E9E9E',
];

// ─── Tag row ──────────────────────────────────────────────────────────────────

function TagRow({
  tag,
  onPress,
  isLast,
}: {
  tag: TagWithCount;
  onPress: () => void;
  isLast: boolean;
}) {
  const txnLabel =
    tag.transaction_count === 0
      ? 'unused'
      : tag.transaction_count === 1
      ? '1 txn'
      : `${tag.transaction_count} txns`;

  return (
    <>
      <TouchableOpacity onPress={onPress} activeOpacity={0.65} style={rowStyles.row}>
        <View style={[rowStyles.dot, { backgroundColor: tag.color }]} />
        <Text style={rowStyles.name} numberOfLines={1}>{tag.name}</Text>
        <Text style={rowStyles.count}>{txnLabel}</Text>
        <Text style={rowStyles.chevron}>›</Text>
      </TouchableOpacity>
      {!isLast && <View style={rowStyles.sep} />}
    </>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 14,
    flexShrink: 0,
  },
  name:    { flex: 1, fontSize: 16, fontWeight: '500', color: '#1C1C1E' },
  count:   { fontSize: 14, color: '#8E8E93', marginRight: 8 },
  chevron: { fontSize: 20, color: '#C7C7CC', lineHeight: 22 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E5EA',
    marginLeft: 50,
  },
});

// ─── Modal ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  color: string;
}

const FORM_DEFAULTS: FormState = { name: '', color: PRESET_COLORS[0] };

interface ModalProps {
  visible: boolean;
  tag: TagWithCount | null;
  onClose: () => void;
  onSaved: () => void;
}

function TagModal({ visible, tag, onClose, onSaved }: ModalProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const isEdit = tag !== null;

  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm(tag ? { name: tag.name, color: tag.color } : FORM_DEFAULTS);
    setErrors({});
    setSaving(false);
    setDeleting(false);
  }, [visible, tag]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateTag(db, tag.id, { name: form.name.trim(), color: form.color });
      } else {
        await createTag(db, form.name.trim(), form.color);
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed.';
      const isDupe = msg.toLowerCase().includes('unique');
      setErrors({ _general: isDupe ? 'A tag with that name already exists.' : msg });
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!tag || deleting) return;
    const count = tag.transaction_count;
    const impact =
      count > 0
        ? `This will remove the tag from ${count} transaction${count === 1 ? '' : 's'}.`
        : 'This tag has not been used on any transactions.';

    Alert.alert(
      `Delete "${tag.name}"?`,
      `${impact} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTag(db, tag.id);
              onSaved();
            } catch {
              setDeleting(false);
              Alert.alert('Error', 'Could not delete the tag. Please try again.');
            }
          },
        },
      ],
    );
  }

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
          <Text style={sheetStyles.title}>{isEdit ? 'Edit Tag' : 'New Tag'}</Text>
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
                  placeholder="e.g. Amex"
                  placeholderTextColor="#C7C7CC"
                  returnKeyType="done"
                  maxLength={40}
                  autoFocus={!isEdit}
                />
              </View>
              {!!errors.name && <Text style={fieldStyles.error}>{errors.name}</Text>}
            </View>

            {/* ── Color ────────────────────────────────────── */}
            <View style={fieldStyles.group}>
              <View style={fieldStyles.colorHeader}>
                <Text style={fieldStyles.label}>Color</Text>
                <View style={[fieldStyles.colorPreview, { backgroundColor: form.color }]} />
              </View>
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

            {!!errors._general && (
              <Text style={fieldStyles.generalError}>{errors._general}</Text>
            )}

            {/* ── Delete (edit only) ────────────────────────── */}
            {isEdit && (
              <TouchableOpacity
                style={[fieldStyles.deleteBtn, deleting && fieldStyles.deleteBtnBusy]}
                onPress={confirmDelete}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting
                  ? <ActivityIndicator color="#FF3B30" />
                  : <Text style={fieldStyles.deleteTxt}>Delete Tag</Text>
                }
              </TouchableOpacity>
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
                  {isEdit ? 'Save Changes' : 'Add Tag'}
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
    maxHeight: '85%',
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
  scrollContent: { padding: 16, gap: 24, paddingBottom: 8 },
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

  colorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 5,
  },
  swatchCheck: { fontSize: 15, color: '#fff', fontWeight: '700' },

  deleteBtn: {
    backgroundColor: '#FFF0F0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFB3B3',
    marginTop: 4,
  },
  deleteBtnBusy: { opacity: 0.5 },
  deleteTxt: { fontSize: 15, fontWeight: '600', color: '#FF3B30' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TagsScreen() {
  const db = useDatabase();

  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [modalTarget, setModalTarget] = useState<TagWithCount | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setTags(await getTagsWithCount(db));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setModalTarget(null); }
  function openEdit(t: TagWithCount) { setModalTarget(t); }
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
        <Text style={screenStyles.title}>Tags</Text>
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
          <Text style={screenStyles.errorTxt}>Failed to load tags</Text>
          <Text style={screenStyles.errorDetail}>{error.message}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {tags.length === 0 ? (
            <View style={screenStyles.emptyWrap}>
              <Text style={screenStyles.emptyIcon}>🔖</Text>
              <Text style={screenStyles.emptyTitle}>No tags yet</Text>
              <Text style={screenStyles.emptySub}>
                Tap + Add to create your first tag
              </Text>
            </View>
          ) : (
            <View style={screenStyles.card}>
              {tags.map((tag, i) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  onPress={() => openEdit(tag)}
                  isLast={i === tags.length - 1}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <TagModal
        visible={modalTarget !== undefined}
        tag={modalTarget ?? null}
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

  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },

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

  emptyWrap: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  emptySub:   { fontSize: 14, color: '#8E8E93', textAlign: 'center', paddingHorizontal: 32 },

  centerFill:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTxt:    { fontSize: 15, fontWeight: '600', color: '#FF3B30', marginBottom: 4 },
  errorDetail: { fontSize: 13, color: '#8E8E93', textAlign: 'center' },
});
