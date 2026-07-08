// Compares what the player wrote against the target melody.
//
// The comparison works on "sounding notes": tied entry notes are merged
// into one long note first, because the player works by ear, so only the
// sound has to match, not the spelling.

import type { PlacedEvent } from "./entry";
import { eventTicks } from "./entry";
import type { TargetNote } from "./song";

export interface SoundingNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  memberFlatIndexes: number[];
}

export interface GradeResult {
  correctByFlatIndex: boolean[];
  rhythmCorrectByFlatIndex: boolean[];
  matchedCount: number;
  checkProgressCount: number;
  totalTargets: number;
  completion: number;
  completedBars: number;
}

export function soundingNotes(placed: PlacedEvent[]): SoundingNote[] {
  const result: SoundingNote[] = [];
  let i = 0;
  while (i < placed.length) {
    const event = placed[i];
    if (event.kind !== "note") {
      i++;
      continue;
    }
    const sounding: SoundingNote = {
      midi: event.midi,
      startTick: event.startTick,
      durationTicks: eventTicks(event),
      memberFlatIndexes: [event.flatIndex],
    };
    let current = event;
    while (
      current.tiedToNext &&
      i + 1 < placed.length &&
      placed[i + 1].kind === "note" &&
      placed[i + 1].midi === current.midi &&
      placed[i + 1].startTick === sounding.startTick + sounding.durationTicks
    ) {
      i++;
      current = placed[i];
      sounding.durationTicks += eventTicks(current);
      sounding.memberFlatIndexes.push(current.flatIndex);
    }
    result.push(sounding);
    i++;
  }
  return result;
}

export function gradeEntry(placed: PlacedEvent[], targets: TargetNote[], barTicks: number): GradeResult {
  const soundings = soundingNotes(placed);
  const targetKeys = new Set(targets.map((t) => `${t.startTick}:${t.durationTicks}:${t.midi}`));
  const targetRhythmKeys = new Set(targets.map((t) => `${t.startTick}:${t.durationTicks}`));

  const correctByFlatIndex: boolean[] = placed.map(() => false);
  const rhythmCorrectByFlatIndex: boolean[] = placed.map(() => false);
  const matchedKeys = new Set<string>();

  for (const sounding of soundings) {
    const key = `${sounding.startTick}:${sounding.durationTicks}:${sounding.midi}`;
    const rhythmKey = `${sounding.startTick}:${sounding.durationTicks}`;
    if (targetRhythmKeys.has(rhythmKey)) {
      for (const flatIndex of sounding.memberFlatIndexes) rhythmCorrectByFlatIndex[flatIndex] = true;
    }
    if (targetKeys.has(key)) {
      matchedKeys.add(key);
      for (const flatIndex of sounding.memberFlatIndexes) correctByFlatIndex[flatIndex] = true;
    }
  }

  let correctRestCount = 0;
  for (const event of placed) {
    if (event.kind !== "rest") continue;
    const end = event.startTick + eventTicks(event);
    const collides = targets.some((t) => t.startTick >= event.startTick && t.startTick < end);
    const correct = !collides;
    correctByFlatIndex[event.flatIndex] = correct;
    rhythmCorrectByFlatIndex[event.flatIndex] = correct;
    if (correct) correctRestCount++;
  }

  const matchedCount = matchedKeys.size;
  const totalTargets = targets.length;
  const completion = totalTargets === 0 ? 0 : matchedCount / totalTargets;

  return {
    correctByFlatIndex,
    rhythmCorrectByFlatIndex,
    matchedCount,
    checkProgressCount: matchedCount + correctRestCount,
    totalTargets,
    completion,
    completedBars: countCompletedBars(soundings, targets, matchedKeys, barTicks),
  };
}

function countCompletedBars(
  soundings: SoundingNote[],
  targets: TargetNote[],
  matchedKeys: Set<string>,
  barTicks: number,
): number {
  if (targets.length === 0) return 0;
  const last = targets[targets.length - 1];
  const barCount = Math.ceil((last.startTick + last.durationTicks) / barTicks);

  let completed = 0;
  for (let bar = 0; bar < barCount; bar++) {
    const barStart = bar * barTicks;
    const barEnd = barStart + barTicks;

    const targetsInBar = targets.filter((t) => t.startTick >= barStart && t.startTick < barEnd);
    const allMatched = targetsInBar.every((t) => matchedKeys.has(`${t.startTick}:${t.durationTicks}:${t.midi}`));

    const soundingsInBar = soundings.filter((s) => s.startTick >= barStart && s.startTick < barEnd);
    const nothingWrong = soundingsInBar.every((s) => matchedKeys.has(`${s.startTick}:${s.durationTicks}:${s.midi}`));

    if (allMatched && nothingWrong) completed++;
  }
  return completed;
}
