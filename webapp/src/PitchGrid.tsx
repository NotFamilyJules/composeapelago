// A map of every pitch item: columns are the 12 pitch classes, rows are
// octaves 7 (top) down to 1. Green cells are pitches you own; clicking one
// enters that exact note at the caret (clicking a locked cell just tells
// you it is locked).

import { HIGHEST_OCTAVE, LOWEST_OCTAVE, PITCH_CLASS_NAMES } from "./theory";
import type { Unlocks } from "./unlocks";
import { hasPitch } from "./unlocks";

interface PitchGridProps {
  unlocks: Unlocks;
  onPickPitch: (midi: number) => void;
}

export function PitchGrid(props: PitchGridProps) {
  const octaves = [];
  for (let octave = HIGHEST_OCTAVE; octave >= LOWEST_OCTAVE; octave--) octaves.push(octave);

  return (
    <div className="pitch-grid" title="Pitch items you own (each pitch + octave is an item). Click a cell to enter that note.">
      <div className="pitch-grid-row">
        <span className="pitch-grid-octave" />
        {PITCH_CLASS_NAMES.map((name) => (
          <span key={name} className="pitch-grid-letter">{name.replace("#", "♯")}</span>
        ))}
      </div>
      {octaves.map((octave) => (
        <div key={octave} className="pitch-grid-row">
          <span className="pitch-grid-octave">{octave}</span>
          {PITCH_CLASS_NAMES.map((name, pcIndex) => {
            const midi = (octave + 1) * 12 + pcIndex;
            const unlocked = hasPitch(props.unlocks, midi);
            return (
              <button
                key={name}
                className={`pitch-cell${unlocked ? " unlocked" : ""}`}
                title={`${name}${octave}${unlocked ? " - click to enter" : " - locked"}`}
                onClick={() => props.onPickPitch(midi)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
