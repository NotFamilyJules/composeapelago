// Composes the bundled starter song, "Getting Started": an original 16-bar
// tune in C major with four tracks - Melody, Bass, Chords, Drums.
//
// Run it from the webapp folder whenever you want to tweak the song:
//   node scripts/make-starter-song.mjs
//
// Use this as the template for adding more premade songs: copy it, change
// the notes, add the new file to src/songs.ts and the apworld's Songs.py.

import tonejsMidi from "@tonejs/midi";
import { writeFileSync } from "node:fs";

const { Midi } = tonejsMidi;

const PPQ = 480;           // ticks per quarter note
const Q = PPQ;             // quarter
const E = PPQ / 2;         // eighth
const H = PPQ * 2;         // half
const W = PPQ * 4;         // whole
const DQ = Q * 1.5;        // dotted quarter
const BAR = PPQ * 4;       // one bar of 4/4
const TEMPO_BPM = 100;

// Note names to MIDI numbers, C4 = 60.
const N = (name) => {
  const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const octave = Number(name.at(-1));
  return letters[name[0]] + (octave + 1) * 12;
};

const midi = new Midi();
midi.header.setTempo(TEMPO_BPM);
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });

// ---------------------------------- melody ----------------------------------
// [note, duration] pairs per bar; rhythm uses quarters, eighths, halves, a
// dotted quarter and a closing whole note so the starter exercises most of
// the note value items.

const melodyBars = [
  [["C4", Q], ["E4", Q], ["G4", H]],                    // 1  (C)
  [["A4", Q], ["G4", Q], ["E4", H]],                    // 2  (Am)
  [["F4", Q], ["A4", Q], ["C5", H]],                    // 3  (F)
  [["B4", Q], ["G4", Q], ["D4", H]],                    // 4  (G)
  [["C4", Q], ["E4", Q], ["G4", Q], ["E4", Q]],         // 5  (C)
  [["A4", E], ["A4", E], ["G4", Q], ["E4", H]],         // 6  (Am)
  [["F4", DQ], ["G4", E], ["A4", H]],                   // 7  (F)
  [["G4", W]],                                          // 8  (G)
  [["E4", Q], ["A4", Q], ["C5", H]],                    // 9  (Am)
  [["C5", E], ["C5", E], ["A4", E], ["A4", E], ["F4", H]], // 10 (F)
  [["G4", Q], ["E4", Q], ["C4", H]],                    // 11 (C)
  [["D4", Q], ["G4", Q], ["B4", H]],                    // 12 (G)
  [["C4", Q], ["E4", Q], ["G4", H]],                    // 13 (C)
  [["A4", Q], ["G4", Q], ["E4", H]],                    // 14 (Am)
  [["D4", Q], ["G4", Q], ["B4", Q], ["G4", Q]],         // 15 (G)
  [["C5", W]],                                          // 16 (C)
];

const melody = midi.addTrack();
melody.name = "Melody";
melody.channel = 0;
melody.instrument.number = 0; // piano
melodyBars.forEach((bar, barIndex) => {
  let tick = barIndex * BAR;
  for (const [name, dur] of bar) {
    melody.addNote({ midi: N(name), ticks: tick, durationTicks: dur - 10, velocity: 0.9 });
    tick += dur;
  }
});

// ---------------------------------- harmony ----------------------------------
// One chord per bar, matching the melody above.

const chordBars = [
  "C", "Am", "F", "G",
  "C", "Am", "F", "G",
  "Am", "F", "C", "G",
  "C", "Am", "G", "C",
];

const CHORD_NOTES = {
  C: ["C3", "E3", "G3"],
  Am: ["A2", "C3", "E3"],
  F: ["F2", "A2", "C3"],
  G: ["G2", "B2", "D3"],
};

const chords = midi.addTrack();
chords.name = "Chords";
chords.channel = 1;
chords.instrument.number = 48; // string ensemble pad
chordBars.forEach((chord, barIndex) => {
  for (const name of CHORD_NOTES[chord]) {
    chords.addNote({ midi: N(name), ticks: barIndex * BAR, durationTicks: W - 20, velocity: 0.55 });
  }
});

// ---------------------------------- bass ----------------------------------
// Root and fifth alternating on the quarter notes.

const BASS_ROOTS = { C: "C2", Am: "A2", F: "F2", G: "G2" };
const bass = midi.addTrack();
bass.name = "Bass";
bass.channel = 2;
bass.instrument.number = 33; // fingered bass
chordBars.forEach((chord, barIndex) => {
  const root = N(BASS_ROOTS[chord]);
  const fifth = root + 7;
  [root, fifth, root, fifth].forEach((note, beat) => {
    bass.addNote({ midi: note, ticks: barIndex * BAR + beat * Q, durationTicks: Q - 20, velocity: 0.8 });
  });
});

// ---------------------------------- drums ----------------------------------
// Channel 9 = General MIDI percussion. Kick on 1 and 3, snare on 2 and 4,
// closed hi-hat on every eighth.

const KICK = 36, SNARE = 38, HAT = 42;
const drums = midi.addTrack();
drums.name = "Drums";
drums.channel = 9;
for (let barIndex = 0; barIndex < chordBars.length; barIndex++) {
  const barStart = barIndex * BAR;
  for (const beat of [0, 2]) drums.addNote({ midi: KICK, ticks: barStart + beat * Q, durationTicks: E, velocity: 0.9 });
  for (const beat of [1, 3]) drums.addNote({ midi: SNARE, ticks: barStart + beat * Q, durationTicks: E, velocity: 0.8 });
  for (let eighth = 0; eighth < 8; eighth++) drums.addNote({ midi: HAT, ticks: barStart + eighth * E, durationTicks: E / 2, velocity: 0.5 });
}

writeFileSync("public/songs/getting-started.mid", Buffer.from(midi.toArray()));
console.log(`Wrote public/songs/getting-started.mid (${chordBars.length} bars, ${melody.notes.length} melody notes)`);
