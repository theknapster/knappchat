import { useEffect, useState } from 'react';
import {
  desktopErrorMessage,
  type DesktopBridge,
  type DesktopHotkeyKind,
  type DesktopHotkeys as Hotkeys,
} from '../lib/desktop';

const ROWS: { kind: DesktopHotkeyKind; label: string; help: string }[] = [
  { kind: 'toggle', label: 'Toggle mute', help: 'Press once to mute, again to unmute.' },
  {
    kind: 'ptt',
    label: 'Push to talk',
    help: 'Hold to talk. When set, you join voice muted.',
  },
];

export default function DesktopHotkeys({
  desktop,
  onRecordingChange,
}: {
  desktop: DesktopBridge;
  onRecordingChange: (recording: boolean) => void;
}) {
  const [hotkeys, setHotkeys] = useState<Hotkeys | null>(null);
  const [recording, setRecording] = useState<DesktopHotkeyKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    desktop.getHotkeys().then(setHotkeys, (err) => setError(desktopErrorMessage(err)));
  }, [desktop]);

  useEffect(() => {
    onRecordingChange(recording !== null);
    if (!recording) return;
    // the hook sees the keypress system-wide; keep it from also typing into
    // or clicking things on the page
    const swallow = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', swallow, true);
    window.addEventListener('keyup', swallow, true);
    return () => {
      window.removeEventListener('keydown', swallow, true);
      window.removeEventListener('keyup', swallow, true);
    };
  }, [recording, onRecordingChange]);

  useEffect(() => () => void desktop.cancelRecording(), [desktop]);

  async function record(kind: DesktopHotkeyKind) {
    setError(null);
    setRecording(kind);
    try {
      const result = await desktop.recordHotkey();
      if (result) await save(kind, result.binding);
    } catch (err) {
      setError(desktopErrorMessage(err));
    } finally {
      setRecording(null);
    }
  }

  async function save(kind: DesktopHotkeyKind, binding: Record<string, unknown> | null) {
    setError(null);
    try {
      const saved = await desktop.setHotkey(kind, binding);
      setHotkeys((prev) => (prev ? { ...prev, [kind]: saved } : prev));
    } catch (err) {
      setError(desktopErrorMessage(err));
    }
  }

  if (!hotkeys) return error ? <p style={styles.error}>{error}</p> : null;

  return (
    <div style={styles.section}>
      <span style={styles.label}>Global hotkeys</span>
      {!hotkeys.available && (
        <p style={styles.error}>
          Global hotkeys aren't working on this system
          {hotkeys.error ? ` (${hotkeys.error})` : ''}.
        </p>
      )}
      {hotkeys.wayland && (
        <p style={styles.help}>
          On Wayland, hotkeys only work while a knappchat or X11 window is focused. Log in
          with an X11 session for system-wide hotkeys.
        </p>
      )}
      {ROWS.map(({ kind, label, help }) => {
        const current = hotkeys[kind];
        return (
          <div key={kind} style={styles.row}>
            <div style={styles.rowText}>
              <div>{label}</div>
              <div style={styles.help}>{help}</div>
            </div>
            <button
              type="button"
              style={{ ...styles.binding, ...(recording === kind ? styles.recording : {}) }}
              onClick={() => (recording ? desktop.cancelRecording() : record(kind))}
              disabled={recording !== null && recording !== kind}
            >
              {recording === kind
                ? 'Press a key or mouse button… (Esc cancels)'
                : current?.label ?? 'Not set'}
            </button>
            <button
              type="button"
              style={styles.clear}
              onClick={() => save(kind, null)}
              disabled={!current || recording !== null}
            >
              Clear
            </button>
          </div>
        );
      })}
      {error && <p style={styles.error}>{error}</p>}
      <p style={styles.help}>
        Work from any app, even when knappchat is minimized. Saved on this computer.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowText: { flex: '1 1 140px', minWidth: 0 },
  help: { margin: 0, fontSize: 12, color: 'var(--text-muted)' },
  error: { margin: 0, fontSize: 12, color: 'var(--danger)' },
  binding: {
    flex: '1 1 160px',
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text)',
    fontFamily: 'ui-monospace, monospace',
    textAlign: 'left',
  },
  recording: { borderColor: 'var(--accent)', outline: '2px solid var(--accent)' },
  clear: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
  },
};
