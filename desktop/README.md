# knappchat desktop

A desktop app for knappchat (Windows and Linux) that adds **global hotkeys**:
toggle mute and push-to-talk work from any app, even while knappchat is
minimized. A browser tab can only see keys while it is focused.

It's a thin Electron shell: it loads your knappchat server's web client, so
the UI updates whenever the server is redeployed. You only need a new build
when this `desktop/` code changes.

## Using it

1. Download the installer from the repo's
   [Releases](https://github.com/theknapster/knappchat/releases):
   `.exe` for Windows, `.AppImage` or `.deb` for Linux.
2. On first launch, enter your server's address (e.g. `https://chat.example.com`).
3. Sign in. The login email has a link and a 6-digit code; enter the code in
   the app. The link would sign in your browser instead.
4. Open **Settings → Global hotkeys** and set **Toggle mute** and/or **Push to
   talk**. Click a field, then press a key combination or a mouse side/middle
   button. Esc cancels.

With push-to-talk set, you join voice muted and talk while holding the key.

The tray icon has Show, Reload, Change server, and "Keep running in tray when
closed" (on by default on Windows). F12 opens DevTools.

### Notes

- Hotkeys are observed, not captured: the key still reaches the focused app,
  as with Discord's keybinds. Pick keys you don't otherwise use, like F9 or a
  mouse side button.
- **Linux:** global hotkeys need an X11 session. Wayland doesn't let apps see
  other apps' input, so under Wayland they only work while an X11/XWayland
  window has focus. The `.deb` depends on `libxtst6`.
- **Windows:** builds are unsigned, so SmartScreen warns on first run ("More
  info" → "Run anyway"). Code signing needs a paid certificate.
- Settings are stored in `settings.json` in the app's user data folder
  (`%APPDATA%\knappchat` or `~/.config/knappchat`).

## Development

```
cd desktop
npm install
npm start          # build and run
npm test           # hotkey matcher tests
npm run dist:linux # AppImage + deb into release/
npm run dist:win   # NSIS installer (build on Windows)
```

| File | Purpose |
|---|---|
| `src/main.ts` | window, tray, permissions, navigation guard, IPC |
| `src/hotkeys.ts` | hotkey matching and recording (no OS dependencies; unit tested) |
| `src/preload.ts` | `window.knappchat` bridge for the web client |
| `src/settings.ts` | settings file and server URL validation |
| `src/setup.html` | first-run "connect to server" page |

The web client detects the bridge in `client/src/lib/desktop.ts`. Inside the
app it uses the global hotkeys and shows their settings instead of the
in-tab hotkey.

Global input comes from [uiohook-napi](https://github.com/SnosMe/uiohook-napi).
Its prebuilt N-API binaries work in Electron as-is, so packaging doesn't
recompile native code (`npmRebuild: false`).

### Security

- The window runs with context isolation, the Chromium sandbox and no Node
  integration.
- The main process checks which page calls each bridge method. Only the
  configured server can use the hotkey methods, and only the local setup page
  can change the server.
- Microphone and notification permissions are granted to the configured
  server's origin only.
- Navigating anywhere else opens your default browser instead.

## Releases

`.github/workflows/desktop.yml` builds Windows and Linux on every
`desktop-v*` tag and attaches the installers to a GitHub release:

```
# bump "version" in desktop/package.json first
git tag desktop-v0.1.0 && git push origin desktop-v0.1.0
```

You can also run it by hand from the Actions tab (workflow_dispatch). That
uploads build artifacts without creating a release.
