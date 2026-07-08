# Composeapelago

A browser-based music notation game for Archipelago: a song plays with its
melody silenced, and you rewrite that melody by ear, note by note, on a
staff. Pitches, note values, and even the backing tracks are Archipelago
items â€” you can only write (and hear) the music you own.

Each run plays one song from a premade library, drawn at generation time
(the seed tells the client which one). Add your own MIDIs with
`npm run add-song` (see "Adding songs to the library" below). Backing
tracks stay silent until you receive their items (Bass Track, Chord Track,
Drum Track, and so on).

Two pieces live in this folder:

- `composeapelago/` â€” the apworld (plus `composeapelago.apworld`, ready to install)
- `webapp/` â€” the client (Vite + React + TypeScript)

## Quick start

### Generate a seed

1. Copy `composeapelago.apworld` into your Archipelago `custom_worlds` folder
   (or double click it) and restart all AP tools.
2. Copy `Composeapelago.yaml` into `Players` and edit `location_mode` if you
   want `bars` instead of `per_note`. The song is chosen randomly by the
   installed apworld, and note/bar counts come from that song's registry.
3. Generate normally (ArchipelagoGenerate) and host the seed.

### Run the client

```
cd webapp
npm install
npm run dev
```

Open the printed URL in a desktop browser. The default song (Rhapsody in
Blue) and a General MIDI SoundFont are bundled â€” no extra downloads.

### Connect

Enter host / port / slot at the top and press Connect. Received items
unlock pitches and note values; each correct note (or completed bar) sends
the next location check; 100% completion sends the goal.

**Offline dev mode**: tick the checkbox instead of connecting. Unlocks come
from `webapp/public/offline-unlocks.json` â€” edit that list freely.

## Playing

1. A song is drawn for the run automatically (random offline, the seed's
   pick when connected). The track list shows the melody you write plus
   each backing track with its lock state.
2. Backing tracks join the mix as their items arrive; the original melody
   track is always muted and replaced by whatever you write.
3. Write what you hear. A note turns **green** when pitch, octave, duration
   and position all match the hidden melody; **yellow** means you have the
   right rhythm but wrong pitch/rest, and if you're totally wrong then it
   stays **red**.

### Controls

| Key | Action |
| --- | --- |
| A-G | enter that note, nearest octave to the previous note |
| 1-5 | duration: whole, half, quarter, eighth, sixteenth |
| .   | dotted toggle |
| T   | tie (in a gap: adds a tied continuation note) |
| R   | rest |
| Up / Down | semitone up / down |
| # / b | sharp / flat (b only flattens on a selected note; in a gap it types B) |
| + âˆ’ | shift the note an octave |
| Ctrl+Z / Ctrl+Y | undo / redo (also the â†¶ â†· toolbar buttons) |
| Left / Right | move the cursor |
| Home / End | jump to first / last position |
| Backspace | delete the note at the cursor |
| Space | play / pause |
| Esc | stop |

Mouse: the toolbar's cursor tool decides what a click does ” **Write**
places the selected duration at the clicked pitch (on an existing note it
replaces it), **Select** moves the cursor onto a note, **Delete** removes
it. Right click always selects, whatever the tool.

The pitch grid next to the track list shows every pitch item: columns are
the 12 pitch classes, rows are octaves 7 down to 1, green means you own
it. Clicking a green cell enters that exact note at the cursor.

### Adding songs to the library

Two commands, from the `webapp` folder:

```
npm run add-song -- path\to\yoursong.mid
..\build-apworld.ps1
```

`add-song` checks the MIDI against the game's constraints (clear errors if
it fails), copies it into `public/songs/`, assigns each backing track a
role item automatically (channel 10 â†’ Drum Track, GM bass programs â†’ Bass
Track, everything else â†’ Chord / Harmony / Counter Melody / Extra Tracks),
and registers the song in `src/songs.ts`, the apworld's `Songs.py`, and
`Options.py`. The webapp can play it immediately; `build-apworld.ps1`
rebuilds and installs the .apworld so generation sees it too.

If the melody isn't the first track with notes, say which one it is:
`npm run add-song -- yoursong.mid --melody 2`. To dry-run a file without
registering anything, `npm run inspect-midi -- yoursong.mid`.

MIDI constraints (add-song checks all of these): the melody must live on
one track and be a single line (chords are collapsed to their top note);
rhythms must sit on a sixteenth grid â€” triplets and 32nds will grade
wrong; melody pitches must stay within C1-B7; one time signature for the
whole song; melodies cap at 999 notes / 300 bars. Backing tracks can be
anything General MIDI can play (drums on channel 10), up to 8 of them
(drums + bass + 6 others).

The cursor is always on the note being edited. It's **purple** at the end
of the piece (entry mode: keys write new music, 1â€“5/. arm the next note)
and **orange** when you move back onto an older note (edit mode: keys
change that note). To change the duration of the very last note, delete and
retype it.

Bars must add up exactly: a rhythm that would spill over the barline is
rejected with an error â€” enter what fits and tie it into the next bar. When
a bar is full, the next note starts the next bar automatically.

### Playback

- **Play** starts wherever the cursor is; **Stop** returns the cursor to
  the beginning.
- Tempo comes from the MIDI. Loop any bar range with the loop controls.
- **Full mix** = backing + your melody as piano; **Melody solo** = just
  your entry.
- **Reference** plays the hidden target melody for the cursor's bar (or the
  looped bars) â€” unlimited uses, that's the "by ear" part.

## AI Disclaimer

This "game" and "apworld" is mostly vibecoded trash. Sorry, mostly just trying 
to prototype this dumb idea but it seems pretty cool so far so hopefully if it 
is actually something people wanna see I'll dedicate time to actually flesh coding it.

