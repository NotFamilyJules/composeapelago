// The note entry model: what the player has written so far and where the
// cursor is. Notes live inside bars (Guitar Pro style), so editing one bar
// never shifts the music in later bars.
//
// The cursor works like a real notation editor's caret. It is either
//   - ON an event  (slot < bar length)  -> you are editing that note, or
//   - IN a gap     (slot == bar length) -> an insertion point: the unfilled
//     tail of any bar that still has room, including completely empty bars.
// That second kind is what lets you refill an empty measure in the middle
// of the piece.
//
// Every function here is pure: it takes a state, returns a new state plus
// an optional error message for the UI to show. No React in this file.

import type { DurationId } from "./theory";
import { durationTicks } from "./theory";

export interface EntryEvent {
  kind: "note" | "rest";
  midi: number;          // ignored for rests
  duration: DurationId;
  dotted: boolean;
  tiedToNext: boolean;   // note is tied into the next note (same pitch)
}

export interface EntryCursor {
  barIndex: number;
  slot: number;          // index into the bar; == bar.length means the gap
}

export interface EntryState {
  bars: EntryEvent[][];  // one array of events per measure
  cursor: EntryCursor;
}

// An entry event with its computed position on the timeline.
export interface PlacedEvent extends EntryEvent {
  barIndex: number;
  indexInBar: number;
  flatIndex: number;
  startTick: number;
}

export interface EntryResult {
  state: EntryState;
  error?: string;
}

export function emptyEntry(measureCount: number): EntryState {
  return {
    bars: Array.from({ length: measureCount }, () => []),
    cursor: { barIndex: 0, slot: 0 },
  };
}

export function eventTicks(event: EntryEvent): number {
  return durationTicks(event.duration, event.dotted);
}

export function barUsedTicks(bar: EntryEvent[]): number {
  return bar.reduce((sum, event) => sum + eventTicks(event), 0);
}

// Lay every event out on the absolute tick timeline. Events in a bar are
// packed from the start of that bar, one after another.
export function flattenEntry(state: EntryState, barTicks: number): PlacedEvent[] {
  const placed: PlacedEvent[] = [];
  state.bars.forEach((bar, barIndex) => {
    let tick = barIndex * barTicks;
    bar.forEach((event, indexInBar) => {
      placed.push({ ...event, barIndex, indexInBar, flatIndex: placed.length, startTick: tick });
      tick += eventTicks(event);
    });
  });
  return placed;
}

export function totalEventCount(state: EntryState): number {
  return state.bars.reduce((sum, bar) => sum + bar.length, 0);
}

// True when the cursor sits on an actual event (edit mode), false when it
// sits in a gap (entry mode).
export function cursorOnEvent(state: EntryState): boolean {
  const bar = state.bars[state.cursor.barIndex];
  return bar !== undefined && state.cursor.slot < bar.length;
}

export function eventAtCursor(state: EntryState): EntryEvent | undefined {
  return state.bars[state.cursor.barIndex]?.[state.cursor.slot];
}

// The tick the cursor sits at: an event's start, or the first free tick of
// a gap. Playback starts here.
export function cursorTick(state: EntryState, barTicks: number): number {
  const { barIndex, slot } = state.cursor;
  const bar = state.bars[barIndex] ?? [];
  let tick = barIndex * barTicks;
  for (let i = 0; i < Math.min(slot, bar.length); i++) tick += eventTicks(bar[i]);
  return tick;
}

// Every place the cursor can be, in staff order: each bar's events, then
// its gap if the bar still has room. Empty bars contribute just their gap,
// which is exactly what makes them selectable.
export function cursorPositions(state: EntryState, barTicks: number): EntryCursor[] {
  const positions: EntryCursor[] = [];
  state.bars.forEach((bar, barIndex) => {
    bar.forEach((_, slot) => positions.push({ barIndex, slot }));
    if (barUsedTicks(bar) < barTicks) positions.push({ barIndex, slot: bar.length });
  });
  return positions;
}

function positionIndex(positions: EntryCursor[], cursor: EntryCursor): number {
  const exact = positions.findIndex(
    (pos) => pos.barIndex === cursor.barIndex && pos.slot === cursor.slot,
  );
  if (exact !== -1) return exact;
  // Cursor no longer exists (its bar filled up or an event vanished):
  // settle on the nearest position at or before it.
  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i];
    if (pos.barIndex < cursor.barIndex
      || (pos.barIndex === cursor.barIndex && pos.slot <= cursor.slot)) return i;
  }
  return 0;
}

// Moving needs the real barTicks so it knows which bars have gap stops.
export function moveCursorBy(state: EntryState, delta: number, barTicks: number): EntryState {
  return moveCursorWithin(state, delta, cursorPositions(state, barTicks));
}

