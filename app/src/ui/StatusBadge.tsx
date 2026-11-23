import { StyleSheet, Text, View } from 'react-native';
import type { SyncStatus } from '../sync/SyncClient';
import { color } from './theme';

const label: Record<SyncStatus, string> = {
  connecting: '○ Connecting',
  syncing: '◐ Syncing',
  online: '● Synced',
  offline: '○ Offline',
};

/** Sync status that never blocks work. Text + symbol, never colour alone, so it reads in bright sun. */
export function StatusBadge({ status, pending }: { status: SyncStatus; pending: number }) {
  const text = status === 'online' && pending > 0 ? `◐ Pending ${pending}` : label[status];
  const tint = status === 'online' ? (pending > 0 ? color.warn : color.ok) : status === 'offline' ? color.bad : color.muted;
  return (
    <View style={[styles.badge, { borderColor: tint }]}>
      <Text style={[styles.text, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  text: { fontSize: 18, fontWeight: '700' },
});
