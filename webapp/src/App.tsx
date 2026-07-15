// The top of the app: owns all state and wires the pieces together.
//
//   TrackList    - the run's song and which backing tracks are unlocked
//   ScoreView    - the staff, cursor, and mouse entry
//   Palette      - note value buttons with lock states
//   Transport    - play/pause/stop/loop/reference
//   ConnectPanel - Archipelago connection + offline mode
//
// Keyboard entry (Guitar Pro / Sibelius style) lives in keyHandlerRef.

import { useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import { ConnectPanel } from "./ConnectPanel";
import { Palette } from "./Palette";
import { PitchGrid } from "./PitchGrid";
import type { CursorTool } from "./ScoreView";
import { ScoreView } from "./ScoreView";
import { ToolSelect } from "./ToolSelect";
import { TrackList } from "./TrackList";
import { Transport } from "./Transport";
import type { ApSession } from "./ap";
import { LOCATION_MODE_BARS, connect, reportProgress, reportTitleGuess } from "./ap";
import type { EntryEvent, EntryState } from "./entry";
import {
  backspaceTarget, cursorOnEvent, cursorTick, deleteEvent, emptyEntry,
  eventAtCursor, firstPosition, flattenEntry, insertAtCursor,
  insertEventInBar, lastPosition, moveCursorBy, referenceMidi, replaceEvent,
} from "./entry";
import { gradeEntry, soundingNotes } from "./grading";
import type { MixMode } from "./playMidi";
import { buildPlaybackMidi, buildReferenceMidi, tickToSeconds } from "./playMidi";
import { loadSavedRun, saveRun } from "./save";
import type { Song } from "./song";
import { buildSong, listTracks } from "./song";
import type { SongDefinition } from "./songs";
import { pickRandomSong, songByIndex, songByKey } from "./songs";
import {
  auditionNote, initSynth, pausePlayback, playMidiFrom, playbackTime, seekTo, stopPlayback,
} from "./synth";
import type { DurationId } from "./theory";
import { DURATIONS, DURATION_IDS, HIGHEST_MIDI, LOWEST_MIDI, TICKS_PER_QUARTER, midiToName, nearestMidiForLetter } from "./theory";
import type { Unlocks } from "./unlocks";
import { addUnlocks, emptyUnlocks, hasDot, hasDuration, hasPitch, hasRest, hasSongTitleReveal, hasTie, hasUnlock, loadOfflineUnlocks, visibleMeasureCount } from "./unlocks";

// Shown in the banner the moment the melody reaches 100% complete.
// Change it to whatever you want your players to see.
const COMPLETE_MESSAGE = "your did it";
const RANDOM_HINT_ITEM = "Random Hint";
const NEXT_PITCH_ITEM = "Next Pitch";
const VOICE_CRACK_TRAP_ITEM = "Voice Crack Trap";
const DRUNK_DRUMMER_TRAP_ITEM = "Drunk Drummer Trap";
const TUNING_TRAP_ITEM = "Tuning Trap";
const SONG_TITLE_REVEAL_ITEM = "Song Title Reveal";

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

export default function App() {
  const [song, setSong] = useState<Song | null>(null);
  const [entry, setEntry] = useState<EntryState>(emptyEntry(1));
  const [selectedDuration, setSelectedDuration] = useState<DurationId>("quarter");
  const [dotted, setDotted] = useState(false);
  const [tool, setTool] = useState<CursorTool>("write");
  const [unlocks, setUnlocks] = useState<Unlocks>(emptyUnlocks());
  const [offlineMode, setOfflineMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [statusText, setStatusText] = useState("Not connected");
  const [flashText, setFlashText] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playheadBar, setPlayheadBar] = useState(-1);
  const [mixMode, setMixMode] = useState<MixMode>("full");
  const [loopRange, setLoopRange] = useState<{ from: number; to: number } | null>(null);
  const [titleGuess, setTitleGuess] = useState("");
  const [titleGuessed, setTitleGuessed] = useState(false);

  const apSessionRef = useRef<ApSession | null>(null);
  const playbackDirtyRef = useRef(true);
  const flashTimerRef = useRef<number>(0);
  const songRef = useRef<Song | null>(null);
  const entryRef = useRef<EntryState>(entry);
  const drunkDrummerPlaysRef = useRef(0);
  const tuningTrapPlaysRef = useRef(0);
  const copiedMeasureRef = useRef<EntryEvent[] | null>(null);

  // Undo/redo: snapshots of the entry state before each successful edit.
  // Cursor-only moves are not recorded. The stacks only ever change
  // together with setEntry, so renders always see fresh lengths.
  const undoStackRef = useRef<EntryState[]>([]);
  const redoStackRef = useRef<EntryState[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const HISTORY_LIMIT = 200;

  // ---------------------------------- derived state ----------------------------------

  const placed = useMemo(
    () => (song ? flattenEntry(entry, song.barTicks) : []),
    [entry, song],
  );

  const grade = useMemo(
    () => gradeEntry(placed, song?.targetNotes ?? [], song?.barTicks ?? TICKS_PER_QUARTER * 4),
    [placed, song],
  );

  const complete = grade.totalTargets > 0 && grade.matchedCount === grade.totalTargets;
  const titleRevealed = hasSongTitleReveal(unlocks) || titleGuessed;
  const visibleMeasures = song ? visibleMeasureCount(unlocks, song.measureCount) : 1;
  const canUndo = hasUnlock(unlocks, "Undo");
  const canRedo = hasUnlock(unlocks, "Redo");
  const canCopy = hasUnlock(unlocks, "Copy");
  const canPaste = hasUnlock(unlocks, "Paste");
  void historyVersion;

  useEffect(() => {
    songRef.current = song;
    entryRef.current = entry;
  }, [song, entry]);

  // Two modes, told apart by what the caret sits on:
  //   entry mode - caret in a gap (the unfilled tail of any bar): keys write
  //     new music into that bar, 1-5 and . pick what the NEXT note will be.
  //   edit mode  - caret on an existing event: keys change THAT event and
  //     leave the palette alone.
  const editMode = cursorOnEvent(entry);

  // ---------------------------------- song loading ----------------------------------

  // Every run gets a song from the premade library: a random one when
  // playing offline, the seed's pick once connected.
  useEffect(() => {
    loadSong(pickRandomSong());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSong(definition: SongDefinition, restoredEntry?: EntryState): Promise<Song> {
    const bytes = await (await fetch(definition.url)).arrayBuffer();
    const midi = new Midi(bytes);
    const newSong = buildSong(definition, bytes, midi);
    setSong(newSong);
    setEntry(restoredEntry ?? emptyEntry(newSong.measureCount));
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryButtons();
    setLoopRange(null);
    setTitleGuessed(false);
    setTitleGuess("");
    playbackDirtyRef.current = true;
    return newSong;
  }

  // ---------------------------------- entry editing ----------------------------------

  function flash(message: string) {
    setFlashText(message);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashText(""), 2500);
  }

  function submitTitleGuess(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!song) return;
    if (normalizeTitle(titleGuess) !== normalizeTitle(song.definition.name)) {
      flash("not quite");
      return;
    }
    setTitleGuessed(true);
    const session = apSessionRef.current;
    if (session && reportTitleGuess(session)) saveRun(session, entry);
    flash("song title guessed");
  }

  function markDirty() {
    playbackDirtyRef.current = true;
  }

  function syncHistoryButtons() {
    setHistoryVersion((version) => version + 1);
  }

  function applyResult(result: { state: EntryState; error?: string }, playMidiNote?: number) {
    if (result.error) {
      flash(result.error);
      return;
    }
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
    syncHistoryButtons();
    setEntry(result.state);
    markDirty();
    if (playMidiNote !== undefined) {
      initSynth().then(() => auditionNote(playMidiNote));
    }
  }

  function undo() {
    if (undoStackRef.current.length === 0) return;
    if (!canUndo) {
      flash("Undo is locked.");
      return;
    }
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(entry);
    syncHistoryButtons();
    setEntry(previous);
    markDirty();
  }

  function redo() {
    if (redoStackRef.current.length === 0) return;
    if (!canRedo) {
      flash("Redo is locked.");
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(entry);
    syncHistoryButtons();
    setEntry(next);
    markDirty();
  }

  function copyMeasure() {
    if (!song) return;
    if (!canCopy) {
      flash("Copy is locked.");
      return;
    }
    copiedMeasureRef.current = entry.bars[entry.cursor.barIndex].map((event) => ({ ...event }));
    flash(`copied measure ${entry.cursor.barIndex + 1}`);
  }

  function pasteMeasure() {
    if (!song) return;
    if (!canPaste) {
      flash("Paste is locked.");
      return;
    }
    const copied = copiedMeasureRef.current;
    if (!copied) {
      flash("nothing copied");
      return;
    }
    if (entry.cursor.barIndex >= visibleMeasures) {
      flash(`Measure ${entry.cursor.barIndex + 1} is locked.`);
      return;
    }
    const usedTicks = copied.reduce((sum, event) => sum + DURATIONS[event.duration].ticks * (event.dotted ? 1.5 : 1), 0);
    if (usedTicks > song.barTicks) {
      flash("copied measure does not fit");
      return;
    }
    applyResult({
      state: {
        bars: entry.bars.map((bar, index) => (
          index === entry.cursor.barIndex ? copied.map((event) => ({ ...event })) : bar
        )),
        cursor: { barIndex: entry.cursor.barIndex, slot: 0 },
      },
    });
  }
  // Can the palette's current duration/dot be used at all?
  function checkPaletteUnlocked(): boolean {
    if (!hasDuration(unlocks, selectedDuration)) {
      flash(`${DURATIONS[selectedDuration].itemName} is locked.`);
      return false;
    }
    if (dotted && !hasDot(unlocks)) {
      flash("Dotted Modifier is locked.");
      return false;
    }
    return true;
  }

  // target: where the note goes. "cursor" = the caret decides (replace the
  // event under it, or insert into its gap's bar); a number = insert into
  // that specific bar (mouse clicks in write mode).
  function enterNote(midi: number, target: { barIndex: number; slot: number } | number | "cursor") {
    if (!song) return;
    const targetBar = target === "cursor" ? entry.cursor.barIndex : typeof target === "number" ? target : target.barIndex;
    if (targetBar >= visibleMeasures) {
      flash(`Measure ${targetBar + 1} is locked.`);
      return;
    }
    if (!hasPitch(unlocks, midi)) {
      flash(`${midiToName(midi)} is locked.`);
      return;
    }
    if (!checkPaletteUnlocked()) return;

    const event: EntryEvent = { kind: "note", midi, duration: selectedDuration, dotted, tiedToNext: false };
    if (target === "cursor") {
      if (editMode) {
        applyResult(replaceEvent(entry, entry.cursor.barIndex, entry.cursor.slot, event, song.barTicks), midi);
      } else {
        applyResult(insertAtCursor(entry, event, song.barTicks), midi);
      }
    } else if (typeof target === "number") {
      applyResult(insertEventInBar(entry, target, event, song.barTicks), midi);
    } else {
      applyResult(replaceEvent(entry, target.barIndex, target.slot, event, song.barTicks), midi);
    }
  }

  function enterLetter(letter: string) {
    if (!song) return;
    const midi = nearestMidiForLetter(letter, referenceMidi(entry));
    enterNote(midi, "cursor");
  }

  function enterRest() {
    if (!song) return;
    if (!hasRest(unlocks)) {
      flash("Rest is locked.");
      return;
    }
    if (editMode) {
      const current = eventAtCursor(entry)!;
      applyResult(replaceEvent(entry, entry.cursor.barIndex, entry.cursor.slot,
        { ...current, kind: "rest", midi: 0, tiedToNext: false }, song.barTicks));
      return;
    }
    if (!checkPaletteUnlocked()) return;
    const event: EntryEvent = { kind: "rest", midi: 0, duration: selectedDuration, dotted, tiedToNext: false };
    applyResult(insertAtCursor(entry, event, song.barTicks));
  }

  // The event that pitch-changing keys and T act on: the one under the
  // caret, or the one just before a gap caret (the note you just typed).
  function activeEvent(): { barIndex: number; slot: number; event: EntryEvent } | null {
    const target = backspaceTarget(entry);
    if (!target) return null;
    const event = entry.bars[target.barIndex]?.[target.slot];
    return event ? { ...target, event } : null;
  }

  // T: Guitar Pro style tie - tie the active note and append a note of the
  // same pitch after it. T on a selected note just toggles its tie flag.
  function enterTie() {
    if (!song) return;
    if (!hasTie(unlocks)) {
      flash("Tie is locked.");
      return;
    }
    const active = activeEvent();
    if (!active || active.event.kind !== "note") {
      flash("Select a note to tie from.");
      return;
    }

    if (editMode) {
      applyResult(replaceEvent(entry, active.barIndex, active.slot,
        { ...active.event, tiedToNext: !active.event.tiedToNext }, song.barTicks));
      return;
    }

    if (!checkPaletteUnlocked()) return;
    const tiedSource = replaceEvent(entry, active.barIndex, active.slot,
      { ...active.event, tiedToNext: true }, song.barTicks);
    if (tiedSource.error) {
      flash(tiedSource.error);
      return;
    }
    const continuation: EntryEvent = { kind: "note", midi: active.event.midi, duration: selectedDuration, dotted, tiedToNext: false };
    applyResult(insertAtCursor(tiedSource.state, continuation, song.barTicks), active.event.midi);
  }

  function selectDuration(duration: DurationId) {
    if (!hasDuration(unlocks, duration)) {
      flash(`${DURATIONS[duration].itemName} is locked.`);
      return;
    }
    setSelectedDuration(duration);
  }

  function toggleDot() {
    if (!hasDot(unlocks)) {
      flash("Dotted Modifier is locked.");
      return;
    }
    setDotted((d) => !d);
  }

  function transposeCursor(semitones: number) {
    if (!song) return;
    const active = activeEvent();
    if (!active || active.event.kind !== "note") return;
    const midi = active.event.midi + semitones;
    if (!hasPitch(unlocks, midi)) {
      flash(`${midiToName(midi)} is locked.`);
      return;
    }
    applyResult(replaceEvent(entry, active.barIndex, active.slot, { ...active.event, midi }, song.barTicks), midi);
  }

  function transposeCursorToOwnedPitch(direction: 1 | -1) {
    if (!song) return;
    const active = activeEvent();
    if (!active || active.event.kind !== "note") return;

    let midi = active.event.midi + direction;
    while (midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI) {
      if (hasPitch(unlocks, midi)) {
        applyResult(replaceEvent(entry, active.barIndex, active.slot, { ...active.event, midi }, song.barTicks), midi);
        return;
      }
      midi += direction;
    }
    flash("No unlocked pitch that way.");
  }

  function deleteAtCursor() {
    if (!song) return;
    const target = backspaceTarget(entry);
    if (!target) return;
    applyResult(deleteEvent(entry, target.barIndex, target.slot, song.barTicks));
  }

  function fillQuarterRests() {
    if (!song) return;
    if (!hasRest(unlocks) || !hasDuration(unlocks, "quarter")) return;
    if (song.barTicks % TICKS_PER_QUARTER !== 0) {
      flash("Quarter rests do not fill this time signature evenly.");
      return;
    }
    const restsPerBar = song.barTicks / TICKS_PER_QUARTER;
    const rest: EntryEvent = { kind: "rest", midi: 0, duration: "quarter", dotted: false, tiedToNext: false };
    applyResult({
      state: {
        bars: Array.from({ length: song.measureCount }, (_, index) => (
          index < visibleMeasures ? Array.from({ length: restsPerBar }, () => ({ ...rest })) : []
        )),
        cursor: { barIndex: 0, slot: 0 },
      },
    });
  }

  function nextMissingTargetNote() {
    const currentSong = songRef.current;
    const currentEntry = entryRef.current;
    if (!currentSong) return null;

    const currentPlaced = flattenEntry(currentEntry, currentSong.barTicks);
    const matchedKeys = new Set(
      soundingNotes(currentPlaced).map((note) => `${note.startTick}:${note.durationTicks}:${note.midi}`),
    );
    return currentSong.targetNotes.find(
      (note) => !matchedKeys.has(`${note.startTick}:${note.durationTicks}:${note.midi}`),
    ) ?? null;
  }

  function showRandomHint() {
    const currentSong = songRef.current;
    if (!currentSong) return;

    const firstNoteByMeasure = new Map<number, { midi: number }>();
    for (const note of currentSong.targetNotes) {
      const measure = Math.floor(note.startTick / currentSong.barTicks) + 1;
      if (!firstNoteByMeasure.has(measure)) firstNoteByMeasure.set(measure, note);
    }

    const measures = [...firstNoteByMeasure.keys()];
    if (measures.length === 0) return;

    const measure = measures[Math.floor(Math.random() * measures.length)];
    const note = firstNoteByMeasure.get(measure)!;
    flash(`Random Hint: measure ${measure} starts with ${midiToName(note.midi)}.`);
  }

  function playNextPitch() {
    const target = nextMissingTargetNote();
    if (!target) {
      flash("Next Pitch: melody is already solved.");
      return;
    }
    initSynth().then(() => auditionNote(target.midi));
    flash("Next Pitch: played the next missing pitch.");
  }

  function applyVoiceCrackTrap() {
    setEntry((current) => {
      const notes: { barIndex: number; slot: number }[] = [];
      current.bars.forEach((bar, barIndex) => {
        bar.forEach((event, slot) => {
          if (event.kind === "note") notes.push({ barIndex, slot });
        });
      });

      if (notes.length === 0) {
        flash("Voice Crack Trap: no notes to crack.");
        return current;
      }

      const picked = notes[Math.floor(Math.random() * notes.length)];
      const bars = current.bars.map((bar, barIndex) => (
        barIndex === picked.barIndex
          ? bar.map((event, slot) => (
            slot === picked.slot ? { ...event, midi: HIGHEST_MIDI, tiedToNext: false } : event
          ))
          : bar
      ));
      flash(`Voice Crack Trap: one note jumped to ${midiToName(HIGHEST_MIDI)}.`);
      markDirty();
      return { ...current, bars };
    });
  }

  function applyDrunkDrummerTrap() {
    drunkDrummerPlaysRef.current += 3;
    flash(`Drunk Drummer Trap: drums offset for ${drunkDrummerPlaysRef.current} plays.`);
  }

  function applyTuningTrap() {
    tuningTrapPlaysRef.current += 1;
    flash("Tuning Trap: melody playback will be one semitone low next play.");
  }

  function receiveItems(itemNames: string[], runEffects = true) {
    const unlockItems = itemNames.filter(
      (name) => name !== RANDOM_HINT_ITEM
        && name !== NEXT_PITCH_ITEM
        && name !== VOICE_CRACK_TRAP_ITEM
        && name !== DRUNK_DRUMMER_TRAP_ITEM
        && name !== TUNING_TRAP_ITEM,
    );
    if (unlockItems.length > 0) setUnlocks((prev) => addUnlocks(prev, unlockItems));
    if (itemNames.includes(SONG_TITLE_REVEAL_ITEM)) {
      setTitleGuessed(true);
      const session = apSessionRef.current;
      if (session && reportTitleGuess(session)) saveRun(session, entryRef.current);
    }

    if (!runEffects) return;
    for (const name of itemNames) {
      if (name === RANDOM_HINT_ITEM) showRandomHint();
      else if (name === NEXT_PITCH_ITEM) playNextPitch();
      else if (name === VOICE_CRACK_TRAP_ITEM) applyVoiceCrackTrap();
      else if (name === DRUNK_DRUMMER_TRAP_ITEM) applyDrunkDrummerTrap();
      else if (name === TUNING_TRAP_ITEM) applyTuningTrap();
    }
  }
  // ---------------------------------- keyboard ----------------------------------

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();

    // Shortcuts with Ctrl/Cmd held: undo and redo only. Anything else
    // (Ctrl+C and friends) must never enter notes.
    if (e.ctrlKey || e.metaKey) {
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (key === "c") { e.preventDefault(); copyMeasure(); }
      else if (key === "v") { e.preventDefault(); pasteMeasure(); }
      return;
    }

    const durationForKey = DURATION_IDS.find((id) => DURATIONS[id].hotkey === key);

    if (durationForKey) selectDuration(durationForKey);
    else if (key === ".") toggleDot();
    // b is both the flat accidental and the note B: on a selected note it
    // flattens, in a gap it types the note.
    else if (key === "b" && editMode) transposeCursor(-1);
    else if (key === "#") transposeCursor(1);
    else if (key.length === 1 && "abcdefg".includes(key)) enterLetter(key);
    else if (key === "r") enterRest();
    else if (key === "t") enterTie();
    else if (key === "arrowleft") { e.preventDefault(); if (song) setEntry((s) => moveCursorBy(s, -1, song.barTicks)); }
    else if (key === "arrowright") { e.preventDefault(); if (song) setEntry((s) => moveCursorBy(s, 1, song.barTicks)); }
    else if (key === "arrowup") { e.preventDefault(); transposeCursorToOwnedPitch(1); }
    else if (key === "arrowdown") { e.preventDefault(); transposeCursorToOwnedPitch(-1); }
    else if (key === "+" || key === "=") transposeCursor(12);
    else if (key === "-") transposeCursor(-12);
    else if (key === "backspace") { e.preventDefault(); deleteAtCursor(); }
    else if (key === "home") { e.preventDefault(); if (song) setEntry((s) => ({ ...s, cursor: firstPosition(s, song.barTicks) })); }
    else if (key === "end") { e.preventDefault(); if (song) setEntry((s) => ({ ...s, cursor: lastPosition(s, song.barTicks) })); }
    else if (key === " ") { e.preventDefault(); handlePlayPause(); }
    else if (key === "escape") handleStop();
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // ---------------------------------- playback ----------------------------------

  function cursorStartTick(): number {
    if (!song) return 0;
    return cursorTick(entry, song.barTicks);
  }

  async function handlePlayPause() {
    if (!song) return;
    await initSynth();
    if (playing) {
      pausePlayback();
      setPlaying(false);
      return;
    }
    // Play always starts from wherever the cursor is.
    const drunkDrummer = drunkDrummerPlaysRef.current > 0;
    const tuningTrap = tuningTrapPlaysRef.current > 0;
    const bytes = buildPlaybackMidi(song, placed, mixMode, unlocks, { drunkDrummer, tuningTrap });
    if (drunkDrummer) {
      drunkDrummerPlaysRef.current -= 1;
      flash(`Drunk Drummer Trap: ${drunkDrummerPlaysRef.current} plays left.`);
    }
    if (tuningTrap) {
      tuningTrapPlaysRef.current -= 1;
      flash("Tuning Trap: melody playback is one semitone low.");
    }
    playMidiFrom(bytes, tickToSeconds(song, cursorStartTick()));
    playbackDirtyRef.current = false;
    setPlaying(true);
  }

  function handleStop() {
    stopPlayback();
    setPlaying(false);
    setPlayheadBar(-1);
    // Stop returns the cursor to the beginning.
    if (song) setEntry((s) => ({ ...s, cursor: firstPosition(s, song.barTicks) }));
  }

  async function handleReferenceListen() {
    if (!song) return;
    await initSynth();
    const cursorBar = Math.floor(cursorStartTick() / song.barTicks);
    const fromBar = loopRange?.from ?? cursorBar;
    const toBar = loopRange?.to ?? cursorBar;
    const bytes = buildReferenceMidi(song, fromBar, toBar);
    playMidiFrom(bytes, tickToSeconds(song, fromBar * song.barTicks));
    playbackDirtyRef.current = true; // next Play must rebuild the real mix
    setPlaying(true);
  }

  // Follow playback: move the bar highlight, apply the loop, stop at the end.
  useEffect(() => {
    if (!playing || !song) return;
    let raf = 0;
    const tick = () => {
      const seconds = playbackTime();
      const fileTicks = song.midi.header.secondsToTicks(seconds);
      const ourTicks = fileTicks * (TICKS_PER_QUARTER / song.midi.header.ppq);
      const bar = Math.floor(ourTicks / song.barTicks);
      setPlayheadBar(bar);

      if (loopRange && ourTicks >= (loopRange.to + 1) * song.barTicks) {
        seekTo(tickToSeconds(song, loopRange.from * song.barTicks));
      }
      if (bar >= song.measureCount + 1) {
        handleStop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, loopRange, song]);

  // ---------------------------------- Archipelago ----------------------------------

  async function handleConnect(host: string, port: string, slot: string) {
    try {
      const session = await connect(host, port, slot, receiveItems);

      apSessionRef.current = session;
      setConnected(true);
      setStatusText(`Connected as ${slot}`);
      // The seed decides which song this run is.
      const seedSong = songByIndex(session.songIndex) ?? songByKey(session.songKey);
      const activeSong = seedSong && seedSong.key !== song?.definition.key ? await loadSong(seedSong) : song;
      const save = loadSavedRun(session);
      if (save && activeSong && save.entry.bars.length === activeSong.measureCount) {
        setEntry(save.entry);
        setStatusText(`Connected as ${slot} - restored save`);
        markDirty();
      }
      if (session.client.items.received.some((item) => item.name === SONG_TITLE_REVEAL_ITEM)) {
        setTitleGuessed(true);
        reportTitleGuess(session);
      }
    } catch (error) {
      setStatusText(`Connection failed: ${String(error)}`);
    }
  }

  async function handleToggleOffline(enabled: boolean) {
    setOfflineMode(enabled);
    if (enabled) {
      const offline = await loadOfflineUnlocks();
      setUnlocks(offline);
      setStatusText("Offline dev mode: unlocks from offline-unlocks.json");
    }
  }

  // Send checks whenever progress grows; flush everything at 100%.
  useEffect(() => {
    const session = apSessionRef.current;
    if (!session) return;
    const progress = session.options.location_mode === LOCATION_MODE_BARS
      ? grade.completedBars
      : grade.checkProgressCount;
    if (reportProgress(session, progress, complete)) {
      saveRun(session, entry);
    }
  }, [grade, complete, entry]);

  // ---------------------------------- render ----------------------------------

  return (
    <div className="app">
      <header>
        <h1>Composeapelago</h1>
        <ConnectPanel
          connected={connected}
          offlineMode={offlineMode}
          statusText={statusText}
          onConnect={handleConnect}
          onToggleOffline={handleToggleOffline}
        />
      </header>

      {song && (
        <div className="song-panel">
          <div className="song-info-column">
            <TrackList song={song} tracks={listTracks(song.midi)} unlocks={unlocks} titleRevealed={titleRevealed} />
            {!titleRevealed && (
              <form className="title-guess" onSubmit={submitTitleGuess}>
                <input
                  value={titleGuess}
                  onChange={(event) => setTitleGuess(event.target.value)}
                  placeholder="guess song title"
                />
                <button type="submit">guess</button>
              </form>
            )}
          </div>
          <PitchGrid unlocks={unlocks} onPickPitch={(midi) => enterNote(midi, "cursor")} />
        </div>
      )}

      {song && (
        <>
          <div className="toolbar">
            <Transport
              playing={playing}
              tempoBpm={song.tempoBpm}
              measureCount={visibleMeasures}
              mixMode={mixMode}
              loopRange={loopRange}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onSetMixMode={(mode) => { setMixMode(mode); markDirty(); }}
              onSetLoopRange={setLoopRange}
              onReferenceListen={handleReferenceListen}
            />

            <div className="palette-divider" />

            <Palette
              unlocks={unlocks}
              selectedDuration={selectedDuration}
              dotted={dotted}
              onSelectDuration={selectDuration}
              onToggleDot={toggleDot}
              onTie={enterTie}
              onRest={enterRest}
            />

            <div className="palette-divider" />

            <button
              className="transport-button fill-rests-button"
              title="Fill every bar with quarter-note rests"
              onClick={fillQuarterRests}
              disabled={!hasRest(unlocks) || !hasDuration(unlocks, "quarter")}
            >Rests</button>

            <div className="palette-divider" />

            <ToolSelect tool={tool} onSetTool={setTool} />

            <div className="palette-divider" />

            <div className="history-buttons">
              <button
                className="transport-button"
                title="Undo (Ctrl+Z)"
                disabled={!canUndo || undoStackRef.current.length === 0}
                onClick={undo}
              >undo</button>
              <button
                className="transport-button"
                title="Redo (Ctrl+Y)"
                disabled={!canRedo || redoStackRef.current.length === 0}
                onClick={redo}
              >redo</button>
              <button
                className="transport-button"
                title="Copy measure (Ctrl+C)"
                disabled={!canCopy}
                onClick={copyMeasure}
              >copy</button>
              <button
                className="transport-button"
                title="Paste measure (Ctrl+V)"
                disabled={!canPaste}
                onClick={pasteMeasure}
              >paste</button>
            </div>

            <span className="completion">
              {(grade.completion * 100).toFixed(1)}% complete
            </span>
          </div>

          {complete && <div className="complete-banner">{COMPLETE_MESSAGE}</div>}

          <ScoreView
            song={song}
            entry={entry}
            grade={grade}
            editMode={editMode}
            tool={tool}
            playheadBar={playheadBar}
            loopRange={loopRange}
            visibleMeasureCount={visibleMeasures}
            onPlaceNote={(midi, replace, barIndex) => enterNote(midi, replace ?? barIndex)}
            onSelectEvent={(barIndex, slot) => setEntry((s) => ({ ...s, cursor: { barIndex, slot } }))}
            onDeleteEvent={(barIndex, slot) => {
              if (song) applyResult(deleteEvent(entry, barIndex, slot, song.barTicks));
            }}
          />
        </>
      )}

      <div className={`flash${flashText ? " visible" : ""}`}>{flashText}</div>

      <footer>
        <span>
          Keys: A-G notes | 1-5 durations | . dot | T tie | R rest | arrows move or transpose | #/b semitone | +/- octave | Ctrl+Z/Y undo/redo | Ctrl+C/V copy/paste measure | Backspace delete | Space play | Esc stop
        </span>
      </footer>
    </div>
  );
}







