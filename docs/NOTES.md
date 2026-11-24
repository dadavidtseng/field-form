# Field Form: Notes

## Assumptions (all confirmed by Josh)

| Question | Assumed | Built |
|---|---|---|
| Sync scope | One-to-one, many-to-many if time allows | **Many-to-many**, with live counts of who has a space open |
| Offline | Dana keeps working and syncs later | **Yes.** Edits survive an app restart and replay in order. |
| Marcus editing | View and inspect; comments if time allows | **Yes, plus two-way comments.** The server rejects any other office edit. |
| Reviewer devices | Physical or emulators | **Both.** The server is found automatically. Tested on Android only. |

## Interaction decisions

- **Draw, then measure.** Dana taps corners, which snap to 15° and 6", so a gloved tap still makes a square room. I rejected freehand: gloved strokes are wobbly, and simplifying them guesses at corners. The sketch syncs as one edit when closed.
- **One highlighted slot at a time.** A tape press fills it and moves on; typing (`12' 4-3/8"`, `3760 mm`) is the fallback.
- **A sketch never looks measured:** estimates are dashed and marked `~` until a reading turns them solid.
- **Width first, then position** from the nearer corner, with a guide showing which distance to take.
- **Closing the shape checks the tape** (green, amber or red), and **every value records its source**, device and time.

## Field conditions and Marcus's needs

| Condition | Response |
|---|---|
| Gloves | Main actions are 64 dp (tape button, keypad, list rows); secondary chips are 44–52 dp, smaller on short landscape screens. No drag or long-press in the field flow. |
| Sun | Near-black on white; yellow only for the active slot; never colour alone |
| Rain | Undo always visible; deleting a space can be undone |
| No signal | Every edit is saved on the device first; a badge shows Offline or Pending |

**Marcus** gets the same canvas, live and read-only: pan, zoom, tap anything for its value in ft-in and mm and its source. The **Overview** gives perimeter, area and closure, and says *ready to quote* only when nothing is missing, no comment is open, every feature fits and the shape closes within an inch; otherwise it says why.

## Packages chosen and rejected

| Chosen | Over | Why |
|---|---|---|
| Skia + Reanimated + Gesture Handler | react-native-svg, PanResponder | Pan and zoom on the UI thread with no React render per frame; sharp at any zoom |
| Own op log | Yjs, Automerge | The server can check each edit by role. Yjs updates are opaque; Automerge needs WebAssembly, which Hermes lacks. |
| `node:sqlite` + `ws` | better-sqlite3, socket.io | No native build, so setup stays under 10 minutes |
| zod | hand-written checks | One schema validates input and types both sides |
| zustand + expo-sqlite | Redux, AsyncStorage | Small, and transactions for the offline queue |

Expo Go has no Bluetooth, so the tape and caliper are simulated behind one interface a real device can implement.

## Cuts and next week

**Cut:** walk-the-perimeter mode, dragging corners, step count, curved walls, multiple outlines, photos, PDF export.

**Next week:**

1. A server-address setting in the app (today: detected, or `EXPO_PUBLIC_SYNC_URL`).
2. Accounts with per-company spaces; today the role is picked on the first screen.
3. A hosted server with TLS, so crews sync from site.
4. Real Bluetooth tapes and calipers through a development build.
5. Testing on iOS and a real iPad.

## Where I spent the 24 hours

Twenty-four hours is a lesson in trade-offs, so I picked one theme and went deep: **how people collaborate on a layout.** That meant getting the architecture right first, so Dana-to-Marcus would also scale to many-to-many, and then testing phone-and-tablet sync over and over, offline and reconnecting included. The other person in that collaboration is standing in sun or rain, so I kept the field flow to a few large buttons and large text she can still read and hit with gloves on.

The last feature follows from the same theme: AI as a third collaborator. On site, Dana's hands are dirty and busy. With an assistant like Claude connected through MCP, she could ask by voice "What did I just measure, and what's still missing?" and dictate a note onto the wall she's standing at. Today the MCP server reads every space and comments as the office, through the same server rules, so it can never change a measurement. Next is a field-role assistant for those hands-free voice notes.
