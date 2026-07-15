// Tracks which Archipelago items the player owns and answers "can I use
// this?" questions for the entry UI. Item names here must match the
// apworld's Items.py exactly.

import type { DurationId } from "./theory";
import { DURATIONS, midiToName, LOWEST_MIDI, HIGHEST_MIDI } from "./theory";

export type Unlocks = Map<string, number>;

export const PROGRESSIVE_MEASURE_ITEM = "Progressive Measure";

export function addUnlocks(unlocks: Unlocks, itemNames: string[]): Unlocks {
  const next = new Map(unlocks);
  for (const name of itemNames) {
    next.set(name, (next.get(name) ?? 0) + 1);
  }
  return next;
}

export function hasUnlock(unlocks: Unlocks, name: string, count = 1): boolean {
  return (unlocks.get(name) ?? 0) >= count;
}

// These are starting inventory in the apworld, but being lenient here
// costs nothing and avoids a soft lock if the server is slow.
export function emptyUnlocks(): Unlocks {
  return addUnlocks(new Map(), ["Quarter Note", "Whole Note", "Rest"]);
}

export function hasPitch(unlocks: Unlocks, midi: number): boolean {
  if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return false;
  return hasUnlock(unlocks, midiToName(midi));
}

export function hasDuration(unlocks: Unlocks, duration: DurationId): boolean {
  return hasUnlock(unlocks, DURATIONS[duration].itemName);
}

export function hasDot(unlocks: Unlocks): boolean {
  return hasUnlock(unlocks, "Dotted Modifier");
}

export function hasTie(unlocks: Unlocks): boolean {
  return hasUnlock(unlocks, "Tie");
}

export function hasRest(unlocks: Unlocks): boolean {
  return hasUnlock(unlocks, "Rest");
}

export function hasSongTitleReveal(unlocks: Unlocks): boolean {
  return hasUnlock(unlocks, "Song Title Reveal");
}

export function visibleMeasureCount(unlocks: Unlocks, totalMeasures: number): number {
  let unlocked = unlocks.get(PROGRESSIVE_MEASURE_ITEM) ?? 0;
  for (const name of unlocks.keys()) {
    if (/^Measure \d+$/.test(name)) unlocked++;
  }
  return Math.min(totalMeasures, 1 + unlocked);
}

// Offline dev mode: grab the unlock list from a local JSON file instead of
// a server. Edit public/offline-unlocks.json to change what you own.
export async function loadOfflineUnlocks(): Promise<Unlocks> {
  const response = await fetch("/offline-unlocks.json");
  const data = await response.json();
  return addUnlocks(emptyUnlocks(), data.items);
}