import {
  SimulatedTape,
  closureCheck,
  hitTest,
  measureSlots,
  nextUnmeasured,
  snapCorner,
  targetKey,
  wallsFromCorners,
  type BaseOp,
  type LayoutKind,
  type Op,
  type Pt,
  type Reading,
  type Slot,
  type Um,
} from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutCanvas } from '../../canvas/LayoutCanvas';
import { Keypad } from '../../field/Keypad';
import { LayoutMenu } from '../../field/LayoutMenu';
import { MeasurePanel } from '../../field/MeasurePanel';
import { SketchBar } from '../../field/SketchBar';
import { useLayoutSync } from '../../sync/useLayoutSync';
import { BigButton } from '../../ui/BigButton';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { StatusBadge } from '../../ui/StatusBadge';
import { TOUCH, color } from '../../ui/theme';

const TAP_RADIUS_PX = 32;

const KIND_LABEL: Record<LayoutKind, string> = {
  room: 'Room',
  deck: 'Deck',
  patio: 'Patio',
  fence: 'Fence',
  other: 'Space',
};

const timeLabel = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Dana's screen: sketch the outline by tapping corners, then measure what was drawn. */
export default function FieldLayout() {
  useKeepAwake();
  const { id, create } = useLocalSearchParams<{ id: string; create?: LayoutKind }>();
  const sync = useLayoutSync(id, 'field');
  const layout = sync.view;

  const [draft, setDraft] = useState<Pt[]>([]);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [keypad, setKeypad] = useState<null | 'manual' | 'next'>(null);
  const [nextOverride, setNextOverride] = useState<Um | null>(null);
  const [realisticError, setRealisticError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tape = useMemo(() => new SimulatedTape(), []);
  const created = useRef(false);

  // A new layout is created by its first op, locally first, so this works without signal.
  useEffect(() => {
    if (!create || created.current) return;
    created.current = true;
    setError(sync.submit({ t: 'layout.create', name: `${KIND_LABEL[create]} · ${timeLabel()}`, kind: create }));
    router.setParams({ create: undefined });
  }, [create, sync]);

  const sketching = !!layout && layout.outline.walls.length === 0;
  const slots = useMemo(() => (layout ? measureSlots(layout) : []), [layout]);
  const armed: Slot | null = slots.find((s) => s.key === armedKey) ?? nextUnmeasured(slots);
  const nextReading = nextOverride ?? armed?.estimateUm ?? 0;

  const run = (op: Op) => setError(sync.submit(op));

  // ---- sketch ----

  const finishSketch = (close: boolean) => {
    const walls = wallsFromCorners(draft, randomUUID);
    const ops: BaseOp[] = walls.map((wall) => ({ t: 'wall.add', wall }));
    if (close) ops.push({ t: 'outline.close', closingWallId: randomUUID() });
    run({ t: 'batch', ops }); // one undo step, one commit
    setDraft([]);
    setArmedKey(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const tapWhileSketching = (p: Pt, radius: number) => {
    const first = draft[0];
    if (first && draft.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= radius) {
      return finishSketch(true);
    }
    const last = draft[draft.length - 1];
    setDraft([...draft, last ? snapCorner(last, p) : p]);
    void Haptics.selectionAsync();
  };

  // ---- measure ----

  const record = (value: Um, source: Reading['source'] | 'manual', device?: string) => {
    if (!armed) return;
    const err = sync.submit({
      t: 'dimension.set',
      target: armed.target,
      dim: { value, source, device, capturedAt: Date.now(), capturedBy: 'Field' },
    });
    setError(err);
    if (err) return;
    setNextOverride(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Auto-advance: treat this slot as filled and arm the next empty one.
    const filled = slots.map((s) => (s.key === armed.key ? { ...s, value } : s));
    setArmedKey(nextUnmeasured(filled, armed.key)?.key ?? null);
  };

  // Readings arrive from the device, not from the button handler, exactly as a Bluetooth tape would.
  const onReading = useEffectEvent((r: Reading) => record(r.value, r.source, r.device));
  useEffect(() => tape.onReading((r) => onReading(r)), [tape]);

  const tapWhileMeasuring = (p: Pt, radius: number) => {
    if (!layout) return;
    const hit = hitTest(layout, p, radius);
    if (hit?.kind !== 'wall') return;
    const target =
      hit.id === layout.outline.closingWallId
        ? ({ kind: 'closing' } as const)
        : ({ kind: 'wall', wallId: hit.id } as const);
    setArmedKey(targetKey(target));
    setNextOverride(null);
  };

  const onTap = (p: Pt, umPerPx: number) =>
    sketching ? tapWhileSketching(p, TAP_RADIUS_PX * umPerPx) : tapWhileMeasuring(p, TAP_RADIUS_PX * umPerPx);

  const undo = () => {
    if (draft.length) return setDraft(draft.slice(0, -1)); // sketch corners are local until finished
    setError(sync.undo());
  };

  const armedWallId =
    armed?.target.kind === 'wall' ? armed.target.wallId : armed ? layout?.outline.closingWallId : null;
  const measuredCount = slots.filter((s) => s.value !== null).length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title={layout?.name ?? 'Loading…'}
        onBack={() => router.back()}
        right={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo"
              disabled={!draft.length && !sync.canUndo}
              onPress={undo}
              style={({ pressed }) => [
                styles.undo,
                !draft.length && !sync.canUndo && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.undoText}>↶ Undo</Text>
            </Pressable>
            <StatusBadge status={sync.status} pending={sync.pendingCount} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rename or delete this space"
              disabled={!layout}
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [styles.menu, pressed && styles.pressed]}
            >
              <Text style={styles.menuText}>⋯</Text>
            </Pressable>
          </>
        }
      />
      <LayoutCanvas layout={layout} selectedId={sketching ? null : armedWallId} onTap={onTap} draft={draft} />
      {(error || sync.notice) && <Text style={styles.error}>{error ?? sync.notice}</Text>}
      {layout?.archived && (
        <View style={styles.deleted}>
          <Text style={styles.deletedText}>This space is deleted.</Text>
          <BigButton label="Restore" onPress={() => run({ t: 'layout.archive', archived: false })} />
        </View>
      )}
      {layout &&
        !layout.archived &&
        (sketching ? (
          <SketchBar
            corners={draft.length}
            onClose={() => finishSketch(true)}
            onFinishOpen={() => finishSketch(false)}
          />
        ) : (
          <MeasurePanel
            slot={armed}
            measuredCount={measuredCount}
            totalCount={slots.length}
            nextReading={nextReading}
            realisticError={realisticError}
            closure={closureCheck(layout)}
            onTape={() => tape.press(nextReading, realisticError)}
            onManual={() => setKeypad('manual')}
            onEditNext={() => setKeypad('next')}
            onToggleError={setRealisticError}
          />
        ))}
      {menuOpen && layout && (
        <LayoutMenu
          name={layout.name}
          onClose={() => setMenuOpen(false)}
          onRename={(name) => {
            setMenuOpen(false);
            run({ t: 'layout.rename', name });
          }}
          onDelete={() => {
            setMenuOpen(false);
            run({ t: 'layout.archive', archived: true });
          }}
        />
      )}
      {keypad && armed && (
        <Keypad
          title={keypad === 'manual' ? `Type ${armed.label}` : 'Set the next tape reading'}
          onCancel={() => setKeypad(null)}
          onSubmit={(um) => {
            setKeypad(null);
            if (keypad === 'manual') record(um, 'manual');
            else setNextOverride(um);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  error: { fontSize: 18, color: color.bad, paddingHorizontal: 16, paddingVertical: 6 },
  undo: {
    minHeight: TOUCH - 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
  },
  undoText: { fontSize: 18, fontWeight: '800', color: color.ink },
  menu: { width: TOUCH - 8, height: TOUCH - 8, justifyContent: 'center', alignItems: 'center' },
  menuText: { fontSize: 32, fontWeight: '900', color: color.ink },
  deleted: { padding: 16, gap: 12, borderTopWidth: 3, borderTopColor: color.bad },
  deletedText: { fontSize: 20, fontWeight: '800', color: color.bad },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
