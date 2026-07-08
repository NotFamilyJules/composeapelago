# Composeapelago â€” Full Technical Documentation

This document is a complete, self-contained description of the Composeapelago
project: the concept, how every part works, the contracts between the parts,
how to customize it, and what it would take to host it on the web. It is
written so that someone (or some AI) with no prior context can understand,
simplify, or extend the system.

---

## 1. The concept

Composeapelago is a **browser-based music notation game** integrated with
**Archipelago** (AP), the multiworld randomizer framework
(https://archipelago.gg). The premise:

- A song plays, but its **melody track is muted**. The player reconstructs
  that melody **by ear**, note by note, on a musical staff.
- The tools needed to write music are **randomizer items**: every pitch
  (per octave), most rhythm values, and even the song's backing tracks
  (bass, chords, drums) are locked until the corresponding Archipelago item
  is received.
- Every correctly placed note (or completed bar) sends a **location check**
  back to the multiworld, which releases items for this player or others.
- Reaching **100% melody completion** is the goal.

The loop that makes it fun: you can only write what you own, so early on you
approximate the melody with whole notes and rests, then refine as eighth
notes, dotted rhythms, and missing pitches arrive. The backing arrangement
fills in around you as you unlock its tracks, making the song easier to hear.

### Archipelago in one paragraph

Archipelago connects many randomized games into one "multiworld". Each game
contributes **items** (things a player can receive) and **locations** (places
that hold one item each). At **generation** time a Python "apworld" module
describes the items/locations/logic; a fill algorithm distributes all games'
items across all games' locations. At **play** time a client connects to the
AP server over WebSocket, reports locations as "checked" (the server then
sends whatever item was placed there to its owner), receives its own items,
and finally reports its **goal** complete. Logic ("rules") exists only at
generation time, to guarantee the seed is completable in some order.

---

## 2. Architecture

Two halves plus a shared contract:

```
composeapelago/          Python apworld â€” generation side (runs inside Archipelago)
webapp/                  Vite + React + TypeScript client â€” play side (browser)
build-apworld.ps1        zips composeapelago/ -> composeapelago.apworld, installs it
Composeapelago.yaml      player options template for generation
```

Data flow of a full round:

1. Player puts `Composeapelago.yaml` in AP's `Players/` folder and runs
   ArchipelagoGenerate. The apworld picks a **song** (random or forced by the
   YAML), builds locations from that song's note/bar counts, builds the item
   pool, applies logic rules, and stores the song key in **slot_data**.
2. The seed is hosted (ArchipelagoServer or archipelago.gg).
3. The player opens the webapp, enters host/port/slot, connects. The client
   reads slot_data, loads the matching MIDI from its bundled library, and
   starts the game.
4. As items arrive they unlock UI affordances. As grading detects matched
   target notes, the client sends location checks. At 100% it flushes any
   unsent checks and sends the goal.

The **webapp also runs standalone** ("offline dev mode"): unlocks come from
a local JSON file and no checks are sent.

---

## 3. The apworld (`composeapelago/`)

Standard AP apworld layout (a folder zipped and renamed `.apworld`). Files:

### 3.1 `Types.py`
Tiny shared classes: `ComposeapelagoLocation`, `ComposeapelagoItem`
(subclasses tagging the game name), and `ItemData(ap_code, classification,
count)` / `LocData(ap_code, region)` plain data holders.

### 3.2 `Songs.py` â€” the song registry (generation side)
```python
SONGS = {
    "all_star": {
        "name": "All Star",
        "track_items": ["Chord Track", "Bass Track", "Drum Track"],
        "note_count": 567,     # melody notes  = location count in per_note mode
        "bar_count": 85,       # melody bars   = location count in bars mode
        "measure_count": 85,   # measures shown/unlocked in the client
    },
    ...
}
```
`# add-song:` marker comments let the `add-song` script insert new song
entries. **Location counts come from the randomly chosen song, not from the
YAML** â€” players never pick songs or count notes by hand.

### 3.3 `Options.py`
Only one player-facing game option:
- `location_mode` (Choice): `per_note = 0` (one check per melody note) or
  `bars = 1` (one check per completed bar).

### 3.4 `Items.py` â€” item tables and pool construction
Item categories and id ranges:

| Category | Names | IDs | Classification |
|---|---|---|---|
| Pitches | `C1`â€¦`B7` (12 pitch classes Ã— octaves 1â€“7, sharps spelling) | 76241001â€“76241084 | octaves 3â€“4 progression, others useful |
| Note values | Quarter/Whole/Half/Eighth/Sixteenth Note, Dotted Modifier, Tie, Rest | 76242001â€“76242008 | progression |
| Filler | Metronome Click | 76243001 | filler |
| Backing tracks | Bass/Chord/Drum/Harmony/Counter Melody Track, Extra Track 1â€“3 | 76244001â€“76244008 | useful |
| Event | Victory | none | progression |

Key concepts:

- **Starting inventory** (`STARTING_NOTE_VALUES = ["Quarter Note", "Whole
  Note", "Rest"]`) is pushed as precollected in `generate_early`. Whole notes
  + rests are enough to grade a melody's held notes, so the first checks are
  reachable with zero received items.
- **`PRIORITY_OCTAVES = (3, 4)`**: melodies live around middle C, so those
  24 pitch items are `progression` (logic can require them, and progression
  balancing pulls them early); all other octaves are `useful`.
- **Pool construction** (`create_itempool`): pool = 84 pitches + 5 pool note
  values (Half/Eighth/Sixteenth/Dotted/Tie) + the chosen song's
  `track_items`. Then it is balanced against the location count:
  - **Too many items** â†’ the overflow is pushed into starting inventory in
    this order: non-priority pitches (shuffled) â†’ priority pitches (shuffled)
    â†’ note values â†’ track items. Counts of precollected note values and
    priority pitches are stored on the world for the rules to read.
  - **Too few items** â†’ Metronome Click filler pads the difference.
- **Victory** is a codeless event item locked onto the codeless
  "Melody Complete" event location; `completion_condition` requires it.

### 3.5 `Locations.py`
Static tables (AP requires the full nameâ†’id map at import time):
- `"Note N placed correctly"` for N in 1â€¦999 â†’ id 76245000+N
- `"Bar N completed"` for N in 1â€¦300 â†’ id 76246000+N
- `"Melody Complete"` â€” event, no id.

**The note cap can never exceed 999** â€” note ids would collide with the bar
id block. Which locations actually exist in a seed:
`get_active_location_count` reads the chosen song's `note_count` or
`bar_count` per `location_mode`, and `is_valid_location` filters the tables
to the first N of the active mode.

### 3.6 `Regions.py`
Deliberately minimal: `Menu -> Staff`, all locations in Staff. All gating is
location rules, not region access.

### 3.7 `Rules.py` â€” the progression logic
The design goal: sphere 1 must not be the whole game, and the items that
matter (rhythms + octave 3/4 pitches) must land early. Rules cannot reference
the actual melody (any MIDI is allowed and the melody isn't known to logic in
a useful way), so requirements scale with *how far through the melody* a
location is:

```python
RULE_TIERS = [            # (fraction passed, note values needed, priority pitches needed)
    (0.25, 2, 8),
    (0.50, 4, 16),
    (0.75, ALL_5, ALL_24),
]
```
Each location past a tier boundary requires
`has_from_list_unique(NOTE_VALUE_ITEM_NAMES, n)` **and**
`has_from_list_unique(PRIORITY_PITCH_NAMES, m)`. The "Melody Complete" event
requires the full toolbox. Result: fill must place rhythm items and octave
3/4 pitches reachable before the 25/50/75% marks â€” verified in spoiler
playthroughs, spheres 1â€“2 are dominated by exactly those items.

**The caps** (`tier_requirements`): a requirement can never exceed what is
obtainable at that point = starting inventory + one item per earlier
location. Capped per category and combined. This is what keeps tiny songs
(down to 1 location) generating without FillErrors.

### 3.8 `__init__.py`
Wires everything into AP's `World` subclass:
- `generate_early`: precollect starting note values; draw the song
  (`self.random.choice` over `SONGS` keys, or the forced option) into
  `self.song_key`.
- `create_regions` / `create_items` / `set_rules` delegate to the modules.
  (AP call order: generate_early â†’ create_regions â†’ create_items â†’ set_rules
  â†’ fill; the rules read the precollect counters that create_items set.)
- `fill_slot_data` sends: all option values, `song` (the key â€” the client
  loads this song), `Seed`, `Slot`, `TotalLocations`.

### 3.9 `archipelago.json`
World manifest (game name, version, `minimum_ap_version`). Required for
AP 0.7+ apworld loading.

---

## 4. The webapp (`webapp/`)

Vite + React 19 + TypeScript. Dependencies: `vexflow` 5 (engraving),
`@tonejs/midi` 2 (MIDI parse/serialize), `spessasynth_lib` 4 (SoundFont
synth + sequencer), `archipelago.js` 2 (AP client).

`public/` assets: `songs/*.mid` (the premade library),
`soundfont/GeneralUserGS.sf2` (~31 MB General MIDI SoundFont),
`offline-unlocks.json` (offline mode's grant list).

### 4.1 `theory.ts` â€” pure music math
- Everything is measured in integer **ticks at 480/quarter**
  (`TICKS_PER_QUARTER`); the finest grid is a sixteenth (`GRID_TICKS = 120`).
  Integer ticks make position/duration comparison exact.
- Pitch names are **sharps only** (`C, C#, D...B` + octave, C4 = midi 60) and
  double as the AP item names.
- `DURATIONS` table: per duration id (wholeâ€¦sixteenth) the tick length,
  VexFlow duration code, AP item name, and hotkey.
- Helpers: midiâ†”name, midiâ†’VexFlow key, black-key test, "nearest octave for
  a typed letter" (picks the octave closest to the previous note), and
  diatonic (staff-step) math used to convert click height â†’ pitch.

### 4.2 `songs.ts` â€” the song registry (client side)
Mirror of `Songs.py` (same keys, same track item names):
```ts
{ key, name, url, melodyTrack, backingTracks: [{trackIndex, itemName}], measureCount }
```
`pickRandomSong()` for offline runs; `songByKey()` when slot_data names the
seed's song. Also carries the `// add-song:entry` marker.

### 4.3 `song.ts` â€” loading a song
Parses the MIDI, reads the first time signature and tempo, and extracts
**target notes** from the melody track: rescale from the file's PPQ to 480,
snap starts/durations to the sixteenth grid, force monophonic (highest note
wins on simultaneous starts). `Song` = definition + parsed midi + raw bytes +
targetNotes + bar geometry (barTicks, measureCount) + tempo. `listTracks`
summarizes tracks (name/instrument/note count) for the UI.

### 4.4 `entry.ts` â€” the editor model (the heart of the UX)
State: `bars: EntryEvent[][]` (one event list per measure â€” bars are
independent containers, so editing one bar never shifts another) and a
**caret cursor** `{barIndex, slot}`:

- `slot < bar.length` â†’ the caret is **ON an event** ("edit mode", drawn
  orange): keys modify that event in place.
- `slot == bar.length` â†’ the caret is **IN the bar's gap** ("entry mode",
  purple): the unfilled tail of any bar that still has room â€” including
  completely empty mid-piece measures. Typing inserts into that bar, then the
  caret jumps to the next gap.

`cursorPositions` enumerates every legal caret stop (each bar's events, plus
one gap per non-full bar) â€” arrow keys walk this list. Insertion enforces the
bar rule: an event must fit the remaining space of its bar (ties are how you
cross barlines); errors are returned as strings for the UI to flash.
`backspaceTarget` gives "the note under the caret, or the one just before a
gap caret" â€” that's also what transpose/tie act on, so after typing a note
the arrows immediately tune it. All functions are pure (state in â†’ state out).

### 4.5 `grading.ts` â€” correctness
Comparison happens on **sounding notes**: consecutive tied entry notes of the
same pitch merge into one long note first, because the player matches sound,
not spelling. A sounding note is correct iff a target note exists with the
exact same `(startTick, durationTicks, midi)` â€” that is pitch, octave,
duration, and position. Rests are green when no target note starts inside
them. Output: per-event correct flags (green/red), matchedCount / totalTargets
(the completion %), and `completedBars` (a bar is complete when all its
target notes are matched and nothing wrong sounds in it) for bars mode.

### 4.6 `ScoreView.tsx` â€” engraving and mouse input
Renders the player's music with VexFlow as **wrapped systems** like real
sheet music: bars per row = what fits the container width (ResizeObserver;
bars stretch to fill the row), vertical scrolling only, clef on every system,
time signature on the first, measure numbers throughout. Unfilled bar tails
are padded with invisible ghost notes so spacing stays proportional. Notes are
colored green/red from the grade. Ties draw (split across system breaks).

During each draw it records geometry: every bar's rect, every note's x, and
each bar's **gap x** (where the caret sits for that bar's tail). The caret is
a plain absolutely-positioned div moved to note-x/gap-x â€” no VexFlow redraw
for cursor movement â€” and auto-scrolls its system into view.

