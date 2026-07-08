// The premade song library. Every run picks one of these: randomly when
// offline, or whichever one the Archipelago seed chose (slot_data "song").
//
// The key and the backing track item names must match the apworld's
// Songs.py exactly.

export interface SongDefinition {
  key: string;   // stable id, shared with the apworld
  name: string;
  url: string;
  melodyTrack: number;   // the track the player reconstructs (always muted)
  backingTracks: { trackIndex: number; itemName: string }[];
  measureCount: number;
}

export const SONG_LIBRARY: SongDefinition[] = [
  {
    key: "korobeiniki",
    name: "Korobeiniki",
    url: "/songs/Korobeiniki.mid",
    melodyTrack: 0,
    backingTracks: [
      { trackIndex: 2, itemName: "Chord Track" },
      { trackIndex: 3, itemName: "Harmony Track" },
      { trackIndex: 5, itemName: "Bass Track" },
      { trackIndex: 6, itemName: "Drum Track" },
    ],
    measureCount: 56,
  },
  {
    key: "cancan",
    name: "Can-Can",
    url: "/songs/cancan.mid",
    melodyTrack: 0,
    backingTracks: [
      { trackIndex: 2, itemName: "Chord Track" },
      { trackIndex: 3, itemName: "Bass Track" },
      { trackIndex: 4, itemName: "Drum Track" },
    ],
    measureCount: 80,
  },
  {
    key: "flight_of_the_bumblebee",
    name: "Flight of the Bumblebee",
    url: "/songs/flight-of-the-bumblebee.mid",
    melodyTrack: 0,
    backingTracks: [
      { trackIndex: 2, itemName: "Chord Track" },
      { trackIndex: 4, itemName: "Bass Track" },
      { trackIndex: 5, itemName: "Drum Track" },
    ],
    measureCount: 101,
  },
  {
    key: "funiculi",
    name: "Funiculi Funicula",
    url: "/songs/funiculi.mid",
    melodyTrack: 0,
    backingTracks: [
      { trackIndex: 1, itemName: "Chord Track" },
      { trackIndex: 3, itemName: "Bass Track" },
      { trackIndex: 4, itemName: "Drum Track" },
    ],
    measureCount: 72,
  },
  {
    key: "william_tell",
    name: "William Tell Overture",
    url: "/songs/william-tell.mid",
    melodyTrack: 0,
    backingTracks: [
      { trackIndex: 1, itemName: "Chord Track" },
      { trackIndex: 2, itemName: "Bass Track" },
      { trackIndex: 3, itemName: "Drum Track" },
    ],
    measureCount: 80,
  },
  // add-song:entry (scripts/add-song.mjs inserts new songs here)
];

export function pickRandomSong(): SongDefinition {
  return SONG_LIBRARY[Math.floor(Math.random() * SONG_LIBRARY.length)];
}

export function songByKey(key: string): SongDefinition | undefined {
  return SONG_LIBRARY.find((song) => song.key === key);
}

