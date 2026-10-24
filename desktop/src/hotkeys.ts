// Global hotkeys via a system-wide input hook (uiohook-napi). Unlike
// Electron's globalShortcut this sees key *release* too, which push-to-talk
// needs. The hook observes input without swallowing it, so the key still
// reaches whatever app is focused (same as Discord's keybinds).
import { EventEmitter } from "node:events";

export type Binding =
  | { type: "key"; keycode: number; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
  | { type: "mouse"; button: number };

export type HotkeyKind = "toggle" | "ptt";
export type HotkeyEvent = "toggle" | "ptt-down" | "ptt-up";

export interface Bindings {
  toggle: Binding | null;
  ptt: Binding | null;
}

// the subset of uiohook's events this module uses
export interface KeyEventLike {
  keycode: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}
export interface MouseEventLike {
  button: unknown;
}

// mouse buttons 1/2 (left/right) are never bindable
const MIN_MOUSE_BUTTON = 3;

export class HotkeyMatcher extends EventEmitter {
  private bindings: Bindings = { toggle: null, ptt: null };
  private held = new Set<HotkeyKind>();
  private recorder: ((binding: Binding | null) => void) | null = null;

  constructor(
    private keyNames: Map<number, string>,
    private modifierCodes: Set<number>,
    private escapeCode: number
  ) {
    super();
  }

  setBindings(bindings: Bindings) {
    // releasing a PTT binding mid-press must not leave the mic open
    if (this.held.has("ptt")) this.emit("hotkey", "ptt-up" satisfies HotkeyEvent);
    this.held.clear();
    this.bindings = bindings;
  }

  // Resolves with the next non-modifier key (with held modifiers) or extra
  // mouse button; null on Escape, cancel() or timeout.
  record(timeoutMs = 15_000): Promise<Binding | null> {
    this.cancelRecording();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finishRecording(null), timeoutMs);
      this.recorder = (binding) => {
        clearTimeout(timer);
        resolve(binding);
      };
    });
  }

  cancelRecording() {
    this.finishRecording(null);
  }

  private finishRecording(binding: Binding | null) {
    const recorder = this.recorder;
    this.recorder = null;
    recorder?.(binding);
  }

  onKeyDown(e: KeyEventLike) {
    if (this.recorder) {
      if (e.keycode === this.escapeCode) this.finishRecording(null);
      else if (!this.modifierCodes.has(e.keycode)) {
        this.finishRecording({
          type: "key",
          keycode: e.keycode,
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey,
        });
      }
      return;
    }
    for (const kind of ["toggle", "ptt"] as const) {
      const b = this.bindings[kind];
      if (b?.type !== "key" || b.keycode !== e.keycode) continue;
      if (b.ctrl !== e.ctrlKey || b.alt !== e.altKey || b.shift !== e.shiftKey || b.meta !== e.metaKey) {
        continue;
      }
      this.press(kind);
    }
  }

  onKeyUp(e: KeyEventLike) {
    // release on the main key alone: letting go of a modifier first still
    // counts as holding, and the key coming up always ends the press
    for (const kind of ["toggle", "ptt"] as const) {
      const b = this.bindings[kind];
      if (b?.type === "key" && b.keycode === e.keycode) this.release(kind);
    }
  }

  onMouseDown(e: MouseEventLike) {
    const button = Number(e.button);
    if (this.recorder) {
      if (button >= MIN_MOUSE_BUTTON) this.finishRecording({ type: "mouse", button });
      return;
    }
    for (const kind of ["toggle", "ptt"] as const) {
      const b = this.bindings[kind];
      if (b?.type === "mouse" && b.button === button) this.press(kind);
    }
  }

  onMouseUp(e: MouseEventLike) {
    const button = Number(e.button);
    for (const kind of ["toggle", "ptt"] as const) {
      const b = this.bindings[kind];
      if (b?.type === "mouse" && b.button === button) this.release(kind);
    }
  }

  // key auto-repeat sends repeated downs; only the first one counts
  private press(kind: HotkeyKind) {
    if (this.held.has(kind)) return;
    this.held.add(kind);
    this.emit("hotkey", (kind === "toggle" ? "toggle" : "ptt-down") satisfies HotkeyEvent);
  }

  private release(kind: HotkeyKind) {
    if (!this.held.delete(kind)) return;
    if (kind === "ptt") this.emit("hotkey", "ptt-up" satisfies HotkeyEvent);
  }

  label(binding: Binding): string {
    if (binding.type === "mouse") {
      return binding.button === 3 ? "Middle mouse" : `Mouse ${binding.button}`;
    }
    const parts: string[] = [];
    if (binding.ctrl) parts.push("Ctrl");
    if (binding.alt) parts.push("Alt");
    if (binding.shift) parts.push("Shift");
    if (binding.meta) parts.push(process.platform === "win32" ? "Win" : "Super");
    parts.push(this.keyNames.get(binding.keycode) ?? `Key ${binding.keycode}`);
    return parts.join("+");
  }
}

export function sameBinding(a: Binding | null, b: Binding | null): boolean {
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}
