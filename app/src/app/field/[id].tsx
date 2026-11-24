import {
  SimulatedCaliper,
  SimulatedTape,
  requiredProgress,
  closureCheck,
  featureFits,
  featureNames,
  hitTest,
  measureGuide,
  placePost,
  placeWallFeature,
  measureSlots,
  nextUnmeasured,
  snapCorner,
  targetKey,
  wallsFromCorners,
  type BaseOp,
  type Feature,
  type LayoutKind,
  type WallFeatureKind,
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
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutCanvas } from '../../canvas/LayoutCanvas';
import { CommentsPanel } from '../../comments/CommentsPanel';
import { commentTargetFor, commentsOn, pinsFor } from '../../comments/targets';
import { FeatureBar } from '../../field/FeatureBar';
import { Keypad } from '../../field/Keypad';
import { LayoutMenu } from '../../field/LayoutMenu';
import { MeasurePanel } from '../../field/MeasurePanel';
import { SketchBar } from '../../field/SketchBar';
import { useLayoutSync } from '../../sync/useLayoutSync';
import { BigButton } from '../../ui/BigButton';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { StatusBadge } from '../../ui/StatusBadge';
import { HEADER_CONTROL, HEADER_RADIUS, breakpoints, color } from '../../ui/theme';

const TAP_RADIUS_PX = 32;
/** `armedKey` value meaning "deliberately nothing selected". */
const NOTHING = 'nothing';

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
  const window = useWindowDimensions();
  // Phones get compact header controls so the space's name stays readable.
  const compact = window.width < breakpoints.compactBelow;
  // Landscape leaves too little height to stack controls under the canvas, so they go beside it.
  const sideBySide = window.width >= breakpoints.sideBySideFrom && window.width > window.height;
  // Phone landscape is short: shrink controls so they fit beside the plan (tablets keep full size).
  const dense = sideBySide && window.height < breakpoints.shortBelow;
  const { id, create } = useLocalSearchParams<{ id: string; create?: LayoutKind }>();
  const sync = useLayoutSync(id, 'field');
  const layout = sync.view;

  const [draft, setDraft] = useState<Pt[]>([]);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  /** Where the armed wall was tapped: a new door/window goes there. */
  const [lastWallTap, setLastWallTap] = useState<Pt | null>(null);
  const [placingPost, setPlacingPost] = useState(false);
  const [keypad, setKeypad] = useState<null | 'manual' | 'next'>(null);
  const [nextOverride, setNextOverride] = useState<Um | null>(null);
  const [realisticError, setRealisticError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const tape = useMemo(() => new SimulatedTape(), []);
  const caliper = useMemo(() => new SimulatedCaliper(), []);
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
  // No explicit choice → arm the next empty slot (keeps TAPE → TAPE flowing). An explicit
  // "nothing" (tap on empty space) arms nothing until Dana taps a wall or feature.
  const armed: Slot | null =
    armedKey === NOTHING ? null : (slots.find((s) => s.key === armedKey) ?? nextUnmeasured(slots));
  const nextReading = nextOverride ?? armed?.estimateUm ?? 0;
  const slotsOf = (featureId: string) =>
    slots.filter((s) => s.target.kind === 'feature' && s.target.featureId === featureId);

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
  useEffect(() => {
    const offTape = tape.onReading((r) => onReading(r));
    const offCaliper = caliper.onReading((r) => onReading(r));
    return () => {
      offTape();
      offCaliper();
    };
  }, [tape, caliper]);

  const tapWhileMeasuring = (p: Pt, radius: number) => {
    if (!layout) return;
    if (placingPost) return addPost(p);
    const hit = hitTest(layout, p, radius);
    if (!hit) {
      setArmedKey(NOTHING); // tap on empty space deselects, as on the office screen
      setLastWallTap(null);
      setNextOverride(null);
      return;
    }
    setNextOverride(null);
    if (hit.kind === 'feature') {
      const own = slotsOf(hit.id);
      const current = own.findIndex((s) => s.key === armed?.key);
      // Tapping the armed feature again steps to its next measurement; otherwise arm its first
      // empty measurement, or its first one to re-measure.
      const next = current >= 0 ? own[(current + 1) % own.length] : (own.find((s) => s.value === null) ?? own[0]);
      setArmedKey(next?.key ?? null);
      return;
    }
    const target =
      hit.id === layout.outline.closingWallId
        ? ({ kind: 'closing' } as const)
        : ({ kind: 'wall', wallId: hit.id } as const);
    setArmedKey(targetKey(target));
    setLastWallTap(p);
  };

  // ---- features ----

  /** Add a feature and arm its first measurement, so the next tape press measures it. */
  const addFeature = (feature: Feature | null, firstField: string) => {
    if (!feature) return;
    const err = sync.submit({ t: 'feature.add', feature });
    setError(err);
    if (err) return;
    setArmedKey(targetKey({ kind: 'feature', featureId: feature.id, field: firstField }));
    setNextOverride(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const addWallFeature = (kind: WallFeatureKind) => {
    if (!layout || !armedWallId) return;
    addFeature(placeWallFeature(layout, armedWallId, kind, randomUUID(), lastWallTap ?? undefined), 'width');
  };

  function addPost(p: Pt) {
    setPlacingPost(false);
    if (layout) addFeature(placePost(layout, p, randomUUID()), 'dx');
  }

  const removeArmedFeature = () => {
    if (!armedFeatureId) return;
    run({ t: 'feature.remove', id: armedFeatureId });
    setArmedKey(null);
  };

  const onTap = (p: Pt, umPerPx: number) =>
    sketching ? tapWhileSketching(p, TAP_RADIUS_PX * umPerPx) : tapWhileMeasuring(p, TAP_RADIUS_PX * umPerPx);

  const undo = () => {
    if (draft.length) return setDraft(draft.slice(0, -1)); // sketch corners are local until finished
    setError(sync.undo());
  };

  const armedWallId =
    armed?.target.kind === 'wall'
      ? armed.target.wallId
      : armed?.target.kind === 'closing'
        ? (layout?.outline.closingWallId ?? null)
        : null;
  const armedFeatureId = armed?.target.kind === 'feature' ? armed.target.featureId : null;
  const armedFeature = armedFeatureId ? layout?.features[armedFeatureId] : undefined;
  const names = layout ? featureNames(layout) : {};
  const progress = requiredProgress(slots);

  // Comments follow the selection: the armed wall or feature, or the whole space.
  const commentTarget = layout ? commentTargetFor(layout, armed?.target ?? null) : null;
  const targetComments = layout ? commentsOn(layout, commentTarget) : [];
  const openHere = targetComments.filter((c) => !c.resolved).length;
  const commentTitle = !commentTarget
    ? 'This space'
    : commentTarget.kind === 'feature'
      ? (names[commentTarget.featureId] ?? 'Feature')
      : (armed?.label ?? 'Wall');
  // Fine detail (post size) is taken with calipers; everything else with the tape.
  const device = armed?.detail ? caliper : tape;

  const header = (
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
            <Text style={styles.undoText}>{compact ? '↶' : '↶ Undo'}</Text>
          </Pressable>
          <StatusBadge status={sync.status} pending={sync.pendingCount} compact={compact} />
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
  );

  const canvas = (
    <LayoutCanvas
      layout={layout}
      selectedId={sketching ? null : (armedFeatureId ?? armedWallId)}
      guide={!sketching && layout && armed ? measureGuide(layout, armed.target) : null}
      onTap={onTap}
      draft={draft}
      pins={layout ? pinsFor(layout) : undefined}
    />
  );

  const controls = (
    <>
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
          <>
            <FeatureBar
              wallArmed={!!armedWallId}
              featureName={armedFeatureId ? (names[armedFeatureId] ?? null) : null}
              placingPost={placingPost}
              misfit={!!(layout && armedFeature && !featureFits(layout, armedFeature))}
              onAdd={addWallFeature}
              onPost={() => setPlacingPost(!placingPost)}
              onRemove={removeArmedFeature}
              fields={(armedFeatureId ? slotsOf(armedFeatureId) : []).map((s) => ({
                key: s.key,
                label: s.label.split(' · ')[1] ?? s.label,
                active: s.key === armed?.key,
                measured: s.value !== null,
              }))}
              dense={dense}
              commentLabel={openHere ? `Comments (${openHere})` : 'Comment'}
              onComments={() => setCommentsOpen(true)}
              onPickField={(key) => {
                setArmedKey(key);
                setNextOverride(null);
              }}
            />
            <MeasurePanel
              slot={armed}
              measuredCount={progress.measured}
              totalCount={progress.total}
              deviceLabel={armed?.detail ? 'CALIPER' : 'TAPE'}
              nextReading={nextReading}
              realisticError={realisticError}
              closure={closureCheck(layout)}
              onTape={() => device.press(nextReading, realisticError)}
              onManual={() => setKeypad('manual')}
              onEditNext={() => setKeypad('next')}
              onToggleError={setRealisticError}
              dense={dense}
            />
          </>
        ))}
    </>
  );

  // Rendered inside the side column in landscape (so they never cover the plan), else over the screen.
  const overlays = (
    <>
      {commentsOpen && layout && (
        <View style={[styles.sheet, sideBySide && styles.sheetFill]}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <CommentsPanel
              title={`Comments · ${commentTitle}`}
              comments={targetComments}
              onAdd={(tag, text) =>
                run({
                  t: 'comment.add',
                  comment: {
                    id: randomUUID(),
                    target: commentTarget,
                    tag,
                    text,
                    by: 'field',
                    at: Date.now(),
                    resolved: false,
                  },
                })
              }
              onToggle={(commentId, resolved) => run({ t: 'comment.resolve', id: commentId, resolved })}
            />
            <BigButton label="Close" onPress={() => setCommentsOpen(false)} />
          </ScrollView>
        </View>
      )}
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
          fill={sideBySide}
          title={keypad === 'manual' ? `Type ${armed.label}` : 'Set the next tape reading'}
          onCancel={() => setKeypad(null)}
          onSubmit={(um) => {
            setKeypad(null);
            if (keypad === 'manual') record(um, 'manual');
            else setNextOverride(um);
          }}
        />
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {header}
      {sideBySide ? (
        <View style={styles.row}>
          <View style={styles.flex}>{canvas}</View>
          <View style={styles.side}>
            <ScrollView contentContainerStyle={styles.sideContent} persistentScrollbar>
              {controls}
            </ScrollView>
            {overlays}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.flex}>{canvas}</View>
          {controls}
          {overlays}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  flex: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: 380, borderLeftWidth: 2, borderLeftColor: color.line },
  sideContent: { flexGrow: 1, justifyContent: 'flex-end' },
  error: { fontSize: 18, color: color.bad, paddingHorizontal: 16, paddingVertical: 6 },
  undo: {
    minHeight: HEADER_CONTROL,
    minWidth: HEADER_CONTROL,
    paddingHorizontal: 12,
    borderRadius: HEADER_RADIUS,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoText: { fontSize: 18, fontWeight: '800', color: color.ink },
  menu: {
    minWidth: HEADER_CONTROL,
    minHeight: HEADER_CONTROL,
    borderRadius: HEADER_RADIUS,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuText: { fontSize: 32, fontWeight: '900', color: color.ink },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    backgroundColor: color.paper,
    borderTopWidth: 3,
    borderTopColor: color.ink,
  },
  sheetFill: { top: 0, maxHeight: '100%' },
  sheetContent: { padding: 12, gap: 12 },
  deleted: { padding: 16, gap: 12, borderTopWidth: 3, borderTopColor: color.bad },
  deletedText: { fontSize: 20, fontWeight: '800', color: color.bad },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
});
