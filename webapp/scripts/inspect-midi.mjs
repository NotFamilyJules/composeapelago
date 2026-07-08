// Checks a MIDI file for the song library and prints the registry entries
// you need to paste into src/songs.ts and the apworld's Songs.py.
//
//   node scripts/inspect-midi.mjs path/to/song.mid [melodyTrackIndex]
//
// It lists every track, warns about anything the game can't represent
// (pitches outside C1-B7, rhythms finer than a sixteenth, chords in the
// melody, time signature changes), and counts the melody's notes and bars
// the same way the game will.

import tonejsMidi from "@tonejs/midi";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const { Midi } = tonejsMidi;

const TICKS_PER_QUARTER = 480;
const GRID = TICKS_PER_QUARTER / 4; // sixteenth grid, same as the game
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LOWEST_MIDI = 24;   // C1
const HIGHEST_MIDI = 107; // B7

// Track item names the apworld knows about (see Items.py). A backing track
// with a role outside this list needs a new item added there first.
const KNOWN_TRACK_ITEMS = [
  "Bass Track", "Chord Track", "Drum Track", "Harmony Track",
  "Counter Melody Track", "Extra Track 1", "Extra Track 2", "Extra Track 3",
];

const [, , filePath, melodyArg] = process.argv;
if (!filePath) {
  console.log("Usage: node scripts/inspect-midi.mjs path/to/song.mid [melodyTrackIndex]");
  process.exit(1);
}

const midi = new Midi(readFileSync(filePath));
const name = (n) => `${PITCH_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

console.log(`\n=== ${basename(filePath)} ===`);
console.log(`ppq ${midi.header.ppq}, tempo ${Math.round(midi.header.tempos[0]?.bpm ?? 120)} bpm, ` +
  `time signature ${(midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]).join("/")}`);

const warnings = [];
if (midi.header.timeSignatures.length > 1) {
  warnings.push("multiple time signatures - the game only reads the first one");
}
if (midi.header.tempos.length > 1) {
  warnings.push("multiple tempos - playback follows them, but the bar highlight math assumes the first");
}

// ---------------------------------- track table ----------------------------------

console.log("\nTracks:");
midi.tracks.forEach((track, index) => {
  if (track.notes.length === 0) {
    console.log(`  ${index}: "${track.name}" (empty)`);
    return;
  }
  const pitches = track.notes.map((note) => note.midi);
  console.log(
    `  ${index}: "${track.name}" ch${track.channel} program ${track.instrument.number} ` +
    `(${track.instrument.name}) - ${track.notes.length} notes, ${name(Math.min(...pitches))}..${name(Math.max(...pitches))}`,
  );
});

// ---------------------------------- melody analysis ----------------------------------

const melodyIndex = melodyArg !== undefined
  ? Number(melodyArg)
  : midi.tracks.findIndex((track) => track.notes.length > 0);
const melody = midi.tracks[melodyIndex];
console.log(`\nMelody track: ${melodyIndex} ("${melody.name}")`);

// Rescale to the game's grid and force monophonic, exactly like song.ts.
const scale = TICKS_PER_QUARTER / midi.header.ppq;
const byStart = new Map();
let quantizeShift = 0;
for (const note of melody.notes) {
  const rawStart = note.ticks * scale;
  const start = Math.round(rawStart / GRID) * GRID;
  const duration = Math.max(GRID, Math.round((note.durationTicks * scale) / GRID) * GRID);
  quantizeShift = Math.max(quantizeShift, Math.abs(rawStart - start));
  const existing = byStart.get(start);
  if (!existing || note.midi > existing.midi) byStart.set(start, { midi: note.midi, start, duration });
  if (existing) warnings.push(`chord in melody at tick ${start} - only the highest note is used`);
}
const targetNotes = [...byStart.values()].sort((a, b) => a.start - b.start);

const outOfRange = targetNotes.filter((note) => note.midi < LOWEST_MIDI || note.midi > HIGHEST_MIDI);
if (outOfRange.length > 0) {
  warnings.push(`${outOfRange.length} melody notes outside C1-B7 (${name(outOfRange[0].midi)}...) - unreachable, transpose the MIDI`);
}
if (quantizeShift > GRID / 3) {
  warnings.push(`quantization moved notes by up to ${Math.round(quantizeShift)} ticks - loose timing or triplets, expect odd rhythms`);
}

const timeSig = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
const barTicks = timeSig[0] * (TICKS_PER_QUARTER * 4) / timeSig[1];
const lastNote = targetNotes[targetNotes.length - 1];
const melodyEnd = lastNote ? lastNote.start + lastNote.duration : 0;
const barCount = Math.max(1, Math.ceil(melodyEnd / barTicks));
const measureCount = Math.max(barCount, ...midi.tracks.map((track) => {
  const last = track.notes[track.notes.length - 1];
  return last ? Math.ceil((last.ticks + last.durationTicks) * scale / barTicks) : 0;
}));

console.log(`Melody notes (after sixteenth-grid cleanup): ${targetNotes.length}`);
console.log(`Melody bars: ${barCount}, full song measures: ${measureCount}`);

if (targetNotes.length > 999) warnings.push("more than 999 melody notes - over the apworld's location cap, pick a shorter melody");
if (barCount > 300) warnings.push("more than 300 melody bars - over the apworld's location cap");

console.log(warnings.length > 0 ? `\nWarnings:\n${warnings.map((w) => `  ! ${w}`).join("\n")}` : "\nNo warnings.");

// ---------------------------------- registry snippets ----------------------------------

const key = basename(filePath).replace(/\.midi?$/i, "").replaceAll("-", "_").toLowerCase();
const displayName = basename(filePath).replace(/\.midi?$/i, "").replaceAll("-", " ");
const backing = midi.tracks
  .map((track, index) => ({ track, index }))
  .filter(({ track, index }) => index !== melodyIndex && track.notes.length > 0);

console.log("\n--- paste into webapp/src/songs.ts (assign real item names to the roles) ---");
console.log(`  {
    key: "${key}",
    name: "${displayName}",
    url: "/songs/${basename(filePath)}",
    melodyTrack: ${melodyIndex},
    backingTracks: [
${backing.map(({ track, index }) => `      { trackIndex: ${index}, itemName: "?? Track" }, // "${track.name}" (${track.instrument.name})`).join("\n")}
    ],
    measureCount: ${measureCount},
  },`);

console.log("\n--- paste into composeapelago/Songs.py ---");
console.log(`    "${key}": {
        "name": "${displayName}",
        "track_items": [${backing.map(() => '"?? Track"').join(", ")}],
        "note_count": ${targetNotes.length},
        "bar_count": ${barCount},
    },`);

console.log(`\nKnown track item names: ${KNOWN_TRACK_ITEMS.join(", ")}`);
console.log("A new role (e.g. Harmony Track) also needs an ItemData entry in Items.py.\n");


