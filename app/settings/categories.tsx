import { router } from 'expo-router';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
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
  createCategory,
  getCategoriesAll,
  reorderCategories,
  updateCategory,
} from '@/db/queries/categories';
import type { Category, CategoryPriority, CategoryType } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ORDER: CategoryType[] = ['expense', 'income'];
const PRIORITY_ORDER: CategoryPriority[] = ['need', 'want', 'savings', 'none'];

const TYPE_LABEL: Record<CategoryType, string> = {
  expense: 'Expense',
  income:  'Income',
};

const PRIORITY_LABEL: Record<CategoryPriority, string> = {
  need:    'Need',
  want:    'Want',
  savings: 'Savings',
  none:    'Other',
};

const PRIORITY_COLOR: Record<CategoryPriority, string> = {
  need:    '#FF3B30',
  want:    '#007AFF',
  savings: '#34C759',
  none:    '#8E8E93',
};

const PRESET_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63',
  '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
  '#795548', '#F44336', '#3F51B5', '#009688',
  '#FFC107', '#8BC34A', '#673AB7', '#03A9F4',
];

// ─── Section model ────────────────────────────────────────────────────────────

interface SectionData {
  key: string;
  type: CategoryType;
  priority: CategoryPriority;
  items: Category[];
}

function buildSections(categories: Category[]): SectionData[] {
  const result: SectionData[] = [];
  for (const type of TYPE_ORDER) {
    for (const priority of PRIORITY_ORDER) {
      const items = categories.filter(c => c.type === type && c.priority === priority);
      if (items.length > 0) {
        result.push({ key: `${type}-${priority}`, type, priority, items });
      }
    }
  }
  return result;
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  item,
  drag,
  isActive,
  onEdit,
}: RenderItemParams<Category> & { onEdit: () => void }) {
  return (
    <ScaleDecorator activeScale={1.03}>
      <View style={[rowStyles.row, isActive && rowStyles.rowLifted]}>
        {/* Left: icon */}
        <TouchableOpacity
          onPress={onEdit}
          activeOpacity={0.65}
          style={rowStyles.contentArea}
        >
          <View style={[rowStyles.iconWrap, { backgroundColor: `${item.color}22` }]}>
            <Text style={rowStyles.icon}>{item.icon}</Text>
          </View>

          <Text style={rowStyles.name} numberOfLines={1}>{item.name}</Text>

          <View style={[rowStyles.badge, { backgroundColor: `${PRIORITY_COLOR[item.priority]}18` }]}>
            <Text style={[rowStyles.badgeTxt, { color: PRIORITY_COLOR[item.priority] }]}>
              {PRIORITY_LABEL[item.priority]}
            </Text>
          </View>

          {item.is_tax_relevant_default === 1 && (
            <Text style={rowStyles.taxIcon}>🧾</Text>
          )}
        </TouchableOpacity>

        {/* Right: drag handle */}
        <TouchableOpacity
          onPressIn={drag}
          style={rowStyles.dragHandle}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
        >
          <Text style={rowStyles.dragIcon}>⠿</Text>
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 10,
  },
  rowLifted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  contentArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },
  icon: { fontSize: 17, lineHeight: 22 },
  name: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1C1C1E', minWidth: 0 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    marginLeft: 7,
    flexShrink: 0,
  },
  badgeTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  taxIcon: { fontSize: 13, marginLeft: 6, flexShrink: 0 },
  dragHandle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragIcon: { fontSize: 18, color: '#C7C7CC', lineHeight: 22 },
});

// ─── Category modal ───────────────────────────────────────────────────────────

interface ModalProps {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  type: CategoryType;
  priority: CategoryPriority;
  color: string;
  icon: string;
  isTaxRelevant: boolean;
  isActive: boolean;
}

const FORM_DEFAULTS: FormState = {
  name: '',
  type: 'expense',
  priority: 'need',
  color: PRESET_COLORS[0],
  icon: '📦',
  isTaxRelevant: false,
  isActive: true,
};

