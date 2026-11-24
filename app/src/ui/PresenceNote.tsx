import { StyleSheet, Text, View } from 'react-native';
import { color } from './theme';

/**
 * Who else has this space open, shown over the plan's corner (the header is full on phones).
 * Counts per role, so it reads the same for one Dana and one Marcus or a whole crew.
 */
export function PresenceNote({ others }: { others: { field: number; office: number } }) {
  const parts: string[] = [];
  if (others.office > 0) parts.push(others.office === 1 ? 'Office viewing' : `${others.office} in the office`);
  if (others.field > 0) parts.push(others.field === 1 ? '1 more in the field' : `${others.field} more in the field`);
  if (!parts.length) return null;
  return (
    <View style={styles.note} pointerEvents="none">
      <Text style={styles.text}>👁 {parts.join(' · ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.line,
    backgroundColor: color.paper,
  },
  text: { fontSize: 15, fontWeight: '700', color: color.muted },
});