Clicks map back through the geometry (row from y, bar from x, pitch from
staff-line math) and obey the active **cursor tool**: Write places/replaces,
Select moves the caret, Delete removes; right-click always selects.

### 4.7 Playback: `playMidi.ts` + `synth.ts`
Playback never mutates the loaded song. Each Play re-parses the original
bytes and builds a fresh MIDI: original melody track emptied, **locked
backing tracks emptied** (their track item not owned), the player's sounding
notes appended as a piano track on a free channel. "Melody solo" empties all
original tracks. `buildReferenceMidi` produces just the target melody within
a bar range (the "Reference" ear button). `tickToSeconds` converts our ticks
to seconds through the file's own tempo map.

`synth.ts` is a module-level singleton: one AudioContext, a SpessaSynth
`WorkletSynthesizer` with the bundled `GeneralUserGS.sf2`, and a `Sequencer`.
Initialized lazily on first user gesture (browsers require it).
`auditionNote` plays immediate feedback on channel 15 when a note is entered.
Transport: play starts wherever the caret is, pause holds, stop returns the
caret to the start; a requestAnimationFrame loop follows `playbackTime()` to
highlight the playing bar and implement bar-range looping (seek back at loop
end).

### 4.8 `ap.ts` â€” the Archipelago client
`connect(host, port, slot)` uses archipelago.js `Client.login` with game name
`"Composeapelago"`; an `itemsReceived` listener adds item **names** to the
unlock set (names are the contract). slot_data provides options, the song
key, and `TotalLocations`.

