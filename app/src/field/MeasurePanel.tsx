import { formatFeetInches, type ClosureLevel, type Slot, type Um } from '@field-form/shared';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { TOUCH, color } from '../ui/theme';

const CLOSURE_TEXT: Record<ClosureLevel, string> = {
  ok: 'closes ✓',
  warn: 'check a wall',
  bad: 're-measure',
};
const CLOSURE_COLOR: Record<ClosureLevel, string> = { ok: color.ok, warn: color.warn, bad: color.bad };

/**
 * The armed slot and the two ways to fill it. The tape button stands in for the button on
 * the physical tape: one press, no screen precision needed, then the next slot arms itself.
 */
export function MeasurePanel({
  slot,
  measuredCount,
  totalCount,
  nextReading,
  realisticError,
  closure,
  onTape,
  onManual,
  onEditNext,
  onToggleError,
  dense,
}: {
  slot: Slot | null;
  measuredCount: number;
  totalCount: number;
  nextReading: Um;
  realisticError: boolean;
  closure: { errorUm: Um; level: ClosureLevel } | null;
  onTape: () => void;
  onManual: () => void;
  onEditNext: () => void;
  onToggleError: (v: boolean) => void;
  /** Short screens (phone landscape): smaller type and buttons so the panel fits beside the plan. */
  dense?: boolean;
}) {
  return (
    <View style={[styles.panel, dense && styles.panelDense]}>
      <View style={styles.info}>
        {slot ? (
          <>
            <Text style={styles.armed}>{slot.label}</Text>
            <Text style={[styles.value, dense && styles.valueDense]}>
              {slot.value !== null ? formatFeetInches(slot.value) : `~${formatFeetInches(slot.estimateUm)}`}
            </Text>
            <Text style={styles.meta}>
              {measuredCount} of {totalCount} measured ·{' '}
              {slot.value !== null ? 're-measuring' : 'waiting for a reading'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.armed}>
              {measuredCount < totalCount ? 'Nothing selected' : `All ${totalCount} measured`}
            </Text>
            <Text style={styles.meta}>
              {measuredCount < totalCount
                ? `${totalCount - measuredCount} still to measure · tap a wall or feature to measure it`
                : 'Tap any wall or feature to re-measure it'}
            </Text>
          </>
        )}
        {closure && (
          <Text style={[styles.closure, { color: CLOSURE_COLOR[closure.level] }]}>
            {/* The size of the error comes first: it is the number Dana acts on. */}
            Off by {formatFeetInches(Math.abs(closure.errorUm))} — {CLOSURE_TEXT[closure.level]}
          </Text>
        )}
        <View style={styles.sim}>
          <Pressable accessibilityRole="button" onPress={onEditNext} style={styles.simButton}>
            <Text style={styles.simText}>Next: {formatFeetInches(nextReading)} ✎</Text>
          </Pressable>
          <Text style={styles.simText}>Simulate tape error</Text>
          <Switch value={realisticError} onValueChange={onToggleError} />
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tape reading"
          disabled={!slot}
          onPress={onTape}
          style={({ pressed }) => [
            styles.tape,
            dense && styles.tapeDense,
            !slot && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.tapeText}>TAPE</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!slot}
          onPress={onManual}
          style={({ pressed }) => [
            styles.manual,
            dense && styles.manualDense,
            !slot && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.manualText}>Type</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: 3,
    borderTopColor: color.active,
    backgroundColor: color.paper,
  },
  info: { flex: 1, gap: 2 },
  armed: { fontSize: 20, fontWeight: '800', color: color.ink },
  value: { fontSize: 34, fontWeight: '800', color: color.ink },
  meta: { fontSize: 16, color: color.muted },
  closure: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  sim: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  simButton: { minHeight: 44, justifyContent: 'center' },
  simText: { fontSize: 16, color: color.muted, fontWeight: '700' },
  buttons: { gap: 10, alignItems: 'center' },
  tape: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: color.active,
    borderWidth: 4,
    borderColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapeText: { fontSize: 24, fontWeight: '900', color: color.ink },
  manual: {
    minHeight: TOUCH - 8,
    width: 104,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualText: { fontSize: 20, fontWeight: '800', color: color.ink },
  panelDense: { paddingVertical: 8 },
  valueDense: { fontSize: 26 },
  tapeDense: { width: 84, height: 84, borderRadius: 42 },
  manualDense: { minHeight: 48, width: 84 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
