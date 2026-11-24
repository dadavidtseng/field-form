# Field Form: Notes

## Assumptions (all confirmed by Josh)

| Question | Assumed | Built |
|---|---|---|
| Sync scope | One-to-one, many-to-many if time allows | **Many-to-many**, with live counts of who has a space open |
| Offline | Dana keeps working and syncs later | **Yes.** Edits survive an app restart and replay in order. |
| Marcus editing | View and inspect; comments if time allows | **Yes, plus two-way comments.** The server rejects any other office edit. |
| Reviewer devices | Physical or emulators | **Both.** The server is found automatically. Tested on Android only. |

## Interaction decisions

- **Draw, then measure.** Dana taps corners, which snap to 15° and 6", so a gloved tap still makes a square room. I rejected freehand drawing: strokes with gloves are wobbly, and turning them into lines guesses at corners she didn't mean. The sketch is sent as one edit when she closes it, so Marcus never sees a half-drawn shape.
- **One highlighted slot at a time.** A tape press fills it and moves on, so measuring is button presses, not screen taps. Typing (`12' 4-3/8"`, `3760 mm`) is the fallback.
- **A sketch never looks measured.** Estimates are dashed and marked `~`; a reading turns the wall solid and re-flows the shape.
- **Width first, then position** from the nearer corner, with a guide showing which distance to take.
- **Closing the shape checks the tape:** measuring the last wall shows the error against the computed length in green, amber or red.
- **Every value records its source** (tape, caliper or typed), device and time.

## Field conditions and Marcus's needs

| Condition | Response |
|---|---|
| Gloves | Main actions are 64 dp (tape button, keypad, list rows); secondary chips are 44–52 dp, smaller on short landscape screens. No drag or long-press in the field flow. |
| Sun | Near-black on white; yellow only for the active slot; never colour alone |
| Rain | Undo always visible; deleting a space can be undone |
| No signal | Every edit is saved on the device first; a badge shows Offline or Pending |

**Marcus** gets the same canvas, live and read-only: pan, zoom, and tap anything for its value in ft-in and mm and its source. The **Overview** shows perimeter, area and closure, and says *ready to quote* only when nothing is missing, no comment is open, every feature fits its wall and the shape closes within an inch. Otherwise it says why not. Comments let him ask for a re-check without a phone call.

## Packages chosen and rejected

| Chosen | Over | Why |
|---|---|---|
| Skia + Reanimated + Gesture Handler | react-native-svg, PanResponder | Pan and zoom on the UI thread with no React render per frame; sharp at any zoom |
| Own op log | Yjs, Automerge | The server can check each edit by role. Yjs updates are opaque; Automerge needs WebAssembly, which Hermes lacks. |
| `node:sqlite` + `ws` | better-sqlite3, socket.io | No native build, so setup stays under 10 minutes |
| zod | hand-written checks | One schema validates input and types both sides |
| zustand + expo-sqlite | Redux, AsyncStorage | Small, and transactions for the offline queue |

Expo Go has no Bluetooth, so the tape and caliper are simulated behind one interface that a real device would implement in a development build.

## Cuts and next week

**Cut:** walk-the-perimeter mode, dragging corners, step count, curved walls, multiple outlines, photos, PDF export.

**Next week:**

1. A server-address setting in the app (today: detected, or `EXPO_PUBLIC_SYNC_URL`).
2. Accounts with per-company spaces; today the role is picked on the first screen.
3. A hosted server with TLS, so crews sync from site.
4. Real Bluetooth tapes and calipers through a development build.
5. Testing on iOS and a real iPad.

**Extra:** an MCP server lets Claude read spaces and comment as the office, for example to flag what's missing before a quote. It follows the same server rules, so it can't change measurements.
