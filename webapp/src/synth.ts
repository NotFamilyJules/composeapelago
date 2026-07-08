// Everything audio: the SpessaSynth synthesizer, the bundled GM SoundFont,
// and the sequencer transport. One module-level singleton so the whole app
// shares one AudioContext.
//
// The browser refuses to start audio without a user gesture, so initSynth()
// is called lazily from click/key handlers, never on page load.

import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";
import workletUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";

const AUDITION_CHANNEL = 15; // reserved for "play the note I just entered"

let context: AudioContext | undefined;
let synth: WorkletSynthesizer | undefined;
let sequencer: Sequencer | undefined;
let initPromise: Promise<void> | undefined;

export function isSynthReady(): boolean {
  return sequencer !== undefined;
}

export async function initSynth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    context = new AudioContext();
    await context.audioWorklet.addModule(workletUrl);

    synth = new WorkletSynthesizer(context);
    synth.connect(context.destination);

    const soundfont = await (await fetch("/soundfont/Composeapelago.sf2")).arrayBuffer();
    await synth.soundBankManager.addSoundBank(soundfont, "main");
    await synth.isReady;

    sequencer = new Sequencer(synth, { skipToFirstNoteOn: false, initialPlaybackRate: 1 });
    sequencer.loopCount = 0;
  })();
  return initPromise;
}

// Immediate feedback when a note is entered or changed: a short piano hit.
export function auditionNote(midi: number): void {
  if (!synth || !context) return;
  if (context.state === "suspended") context.resume();
  synth.programChange(AUDITION_CHANNEL, 0);
  synth.noteOn(AUDITION_CHANNEL, midi, 100);
  const held = synth;
  setTimeout(() => held.noteOff(AUDITION_CHANNEL, midi), 350);
}

// Load a fresh MIDI into the sequencer and start playing at a position.
export function playMidiFrom(bytes: Uint8Array, fromSeconds: number): void {
  if (!sequencer || !context) return;
  if (context.state === "suspended") context.resume();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  sequencer.loadNewSongList([{ binary: buffer }]);
  sequencer.loopCount = 0;
  sequencer.currentTime = fromSeconds;
  sequencer.play();
}

export function resumePlayback(): void {
  if (!sequencer || !context) return;
  if (context.state === "suspended") context.resume();
  sequencer.play();
}

export function pausePlayback(): void {
  sequencer?.pause();
}

export function stopPlayback(): void {
  if (!sequencer) return;
  sequencer.pause();
  synth?.stopAll();
}

export function isPaused(): boolean {
  return sequencer?.paused ?? true;
}

export function playbackTime(): number {
  return sequencer?.currentHighResolutionTime ?? 0;
}

export function seekTo(seconds: number): void {
  if (sequencer) sequencer.currentTime = seconds;
}
