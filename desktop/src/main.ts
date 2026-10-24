import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { HotkeyMatcher, sameBinding, type Binding, type HotkeyKind } from "./hotkeys";
import { isBinding, loadSettings, normalizeServerUrl, saveSettings } from "./settings";

const SETUP_PAGE = path.join(__dirname, "setup.html");
const SETUP_URL = pathToFileURL(SETUP_PAGE).href;
const ICON = path.join(__dirname, "..", "assets", "icon.png");
// what the remote site may use; everything else is denied
const ALLOWED_PERMISSIONS = new Set(["media", "notifications", "clipboard-sanitized-write"]);

if (!app.requestSingleInstanceLock()) app.quit();

const settings = loadSettings();
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let hookError: string | null = null;

const keyNames = new Map<number, string>(
  Object.entries(UiohookKey).map(([name, code]) => [code as number, name])
);
const matcher = new HotkeyMatcher(
  keyNames,
  new Set([
    UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Alt, UiohookKey.AltRight,
    UiohookKey.Shift, UiohookKey.ShiftRight, UiohookKey.Meta, UiohookKey.MetaRight,
  ]),
  UiohookKey.Escape
);
matcher.setBindings(settings.hotkeys);
matcher.on("hotkey", (event) => win?.webContents.send("knappchat:hotkey", event));

function serverOrigin(): string | null {
  return settings.serverUrl ? new URL(settings.serverUrl).origin : null;
}

function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

function fromServer(e: IpcMainInvokeEvent): boolean {
  const origin = originOf(e.senderFrame?.url);
  return origin !== null && origin === serverOrigin();
}

function fromSetup(e: IpcMainInvokeEvent): boolean {
  return e.senderFrame?.url.split(/[?#]/)[0] === SETUP_URL;
}

function startHook() {
  uIOhook.on("keydown", (e) => matcher.onKeyDown(e));
  uIOhook.on("keyup", (e) => matcher.onKeyUp(e));
  uIOhook.on("mousedown", (e) => matcher.onMouseDown(e));
  uIOhook.on("mouseup", (e) => matcher.onMouseUp(e));
  try {
    uIOhook.start();
  } catch (err) {
    hookError = err instanceof Error ? err.message : String(err);
    console.error("global hotkeys unavailable:", hookError);
  }
}

function describe(binding: Binding | null) {
  return binding ? { binding, label: matcher.label(binding) } : null;
}

function registerIpc() {
  ipcMain.handle("knappchat:get-hotkeys", (e) => {
    if (!fromServer(e)) throw new Error("not allowed");
    return {
      available: hookError === null,
      error: hookError,
      // Wayland doesn't let apps see other apps' input
      wayland: process.platform === "linux" && Boolean(process.env.WAYLAND_DISPLAY),
      toggle: describe(settings.hotkeys.toggle),
      ptt: describe(settings.hotkeys.ptt),
    };
  });

  ipcMain.handle("knappchat:record-hotkey", async (e) => {
    if (!fromServer(e)) throw new Error("not allowed");
    return describe(await matcher.record());
  });

  ipcMain.handle("knappchat:cancel-recording", (e) => {
    if (!fromServer(e)) throw new Error("not allowed");
    matcher.cancelRecording();
  });

  ipcMain.handle("knappchat:set-hotkey", (e, kind: unknown, binding: unknown) => {
    if (!fromServer(e)) throw new Error("not allowed");
    if (kind !== "toggle" && kind !== "ptt") throw new Error("unknown hotkey");
    if (binding !== null && !isBinding(binding)) throw new Error("invalid hotkey");
    const other: HotkeyKind = kind === "toggle" ? "ptt" : "toggle";
    if (sameBinding(binding, settings.hotkeys[other])) {
      throw new Error("that key is already used for the other hotkey");
    }
    settings.hotkeys[kind] = binding;
    saveSettings(settings);
    matcher.setBindings(settings.hotkeys);
    return describe(binding);
  });

  ipcMain.handle("knappchat:get-server", (e) => {
    if (!fromSetup(e)) throw new Error("not allowed");
    return settings.serverUrl;
  });

  ipcMain.handle("knappchat:set-server", (e, input: unknown) => {
    if (!fromSetup(e)) throw new Error("not allowed");
    const url = typeof input === "string" ? normalizeServerUrl(input) : null;
    if (!url) throw new Error("enter an https:// address, e.g. https://chat.example.com");
    settings.serverUrl = url;
    saveSettings(settings);
    void win?.loadURL(url);
    return url;
  });
}

function guardSession() {
  const allowed = (url: string | undefined, permission: string) =>
    ALLOWED_PERMISSIONS.has(permission) && originOf(url) === serverOrigin();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(allowed(details.requestingUrl, permission))
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) =>
    allowed(origin, permission)
  );
}

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

function showSetup() {
  void win?.loadFile(SETUP_PAGE);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    minHeight: 400,
    title: "knappchat",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // keep voice and the chat socket running while minimized
      backgroundThrottling: false,
    },
  });

  // stay on the configured server; anything else opens in the browser
  win.webContents.on("will-navigate", (e, url) => {
    if (url.split(/[?#]/)[0] === SETUP_URL || originOf(url) === serverOrigin()) return;
    e.preventDefault();
    openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F12") win?.webContents.toggleDevTools();
  });
  win.webContents.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      console.error(`failed to load ${url}: ${description}`);
      void win?.loadFile(SETUP_PAGE, { query: { error: description, url } });
    }
  });

  win.on("close", (e) => {
    if (settings.closeToTray && tray && !quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => {
    win = null;
  });

  if (settings.serverUrl) void win.loadURL(settings.serverUrl);
  else showSetup();
}

function show() {
  if (!win) createWindow();
  win?.show();
  if (win?.isMinimized()) win.restore();
  win?.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("knappchat");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show knappchat", click: show },
      { label: "Reload", click: () => win?.webContents.reload() },
      { label: "Change server…", click: () => { show(); showSetup(); } },
      {
        label: "Keep running in tray when closed",
        type: "checkbox",
        checked: settings.closeToTray,
        click: (item) => {
          settings.closeToTray = item.checked;
          saveSettings(settings);
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on("click", show);
}

app.on("second-instance", show);

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  guardSession();
  registerIpc();
  startHook();
  createWindow();
  try {
    createTray();
  } catch (err) {
    console.error("tray unavailable:", err);
  }
});

app.on("before-quit", () => {
  quitting = true;
  try {
    uIOhook.stop();
  } catch {
    // hook never started
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
