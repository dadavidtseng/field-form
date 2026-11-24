import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HEADER_CONTROL, TOUCH, color } from './theme';

/** Top bar: a glove-sized back button, a title, and optional controls on the right. */
export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: color.line,
    backgroundColor: color.paper,
  },
  // Wider than tall: still a glove-sized target (≥ 64 dp across) without a taller row.
  back: { width: TOUCH, minHeight: HEADER_CONTROL, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 44, lineHeight: 48, color: color.ink, fontWeight: '700' },
  title: { flex: 1, fontSize: 24, fontWeight: '800', color: color.ink },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
