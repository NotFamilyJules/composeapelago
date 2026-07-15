// One-command song import. Drop a MIDI anywhere (public/songs/ is the
// usual spot), then from the webapp folder run:
//
//   npm run add-song -- path/to/song.mid            (melody = first track with notes)
//   npm run add-song -- path/to/song.mid --melody 2 (melody = track 2)
//
// The script:
//   1. checks the MIDI against the game's constraints and prints exactly
//      what needs fixing if it fails,
//   2. copies the file into public/songs/ if it is not already there,
//   3. assigns each backing track a role item (drums by channel, bass by
//      GM program, the rest down a fixed chain),
//   4. registers the song in src/songs.ts, ../composeapelago/Songs.py and
//
// After it succeeds: the webapp can play the song immediately (dev server
// picks it up on reload); run build-apworld.ps1 at the repo root to rebuild
// the .apworld for generation.

import tonejsMidi from "@tonejs/midi";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const { Midi } = tonejsMidi;

const TICKS_PER_QUARTER = 480;
const GRID = TICKS_PER_QUARTER / 4; // sixteenth grid, same as the game
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LOWEST_MIDI = 24;   // C1
const HIGHEST_MIDI = 107; // B7
const MAX_NOTES = 999;    // apworld location caps (Locations.py)
const MAX_BARS = 150;

// Where the registries live, relative to this script's webapp folder.
const SONGS_TS = "src/songs.ts";
const SONGS_PY = "../composeapelago/Songs.py";
const SONGS_DIR = "public/songs";

// Roles handed to backing tracks, in the order the generic ones are used
// up. Every name here must exist in the apworld's Items.py.
const GENERIC_ROLES = ["Chord Track", "Harmony Track", "Counter Melody Track", "Extra Track 1", "Extra Track 2", "Extra Track 3"];
const BASS_PROGRAMS_START = 32; // GM programs 32-39 are basses
const BASS_PROGRAMS_END = 39;

// ---------------------------------- read arguments ----------------------------------

const args = process.argv.slice(2);
const melodyFlag = args.indexOf("--melody");
const melodyArg = melodyFlag !== -1 ? Number(args[melodyFlag + 1]) : undefined;
const filePath = args.find((arg, i) => !arg.startsWith("--") && (melodyFlag === -1 || i !== melodyFlag + 1));
if (!filePath) {
  console.log("Usage: npm run add-song -- path/to/song.mid [--melody trackIndex]");
  process.exit(1);
}

