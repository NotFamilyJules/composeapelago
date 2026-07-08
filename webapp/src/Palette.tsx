// The note value palette: duration buttons plus dot / tie / rest toggles.
// Locked tools stay visible but dimmed with a lock icon, exactly like the
// mission list in a certain N64 randomizer.

import { NoteIcon } from "./NoteIcon";
import type { DurationId } from "./theory";
import { DURATIONS, DURATION_IDS } from "./theory";
import type { Unlocks } from "./unlocks";
import { hasDot, hasDuration, hasRest, hasTie } from "./unlocks";

interface PaletteProps {
  unlocks: Unlocks;
  selectedDuration: DurationId;
  dotted: boolean;
  onSelectDuration: (duration: DurationId) => void;
  onToggleDot: () => void;
  onTie: () => void;
  onRest: () => void;
}

export function Palette(props: PaletteProps) {
  const { unlocks, selectedDuration, dotted } = props;

  return (
    <div className="palette">
      {DURATION_IDS.map((id) => {
        const unlocked = hasDuration(unlocks, id);
        return (
          <button
            key={id}
            className={`palette-button${selectedDuration === id ? " selected" : ""}${unlocked ? "" : " locked"}`}
            disabled={!unlocked}
            title={`${DURATIONS[id].label} (${DURATIONS[id].hotkey})${unlocked ? "" : " - locked"}`}
            onClick={() => props.onSelectDuration(id)}
          >
            <NoteIcon kind={id} />
            <span className="hotkey">{DURATIONS[id].hotkey}</span>
            {!unlocked && <span className="lock">🔒</span>}
          </button>
        );
      })}

      <div className="palette-divider" />

      <button
        className={`palette-button${dotted ? " selected" : ""}${hasDot(unlocks) ? "" : " locked"}`}
        disabled={!hasDot(unlocks)}
        title="Dotted (.)"
        onClick={props.onToggleDot}
      >
        <NoteIcon kind="dot" />
        <span className="hotkey">.</span>
        {!hasDot(unlocks) && <span className="lock">🔒</span>}
      </button>

      <button
        className={`palette-button${hasTie(unlocks) ? "" : " locked"}`}
        disabled={!hasTie(unlocks)}
        title="Tie (T)"
        onClick={props.onTie}
      >
        <NoteIcon kind="tie" />
        <span className="hotkey">T</span>
        {!hasTie(unlocks) && <span className="lock">🔒</span>}
      </button>

      <button
        className={`palette-button${hasRest(unlocks) ? "" : " locked"}`}
        disabled={!hasRest(unlocks)}
        title="Rest (R)"
        onClick={props.onRest}
      >
        <NoteIcon kind="rest" />
        <span className="hotkey">R</span>
        {!hasRest(unlocks) && <span className="lock">🔒</span>}
      </button>
    </div>
  );
}