**The check ladder**: location ids are computed, not looked up â€”
`76245000 + N` (notes) / `76246000 + N` (bars). Progress (matchedCount or
completedBars) only ratchets upward: when it exceeds `checksSent`, the next
rungs are sent. **The ladder is a progress count, not per-specific-note** â€”
matching any target note advances "Note 1 placed correctly", then "Note 2",
etc. The **mismatch rule**: checks cap at `TotalLocations`; when grading says
100% complete, all remaining rungs are flushed at once and
`client.goal()` fires. (Notes beyond the count still count toward the %; a
shorter-than-expected melody flushes at the end. Any MIDI is acceptable.)

### 4.9 `unlocks.ts` + offline mode
`Unlocks` is a `Set<string>` of item names; helpers answer hasPitch (by midi
number â†’ name), hasDuration/hasDot/hasTie/hasRest. Offline dev mode merges
names from `public/offline-unlocks.json`. Gating is enforced at entry time:
locked pitch â†’ red flash "F#4 is locked."; locked palette buttons are dimmed
with a lock icon but stay visible.

### 4.10 UI components
- `App.tsx` â€” owns all state, wires everything; keyboard handling lives in a
  ref'd handler. Undo/redo: snapshots of the entry state pushed on every
  successful edit (not cursor moves), Ctrl+Z/Ctrl+Y + toolbar â†¶â†· buttons,
  200-step cap, cleared on song load. `COMPLETE_MESSAGE` constant at the top
  = the banner text shown at 100%.