const fileName = basename(filePath);
const key = fileName.replace(/\.midi?$/i, "").replaceAll(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
const displayName = fileName.replace(/\.midi?$/i, "").replaceAll(/[-_]+/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase());
const name = (n) => `${PITCH_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

const midi = new Midi(readFileSync(filePath));

// ---------------------------------- validate ----------------------------------

const errors = [];
const warnings = [];

const melodyIndex = melodyArg ?? midi.tracks.findIndex((track) => track.notes.length > 0);
const melody = midi.tracks[melodyIndex];
if (!melody || melody.notes.length === 0) {
  errors.push(`melody track ${melodyIndex} has no notes - pass --melody with the right track index`);
}

// Rescale to the game's grid and force monophonic, exactly like song.ts.
const scale = TICKS_PER_QUARTER / midi.header.ppq;
const byStart = new Map();
let quantizeShift = 0;
let chordCount = 0;
for (const note of melody?.notes ?? []) {
  const rawStart = note.ticks * scale;
  const start = Math.round(rawStart / GRID) * GRID;
  const duration = Math.max(GRID, Math.round((note.durationTicks * scale) / GRID) * GRID);
  quantizeShift = Math.max(quantizeShift, Math.abs(rawStart - start));
  if (byStart.has(start)) chordCount++;
  const existing = byStart.get(start);
  if (!existing || note.midi > existing.midi) byStart.set(start, { midi: note.midi, start, duration });
}
const targetNotes = [...byStart.values()].sort((a, b) => a.start - b.start);

const outOfRange = targetNotes.filter((note) => note.midi < LOWEST_MIDI || note.midi > HIGHEST_MIDI);
if (outOfRange.length > 0) {
  errors.push(`${outOfRange.length} melody notes are outside C1-B7 (first: ${name(outOfRange[0].midi)}) - transpose the MIDI into range`);
}
if (targetNotes.length > MAX_NOTES) {
  errors.push(`melody has ${targetNotes.length} notes, the cap is ${MAX_NOTES} - pick a shorter melody track`);
}
if (chordCount > 0) {
  warnings.push(`${chordCount} chords in the melody - only the highest note of each is used`);
}
if (quantizeShift > GRID / 3) {
  warnings.push(`quantization moved notes by up to ${Math.round(quantizeShift)} ticks - loose timing or triplets will grade oddly`);
}
if (midi.header.timeSignatures.length > 1) {
  warnings.push("multiple time signatures - the game only reads the first one");
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
if (barCount > MAX_BARS) {
  errors.push(`melody spans ${barCount} bars, the cap is ${MAX_BARS}`);
}
if (measureCount > MAX_BARS) {
  errors.push(`song is ${measureCount} measures, the cap is ${MAX_BARS}`);
}

// ---------------------------------- assign track roles ----------------------------------

const backing = midi.tracks
  .map((track, index) => ({ track, index }))
  .filter(({ track, index }) => index !== melodyIndex && track.notes.length > 0);

const freeGenerics = [...GENERIC_ROLES];
let bassUsed = false;
let drumUsed = false;
const assignments = [];
for (const { track, index } of backing) {
  let role;
  if (track.channel === 9 && !drumUsed) {
    role = "Drum Track";
    drumUsed = true;
  } else if (track.instrument.number >= BASS_PROGRAMS_START && track.instrument.number <= BASS_PROGRAMS_END && !bassUsed) {
    role = "Bass Track";
    bassUsed = true;
  } else {
    role = freeGenerics.shift();
  }
  if (!role) {
    errors.push(`too many backing tracks - ran out of role items at track ${index} ("${track.name}"). The game supports drums + bass + ${GENERIC_ROLES.length} others.`);
    break;
  }
  assignments.push({ index, role, trackName: track.name, instrument: track.instrument.name });
}
if (backing.length === 0) {
  warnings.push("no backing tracks - the run will be melody-only with no track items");
}

// ---------------------------------- report ----------------------------------

console.log(`\n=== ${fileName} -> "${displayName}" (key: ${key}) ===`);
console.log(`melody: track ${melodyIndex} ("${melody?.name}"), ${targetNotes.length} notes, ${barCount} bars, song is ${measureCount} measures`);
for (const a of assignments) {
  console.log(`track ${a.index} "${a.trackName}" (${a.instrument}) -> ${a.role}`);
}
if (warnings.length > 0) console.log(`\nWarnings:\n${warnings.map((w) => `  ! ${w}`).join("\n")}`);
if (errors.length > 0) {
  console.log(`\nNOT ADDED - fix these first:\n${errors.map((e) => `  X ${e}`).join("\n")}\n`);
  process.exit(1);
}

// ---------------------------------- register everywhere ----------------------------------

const songsTs = readFileSync(SONGS_TS, "utf8");
const songsPy = readFileSync(SONGS_PY, "utf8");

if (songsTs.includes(`key: "${key}"`) || songsPy.includes(`"${key}":`)) {
  console.log(`\nNOT ADDED: a song with key "${key}" is already registered. Remove its entries (or rename the file) first.\n`);
  process.exit(1);
}

// Copy the MIDI into public/songs/ if it came from somewhere else.
const target = join(SONGS_DIR, fileName);
if (resolve(filePath) !== resolve(target)) {
  copyFileSync(filePath, target);
  console.log(`copied to ${target}`);
}


const tsEntry = `  {
    key: "${key}",
    name: "${displayName}",
    url: "/songs/${fileName}",
    melodyTrack: ${melodyIndex},
    backingTracks: [
${assignments.map((a) => `      { trackIndex: ${a.index}, itemName: "${a.role}" }, // "${a.trackName}" (${a.instrument})`).join("\n")}
    ],
    measureCount: ${measureCount},
  },
`;

const pySongEntry = `    "${key}": {
        "name": "${displayName}",
        "track_items": [${assignments.map((a) => `"${a.role}"`).join(", ")}],
        "note_count": ${targetNotes.length},
        "bar_count": ${barCount},
        "measure_count": ${measureCount},
    },
`;

writeFileSync(SONGS_TS, songsTs.replace("  // add-song:entry", `${tsEntry}  // add-song:entry`));
writeFileSync(SONGS_PY, songsPy.replace("    # add-song:song", `${pySongEntry}    # add-song:song`));

console.log(`
Registered "${displayName}":
  - webapp/src/songs.ts            (playable in the webapp right away)
  - composeapelago/Songs.py        (note_count ${targetNotes.length}, bar_count ${barCount})

Next: run build-apworld.ps1 at the repo root so generation sees it.
`);




