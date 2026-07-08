// Playback controls: play/pause/stop, tempo readout, bar range looping,
// full mix vs melody solo, and the reference listen button.

import type { MixMode } from "./playMidi";

interface TransportProps {
  playing: boolean;
  tempoBpm: number;
  measureCount: number;
  mixMode: MixMode;
  loopRange: { from: number; to: number } | null;
  onPlayPause: () => void;
  onStop: () => void;
  onSetMixMode: (mode: MixMode) => void;
  onSetLoopRange: (range: { from: number; to: number } | null) => void;
  onReferenceListen: () => void;
}

export function Transport(props: TransportProps) {
  const { playing, tempoBpm, measureCount, mixMode, loopRange } = props;

  function updateLoop(part: "from" | "to", value: number) {
    const bar = Math.max(1, Math.min(measureCount, value)) - 1;
    const current = loopRange ?? { from: 0, to: measureCount - 1 };
    const next = { ...current, [part]: bar };
    if (next.to < next.from) next.to = next.from;
    props.onSetLoopRange(next);
  }

  return (
    <div className="transport">
      <button className="transport-button" onClick={props.onPlayPause} title="Play/Pause (Space)">
        {playing ? "⏸" : "▶"}
      </button>
      <button className="transport-button" onClick={props.onStop} title="Stop (Esc)">
        ⏹
      </button>

      <span className="tempo">♩ = {tempoBpm}</span>

      <label className="mix-select">
        <select value={mixMode} onChange={(e) => props.onSetMixMode(e.target.value as MixMode)}>
          <option value="full">Full mix</option>
          <option value="solo">Melody solo</option>
        </select>
      </label>

      <span className="loop-controls">
        <label>
          <input
            type="checkbox"
            checked={loopRange !== null}
            onChange={(e) => props.onSetLoopRange(e.target.checked ? { from: 0, to: measureCount - 1 } : null)}
          />
          Loop bars
        </label>
        {loopRange && (
          <>
            <input
              type="number" min={1} max={measureCount} value={loopRange.from + 1}
              onChange={(e) => updateLoop("from", Number(e.target.value))}
            />
            <span>to</span>
            <input
              type="number" min={1} max={measureCount} value={loopRange.to + 1}
              onChange={(e) => updateLoop("to", Number(e.target.value))}
            />
          </>
        )}
      </span>

      <button className="reference-button" onClick={props.onReferenceListen} title="Play the target melody for the cursor's bar (or looped bars)">
        👂 Reference
      </button>
    </div>
  );
}
