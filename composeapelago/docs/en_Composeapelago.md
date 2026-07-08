# Composeapelago

## What is this game?

Composeapelago is a browser-based music notation game. A song plays; its
melody line is silenced and it is your job to rewrite that melody by ear,
note by note, on a staff.

## What do items do?

Three kinds of items exist:

- **Pitches** - every pitch class (C, C#, D ... B) in octaves 1 through 7,
  one item each. You cannot enter a pitch you do not own yet.
- **Note values** - half, eighth and sixteenth notes, the dotted modifier,
  and ties. You start with the quarter note, the whole note, and rests -
  enough to grade out a melody's held notes and earn your first checks.

Logic prioritizes the full rhythm toolbox and the octave 3-4 pitches
(where melodies live), so those items land early in the seed.
- **Backing tracks** - the song's accompaniment (Bass Track, Chord Track,
  Drum Track). Each one un-mutes that track in the mix.

Each run plays one song from the premade library, drawn at generation.
Everything else (octave movement, time signatures, key signatures) is
available from the start.

## What is a location check?

Depending on your YAML, either every correctly placed note ("Note N placed
correctly") or every completed bar ("Bar N completed"). Checks are sent in
sequence as your reconstruction grows.

## What is the goal?

Reconstruct the melody 100%. Any leftover checks are flushed at that moment
and the goal is sent.
