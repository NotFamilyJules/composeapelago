# The premade song library. Each run randomly plays one of these songs,
# then tells the client through slot_data.
#
# The keys and track item names must match the webapp's src/songs.ts
# exactly. To add a song: compose the MIDI (see the webapp's
# scripts/make-starter-song.mjs), then run webapp/scripts/add-song.mjs.

# song key -> everything generation needs to know about it:
#   track_items   - which backing track items exist for it.
#   note_count    - melody notes; the location count in per_note mode.
#   bar_count     - melody bars; the location count in bars mode.
#   measure_count - measures shown/unlocked in the client.
SONGS = {
    "korobeiniki": {
        "name": "Korobeiniki",
        "track_items": ["Chord Track", "Harmony Track", "Bass Track", "Drum Track"],
        "note_count": 219,
        "bar_count": 56,
        "measure_count": 56,
    },
    "cancan": {
        "name": "Can-Can",
        "track_items": ["Chord Track", "Bass Track", "Drum Track"],
        "note_count": 426,
        "bar_count": 80,
        "measure_count": 80,
    },
    "flight_of_the_bumblebee": {
        "name": "Flight of the Bumblebee",
        "track_items": ["Chord Track", "Bass Track", "Drum Track"],
        "note_count": 683,
        "bar_count": 101,
        "measure_count": 101,
    },
    "funiculi": {
        "name": "Funiculi Funicula",
        "track_items": ["Chord Track", "Bass Track", "Drum Track"],
        "note_count": 324,
        "bar_count": 72,
        "measure_count": 72,
    },
    "william_tell": {
        "name": "William Tell Overture",
        "track_items": ["Chord Track", "Bass Track", "Drum Track"],
        "note_count": 813,
        "bar_count": 80,
        "measure_count": 80,
    },
    # add-song:song (scripts/add-song.mjs inserts new songs here)
}

