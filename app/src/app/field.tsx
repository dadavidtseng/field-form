import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useLayoutSync } from '../sync/useLayoutSync';
import { BigButton } from '../ui/BigButton';
import { StatusBadge } from '../ui/StatusBadge';
import { color } from '../ui/theme';

// Skeleton: one fixed layout until the shared layout list lands (build step 3).
const DEMO_LAYOUT = 'demo';

const stamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function FieldScreen() {
  const sync = useLayoutSync(DEMO_LAYOUT, 'field');
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => string | null) => setError(fn());

  return (
    <SafeAreaView style={styles.root}>
      <StatusBadge status={sync.status} pending={sync.pendingCount} />
      <View style={styles.body}>
        <Text style={styles.caption}>Layout</Text>
        <Text style={styles.name}>{sync.view?.name ?? 'No layout yet'}</Text>
      </View>
      {error || sync.notice ? <Text style={styles.error}>{error ?? sync.notice}</Text> : null}
      <View style={styles.actions}>
        {sync.view ? (
          <BigButton
            label="Rename (sync test)"
            onPress={() => run(() => sync.submit({ t: 'layout.rename', name: `Kitchen · ${stamp()}` }))}
          />
        ) : (
          <BigButton
            label="Create layout"
            onPress={() => run(() => sync.submit({ t: 'layout.create', name: `Room · ${stamp()}`, kind: 'room' }))}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, padding: 20 },
  body: { flex: 1, justifyContent: 'center' },
  caption: { fontSize: 18, color: color.muted },
  name: { fontSize: 34, fontWeight: '800', color: color.ink },
  error: { fontSize: 18, color: color.bad, marginBottom: 12 },
  actions: { gap: 12 },
});
