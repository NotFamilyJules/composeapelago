// Hand-drawn SVG icons for the palette. Unicode music glyphs render with
// detached stems in a lot of fonts, so we draw our own: the stem is a line
// that starts exactly at the notehead, guaranteed attached.

import type { DurationId } from "./theory";

export type NoteIconKind = DurationId | "dot" | "tie" | "rest";

interface NoteIconProps {
  kind: NoteIconKind;
}

// Shared geometry: notehead centered at (12, 30), stem on its right edge
// rising to y=7, flags hanging off the stem top.
const HEAD_CX = 12;
const HEAD_CY = 30;
const STEM_X = 16.6;
const STEM_TOP = 7;

function Head({ filled }: { filled: boolean }) {
  return (
    <ellipse
      cx={HEAD_CX} cy={HEAD_CY} rx={5.6} ry={4.1}
      transform={`rotate(-20 ${HEAD_CX} ${HEAD_CY})`}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth={1.8}
    />
  );
}

function Stem() {
  return <line x1={STEM_X} y1={HEAD_CY} x2={STEM_X} y2={STEM_TOP} stroke="currentColor" strokeWidth={1.8} />;
}

function Flag({ atY }: { atY: number }) {
  return (
    <path
      d={`M${STEM_X} ${atY} C ${STEM_X + 6} ${atY + 4}, ${STEM_X + 6} ${atY + 10}, ${STEM_X + 1} ${atY + 15}`}
      fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
    />
  );
}

export function NoteIcon({ kind }: NoteIconProps) {
  return (
    <svg className="note-icon" viewBox="0 0 26 40" width={22} height={32} aria-hidden>
      {kind === "whole" && (
        <ellipse cx={13} cy={20} rx={7} ry={4.6} fill="none" stroke="currentColor" strokeWidth={2.2} />
      )}
      {kind === "half" && (<><Head filled={false} /><Stem /></>)}
      {kind === "quarter" && (<><Head filled /><Stem /></>)}
      {kind === "eighth" && (<><Head filled /><Stem /><Flag atY={STEM_TOP} /></>)}
      {kind === "sixteenth" && (<><Head filled /><Stem /><Flag atY={STEM_TOP} /><Flag atY={STEM_TOP + 7} /></>)}
      {kind === "dot" && <circle cx={13} cy={20} r={3.2} fill="currentColor" />}
      {kind === "tie" && (
        <path d="M4 17 Q 13 26, 22 17" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      )}
      {kind === "rest" && (
        <path
          d="M10 7 L16 14 L11 20 L16 26 Q9 24 12 32"
          fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
