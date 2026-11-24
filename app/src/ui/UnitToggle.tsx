import { Pressable, StyleSheet, Text } from 'react-native';
import { useUnits } from '../state/units';
import { HEADER_CONTROL, HEADER_RADIUS, color } from './theme';

/** Switches this device between ft-in and metric display. */
export function UnitToggle() {
  const system = useUnits((s) => s.system);
  const toggle = useUnits((s) => s.toggle);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Units: ${system === 'imperial' ? 'feet and inches' : 'metric'}. Tap to switch.`}
      onPress={toggle}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{system === 'imperial' ? 'ft-in' : 'mm'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: HEADER_CONTROL,
    minWidth: HEADER_CONTROL,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: color.ink,
    borderRadius: HEADER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
  text: { fontSize: 18, fontWeight: '800', color: color.ink },
});
