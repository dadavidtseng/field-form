import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { BigButton } from '../ui/BigButton';
import { TOUCH, color } from '../ui/theme';

/**
 * Rename or delete the current space. Rename is occasional, so a text field is acceptable here;
 * delete always asks first, because a wet screen produces ghost taps.
 */
export function LayoutMenu({
  name,
  onRename,
  onDelete,
  onClose,
}: {
  name: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const trimmed = draft.trim();

  const confirmDelete = () =>
    Alert.alert(`Delete "${name}"?`, 'It disappears from every list. You can undo straight after.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);

  return (
    <View style={styles.sheet}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={() => trimmed && onRename(trimmed)}
      />
      <BigButton label="Save name" onPress={() => trimmed && onRename(trimmed)} />
      <View style={styles.danger}>
        <BigButton label="Delete space" onPress={confirmDelete} />
      </View>
      <BigButton label="Close" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 12,
    backgroundColor: color.paper,
    borderTopWidth: 3,
    borderTopColor: color.ink,
  },
  label: { fontSize: 18, fontWeight: '700', color: color.muted },
  input: {
    minHeight: TOUCH,
    borderWidth: 2,
    borderColor: color.ink,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 24,
    fontWeight: '700',
    color: color.ink,
  },
  danger: { borderWidth: 3, borderColor: color.bad, borderRadius: 14 },
});
