import {
  formatFeetInches,
  formatLength,
  formatMillimetres,
  layoutSummary,
  type ClosureLevel,
  type Layout,
  type Slot,
} from '@field-form/shared';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color } from '../ui/theme';

const CLOSURE_TEXT: Record<ClosureLevel, string> = { ok: 'closes ✓', warn: 'check a wall', bad: 're-measure' };
const CLOSURE_COLOR: Record<ClosureLevel, string> = { ok: color.ok, warn: color.warn, bad: color.bad };

export interface Selection {
  title: string;
  slots: Slot[];
}

const time = (ts?: number) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';

/**
 * Marcus's read-only inspector. With something selected it shows every measurement in ft-in and
 * mm with where it came from; otherwise the numbers he quotes from and whether they are complete.
 */
export function InspectPanel({
  layout,
  selection,
  activeKey,
  onPick,
  onClear,
}: {
  layout: Layout;
  selection: Selection | null;
  activeKey: string | null;
  onPick: (key: string) => void;
  onClear: () => void;
}) {
  if (selection) {
    return (
      <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{selection.title}</Text>
          <Pressable accessibilityRole="button" onPress={onClear} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        {selection.slots.map((s) => (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            onPress={() => onPick(s.key)}
            style={[styles.row, s.key === activeKey && styles.rowActive]}
          >
            <Text style={styles.label}>
              {s.label.split(' · ')[1] ?? 'length'}
              {s.optional ? ' (optional)' : ''}
            </Text>
            {s.value !== null ? (
              <>
                <Text style={styles.value}>
                  {s.detail ? formatLength(s.value, 'imperial', true) : formatFeetInches(s.value)}{' '}
                  <Text style={styles.mm}>· {formatMillimetres(s.value, s.detail ? 2 : 0)}</Text>
                </Text>
                <Text style={styles.meta}>
                  {[s.dim?.source, s.dim?.device, time(s.dim?.capturedAt), s.dim?.capturedBy]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </>
            ) : (
              <Text style={styles.missing}>Not measured yet · sketch ~{formatFeetInches(s.estimateUm)}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  const sum = layoutSummary(layout);
  const remaining = sum.total - sum.measured;
  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Overview</Text>
      <Stat label={sum.areaSqFt === null ? 'Length' : 'Perimeter'} value={formatFeetInches(sum.perimeterUm)} />
      {sum.areaSqFt !== null && <Stat label="Area" value={`${sum.areaSqFt.toFixed(1)} sq ft`} />}
      {sum.closure && (
        <Text style={[styles.closure, { color: CLOSURE_COLOR[sum.closure.level] }]}>
          Off by {formatFeetInches(Math.abs(sum.closure.errorUm))} — {CLOSURE_TEXT[sum.closure.level]}
        </Text>
      )}
      <Text style={[styles.progress, remaining ? styles.notReady : styles.ready]}>
        {remaining
          ? `${remaining} measurement${remaining === 1 ? '' : 's'} still to take`
          : `All ${sum.total} measured · ready to quote`}
      </Text>
      <Text style={styles.hint}>Tap a wall, door or post to inspect it.</Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: color.paper },
  content: { padding: 16, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: color.ink },
  close: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 24, fontWeight: '800', color: color.ink },
  row: { padding: 12, borderWidth: 2, borderColor: color.line, borderRadius: 10, gap: 2 },
  rowActive: { borderColor: color.active, borderWidth: 3 },
  label: { fontSize: 16, color: color.muted, fontWeight: '700' },
  value: { fontSize: 26, fontWeight: '800', color: color.ink },
  mm: { fontSize: 18, fontWeight: '600', color: color.muted },
  meta: { fontSize: 14, color: color.muted },
  missing: { fontSize: 18, color: color.warn, fontWeight: '700' },
  closure: { fontSize: 18, fontWeight: '800' },
  progress: { fontSize: 18, fontWeight: '800' },
  ready: { color: color.ok },
  notReady: { color: color.warn },
  hint: { fontSize: 15, color: color.muted, marginTop: 8 },
});
