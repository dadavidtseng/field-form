import { Pressable, StyleSheet, Text } from 'react-native';
import { TOUCH, color } from './theme';

/** Primary button sized for gloved hands (at least 64 dp tall). */
export function BigButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderRadius: 12,
    backgroundColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pressed: { opacity: 0.7 },
  label: { color: color.paper, fontSize: 22, fontWeight: '700' },
});
