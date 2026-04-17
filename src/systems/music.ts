import Phaser from "phaser";

const STEP_MS = 148;
const NOTE_AHEAD_S = 0.04;
const MASTER_VOLUME = 0.135;
const MUSIC_MUTED_STORAGE_KEY = "aiExplorerMusicMuted";

const MELODY_STEPS: readonly (number | null)[] = [
  72, 75, 79, 75, 81, 79, 77, 75,
  72, 75, 79, 75, 84, 82, 81, 79,
  77, 79, 82, 79, 81, 79, 77, 75,
  72, 75, 79, 82, 81, 77, 75, 72,
  70, 74, 77, 74, 79, 77, 75, 74,
  70, 74, 77, 74, 82, 81, 79, 77,
  69, 72, 76, 72, 77, 76, 74, 72,
  67, 70, 74, 77, 75, 72, 70, 67,
] as const;

const BASS_STEPS: readonly (number | null)[] = [
  41, null, 41, null, 48, null, 48, null,
  39, null, 39, null, 46, null, 46, null,
  43, null, 43, null, 50, null, 50, null,
  39, null, 39, null, 46, null, 46, null,
  38, null, 38, null, 45, null, 45, null,
  36, null, 36, null, 43, null, 43, null,
  41, null, 41, null, 48, null, 48, null,
  36, null, 36, null, 43, null, 43, null,
] as const;

const ACCENT_STEPS: readonly (number | null)[] = [
  null, 63, null, 67, null, 69, null, 70,
  null, 67, null, 70, null, 72, null, 75,
  null, 65, null, 69, null, 70, null, 72,
  null, 63, null, 67, null, 69, null, 70,
  null, 62, null, 65, null, 67, null, 69,
  null, 65, null, 69, null, 70, null, 72,
  null, 60, null, 64, null, 67, null, 69,
  null, 62, null, 65, null, 67, null, 70,
] as const;

const DRIVE_STEPS: readonly (number | null)[] = [
  60, 63, 67, 63, 60, 63, 69, 63,
  58, 62, 65, 62, 58, 62, 67, 62,
  63, 67, 70, 67, 63, 67, 72, 67,
  58, 62, 65, 62, 58, 62, 67, 62,
  57, 60, 64, 60, 57, 60, 67, 60,
  55, 59, 62, 59, 55, 59, 65, 59,
  60, 63, 67, 63, 60, 63, 69, 63,
  55, 59, 62, 59, 55, 59, 65, 59,
] as const;

const CHORD_ROOT_STEPS: readonly (number | null)[] = [
  53, null, null, null, 57, null, null, null,
  51, null, null, null, 55, null, null, null,
  56, null, null, null, 58, null, null, null,
  51, null, null, null, 55, null, null, null,
  50, null, null, null, 53, null, null, null,
  48, null, null, null, 51, null, null, null,
  53, null, null, null, 57, null, null, null,
  48, null, null, null, 51, null, null, null,
] as const;

type WebAudioManager = Phaser.Sound.WebAudioSoundManager & { context?: AudioContext };

let audioContext: AudioContext | undefined;
let masterGain: GainNode | undefined;
let masterCompressor: DynamicsCompressorNode | undefined;
let loopTimer: number | undefined;
let musicStarted = false;
let listenersBound = false;
let destroyBound = false;
let stepIndex = 0;
let musicMuted = readStoredMuteState();

export function ensureRetroMusic(scene: Phaser.Scene) {
  const context = getAudioContext(scene);
  if (!context) return;

  audioContext = context;
  ensureMasterGain(context);
  bindUnlockListeners();

  if (!destroyBound) {
    destroyBound = true;
    scene.game.events.once(Phaser.Core.Events.DESTROY, () => {
      stopRetroMusic();
    });
  }

  startLoopIfReady();
}

export function isRetroMusicMuted() {
  return musicMuted;
}

export function setRetroMusicMuted(muted: boolean) {
  musicMuted = muted;
  writeStoredMuteState(musicMuted);

  if (masterGain && audioContext) {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(musicMuted ? 0 : MASTER_VOLUME, now + 0.05);
  }

  return musicMuted;
}

export function toggleRetroMusicMute() {
  return setRetroMusicMuted(!musicMuted);
}

function getAudioContext(scene: Phaser.Scene) {
  const soundManager = scene.sound as WebAudioManager;
  return soundManager.context;
}

function ensureMasterGain(context: AudioContext) {
  if (masterGain) return masterGain;

  masterGain = context.createGain();
  masterCompressor = context.createDynamicsCompressor();
  masterCompressor.threshold.setValueAtTime(-18, context.currentTime);
  masterCompressor.knee.setValueAtTime(18, context.currentTime);
  masterCompressor.ratio.setValueAtTime(10, context.currentTime);
  masterCompressor.attack.setValueAtTime(0.003, context.currentTime);
  masterCompressor.release.setValueAtTime(0.22, context.currentTime);
  masterGain.gain.setValueAtTime(musicMuted ? 0 : MASTER_VOLUME, context.currentTime);
  masterGain.connect(masterCompressor);
  masterCompressor.connect(context.destination);
  return masterGain;
}

function bindUnlockListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;

  const unlock = () => {
    const context = audioContext;
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume().catch(() => undefined).finally(() => {
        startLoopIfReady();
      });
      return;
    }

    startLoopIfReady();
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      unlock();
    }
  });
}

function startLoopIfReady() {
  const context = audioContext;
  if (!context || context.state !== "running" || musicStarted) return;

  musicStarted = true;
  scheduleCurrentStep();
  loopTimer = window.setInterval(() => {
    scheduleCurrentStep();
  }, STEP_MS);
}

function scheduleCurrentStep() {
  const context = audioContext;
  const gain = masterGain;
  if (!context || !gain) return;

  const startTime = context.currentTime + NOTE_AHEAD_S;
  const step = stepIndex % MELODY_STEPS.length;

  const melody = MELODY_STEPS[step];
  if (melody !== null) {
    playNote(context, gain, midiToFrequency(melody), 0.19, 0.13, "square", startTime);
  }

  const bass = BASS_STEPS[step];
  if (bass !== null) {
    playNote(context, gain, midiToFrequency(bass), 0.15, 0.2, "triangle", startTime);
  }

  const accent = ACCENT_STEPS[step];
  if (accent !== null) {
    playNote(context, gain, midiToFrequency(accent), 0.075, 0.085, "square", startTime);
  }

  const drive = DRIVE_STEPS[step];
  if (drive !== null) {
    playNote(context, gain, midiToFrequency(drive), 0.065, 0.075, "sawtooth", startTime);
  }

  const chordRoot = CHORD_ROOT_STEPS[step];
  if (chordRoot !== null) {
    playChord(context, gain, chordRoot, 0.06, 0.24, startTime);
  }

  if (step % 4 === 0) {
    playKick(context, gain, startTime);
  }

  if (step % 8 === 4) {
    playSnare(context, gain, startTime);
  }

  if (step % 2 === 1) {
    playHat(context, gain, startTime);
  }

  stepIndex += 1;
}

function playNote(
  context: AudioContext,
  output: GainNode,
  frequency: number,
  volume: number,
  durationSeconds: number,
  type: OscillatorType,
  startTime: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const endTime = startTime + durationSeconds;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "triangle" ? 680 : type === "sawtooth" ? 920 : 1120, startTime);
  filter.Q.setValueAtTime(0.95, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(output);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.01);
}

function playChord(
  context: AudioContext,
  output: GainNode,
  rootMidi: number,
  volume: number,
  durationSeconds: number,
  startTime: number,
) {
  playNote(context, output, midiToFrequency(rootMidi), volume, durationSeconds, "sawtooth", startTime);
  playNote(context, output, midiToFrequency(rootMidi + 3), volume * 0.74, durationSeconds, "triangle", startTime);
  playNote(context, output, midiToFrequency(rootMidi + 7), volume * 0.66, durationSeconds, "square", startTime);
  playNote(context, output, midiToFrequency(rootMidi + 10), volume * 0.42, durationSeconds, "triangle", startTime);
}

function playKick(context: AudioContext, output: GainNode, startTime: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(160, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(44, startTime + 0.12);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.22, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);

  oscillator.connect(gain);
  gain.connect(output);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.15);
}

function playSnare(context: AudioContext, output: GainNode, startTime: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(280, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(120, startTime + 0.1);

  filter.type = "highpass";
  filter.frequency.setValueAtTime(1100, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.095, startTime + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(output);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.13);
}

function playHat(context: AudioContext, output: GainNode, startTime: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(5400, startTime);

  filter.type = "highpass";
  filter.frequency.setValueAtTime(3200, startTime);
  filter.Q.setValueAtTime(0.8, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.03, startTime + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(output);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.05);
}

function midiToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function stopRetroMusic() {
  if (loopTimer !== undefined && typeof window !== "undefined") {
    window.clearInterval(loopTimer);
  }

  loopTimer = undefined;
  musicStarted = false;
  stepIndex = 0;

  if (masterGain) {
    try {
      masterGain.disconnect();
    } catch {
      // Ignore disconnect errors during teardown.
    }
  }

  if (masterCompressor) {
    try {
      masterCompressor.disconnect();
    } catch {
      // Ignore disconnect errors during teardown.
    }
  }

  masterGain = undefined;
  masterCompressor = undefined;
  audioContext = undefined;
}

function readStoredMuteState() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(MUSIC_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredMuteState(muted: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MUSIC_MUTED_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Ignore storage failures so mute still works during the session.
  }
}
