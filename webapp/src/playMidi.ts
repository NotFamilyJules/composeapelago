// Builds the MIDI files that actually get played. The player's melody
// always renders as piano (GM program 0); the original melody track is
// muted by simply not copying its notes; backing tracks only play once
// their track item (Bass Track, Chord Track, ...) has been unlocked.

import { Midi } from "@tonejs/midi";
import type { Song } from "./song";
import type { PlacedEvent } from "./entry";
import { TICKS_PER_QUARTER } from "./theory";
import { soundingNotes } from "./grading";
import type { Unlocks } from "./unlocks";
import { hasUnlock } from "./unlocks";

export type MixMode = "full" | "solo";

export interface PlaybackEffects {
  drunkDrummer: boolean;
  tuningTrap: boolean;
}

// Find a MIDI channel the backing tracks are not using (9 is drums).
function freeChannel(midi: Midi): number {
  const used = new Set(midi.tracks.map((track) => track.channel));
  for (let channel = 15; channel >= 0; channel--) {
    if (channel !== 9 && !used.has(channel)) return channel;
  }
  return 15;
}

function offsetTrack(track: Midi["tracks"][number], offsetTicks: number, ppq: number): void {
  const fileOffsetTicks = Math.round(offsetTicks * (ppq / TICKS_PER_QUARTER));
  for (const note of track.notes) note.ticks += fileOffsetTicks;
}

// The full mix: unlocked backing tracks as-is, locked ones silent, the
// original melody track silenced, and the player's entry as piano on top.
export function buildPlaybackMidi(
  song: Song,
  placed: PlacedEvent[],
  mode: MixMode,
  unlocks: Unlocks,
  effects: PlaybackEffects = { drunkDrummer: false, tuningTrap: false },
): Uint8Array {
  // Re-parse the original bytes so we never mutate the loaded song.
  const midi = new Midi(song.sourceBytes);

  if (mode === "solo") {
    for (const track of midi.tracks) track.notes = [];
  } else {
    midi.tracks[song.melodyTrackIndex].notes = [];
    for (const backing of song.definition.backingTracks) {
      const track = midi.tracks[backing.trackIndex];
      if (!hasUnlock(unlocks, backing.itemName)) {
        track.notes = [];
      } else if (effects.drunkDrummer && backing.itemName === "Drum Track") {
        offsetTrack(track, TICKS_PER_QUARTER * 1.5, midi.header.ppq);
      }
    }
  }

  addPlayerTrack(midi, placed, effects.tuningTrap ? -1 : 0);
  return midi.toArray();
}

// Reference listen: only the target melody, only inside the given bar
// range, as piano.
export function buildReferenceMidi(song: Song, fromBar: number, toBar: number): Uint8Array {
  const midi = new Midi(song.sourceBytes);
  const scale = midi.header.ppq / TICKS_PER_QUARTER;
  const fromTick = fromBar * song.barTicks;
  const toTick = (toBar + 1) * song.barTicks;

  for (const track of midi.tracks) track.notes = [];

  const track = midi.addTrack();
  track.channel = freeChannel(midi);
  track.instrument.number = 0;
  for (const note of song.targetNotes) {
    if (note.startTick < fromTick || note.startTick >= toTick) continue;
    track.addNote({
      midi: note.midi,
      ticks: Math.round(note.startTick * scale),
      durationTicks: Math.round(note.durationTicks * scale),
      velocity: 0.85,
    });
  }
  return midi.toArray();
}

// Tied entry notes are merged before playback so they sound as one held
// note instead of two attacks.
function addPlayerTrack(midi: Midi, placed: PlacedEvent[], transposeSemitones: number): void {
  const scale = midi.header.ppq / TICKS_PER_QUARTER;
  const track = midi.addTrack();
  track.name = "Player Melody";
  track.channel = freeChannel(midi);
  track.instrument.number = 0;

  for (const sounding of soundingNotes(placed)) {
    track.addNote({
      midi: sounding.midi + transposeSemitones,
      ticks: Math.round(sounding.startTick * scale),
      durationTicks: Math.round(sounding.durationTicks * scale),
      velocity: 0.85,
    });
  }
}

// Convert a position in our ticks to seconds in the playback file, using
// the file's own tempo map.
export function tickToSeconds(song: Song, tick: number): number {
  const fileTick = tick * (song.midi.header.ppq / TICKS_PER_QUARTER);
  return song.midi.header.ticksToSeconds(fileTick);
}