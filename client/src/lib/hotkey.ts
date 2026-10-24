// Mute hotkey, stored per-browser. Matching uses KeyboardEvent.code (physical
// key) so it doesn't change with shift state or keyboard layout quirks.
export interface Hotkey {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const STORAGE_KEY = 'knappchat.muteHotkey';
// pre-rename key, read once so existing hotkey settings carry over
const LEGACY_STORAGE_KEY = 'discord-lite.muteHotkey';
const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight',
]);

// Alt+M: unbound in Chrome/Firefox (Ctrl+Shift+M is Firefox's responsive mode)
export const DEFAULT_MUTE_HOTKEY: Hotkey = {
  code: 'KeyM',
  ctrl: false,
  alt: true,
  shift: false,
  meta: false,
};

export function loadMuteHotkey(): Hotkey | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return DEFAULT_MUTE_HOTKEY;
    return raw === 'none' ? null : (JSON.parse(raw) as Hotkey);
  } catch {
    return DEFAULT_MUTE_HOTKEY;
  }
}

export function saveMuteHotkey(hotkey: Hotkey | null) {
  try {
    localStorage.setItem(STORAGE_KEY, hotkey ? JSON.stringify(hotkey) : 'none');
  } catch {
    // storage unavailable (private mode etc.) - setting lasts for this tab only
  }
}

// null while only modifiers are held, so the recorder waits for a real key
export function hotkeyFromEvent(e: KeyboardEvent): Hotkey | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  return {
    code: e.code,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  };
}

export function matchesHotkey(e: KeyboardEvent, hotkey: Hotkey): boolean {
  return (
    e.code === hotkey.code &&
    e.ctrlKey === hotkey.ctrl &&
    e.altKey === hotkey.alt &&
    e.shiftKey === hotkey.shift &&
    e.metaKey === hotkey.meta
  );
}

// a bare key (or shift+key) would fire while typing a chat message
export function hasCommandModifier(hotkey: Hotkey): boolean {
  return hotkey.ctrl || hotkey.alt || hotkey.meta;
}

export function formatHotkey(hotkey: Hotkey): string {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push('Ctrl');
  if (hotkey.alt) parts.push('Alt');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.meta) parts.push('Meta');
  parts.push(
    hotkey.code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ')
  );
  return parts.join('+');
}
