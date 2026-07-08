// Tracks which Archipelago items the player owns and answers "can I use
// this?" questions for the entry UI. Item names here must match the
// apworld's Items.py exactly.

import type { DurationId } from "./theory";
import { DURATIONS, midiToName, LOWEST_MIDI, HIGHEST_MIDI } from "./theory";

export type Unlocks = Set<string>;

// These are starting inventory in the apworld, but being lenient here
// costs nothing and avoids a soft lock if the server is slow.
export function emptyUnlocks(): Unlocks {
  return new Set(["Quarter Note", "Whole Note", "Rest"]);
}

export function hasPitch(unlocks: Unlocks, midi: number): boolean {
  if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return false;
  return unlocks.has(midiToName(midi));
}

export function hasDuration(unlocks: Unlocks, duration: DurationId): boolean {
  return unlocks.has(DURATIONS[duration].itemName);
}

export function hasDot(unlocks: Unlocks): boolean {
  return unlocks.has("Dotted Modifier");
}

export function hasTie(unlocks: Unlocks): boolean {
  return unlocks.has("Tie");
}

export function hasRest(unlocks: Unlocks): boolean {
  return unlocks.has("Rest");
}

export function hasSongTitleReveal(unlocks: Unlocks): boolean {
  return unlocks.has("Song Title Reveal");
}

export function visibleMeasureCount(unlocks: Unlocks, totalMeasures: number): number {
  let count = 1;
  for (let measure = 2; measure <= totalMeasures; measure++) {
    if (!unlocks.has(`Measure ${measure}`)) break;
    count++;
  }
  return Math.min(totalMeasures, count);
}
// Offline dev mode: grab the unlock list from a local JSON file instead of
// a server. Edit public/offline-unlocks.json to change what you own.
export async function loadOfflineUnlocks(): Promise<Unlocks> {
  const response = await fetch("/offline-unlocks.json");
  const data = await response.json();
  const unlocks = emptyUnlocks();
  for (const item of data.items) unlocks.add(item);
  return unlocks;
}