- `TrackList.tsx` â€” the song panel: melody row + each backing track with
  ðŸ”’/ðŸ”Š state. All wording is literal strings here.
- `PitchGrid.tsx` â€” 12Ã—7 grid of pitch items (octave 7 top). Green = owned;
  **clicking a cell enters that exact pitch at the caret**.
- `Palette.tsx` + `NoteIcon.tsx` â€” duration/dot/tie/rest buttons with
  hand-drawn SVG icons (unicode music glyphs render detached stems in many
  fonts, so the stems are drawn as lines starting on the notehead).
- `ToolSelect.tsx` â€” Select / Write / Delete cursor tools.
- `Transport.tsx` â€” play/pause/stop, tempo readout, full-mix/solo select,
  bar-range loop, Reference listen.
- `ConnectPanel.tsx` â€” host/port/slot + offline toggle + status text.

### 4.11 Controls
| Input | Action |
|---|---|
| Aâ€“G | enter note, nearest octave to previous note |
| 1â€“5 | select duration (wholeâ€¦sixteenth) |
| `.` | dotted toggle; T = tie; R = rest |
| â†‘ â†“ | semitone up/down (on caret's active note) |
| `#` / `b` | sharp / flat â€” `b` only flattens when a note is selected, in a gap it types B |
| + âˆ’ | octave up/down |
| â† â†’ / Home / End | move caret through notes and gaps |
| Backspace | delete at caret (or the note before a gap caret) |
| Space / Esc | play-pause from caret / stop (caret to start) |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Mouse | per the tool: Write places (on a note: replaces), Select selects, Delete deletes; right-click always selects; clicking a green pitch cell enters that pitch |

---

## 5. The shared contract (read this before changing anything)

These must agree between the apworld and the webapp or the game silently
breaks:

1. **Game name** `"Composeapelago"` (`__init__.py` â†” `ap.ts` login).
2. **Item names**: pitch names (`C1`â€¦`B7`, sharps), note value names, track
   item names. The client keys everything off received item *names*.
3. **Location id bases**: `76245000 + N` / `76246000 + N`
   (`Locations.py` â†” `ap.ts`). Note cap â‰¤ 999 (id collision).
4. **Song registry**: keys and per-song `track_items` in `Songs.py` â†”
   `songs.ts` `backingTracks` item names; `note_count`/`bar_count` must be
   what the client's quantizer actually produces (the `add-song`/
   `inspect-midi` scripts compute them with identical code).
