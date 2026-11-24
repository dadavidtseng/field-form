import { StyleSheet, Text, View } from 'react-native';
import type { SyncStatus } from '../sync/SyncClient';
import { HEADER_CONTROL, HEADER_RADIUS, color } from './theme';

const label: Record<SyncStatus, string> = {
  connecting: '○ Connecting',
  syncing: '◐ Syncing',
  online: '● Synced',
  offline: '○ Offline',
};

/** Sync status that never blocks work. Text + symbol, never colour alone, so it reads in bright sun. */
export function StatusBadge({
  status,
  pending,
  compact,
}: {
  status: SyncStatus;
  pending: number;
  /** Phones: symbol (+ pending count) only, so the screen title keeps its room. */
  compact?: boolean;
}) {
  const full = status === 'online' && pending > 0 ? `◐ Pending ${pending}` : label[status];
  const text = compact ? (status === 'online' && pending > 0 ? `◐ ${pending}` : label[status].split(' ')[0]) : full;
  const tint =
    status === 'online' ? (pending > 0 ? color.warn : color.ok) : status === 'offline' ? color.bad : color.muted;
  return (
    <View style={[styles.badge, { borderColor: tint }]} accessibilityLabel={full}>
      <Text style={[styles.text, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    // minHeight, not height: very large system font sizes grow the badge instead of clipping it.
    minHeight: HEADER_CONTROL,
    minWidth: HEADER_CONTROL,
    borderWidth: 2,
    borderRadius: HEADER_RADIUS,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { fontSize: 18, fontWeight: '700' },
});
