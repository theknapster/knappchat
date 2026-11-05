// Voice event sounds, synthesized with Web Audio so there are no asset files.
// Settings are stored per-browser, like the mute hotkey.
export type VoiceSound = 'join' | 'leave' | 'mute' | 'unmute';

export interface SoundSettings {
  enabled: boolean;
  // push-to-talk press/release; off by default since it fires constantly
  pushToTalk: boolean;
}

const STORAGE_KEY = 'knappchat.voiceSounds';
const DEFAULT_SETTINGS: SoundSettings = { enabled: true, pushToTalk: false };
const VOLUME = 0.08;

// [frequency Hz, start offset s] per note; each note is a short sine blip
const NOTES: Record<VoiceSound, [number, number][]> = {
  join: [[523.25, 0], [783.99, 0.09]],
  leave: [[783.99, 0], [523.25, 0.09]],
  mute: [[392, 0]],
  unmute: [[587.33, 0]],
};
const NOTE_LENGTH = 0.12;

let settings = loadSettings();
let context: AudioContext | null = null;

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSoundSettings(): SoundSettings {
  return settings;
}

export function saveSoundSettings(next: SoundSettings) {
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode etc.) - setting lasts for this tab only
  }
}

// Browsers only allow audio after a user gesture; call this from one (the
// Join click) so later sounds, including from global hotkeys, can play.
export function unlockSounds() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

export function playSound(sound: VoiceSound, { pushToTalk = false } = {}) {
  if (!settings.enabled || (pushToTalk && !settings.pushToTalk) || !context) return;
  const ctx = context;
  const now = ctx.currentTime;
  for (const [frequency, offset] of NOTES[sound]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    // quick attack and exponential decay, so there's no click at either end
    const start = now + offset;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_LENGTH);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + NOTE_LENGTH + 0.02);
  }
}
