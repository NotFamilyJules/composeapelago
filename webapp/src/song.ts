// Turns a parsed MIDI file into the game's idea of a song: a target melody
// (the notes the player has to reconstruct), a time signature, and a bar
// layout. The original Midi object is kept around for playback rebuilding.

import { Midi } from "@tonejs/midi";
import type { SongDefinition } from "./songs";
import { GRID_TICKS, TICKS_PER_QUARTER } from "./theory";

// One note of the melody the player is trying to match, on our tick grid.
export interface TargetNote {
  midi: number;
  startTick: number;
  durationTicks: number;
}

export interface TrackSummary {
  index: number;
  name: string;
  instrument: string;
  noteCount: number;
}

export interface Song {
  definition: SongDefinition; // which library song this is
  midi: Midi;                 // the parsed file, used to rebuild playback
  sourceBytes: ArrayBuffer;   // the original file bytes
  melodyTrackIndex: number;
  targetNotes: TargetNote[];
  beatsPerBar: number;        // time signature numerator
  beatValue: number;          // time signature denominator
  barTicks: number;           // length of one bar in our ticks
  measureCount: number;       // how many bars the staff shows
  tempoBpm: number;
}

export function listTracks(midi: Midi): TrackSummary[] {
  return midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    instrument: track.instrument?.name ?? "unknown",
    noteCount: track.notes.length,
  }));
}

export function buildSong(
  definition: SongDefinition,
  sourceBytes: ArrayBuffer,
  midi: Midi,
): Song {
  const timeSig = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const beatsPerBar = timeSig[0];
  const beatValue = timeSig[1];
  const barTicks = beatsPerBar * (TICKS_PER_QUARTER * 4) / beatValue;
  const tempoBpm = Math.round(midi.header.tempos[0]?.bpm ?? 120);

  const targetNotes = extractTargetNotes(midi, definition.melodyTrack);
  const measureCount = definition.measureCount;

  return {
    definition,
    midi,
    sourceBytes,
    melodyTrackIndex: definition.melodyTrack,
    targetNotes,
    beatsPerBar,
    beatValue,
    barTicks,
    measureCount,
    tempoBpm,
  };
}

// Reads the melody track, rescales it to our 480-ticks-per-quarter grid,
// snaps everything to the sixteenth grid, and forces it monophonic
// (highest note wins when the track has chords).
function extractTargetNotes(midi: Midi, trackIndex: number): TargetNote[] {
  const track = midi.tracks[trackIndex];
  if (!track) return [];
  const scale = TICKS_PER_QUARTER / midi.header.ppq;

  const byStart = new Map<number, TargetNote>();
  for (const note of track.notes) {
    const startTick = Math.round((note.ticks * scale) / GRID_TICKS) * GRID_TICKS;
    const durationTicks = Math.max(
      GRID_TICKS,
      Math.round((note.durationTicks * scale) / GRID_TICKS) * GRID_TICKS,
    );
    const existing = byStart.get(startTick);
    if (!existing || note.midi > existing.midi) {
      byStart.set(startTick, { midi: note.midi, startTick, durationTicks });
    }
  }

  const notes = [...byStart.values()].sort((a, b) => a.startTick - b.startTick);

  // Trim notes that overlap the next note (a common MIDI legato habit) so
  // the melody can actually be written as sheet music.
  for (let i = 0; i < notes.length - 1; i++) {
    const maxDuration = notes[i + 1].startTick - notes[i].startTick;
    if (notes[i].durationTicks > maxDuration) {
      notes[i].durationTicks = Math.max(GRID_TICKS, maxDuration);
    }
  }
  return notes;
}