5. **slot_data shape**: `options.location_mode`, `song`, `TotalLocations`.

---

## 6. The song pipeline

Songs are premade and ship with the game (no runtime upload â€” both sides
must know the same songs). Adding one is two commands from `webapp/`:

```
npm run add-song -- path\to\song.mid        (optionally --melody <trackIndex>)
..\build-apworld.ps1
```

`scripts/add-song.mjs`:
1. **Validates** and prints exact errors: melody must be one track, single
   line (chords collapse to top note, warned); rhythms must sit on the
   sixteenth grid (loose timing/triplets warned â€” they'll grade oddly);
   melody pitches within C1â€“B7 (else "transpose"); â‰¤999 notes / â‰¤300 bars;
   one time signature (first one used); â‰¤8 backing tracks.
2. **Copies** the file into `public/songs/`.
3. **Assigns track roles**: channel 9 â†’ Drum Track; GM programs 32â€“39 â†’ Bass
   Track; everything else takes the chain Chord â†’ Harmony â†’ Counter Melody â†’
   Extra 1â€“3.
4. **Registers** the song in `songs.ts` and `Songs.py` (note/bar/measure counts)
   via the `add-song:` marker comments. Duplicate keys are refused.

`scripts/inspect-midi.mjs` is the dry-run analyzer (same checks, prints the
entries without writing). `scripts/make-starter-song.mjs` is a template for
*composing* songs in code with @tonejs/midi. `build-apworld.ps1` re-zips the
apworld and installs it into `C:\ProgramData\Archipelago\custom_worlds`.

---

## 7. Customization map

| What | Where |
|---|---|
| UI colors | CSS variables in `webapp/src/index.css` `:root` (`--bg`, `--panel`, `--accent`, `--correct`, `--wrong`â€¦) |
| Staff note colors / paper | `CORRECT_COLOR`/`WRONG_COLOR` in `ScoreView.tsx`; `.score-scroll` background in index.css |
| UI font | `font-family` in `:root` (engraving glyphs are VexFlow's built-in font, not swappable via CSS) |
| Song panel wording | literal strings in `TrackList.tsx` |
| 100% message | `COMPLETE_MESSAGE` top of `App.tsx`; styling `.complete-banner` in index.css |
| Hotkeys | `DURATIONS[...].hotkey` in `theory.ts` + the key handler in `App.tsx` |
| Starting inventory | `STARTING_NOTE_VALUES` in `Items.py` (keep client `emptyUnlocks()` lenient) |
| Progression pacing | `RULE_TIERS` in `Rules.py`; `PRIORITY_OCTAVES` in `Items.py` |
| Layout density | `MIN_BAR_WIDTH`, `SYSTEM_HEIGHT` in `ScoreView.tsx`; `.score-scroll max-height` |
| New track role items | add `ItemData` in `Items.py` `composeapelago_tracks` + role chain in `add-song.mjs` |
| Offline grants | `public/offline-unlocks.json` |
| Grading strictness | `gradeEntry` in `grading.ts` (e.g. drop duration from the match key for pitch-only mode) |

Design decisions worth preserving:
- **Never reveal the answer visually** â€” feedback is only red/green after
  entry; the reference is *audio*.
- Items gate **abilities** (write/hear), not cosmetics. (Key signatures were
  deliberately NOT made items for this reason: they change notation, not
  ability, and gating them punishes readability. Recommended handling:
  auto-display from the MIDI + spell notes relative to the key. Not yet
  implemented â€” current engraving is sharps-only with per-note accidentals
  and no key signature drawn.)

## 8. Simplification notes (if rebuilding smaller)

Load-bearing and worth keeping even in a minimal version: integer tick grid,
sounding-note grading, the caret model (event/gap), the check ladder with the
flush-at-100% rule, and the two-sided song registry.

Cut candidates for a minimal build: bars location mode (per-note covers the
concept), cursor tools (keyboard + write-only clicks suffice), the tie item
(biggest source of edge cases: merging, cross-bar, engraving splits),
undo/redo, pitch-grid clicking, and looping. The 31 MB SoundFont can be
replaced by a small sf2/sf3 (e.g. TimGM6mb, ~6 MB) at a quality cost â€” one
line in `synth.ts`.

---

## 9. Hosting on the web

The client is a **fully static site**: `npm run build` â†’ `dist/` (HTML + JS +
the `public/` assets). Any static host works (Netlify, Vercel, GitHub Pages,
itch.io HTML upload, a plain nginx). No server code. Things that actually
matter:

1. **Mixed content / WebSocket security (the big one).** A page served over
   `https://` may only open `wss://` sockets. Self-hosted AP servers speak
   plain `ws://`, which browsers will block from an https page.
   Options:
   - Host the client on plain `http://` (fine for a hobby domain, ugly).
   - Tell users to use wss-capable hosts (seeds hosted on archipelago.gg
     support `wss://`), and have the client try `wss://` first. archipelago.js
     accepts explicit `ws://` / `wss://` prefixes in the login URL â€” today the
     client passes bare `host:port` and lets the library pick; for public
     hosting, add a protocol dropdown or try-wss-then-ws logic in `ap.ts`.
   - Or provide a small WSS reverse proxy for self-hosters.
2. **Asset weight.** The SoundFont is ~31 MB and loads on first user gesture.
   For public hosting: serve it compressed (brotli), cache it aggressively
   (immutable), consider a smaller font or SF3 (spessasynth supports it), and
   show a loading indicator (currently there is none â€” first Play just waits).
3. **Song licensing.** This is the real blocker for public deployment: the
   current library (All Star, One Last Breath, Pokemon Theme) is copyrighted
   music transcribed as MIDI. Fine on a private machine among friends;
   **not distributable on a public site**. For public hosting, stock the
   library with original compositions (see `make-starter-song.mjs` â€” the
   original "Getting Started" tune was built this way) or public-domain
   works (pre-1930 compositions; note MIDI *arrangements* can carry their own
   rights). The SoundFont (GeneralUser GS) has a permissive license that
   allows redistribution.
4. **Multiplayer reality check.** Every player needs the same song library
   the seed was generated with. Ship the apworld and the site as a matched
   pair (version the registry; the apworld's `world_version` and a version
   string in `songs.ts` should move together).
5. **Vite specifics.** Assets are referenced root-relative (`/songs/...`,
   `/soundfont/...`); if hosting under a subpath (GitHub Pages project site),
   set Vite's `base` accordingly. The SpessaSynth worklet is bundled via
   `?url` import and just works after `vite build`.
6. **Desktop-only** remains the scope: keyboard-first entry, no touch
   support, ResizeObserver layout works down to ~700 px width but the UX
   assumes a physical keyboard.

### Running everything locally (current workflow)

```
# client
cd webapp && npm install && npm run dev          # http://localhost:5173

# apworld into Archipelago
./build-apworld.ps1                              # zips + installs to custom_worlds

# generate + host a seed (Archipelago 0.6.6+ installed)
ArchipelagoGenerate.exe --player_files_path <folder with Composeapelago.yaml>
ArchipelagoServer.exe <output zip>               # default port 38281

# connect: host localhost, port 38281, slot name from the YAML
# server console: /send <player> "<item name>" grants items for testing
```

---

## 10. Known behaviors & limitations (iteration 1 scope)

- Melody line only, single voice, piano sound for the player's entry; no
  triplets/32nds (sixteenth grid), no dynamics/articulations/lyrics, no
  chords in the entry lane, first time-signature and tempo only for layout.
- Checks are a progress ladder (any matched target advances rung N), by
  design â€” the YAML/song count fixes the pool, the client caps and flushes.
- Checks are never revoked (AP checks are permanent); deleting a matched note
  lowers the % but already-sent checks stay sent.
- The running mix doesn't hot-swap when a track item arrives mid-playback;
  the next Play includes it.
- No error handling/guardrails beyond what live testing demanded (by
  request); notable one that WAS needed: `package.json` must stay BOM-free
  (PowerShell 5.1 writes BOMs by default and Vite chokes).
- AP reconnect: the client resends the full ladder on reconnect (server
  ignores duplicates); local entry state lives only in memory â€” a page reload
  loses the written score (no persistence yet).


