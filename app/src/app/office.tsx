import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLayoutSync } from '../sync/useLayoutSync';
import { StatusBadge } from '../ui/StatusBadge';
import { color } from '../ui/theme';

// Temporary: one fixed layout until the shared layout list replaces it.
const DEMO_LAYOUT = 'demo';

export default function OfficeScreen() {
  const sync = useLayoutSync(DEMO_LAYOUT, 'office');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBadge status={sync.status} pending={sync.pendingCount} />
      <View style={styles.body}>
        <Text style={styles.caption}>Watching layout from the field</Text>
        <Text style={styles.name}>{sync.view?.name ?? 'Waiting for Dana…'}</Text>
        <Text style={styles.meta}>Server seq {sync.lastSeq}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, padding: 20 },
  body: { flex: 1, justifyContent: 'center' },
  caption: { fontSize: 18, color: color.muted },
  name: { fontSize: 34, fontWeight: '800', color: color.ink },
  meta: { fontSize: 16, color: color.muted, marginTop: 8 },
});
