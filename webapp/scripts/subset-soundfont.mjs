import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BasicMIDI, SoundBankLoader } from "spessasynth_core";

const root = new URL("..", import.meta.url);
const soundfontPath = new URL("../song_packs/soundfonts/GeneralUserGS.sf2", root);
const outputPath = new URL("public/soundfont/Composeapelago.sf2", root);
const songFiles = [
  "Korobeiniki.mid",
  "cancan.mid",
  "flight-of-the-bumblebee.mid",
  "funiculi.mid",
  "william-tell.mid",
];

function mergePresetUsage(target, source) {
  for (const [preset, notes] of source) {
    let targetNotes = target.get(preset);
    if (!targetNotes) {
      targetNotes = new Map();
      target.set(preset, targetNotes);
    }

    for (const [note, velocities] of notes) {
      let targetVelocities = targetNotes.get(note);
      if (!targetVelocities) {
        targetVelocities = new Set();
        targetNotes.set(note, targetVelocities);
      }

      for (const velocity of velocities) {
        targetVelocities.add(velocity);
      }
    }
  }
}

const soundfont = SoundBankLoader.fromArrayBuffer(await readFile(soundfontPath));
const usedPresets = new Map();

for (const songFile of songFiles) {
  const midiPath = new URL(join("public", "songs", songFile), root);
  const midi = BasicMIDI.fromArrayBuffer(await readFile(midiPath), songFile);
  mergePresetUsage(usedPresets, midi.getUsedProgramsAndKeys(soundfont));
}

soundfont.trim(usedPresets);

const output = soundfont.writeSF2({
  software: "Composeapelago soundfont subset",
  writeDefaultModulators: true,
  writeExtendedLimits: true,
});

await writeFile(outputPath, Buffer.from(output));

console.log(`Wrote ${outputPath.pathname}`);
console.log(`Presets: ${soundfont.presets.length}`);
console.log(`Samples: ${soundfont.samples.length}`);
console.log(`Bytes: ${output.byteLength}`);
