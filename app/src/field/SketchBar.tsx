import { StyleSheet, Text, View } from 'react-native';
import { BigButton } from '../ui/BigButton';
import { color } from '../ui/theme';

/**
 * Controls while tapping out corners. Nothing is sent until the sketch is finished, and how it
 * is finished decides what it is: a closed shape (room, deck, patio) or an open line (fence).
 */
export function SketchBar({
  corners,
  onClose,
  onFinishOpen,
}: {
  corners: number;
  onClose: () => void;
  onFinishOpen: () => void;
}) {
  const hint =
    corners === 0
      ? 'Tap where the first corner is.'
      : corners < 3
        ? 'Tap the next corner. Lines snap to 15° and 6".'
        : 'Tap the yellow first corner to close, or finish as an open line.';
  return (
    <View style={styles.bar}>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.row}>
        {corners >= 3 && (
          <View style={styles.cell}>
            <BigButton label="Close shape" onPress={onClose} />
          </View>
        )}
        {corners >= 2 && (
          <View style={styles.cell}>
            <BigButton label="Done: open line" onPress={onFinishOpen} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: 12, gap: 10, borderTopWidth: 3, borderTopColor: color.ink, backgroundColor: color.paper },
  hint: { fontSize: 20, fontWeight: '700', color: color.ink },
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
});
