// The staff itself: renders the player's music with VexFlow as wrapped
// systems (rows of bars) that fit the container width and scroll
// vertically, just like real sheet music. Draws the cursor and turns mouse
// clicks back into actions depending on the active tool:
//
//   write  - click places a note at the clicked pitch (on top of an
//            existing note replaces it)
//   select - click moves the cursor onto the nearest note
//   delete - click removes the nearest note
//
// Right click always selects, whatever the tool.

import { useEffect, useRef, useState } from "react";
import { Accidental, Dot, Formatter, GhostNote, Renderer, Stave, StaveNote, StaveTie, StemmableNote } from "vexflow";
import type { EntryState, PlacedEvent } from "./entry";
import { flattenEntry } from "./entry";
import type { GradeResult } from "./grading";
import type { Song } from "./song";
import { DURATIONS, DURATION_IDS, TICKS_PER_QUARTER, diatonicToMidi, isBlackKey, midiToDiatonic, midiToVexKey } from "./theory";

export type CursorTool = "select" | "write" | "delete";

const MIN_BAR_WIDTH = 240;   // bars stretch up from this to fill the row
const SYSTEM_LEFT = 10;      // left margin of every system
const CLEF_EXTRA = 75;       // extra width on each system's first bar (clef + time sig)
const SYSTEM_HEIGHT = 170;   // vertical distance between systems
const SYSTEM_TOP = 40;       // staff top line offset inside its system band
const CURSOR_TOP = 15;       // cursor overlay offsets within a system band
const CURSOR_HEIGHT = 130;
const CORRECT_COLOR = "#2f9e44";
const RHYTHM_COLOR = "#f2c94c";
const WRONG_COLOR = "#e03131";

// The top line of a treble stave is F5; its diatonic index anchors the
// click-height-to-pitch math.
const TOP_LINE_DIATONIC = midiToDiatonic(77);

interface ScoreViewProps {
  song: Song;
  entry: EntryState;
  grade: GradeResult;
  editMode: boolean;               // caret is on a note (editing), not in a gap
  tool: CursorTool;
  playheadBar: number;             // bar currently playing, -1 when stopped
  loopRange: { from: number; to: number } | null;
  visibleMeasureCount: number;
  onPlaceNote: (midi: number, replace: { barIndex: number; slot: number } | null, barIndex: number) => void;
  onSelectEvent: (barIndex: number, slot: number) => void;
  onDeleteEvent: (barIndex: number, slot: number) => void;
}

// Where each bar landed during the VexFlow draw, so the click handler,
// highlights, and the cursor overlay can find things again.
interface BarGeometry {
  x: number;
  y: number;      // top of the system band this bar sits in
  width: number;
  gapX: number;   // where the caret sits when this bar's tail is selected
}

interface RenderGeometry {
  bars: BarGeometry[];
  noteXs: { barIndex: number; indexInBar: number; x: number }[];
  topLineOffset: number;  // stave top line y relative to the system band top
  lineSpacing: number;
}

