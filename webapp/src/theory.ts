// Pure music math shared by every other file: pitch names, octaves, and
// note durations measured in ticks. No React, no audio, no state in here.

// Everything in the app is measured in ticks at this resolution.
// A quarter note is always 480 ticks no matter what the MIDI file used.
export const TICKS_PER_QUARTER = 480;

// The finest grid the game understands (a sixteenth note).
export const GRID_TICKS = TICKS_PER_QUARTER / 4;

// Sharps only, matching the item names in the apworld exactly.
export const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// The apworld hands out pitch items for octaves 1 through 7.
export const LOWEST_OCTAVE = 1;
export const HIGHEST_OCTAVE = 7;
export const LOWEST_MIDI = (LOWEST_OCTAVE + 1) * 12;        // C1 = 24
export const HIGHEST_MIDI = (HIGHEST_OCTAVE + 1) * 12 + 11; // B7 = 107

export type DurationId = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

export interface DurationInfo {
  ticks: number;
  vexDuration: string; // what VexFlow calls this duration
  itemName: string;    // the Archipelago item that unlocks it
  hotkey: string;      // number key that selects it
  label: string;
}

export const DURATIONS: Record<DurationId, DurationInfo> = {
  whole:     { ticks: TICKS_PER_QUARTER * 4, vexDuration: "w",  itemName: "Whole Note",     hotkey: "1", label: "Whole" },
  half:      { ticks: TICKS_PER_QUARTER * 2, vexDuration: "h",  itemName: "Half Note",      hotkey: "2", label: "Half" },
  quarter:   { ticks: TICKS_PER_QUARTER,     vexDuration: "q",  itemName: "Quarter Note",   hotkey: "3", label: "Quarter" },
  eighth:    { ticks: TICKS_PER_QUARTER / 2, vexDuration: "8",  itemName: "Eighth Note",    hotkey: "4", label: "Eighth" },
  sixteenth: { ticks: TICKS_PER_QUARTER / 4, vexDuration: "16", itemName: "Sixteenth Note", hotkey: "5", label: "Sixteenth" },
};

export const DURATION_IDS = Object.keys(DURATIONS) as DurationId[];

export function durationTicks(duration: DurationId, dotted: boolean): number {
  const base = DURATIONS[duration].ticks;
  return dotted ? base * 1.5 : base;
}

// midi 60 -> "C4". These strings are also the apworld item names.
export function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[midi % 12]}${octave}`;
}

// midi 61 -> "c#/4", the key format VexFlow wants.
export function midiToVexKey(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[midi % 12].toLowerCase()}/${octave}`;
}

export function isBlackKey(midi: number): boolean {
  return PITCH_CLASS_NAMES[midi % 12].includes("#");
}

// Natural (white key) midi note for a letter A-G in a given octave.
const LETTER_TO_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Given a letter the player typed and the pitch they were just on, pick the
// octave that puts the new note closest to the old one (ties go down).
export function nearestMidiForLetter(letter: string, referenceMidi: number): number {
  const pitchClass = LETTER_TO_PITCH_CLASS[letter.toUpperCase()];
  let best = -1;
  for (let octave = LOWEST_OCTAVE; octave <= HIGHEST_OCTAVE; octave++) {
    const candidate = pitchClass + (octave + 1) * 12;
    if (best === -1
      || Math.abs(candidate - referenceMidi) < Math.abs(best - referenceMidi)
      || (Math.abs(candidate - referenceMidi) === Math.abs(best - referenceMidi) && candidate < best)) {
      best = candidate;
    }
  }
  return best;
}

// Diatonic (staff line/space) helpers used to turn a click height into a pitch.
// Diatonic index counts white-key steps: C0=0, D0=1 ... so E4 (bottom treble line) = 30.
const DIATONIC_OF_PITCH_CLASS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B
const PITCH_CLASS_OF_DIATONIC = [0, 2, 4, 5, 7, 9, 11];

export function midiToDiatonic(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + DIATONIC_OF_PITCH_CLASS[midi % 12];
}

export function diatonicToMidi(diatonic: number): number {
  const octave = Math.floor(diatonic / 7);
  return (octave + 1) * 12 + PITCH_CLASS_OF_DIATONIC[((diatonic % 7) + 7) % 7];
}
