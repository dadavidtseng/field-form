import { formatFeetInches, parseLength, type Um } from '@field-form/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TOUCH, color } from '../ui/theme';

const ROWS = [
  ['7', '8', '9', '⌫'],
  ['4', '5', '6', "'"],
  ['1', '2', '3', '"'],
  ['-', '0', '/', '.'],
];

/**
 * Full-width keypad for numbers read off a plan or called out by a teammate. Accepts what
 * people actually write (12' 4-3/8", 3/8", 150.5", 3760 mm) and shows how it was read before
 * it is saved, so a mistyped value is caught here rather than in the office.
 */
export function Keypad({
  title,
  onSubmit,
  onCancel,
  fill,
}: {
  title: string;
  onSubmit: (um: Um) => void;
  onCancel: () => void;
  /**
   * Fill the parent (the landscape side column) and share its height between the key rows,
   * instead of a bottom sheet with fixed-height keys that would not fit a short screen.
   */
  fill?: boolean;
}) {
  const [text, setText] = useState('');
  const parsed = parseLength(text);

  const press = (key: string) => {
    if (key === '⌫') setText((t) => t.slice(0, -1));
    else setText((t) => t + key);
  };

  return (
    <View style={[styles.sheet, fill && styles.fill]}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.display}>
        <Text style={styles.input}>{text || ' '}</Text>
        <Text style={[styles.preview, !parsed && text ? styles.bad : null]}>
          {text ? (parsed !== null ? `= ${formatFeetInches(parsed)}` : "Can't read that yet") : 'e.g. 12\' 4-3/8"'}
        </Text>
      </View>
      {ROWS.map((row) => (
        <View key={row.join()} style={[styles.row, fill && styles.rowFill]}>
          {row.map((k) => (
            <Key key={k} label={k} onPress={() => press(k)} />
          ))}
        </View>
      ))}
      <View style={[styles.row, fill && styles.rowFill]}>
        <Key label="mm" onPress={() => press(' mm')} />
        <Key label="Cancel" onPress={onCancel} />
        <Key label="Save" wide primary disabled={parsed === null} onPress={() => parsed !== null && onSubmit(parsed)} />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  wide,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        wide && styles.wide,
        primary && styles.primary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.keyText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    gap: 8,
    backgroundColor: color.paper,
    borderTopWidth: 3,
    borderTopColor: color.ink,
  },
  title: { fontSize: 20, fontWeight: '800', color: color.ink },
  display: { borderWidth: 2, borderColor: color.ink, borderRadius: 10, padding: 10 },
  input: { fontSize: 32, fontWeight: '800', color: color.ink },
  preview: { fontSize: 18, color: color.muted },
  bad: { color: color.bad },
  // Keys stretch to their row's height; the row sets the glove-sized minimum.
  row: { flexDirection: 'row', gap: 8, minHeight: TOUCH },
  fill: { top: 0 },
  // Rows share the column's height; keys stay at least 44 dp, the smallest comfortable target.
  rowFill: { flex: 1, minHeight: 44 },
  key: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wide: { flex: 2 },
  primary: { backgroundColor: color.ink },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
  keyText: { fontSize: 26, fontWeight: '800', color: color.ink },
  primaryText: { color: color.paper },
});
