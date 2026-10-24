import { app } from "electron";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { Binding, Bindings } from "./hotkeys";

export interface Settings {
  serverUrl: string | null;
  hotkeys: Bindings;
  // Windows users expect voice apps to keep running in the tray; many Linux
  // desktops have no tray, where hiding the window would strand the app
  closeToTray: boolean;
}

const defaults = (): Settings => ({
  serverUrl: null,
  hotkeys: { toggle: null, ptt: null },
  closeToTray: process.platform === "win32",
});

function file() {
  return path.join(app.getPath("userData"), "settings.json");
}

export function isBinding(v: unknown): v is Binding {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  if (b.type === "mouse") return Number.isInteger(b.button);
  return (
    b.type === "key" &&
    Number.isInteger(b.keycode) &&
    ["ctrl", "alt", "shift", "meta"].every((k) => typeof b[k] === "boolean")
  );
}

export function loadSettings(): Settings {
  const s = defaults();
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8"));
    if (typeof raw.serverUrl === "string") s.serverUrl = raw.serverUrl;
    if (typeof raw.closeToTray === "boolean") s.closeToTray = raw.closeToTray;
    if (isBinding(raw.hotkeys?.toggle)) s.hotkeys.toggle = raw.hotkeys.toggle;
    if (isBinding(raw.hotkeys?.ptt)) s.hotkeys.ptt = raw.hotkeys.ptt;
  } catch {
    // first run or unreadable file: defaults
  }
  return s;
}

export function saveSettings(s: Settings) {
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, file());
}

// https only, except plain http for local development
export function normalizeServerUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim().includes("://") ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url.origin;
}