function moveCursorWithin(state: EntryState, delta: number, positions: EntryCursor[]): EntryState {
  if (positions.length === 0) return state;
  const index = Math.max(0, Math.min(positions.length - 1, positionIndex(positions, state.cursor) + delta));
  return { ...state, cursor: positions[index] };
}

export function firstPosition(state: EntryState, barTicks: number): EntryCursor {
  return cursorPositions(state, barTicks)[0] ?? { barIndex: 0, slot: 0 };
}

export function lastPosition(state: EntryState, barTicks: number): EntryCursor {
  const positions = cursorPositions(state, barTicks);
  return positions[positions.length - 1] ?? { barIndex: 0, slot: 0 };
}

// After inserting an event, the caret jumps to the next gap: the same
// bar's tail if it still has room, otherwise the next unfilled bar. That
// keeps continuous typing flowing and lands on the next hole to fill.
function nextGapAfter(state: EntryState, barIndex: number, barTicks: number): EntryCursor {
  for (let b = barIndex; b < state.bars.length; b++) {
    if (barUsedTicks(state.bars[b]) < barTicks) return { barIndex: b, slot: state.bars[b].length };
  }
  return lastPosition(state, barTicks);
}

// Insert an event into a specific bar (at the end of what is already
// there). Enforces the bar rule: an event must fit inside the remaining
// space of its bar, no spilling across the barline (that is what ties are
// for).
export function insertEventInBar(
  state: EntryState, barIndex: number, event: EntryEvent, barTicks: number,
): EntryResult {
  if (barIndex >= state.bars.length) {
    return { state, error: "The song is full - no more bars." };
  }
  const remaining = barTicks - barUsedTicks(state.bars[barIndex]);
  if (eventTicks(event) > remaining) {
    if (remaining <= 0) {
      return { state, error: `Bar ${barIndex + 1} is already full.` };
    }
    return { state, error: `That rhythm exceeds the length of bar ${barIndex + 1}. Use a tie to cross the barline.` };
  }
  const bars = state.bars.map((bar, index) => (index === barIndex ? [...bar, event] : bar));
  const next: EntryState = { bars, cursor: state.cursor };
  return { state: { bars, cursor: nextGapAfter(next, barIndex, barTicks) } };
}

// Insert at the caret: the cursor's bar when it is a gap, or the bar of
// the event it sits on when that bar still has room behind it.
export function insertAtCursor(state: EntryState, event: EntryEvent, barTicks: number): EntryResult {
  return insertEventInBar(state, state.cursor.barIndex, event, barTicks);
}

// Swap out an event in place. The edited bar may end up shorter than a
// full measure (you then fix it by hand), but never longer.
export function replaceEvent(
  state: EntryState, barIndex: number, slot: number, event: EntryEvent, barTicks: number,
): EntryResult {
  const bar = state.bars[barIndex];
  if (!bar || slot >= bar.length) return { state };

  const newUsed = barUsedTicks(bar) - eventTicks(bar[slot]) + eventTicks(event);
  if (newUsed > barTicks) {
    return { state, error: `That rhythm exceeds the length of bar ${barIndex + 1}.` };
  }
  const bars = state.bars.map((b, index) =>
    index === barIndex ? b.map((e, i) => (i === slot ? event : e)) : b,
  );
  return { state: { bars, cursor: { barIndex, slot } } };
}

export function deleteEvent(state: EntryState, barIndex: number, slot: number, barTicks: number): EntryResult {
  const bar = state.bars[barIndex];
  if (!bar || slot >= bar.length) return { state };

  const bars = state.bars.map((b, index) =>
    index === barIndex ? b.filter((_, i) => i !== slot) : b,
  );
  // Land on the same spot, which is now the next event (or the bar's gap).
  const next: EntryState = { bars, cursor: { barIndex, slot } };
  const positions = cursorPositions(next, barTicks);
  return { state: { bars, cursor: positions[positionIndex(positions, next.cursor)] ?? { barIndex: 0, slot: 0 } } };
}

// The event backspace removes: the one under the cursor, or the one just
// before a gap cursor (the note you most recently typed).
export function backspaceTarget(state: EntryState): { barIndex: number; slot: number } | null {
  const { barIndex, slot } = state.cursor;
  if (cursorOnEvent(state)) return { barIndex, slot };
  if (slot > 0) return { barIndex, slot: slot - 1 };
  return null; // gap of an empty bar - nothing here to delete
}

// The pitch that "nearest octave" entry is measured against: the note under
// the cursor, or the closest note before it, or middle C.
export function referenceMidi(state: EntryState): number {
  const { barIndex, slot } = state.cursor;
  for (let b = barIndex; b >= 0; b--) {
    const bar = state.bars[b];
    const startSlot = b === barIndex ? Math.min(slot, bar.length - 1) : bar.length - 1;
    for (let i = startSlot; i >= 0; i--) {
      if (bar[i]?.kind === "note") return bar[i].midi;
    }
  }
  return 60;
}
