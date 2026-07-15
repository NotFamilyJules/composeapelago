// The Archipelago connection. Connect with host/port/slot, receive items
// as unlock names, send location checks as the melody grows, send the goal
// at 100%.
//
// Location ids are hardcoded to match the apworld's Locations.py:
//   Note N placed correctly = 76245000 + N
//   Bar N completed         = 76246000 + N

import { Client } from "archipelago.js";

const NOTE_LOCATION_BASE = 76245000;
const BAR_LOCATION_BASE = 76246000;
const TITLE_GUESS_LOCATION_ID = 76248001;

export const LOCATION_MODE_PER_NOTE = 0;
export const LOCATION_MODE_BARS = 1;

// What the apworld puts in slot_data (see __init__.py fill_slot_data).
// Location counts are not options anymore: they come from the chosen song,
// and TotalLocations carries the result.
export interface SlotOptions {
  location_mode: number;
}

interface SlotData {
  options: SlotOptions;
  song: string; // fallback key for older apworlds
  song_index?: number; // indexed song picked by the apworld
  Seed: string;
  Slot: string;
  TotalLocations: number;
  TotalMeasures: number;
}

export interface ApSession {
  client: Client;
  options: SlotOptions;
  songKey: string;
  songIndex: number;
  seedName: string;
  slotName: string;
  totalLocations: number;
  totalMeasures: number;
  checksSent: number; // how many rungs of the location ladder we've sent
  goalSent: boolean;
  titleGuessSent: boolean;
}

function checkedCountForSession(client: Client, locationMode: number, totalLocations: number): number {
  const base = locationMode === LOCATION_MODE_BARS ? BAR_LOCATION_BASE : NOTE_LOCATION_BASE;
  const checked = new Set(client.room.checkedLocations);
  let count = 0;
  for (let n = 1; n <= totalLocations; n++) {
    if (checked.has(base + n)) count++;
  }
  return count;
}

export async function connect(
  host: string,
  port: string,
  slot: string,
  onItems: (itemNames: string[], runEffects: boolean) => void,
): Promise<ApSession> {
  const client = new Client();

  const slotData = await client.login<Record<string, never>>(
    `${host}:${port}`, slot, "Composeapelago",
  ) as unknown as SlotData;

  onItems(client.items.received.map((item) => item.name), false);
  client.items.on("itemsReceived", (items) => {
    onItems(items.map((item) => item.name), true);
  });

  return {
    client,
    options: slotData.options,
    songKey: slotData.song ?? "",
    songIndex: slotData.song_index ?? -1,
    seedName: slotData.Seed ?? "",
    slotName: slotData.Slot ?? slot,
    totalLocations: slotData.TotalLocations ?? 0,
    totalMeasures: slotData.TotalMeasures ?? 0,
    checksSent: checkedCountForSession(client, slotData.options.location_mode, slotData.TotalLocations ?? 0),
    goalSent: false,
    titleGuessSent: client.room.checkedLocations.includes(TITLE_GUESS_LOCATION_ID),
  };
}
// The location ladder: check counts only ever go up, one location per rung.
// progressCount is matched notes (per_note mode) or completed bars (bars
// mode); at 100% completion everything left is flushed and the goal fires.
export function reportProgress(session: ApSession, progressCount: number, complete: boolean): boolean {
  const bars = session.options.location_mode === LOCATION_MODE_BARS;
  const base = bars ? BAR_LOCATION_BASE : NOTE_LOCATION_BASE;
  const totalLocations = session.totalLocations;
  let changed = false;

  const target = complete ? totalLocations : Math.min(progressCount, totalLocations);
  if (target > session.checksSent) {
    const ids = [];
    for (let n = session.checksSent + 1; n <= target; n++) ids.push(base + n);
    session.client.check(...ids);
    session.checksSent = target;
    changed = true;
  }

  if (complete && !session.goalSent) {
    session.client.goal();
    session.goalSent = true;
    changed = true;
  }

  return changed;
}
export function reportTitleGuess(session: ApSession): boolean {
  if (session.titleGuessSent) return false;
  session.client.check(TITLE_GUESS_LOCATION_ID);
  session.titleGuessSent = true;
  return true;
}