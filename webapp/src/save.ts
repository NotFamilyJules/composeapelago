import type { ApSession } from "./ap";
import type { EntryState } from "./entry";

const SAVE_PREFIX = "composeapelago:v1";

interface SavedRun {
  entry: EntryState;
  checksSent: number;
  goalSent: boolean;
}

export function saveKeyForSession(session: ApSession): string {
  return [
    SAVE_PREFIX,
    session.seedName,
    session.slotName,
    session.songKey,
    session.options.location_mode,
  ].join(":");
}

export function loadSavedRun(session: ApSession): SavedRun | null {
  const raw = localStorage.getItem(saveKeyForSession(session));
  if (!raw) return null;
  const save = JSON.parse(raw) as SavedRun;
  return save.entry?.bars ? save : null;
}

export function saveRun(session: ApSession, entry: EntryState): void {
  const save: SavedRun = {
    entry,
    checksSent: session.checksSent,
    goalSent: session.goalSent,
  };
  localStorage.setItem(saveKeyForSession(session), JSON.stringify(save));
}