import type { WallFeatureKind } from '@field-form/shared';
import { createContext, useContext } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color } from '../ui/theme';

const WALL_FEATURES: { kind: WallFeatureKind; label: string }[] = [
  { kind: 'door', label: '+ Door' },
  { kind: 'window', label: '+ Window' },
  { kind: 'opening', label: '+ Opening' },
  { kind: 'step', label: '+ Step' },
];

/**
 * Marking features. With a wall armed, one tap adds a door/window/opening/step where the wall
 * was tapped. "+ Post" waits for a tap inside the space. With a feature armed, it can be removed.
 */
export function FeatureBar({
  wallArmed,
  featureName,
  fields,
  placingPost,
  misfit,
  onAdd,
  onPost,
  onRemove,
  onPickField,
  dense = false,
}: {
  wallArmed: boolean;
  /** Name of the armed feature ("Door 1"), or null when a wall or nothing is armed. */
  featureName: string | null;
  /** The armed feature's measurements, so any of them can be (re-)measured directly. */
  fields: { key: string; label: string; active: boolean; measured: boolean }[];
  placingPost: boolean;
  /** The armed feature runs past the end of its wall. */
  misfit: boolean;
  onAdd: (kind: WallFeatureKind) => void;
  onPost: () => void;
  onRemove: () => void;
  onPickField: (key: string) => void;
  /** Short screens (phone landscape): smaller chips so the controls fit beside the plan. */
  dense?: boolean;
}) {
  return (
    <DenseContext.Provider value={dense}>
      <FeatureBarBody
        wallArmed={wallArmed}
        featureName={featureName}
        fields={fields}
        placingPost={placingPost}
        misfit={misfit}
        onAdd={onAdd}
        onPost={onPost}
        onRemove={onRemove}
        onPickField={onPickField}
      />
    </DenseContext.Provider>
  );
}

/** Lets every chip in the row pick up the dense size without passing it through each call. */
const DenseContext = createContext(false);

function FeatureBarBody({
  wallArmed,
  featureName,
  fields,
  placingPost,
  misfit,
  onAdd,
  onPost,
  onRemove,
  onPickField,
}: Omit<Parameters<typeof FeatureBar>[0], 'dense'>) {
  const dense = useContext(DenseContext);
  if (placingPost) {
    return (
      <View style={styles.bar}>
        <Text style={styles.prompt}>Tap inside the space where the post is.</Text>
        <Chip label="Cancel" onPress={onPost} />
      </View>
    );
  }

  const fieldChips = featureName
    ? fields.map((f) => (
        <Chip
          key={f.key}
          label={`${f.measured ? '✓ ' : ''}${f.label}`}
          active={f.active}
          onPress={() => onPickField(f.key)}
        />
      ))
    : [];
  const actionChips = [
    ...(wallArmed ? WALL_FEATURES.map((f) => <Chip key={f.kind} label={f.label} onPress={() => onAdd(f.kind)} />) : []),
    <Chip key="post" label="+ Post" onPress={onPost} />,
    ...(featureName ? [<Chip key="remove" label={`Remove ${featureName}`} danger onPress={onRemove} />] : []),
  ];

  return (
    <View style={styles.bar}>
      {misfit && (
        <Text style={styles.warn}>{`${featureName} doesn't fit on its wall. Check its width and position.`}</Text>
      )}
      {dense ? (
        // Short screens: one sideways-scrolling strip, so more chips never push the
        // measure panel off the bottom.
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.strip}>
          {fieldChips}
          {actionChips}
        </ScrollView>
      ) : (
        <>
          {fieldChips.length > 0 && <View style={styles.row}>{fieldChips}</View>}
          <View style={styles.row}>{actionChips}</View>
        </>
      )}
    </View>
  );
}

function Chip({
  label,
  onPress,
  danger,
  active,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  const dense = useContext(DenseContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        dense && styles.chipDense,
        danger && styles.danger,
        active && styles.active,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, dense && styles.chipTextDense, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 8, gap: 6, backgroundColor: color.paper },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  strip: { gap: 8, paddingBottom: 4 },
  prompt: { fontSize: 18, fontWeight: '800', color: color.ink },
  warn: { fontSize: 16, fontWeight: '800', color: color.bad },
  chipDense: { minHeight: 44, paddingHorizontal: 12 },
  chip: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: color.ink,
    justifyContent: 'center',
  },
  chipText: { fontSize: 18, fontWeight: '800', color: color.ink },
  chipTextDense: { fontSize: 16 },
  danger: { borderColor: color.bad },
  active: { backgroundColor: color.active, borderWidth: 3 },
  dangerText: { color: color.bad },
  pressed: { opacity: 0.6 },
});
