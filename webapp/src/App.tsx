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
import { LOCATION_MODE_BARS, connect, reportProgress } from "./ap";
import type { EntryEvent, EntryState } from "./entry";
import {
  backspaceTarget, cursorOnEvent, cursorTick, deleteEvent, emptyEntry,
  eventAtCursor, firstPosition, flattenEntry, insertAtCursor,
  insertEventInBar, lastPosition, moveCursorBy, referenceMidi, replaceEvent,
} from "./entry";
import { gradeEntry } from "./grading";
import type { MixMode } from "./playMidi";
import { buildPlaybackMidi, buildReferenceMidi, tickToSeconds } from "./playMidi";
import { loadSavedRun, saveRun } from "./save";
import type { Song } from "./song";
import { buildSong, listTracks } from "./song";
import type { SongDefinition } from "./songs";
import { pickRandomSong, songByKey } from "./songs";
import {
  auditionNote, initSynth, pausePlayback, playMidiFrom, playbackTime, seekTo, stopPlayback,
} from "./synth";
import type { DurationId } from "./theory";
import { DURATIONS, DURATION_IDS, TICKS_PER_QUARTER, midiToName, nearestMidiForLetter } from "./theory";
import type { Unlocks } from "./unlocks";
import { emptyUnlocks, hasDot, hasDuration, hasPitch, hasRest, hasSongTitleReveal, hasTie, loadOfflineUnlocks, visibleMeasureCount } from "./unlocks";

// Shown in the banner the moment the melody reaches 100% complete.
// Change it to whatever you want your players to see.
const COMPLETE_MESSAGE = "your did it";

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

  const apSessionRef = useRef<ApSession | null>(null);
  const playbackDirtyRef = useRef(true);
  const flashTimerRef = useRef<number>(0);

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
  const titleRevealed = hasSongTitleReveal(unlocks);
  const visibleMeasures = song ? visibleMeasureCount(unlocks, song.measureCount) : 1;
  void historyVersion;

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
    playbackDirtyRef.current = true;
    return newSong;
  }

  // ---------------------------------- entry editing ----------------------------------

  function flash(message: string) {
    setFlashText(message);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashText(""), 2500);
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
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(entry);
    syncHistoryButtons();
    setEntry(previous);
    markDirty();
  }

  function redo() {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(entry);
    syncHistoryButtons();
    setEntry(next);
    markDirty();
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
    // Edit mode: change the note under the cursor and leave the palette
    // alone. Entry mode: just arm the palette for the next note.
    if (editMode && song) {
      const current = eventAtCursor(entry)!;
      applyResult(replaceEvent(entry, entry.cursor.barIndex, entry.cursor.slot,
        { ...current, duration }, song.barTicks),
        current.kind === "note" ? current.midi : undefined);
      return;
    }
    setSelectedDuration(duration);
  }

  function toggleDot() {
    if (!hasDot(unlocks)) {
      flash("Dotted Modifier is locked.");
      return;
    }
    if (editMode && song) {
      const current = eventAtCursor(entry)!;
      applyResult(replaceEvent(entry, entry.cursor.barIndex, entry.cursor.slot,
        { ...current, dotted: !current.dotted }, song.barTicks),
        current.kind === "note" ? current.midi : undefined);
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
    else if (key === "arrowup") { e.preventDefault(); transposeCursor(1); }
    else if (key === "arrowdown") { e.preventDefault(); transposeCursor(-1); }
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
    const bytes = buildPlaybackMidi(song, placed, mixMode, unlocks);
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
      const session = await connect(host, port, slot, (names) => {
        setUnlocks((prev) => {
          const next = new Set(prev);
          for (const name of names) next.add(name);
          return next;
        });
      });
      apSessionRef.current = session;
      setConnected(true);
      setStatusText(`Connected as ${slot}`);
      // The seed decides which song this run is.
      const seedSong = songByKey(session.songKey);
      const activeSong = seedSong && seedSong.key !== song?.definition.key ? await loadSong(seedSong) : song;
      const save = loadSavedRun(session);
      if (save && activeSong && save.entry.bars.length === activeSong.measureCount) {
        setEntry(save.entry);
        setStatusText(`Connected as ${slot} - restored save`);
        markDirty();
      }
    } catch (error) {
      setStatusText(`Connection failed: ${String(error)}`);
    }
  }

  async function handleToggleOffline(enabled: boolean) {
    setOfflineMode(enabled);
    if (enabled) {
      const offline = await loadOfflineUnlocks();
      setUnlocks((prev) => {
        const next = new Set(prev);
        for (const name of offline) next.add(name);
        return next;
      });
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
          <TrackList song={song} tracks={listTracks(song.midi)} unlocks={unlocks} titleRevealed={titleRevealed} />
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
                disabled={undoStackRef.current.length === 0}
                onClick={undo}
              >undo</button>
              <button
                className="transport-button"
                title="Redo (Ctrl+Y)"
                disabled={redoStackRef.current.length === 0}
                onClick={redo}
              >redo</button>
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
          Keys: A-G notes | 1-5 duration | . dot | T tie | R rest | arrow keys move and transpose | # sharp | b flat on selected note | +/- octave | Ctrl+Z/Y undo/redo | Backspace delete | Space play | Esc stop | mouse uses Select / Write / Delete | right-click selects | green pitch cells enter notes
        </span>
      </footer>
    </div>
  );
}







