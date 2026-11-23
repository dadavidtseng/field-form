import { hitTest, type LayoutKind, type Pt } from '@field-form/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutCanvas } from '../../canvas/LayoutCanvas';
import { sampleRoomOp } from '../../dev/sampleRoom';
import { useLayoutSync } from '../../sync/useLayoutSync';
import { BigButton } from '../../ui/BigButton';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { StatusBadge } from '../../ui/StatusBadge';
import { color } from '../../ui/theme';

const TAP_RADIUS_PX = 32;

const KIND_LABEL: Record<LayoutKind, string> = {
  room: 'Room',
  deck: 'Deck',
  patio: 'Patio',
  fence: 'Fence',
  other: 'Space',
};

const timeLabel = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function FieldLayout() {
  const { id, create } = useLocalSearchParams<{ id: string; create?: LayoutKind }>();
  const sync = useLayoutSync(id, 'field');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const created = useRef(false);

  // A new layout is created by its first op, locally first, so this works without signal.
  useEffect(() => {
    if (!create || created.current) return;
    created.current = true;
    setError(sync.submit({ t: 'layout.create', name: `${KIND_LABEL[create]} · ${timeLabel()}`, kind: create }));
    router.setParams({ create: undefined });
  }, [create, sync]);

  const onTap = (p: Pt, umPerPx: number) => {
    if (!sync.view) return;
    setSelectedId(hitTest(sync.view, p, TAP_RADIUS_PX * umPerPx)?.id ?? null);
  };

  const empty = !sync.view || sync.view.outline.walls.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={sync.view?.name ?? 'Loading…'}
        onBack={() => router.back()}
        right={<StatusBadge status={sync.status} pending={sync.pendingCount} />}
      />
      <LayoutCanvas layout={sync.view} selectedId={selectedId} onTap={onTap} />
      {(error || sync.notice) && <Text style={styles.error}>{error ?? sync.notice}</Text>}
      <View style={styles.actions}>
        {empty && sync.view && (
          <BigButton label="Add sample room (temporary)" onPress={() => setError(sync.submit(sampleRoomOp()))} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  error: { fontSize: 18, color: color.bad, paddingHorizontal: 16, paddingTop: 8 },
  actions: { padding: 16, gap: 12 },
});
