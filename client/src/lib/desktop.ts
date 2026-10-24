// Bridge exposed by the knappchat desktop app (desktop/src/preload.ts).
// Undefined in a normal browser.

export type DesktopHotkeyKind = 'toggle' | 'ptt';
export type DesktopHotkeyEvent = 'toggle' | 'ptt-down' | 'ptt-up';

// opaque to the web client; only the desktop app interprets it
export type DesktopBinding = Record<string, unknown>;

export interface DesktopHotkey {
  binding: DesktopBinding;
  label: string;
}

export interface DesktopHotkeys {
  available: boolean;
  error: string | null;
  wayland: boolean;
  toggle: DesktopHotkey | null;
  ptt: DesktopHotkey | null;
}

export interface DesktopBridge {
  version: number;
  platform: string;
  getHotkeys(): Promise<DesktopHotkeys>;
  recordHotkey(): Promise<DesktopHotkey | null>;
  cancelRecording(): Promise<void>;
  setHotkey(kind: DesktopHotkeyKind, binding: DesktopBinding | null): Promise<DesktopHotkey | null>;
  onHotkey(callback: (event: DesktopHotkeyEvent) => void): () => void;
}

declare global {
  interface Window {
    knappchat?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = window.knappchat;

// ipc errors arrive as "Error invoking remote method '…': Error: <message>"
export function desktopErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^.*Error: /, '');
}