export function ScoreView(props: ScoreViewProps) {
  const { song, entry, grade, editMode, tool, playheadBar, loopRange, visibleMeasureCount, onPlaceNote, onSelectEvent, onDeleteEvent } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<RenderGeometry | null>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  const placed = flattenEntry(entry, song.barTicks);

  // How many bars fit per system, and how wide each one gets after
  // stretching to fill the row edge to edge.
  const usable = Math.max(320, containerWidth - SYSTEM_LEFT * 2 - CLEF_EXTRA);
  const barsPerSystem = Math.max(1, Math.floor(usable / MIN_BAR_WIDTH));
  const shownMeasures = Math.max(1, Math.min(visibleMeasureCount, song.measureCount));
  const barWidth = usable / Math.min(barsPerSystem, shownMeasures);
  const systemCount = Math.ceil(shownMeasures / barsPerSystem);
  const totalHeight = systemCount * SYSTEM_HEIGHT + 30;

  // Refit whenever the window resizes the score area.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => setContainerWidth(scroller.clientWidth));
    observer.observe(scroller);
    setContainerWidth(scroller.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Redraw the whole score whenever the music, grading, or width changes.
  useEffect(() => {
    const host = drawRef.current;
    if (!host) return;
    host.innerHTML = "";

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(containerWidth, totalHeight);
    const ctx = renderer.getContext();

    const geometry: RenderGeometry = {
      bars: [],
      noteXs: [],
      topLineOffset: SYSTEM_TOP,
      lineSpacing: 10,
    };

    const vexByFlatIndex = new Map<number, StaveNote>();
    for (let barIndex = 0; barIndex < shownMeasures; barIndex++) {
      const system = Math.floor(barIndex / barsPerSystem);
      const columnInSystem = barIndex % barsPerSystem;
      const isSystemStart = columnInSystem === 0;
      const x = SYSTEM_LEFT + (isSystemStart ? 0 : CLEF_EXTRA + columnInSystem * barWidth);
      const y = system * SYSTEM_HEIGHT;
      const width = barWidth + (isSystemStart ? CLEF_EXTRA : 0);

      const stave = new Stave(x, y + SYSTEM_TOP, width);
      if (isSystemStart) {
        stave.addClef("treble");
        if (system === 0) stave.addTimeSignature(`${song.beatsPerBar}/${song.beatValue}`);
      }
      stave.setMeasure(barIndex + 1);
      stave.setContext(ctx).draw();

      geometry.topLineOffset = stave.getYForLine(0) - y;
      geometry.lineSpacing = stave.getSpacingBetweenLines();

      const barEvents = placed.filter((event) => event.barIndex === barIndex);
      const notes = buildBarNotes(barEvents, grade, song.barTicks, vexByFlatIndex);
      if (notes.length > 0) {
        Formatter.FormatAndDraw(ctx, stave, notes, { autoBeam: true, alignRests: false });
      }

      let lastNoteX = 0;
      for (const event of barEvents) {
        const vexNote = vexByFlatIndex.get(event.flatIndex);
        if (vexNote) {
          const noteX = vexNote.getAbsoluteX();
          geometry.noteXs.push({ barIndex, indexInBar: event.indexInBar, x: noteX });
          lastNoteX = noteX;
        }
      }

      // The caret spot for this bar's unfilled tail: after its last note,
      // or near the front of an empty bar.
      const gapX = barEvents.length > 0
        ? lastNoteX + 40
        : x + (isSystemStart ? CLEF_EXTRA : 0) + 25;
      geometry.bars.push({ x, y, width, gapX: Math.min(gapX, x + width - 12) });
    }

    // Ties between consecutive tied notes of the same pitch.
    for (let i = 0; i < placed.length - 1; i++) {
      const here = placed[i];
      const next = placed[i + 1];
      if (here.kind === "note" && here.tiedToNext && next.kind === "note" && next.midi === here.midi) {
        const firstNote = vexByFlatIndex.get(here.flatIndex);
        const lastNote = vexByFlatIndex.get(next.flatIndex);
        if (firstNote && lastNote) {
          // A tie across a system break draws as two half-ties.
          if (placed[i].barIndex % barsPerSystem === barsPerSystem - 1 && next.barIndex > here.barIndex) {
            new StaveTie({ firstNote, lastNote: undefined, firstIndexes: [0] }).setContext(ctx).draw();
            new StaveTie({ firstNote: undefined, lastNote, lastIndexes: [0] }).setContext(ctx).draw();
          } else {
            new StaveTie({ firstNote, lastNote, firstIndexes: [0], lastIndexes: [0] }).setContext(ctx).draw();
          }
        }
      }
    }

    geometryRef.current = geometry;
    positionCursor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, grade, song, containerWidth, totalHeight, barsPerSystem, barWidth, shownMeasures]);

  // The cursor is a plain div laid over the SVG, so moving it never needs
  // a VexFlow redraw. A caret on a note sits at that note; a caret in a
  // bar's gap sits after the bar's content (or at the front if empty).
  function positionCursor() {
    const geometry = geometryRef.current;
    const cursor = cursorRef.current;
    if (!geometry || !cursor) return;

    const { barIndex, slot } = entry.cursor;
    const bar = geometry.bars[barIndex];
    if (!bar) return;

    const hit = geometry.noteXs.find((n) => n.barIndex === barIndex && n.indexInBar === slot);
    const cursorX = hit ? hit.x : bar.gapX;
    const cursorY = bar.y + CURSOR_TOP;
    cursor.style.left = `${cursorX - 6}px`;
    cursor.style.top = `${cursorY}px`;

    // Keep the cursor's system in view while typing.
    const scroller = scrollRef.current;
    if (scroller) {
      const margin = 40;
      if (cursorY < scroller.scrollTop + margin
        || cursorY + SYSTEM_HEIGHT > scroller.scrollTop + scroller.clientHeight - margin) {
        scroller.scrollTo({ top: Math.max(0, cursorY - scroller.clientHeight / 2), behavior: "smooth" });
      }
    }
  }

  useEffect(positionCursor);

  // Which bar a click landed in, from its x/y inside the score.
  function barFromPoint(x: number, y: number): number {
    const geometry = geometryRef.current!;
    let best = 0;
    for (let barIndex = 0; barIndex < geometry.bars.length; barIndex++) {
      const bar = geometry.bars[barIndex];
      if (y >= bar.y && y < bar.y + SYSTEM_HEIGHT && x >= bar.x && x < bar.x + bar.width) return barIndex;
      if (y >= bar.y && y < bar.y + SYSTEM_HEIGHT) best = barIndex; // same row fallback
    }
    return best;
  }

  function pitchFromY(y: number, barIndex: number): number {
    const geometry = geometryRef.current!;
    const topLineY = (geometry.bars[barIndex]?.y ?? 0) + geometry.topLineOffset;
    const halfStep = geometry.lineSpacing / 2;
    const stepsBelowTop = Math.round((y - topLineY) / halfStep);
    return diatonicToMidi(TOP_LINE_DIATONIC - stepsBelowTop);
  }

  function nearestNote(x: number, barIndex: number): { barIndex: number; indexInBar: number; x: number } | null {
    const geometry = geometryRef.current!;
    let best: { barIndex: number; indexInBar: number; x: number } | null = null;
    for (const note of geometry.noteXs) {
      if (note.barIndex !== barIndex) continue;
      if (!best || Math.abs(note.x - x) < Math.abs(best.x - x)) best = note;
    }
    return best;
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const barIndex = barFromPoint(x, y);
    const near = nearestNote(x, barIndex);

    if (tool === "select") {
      if (near) onSelectEvent(near.barIndex, near.indexInBar);
      return;
    }
    if (tool === "delete") {
      if (near && Math.abs(near.x - x) < 30) onDeleteEvent(near.barIndex, near.indexInBar);
      return;
    }
    // Write: clicking on top of an existing note replaces it; anywhere else
    // in a bar adds a note to that bar (empty measures included).
    const midi = pitchFromY(y, barIndex);
    const replacing = near && Math.abs(near.x - x) < 20
      ? { barIndex: near.barIndex, slot: near.indexInBar }
      : null;
    onPlaceNote(midi, replacing, barIndex);
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const geometry = geometryRef.current;
    if (!geometry) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const near = nearestNote(x, barFromPoint(x, y));
    if (near) onSelectEvent(near.barIndex, near.indexInBar);
  }

  return (
    <div className={`score-scroll tool-${tool}`} ref={scrollRef}>
      <div
        className="score-inner"
        style={{ height: totalHeight }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {/* bar highlights sit under the SVG */}
        {Array.from({ length: shownMeasures }, (_, barIndex) => {
          const bar = geometryRef.current?.bars[barIndex];
          const isLooped = loopRange && barIndex >= loopRange.from && barIndex <= loopRange.to;
          const isPlaying = barIndex === playheadBar;
          if (!bar || (!isLooped && !isPlaying)) return null;
          return (
            <div
              key={barIndex}
              className={`bar-highlight${isPlaying ? " playing" : ""}${isLooped ? " looped" : ""}`}
              style={{ left: bar.x, top: bar.y, width: bar.width, height: SYSTEM_HEIGHT }}
            />
          );
        })}
        <div ref={drawRef} className="score-svg" />
        <div ref={cursorRef} className={`entry-cursor${editMode ? " edit-mode" : ""}`} style={{ height: CURSOR_HEIGHT }} />
      </div>
    </div>
  );
}

// Build the VexFlow notes for one bar: real notes and rests colored by
// correctness, plus invisible ghost notes padding out the unfilled tail of
// the bar so spacing stays proportional.
function buildBarNotes(
  barEvents: PlacedEvent[],
  grade: GradeResult,
  barTicks: number,
  vexByFlatIndex: Map<number, StaveNote>,
): StemmableNote[] {
  const notes: StemmableNote[] = [];
  let usedTicks = 0;

  const fullQuarterRestBar = barEvents.length > 1
    && barTicks === TICKS_PER_QUARTER * 4
    && barEvents.every((event) => event.kind === "rest" && event.duration === "quarter" && !event.dotted);
  if (fullQuarterRestBar) {
    const note = new StaveNote({ keys: ["b/4"], duration: "wr" });
    const allCorrect = barEvents.every((event) => grade.correctByFlatIndex[event.flatIndex]);
    const allRhythmCorrect = barEvents.every((event) => grade.rhythmCorrectByFlatIndex[event.flatIndex]);
    const color = allCorrect ? CORRECT_COLOR : allRhythmCorrect ? RHYTHM_COLOR : WRONG_COLOR;
    note.setStyle({ fillStyle: color, strokeStyle: color });
    for (const event of barEvents) vexByFlatIndex.set(event.flatIndex, note);
    return [note];
  }

  for (const event of barEvents) {
    const info = DURATIONS[event.duration];
    let note: StaveNote;
    if (event.kind === "rest") {
      note = new StaveNote({ keys: ["b/4"], duration: `${info.vexDuration}r` });
    } else {
      note = new StaveNote({ keys: [midiToVexKey(event.midi)], duration: info.vexDuration, autoStem: true });
      if (isBlackKey(event.midi)) {
        note.addModifier(new Accidental("#"), 0);
      }
    }
    if (event.dotted) {
      Dot.buildAndAttach([note], { all: true });
    }
    const color = grade.correctByFlatIndex[event.flatIndex]
      ? CORRECT_COLOR
      : grade.rhythmCorrectByFlatIndex[event.flatIndex]
        ? RHYTHM_COLOR
        : WRONG_COLOR;
    note.setStyle({ fillStyle: color, strokeStyle: color });
    vexByFlatIndex.set(event.flatIndex, note);
    notes.push(note);
    usedTicks += durationOf(event);
  }

  // Pad the remainder with ghosts (largest pieces first).
  let remaining = barTicks - usedTicks;
  for (const id of DURATION_IDS) {
    const info = DURATIONS[id];
    while (remaining >= info.ticks) {
      notes.push(new GhostNote(info.vexDuration));
      remaining -= info.ticks;
    }
  }
  return notes;
}

function durationOf(event: PlacedEvent): number {
  const base = DURATIONS[event.duration].ticks;
  return event.dotted ? base * 1.5 : base;
}