function CategoryModal({ visible, category, onClose, onSaved }: ModalProps) {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const isEdit = category !== null;

  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (category) {
      setForm({
        name: category.name,
        type: category.type,
        priority: category.priority,
        color: category.color,
        icon: category.icon,
        isTaxRelevant: category.is_tax_relevant_default === 1,
        isActive: category.is_active === 1,
      });
    } else {
      setForm(FORM_DEFAULTS);
    }
    setErrors({});
    setSaving(false);
  }, [visible, category]);

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
        await updateCategory(db, category.id, {
          name: form.name.trim(),
          type: form.type,
          priority: form.priority,
          color: form.color,
          icon: form.icon || '📦',
          is_tax_relevant_default: form.isTaxRelevant ? 1 : 0,
          is_active: form.isActive ? 1 : 0,
        });
      } else {
        await createCategory(db, {
          name: form.name.trim(),
          type: form.type,
          priority: form.priority,
          color: form.color,
          icon: form.icon || '📦',
          is_tax_relevant_default: form.isTaxRelevant ? 1 : 0,
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
        <View style={sheetStyles.handle} />

        <View style={sheetStyles.header}>
          <TouchableOpacity onPress={onClose} style={sheetStyles.headerSide}>
            <Text style={sheetStyles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={sheetStyles.title}>
            {isEdit ? 'Edit Category' : 'New Category'}
          </Text>
          <View style={sheetStyles.headerSide} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={60}
        >
          <View style={{ flex: 1 }}>
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
                    placeholder="e.g. Groceries"
                    placeholderTextColor="#C7C7CC"
                    returnKeyType="done"
                    maxLength={50}
                    autoFocus={!isEdit}
                  />
                </View>
                {!!errors.name && <Text style={fieldStyles.error}>{errors.name}</Text>}
              </View>

              {/* ── Type ─────────────────────────────────────── */}
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>Type</Text>
                <View style={fieldStyles.segRow}>
                  {(['expense', 'income'] as CategoryType[]).map(t => {
                    const active = form.type === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[fieldStyles.segBtn, active && fieldStyles.segBtnOn]}
                        onPress={() => set('type', t)}
                        activeOpacity={0.7}
                      >
                        <Text style={[fieldStyles.segTxt, active && fieldStyles.segTxtOn]}>
                          {TYPE_LABEL[t]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Priority ─────────────────────────────────── */}
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>Priority</Text>
                <View style={fieldStyles.priorityGrid}>
                  {PRIORITY_ORDER.map(p => {
                    const active = form.priority === p;
                    const color = PRIORITY_COLOR[p];
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[
                          fieldStyles.priorityBtn,
                          active
                            ? { backgroundColor: color, borderColor: color }
                            : { borderColor: '#E5E5EA' },
                        ]}
                        onPress={() => set('priority', p)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          fieldStyles.priorityTxt,
                          { color: active ? '#fff' : color },
                        ]}>
                          {PRIORITY_LABEL[p]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── Color ────────────────────────────────────── */}
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

              {/* ── Icon ─────────────────────────────────────── */}
              <View style={fieldStyles.group}>
                <Text style={fieldStyles.label}>Icon</Text>
                <View style={fieldStyles.iconRow}>
                  <View style={[fieldStyles.iconPreview, { backgroundColor: `${form.color}22` }]}>
                    <Text style={fieldStyles.iconPreviewEmoji}>
                      {form.icon || '📦'}
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

              {/* ── Tax relevant ─────────────────────────────── */}
              <View style={fieldStyles.group}>
                <View style={fieldStyles.toggleCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldStyles.toggleLabel}>Tax Relevant Default</Text>
                    <Text style={fieldStyles.toggleSub}>
                      New transactions in this category are pre-marked as tax-relevant
                    </Text>
                  </View>
                  <Switch
                    value={form.isTaxRelevant}
                    onValueChange={v => set('isTaxRelevant', v)}
                    trackColor={{ false: '#E5E5EA', true: Colors.light.tint }}
                    ios_backgroundColor="#E5E5EA"
                  />
                </View>
              </View>

              {/* ── Archive toggle (edit only) ────────────────── */}
              {isEdit && (
                <View style={fieldStyles.group}>
                  <View style={fieldStyles.toggleCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={fieldStyles.toggleLabel}>Active</Text>
                      <Text style={fieldStyles.toggleSub}>
                        Archived categories are hidden from the transaction form
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
          </View>
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
                  {isEdit ? 'Save Changes' : 'Add Category'}
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
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
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

  // Type: 2-button segment
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  segBtnOn: { backgroundColor: Colors.light.tint },
  segTxt: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  segTxtOn: { color: '#fff' },

  // Priority: 4 pill buttons in a row
  priorityGrid: { flexDirection: 'row', gap: 8 },
  priorityBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  priorityTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Color swatches: 4 per row
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  swatchCheck: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // Icon
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

  // Toggles
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

export default function CategoriesManageScreen() {
  const db = useDatabase();

  const [sections, setSections] = useState<SectionData[]>([]);
  const [archived, setArchived] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [modalTarget, setModalTarget] = useState<Category | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const all = await getCategoriesAll(db);
      setSections(buildSections(all.filter(c => c.is_active === 1)));
      setArchived(all.filter(c => c.is_active === 0));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { load(); }, [load]);

  // ── Drag-to-reorder ─────────────────────────────────────────────────────────

  async function handleDragEnd(sectionKey: string, newItems: Category[]) {
    const newOrder = sections
      .flatMap(s => s.key === sectionKey ? newItems : s.items)
      .map(c => c.id);

    setSections(prev =>
      prev.map(s => s.key === sectionKey ? { ...s, items: newItems } : s),
    );

    try {
      await reorderCategories(db, newOrder);
    } catch {
      await load();
    }
  }

  // ── Modal helpers ───────────────────────────────────────────────────────────

  function openCreate() { setModalTarget(null); }
  function openEdit(c: Category) { setModalTarget(c); }
  function closeModal() { setModalTarget(undefined); }

  async function handleSaved() {
    closeModal();
    await load();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
        <Text style={screenStyles.title}>Categories</Text>
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
          <Text style={screenStyles.errorTxt}>Failed to load categories</Text>
          <Text style={screenStyles.errorDetail}>{error.message}</Text>
        </View>
      ) : (
        <NestableScrollContainer
          contentContainerStyle={screenStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section, idx) => {
            const prevSection = sections[idx - 1];
            const showTypeHeader = !prevSection || prevSection.type !== section.type;

            return (
              <View key={section.key}>
                {/* Type header (once per type) */}
                {showTypeHeader && (
                  <View style={[
                    screenStyles.typeHeaderWrap,
                    idx > 0 && { marginTop: 24 },
                  ]}>
                    <Text style={screenStyles.typeHeader}>
                      {TYPE_LABEL[section.type].toUpperCase()}
                    </Text>
                  </View>
                )}

                {/* Priority sub-header */}
                <View style={screenStyles.priorityHeaderWrap}>
                  <View style={[screenStyles.priorityDot, { backgroundColor: PRIORITY_COLOR[section.priority] }]} />
                  <Text style={[screenStyles.priorityHeader, { color: PRIORITY_COLOR[section.priority] }]}>
                    {PRIORITY_LABEL[section.priority]}
                  </Text>
                </View>

                {/* Draggable list for this section */}
                <View style={screenStyles.card}>
                  <NestableDraggableFlatList
                    data={section.items}
                    keyExtractor={item => item.id.toString()}
                    renderItem={(params) => (
                      <CategoryRow {...params} onEdit={() => openEdit(params.item)} />
                    )}
                    ItemSeparatorComponent={() => <View style={screenStyles.sep} />}
                    onDragEnd={({ data }) => handleDragEnd(section.key, data)}
                    scrollEnabled={false}
                    activationDistance={8}
                  />
                </View>
              </View>
            );
          })}

          {/* ── Archived section ─────────────────────────────────── */}
          {archived.length > 0 && (
            <View style={screenStyles.archivedSection}>
              <TouchableOpacity
                onPress={() => setArchivedExpanded(v => !v)}
                style={screenStyles.archivedToggle}
                activeOpacity={0.7}
              >
                <Text style={screenStyles.archivedHeader}>
                  ARCHIVED ({archived.length})
                </Text>
                <Text style={screenStyles.archivedChevron}>
                  {archivedExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {archivedExpanded && (
                <View style={[screenStyles.card, { opacity: 0.55 }]}>
                  {archived.map((cat, i) => (
                    <View key={cat.id}>
                      <TouchableOpacity
                        onPress={() => openEdit(cat)}
                        style={rowStyles.row}
                        activeOpacity={0.65}
                      >
                        <View style={rowStyles.contentArea}>
                          <View style={[rowStyles.iconWrap, { backgroundColor: `${cat.color}22` }]}>
                            <Text style={rowStyles.icon}>{cat.icon}</Text>
                          </View>
                          <Text style={rowStyles.name} numberOfLines={1}>{cat.name}</Text>
                          <View style={[rowStyles.badge, { backgroundColor: `${PRIORITY_COLOR[cat.priority]}18` }]}>
                            <Text style={[rowStyles.badgeTxt, { color: PRIORITY_COLOR[cat.priority] }]}>
                              {PRIORITY_LABEL[cat.priority]}
                            </Text>
                          </View>
                          {cat.is_tax_relevant_default === 1 && (
                            <Text style={rowStyles.taxIcon}>🧾</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      {i < archived.length - 1 && <View style={screenStyles.sep} />}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </NestableScrollContainer>
      )}

      <CategoryModal
        visible={modalTarget !== undefined}
        category={modalTarget ?? null}
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
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  addBtn: { minWidth: 80, alignItems: 'flex-end' },
  addTxt: { fontSize: 16, color: Colors.light.tint, fontWeight: '500' },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 4 },

  // Type header
  typeHeaderWrap: { marginBottom: 4 },
  typeHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },

  // Priority sub-header
  priorityHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 6,
    paddingLeft: 2,
  },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  priorityHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
    marginLeft: 63,
  },

  // Archived
  archivedSection: { marginTop: 28 },
  archivedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  archivedHeader: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  archivedChevron: { fontSize: 10, color: '#8E8E93' },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorTxt: { fontSize: 15, fontWeight: '600', color: '#FF3B30', marginBottom: 4 },
  errorDetail: { fontSize: 13, color: '#8E8E93', textAlign: 'center' },
});
