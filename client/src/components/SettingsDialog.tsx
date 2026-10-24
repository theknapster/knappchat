import { useEffect, useState } from 'react';
import type { SessionUser } from '../lib/api';
import { setNickname } from '../lib/api';
import {
  DEFAULT_MUTE_HOTKEY,
  formatHotkey,
  hasCommandModifier,
  hotkeyFromEvent,
  type Hotkey,
} from '../lib/hotkey';

export default function SettingsDialog({
  user,
  muteHotkey,
  onNicknameSaved,
  onMuteHotkeyChange,
  onClose,
}: {
  user: SessionUser;
  muteHotkey: Hotkey | null;
  onNicknameSaved: (nickname: string | null) => void;
  onMuteHotkeyChange: (hotkey: Hotkey | null) => void;
  onClose: () => void;
}) {
  const [nickname, setNicknameValue] = useState(user.nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (recording) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [recording, onClose]);

  async function saveNickname(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNicknameError(null);
    setNicknameStatus(null);
    try {
      const res = await setNickname(nickname);
      onNicknameSaved(res.nickname);
      setNicknameValue(res.nickname ?? '');
      setNicknameStatus(res.nickname ? 'Saved' : 'Cleared — showing your email');
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : 'failed to save');
    } finally {
      setSaving(false);
    }
  }

  function recordKey(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    const hotkey = hotkeyFromEvent(e.nativeEvent);
    if (!hotkey) return;
    onMuteHotkeyChange(hotkey);
    setRecording(false);
  }

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        style={styles.dialog}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" style={styles.title}>
          Settings
        </h2>

        <form onSubmit={saveNickname} style={styles.section}>
          <label htmlFor="nickname" style={styles.label}>
            Nickname
          </label>
          <div style={styles.row}>
            <input
              id="nickname"
              style={styles.input}
              value={nickname}
              onChange={(e) => setNicknameValue(e.target.value)}
              placeholder={user.email}
              maxLength={32}
              autoFocus
            />
            <button type="submit" style={styles.primaryButton} disabled={saving}>
              Save
            </button>
          </div>
          <p style={styles.help}>
            Shown to everyone in chat and voice. Leave empty to use your email.
          </p>
          {nicknameStatus && <p style={styles.help}>{nicknameStatus}</p>}
          {nicknameError && <p style={styles.error}>{nicknameError}</p>}
        </form>

        <div style={styles.section}>
          <span style={styles.label}>Mute / unmute hotkey</span>
          <div style={styles.row}>
            <button
              type="button"
              style={{ ...styles.hotkeyButton, ...(recording ? styles.recording : {}) }}
              onClick={() => setRecording(true)}
              onKeyDown={recording ? recordKey : undefined}
              onBlur={() => setRecording(false)}
            >
              {recording
                ? 'Press a key combination… (Esc to cancel)'
                : muteHotkey
                  ? formatHotkey(muteHotkey)
                  : 'Not set'}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => onMuteHotkeyChange(null)}
              disabled={!muteHotkey}
            >
              Clear
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => onMuteHotkeyChange(DEFAULT_MUTE_HOTKEY)}
            >
              Default
            </button>
          </div>
          <p style={styles.help}>
            Works while this tab is focused. Saved in this browser only.
            {muteHotkey && !hasCommandModifier(muteHotkey) &&
              ' Without Ctrl/Alt it is ignored while typing in a text box.'}
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 10,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  title: { margin: 0, fontSize: 18 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text)',
  },
  help: { margin: 0, fontSize: 12, color: 'var(--text-muted)' },
  error: { margin: 0, fontSize: 12, color: 'var(--danger)' },
  primaryButton: {
    padding: '8px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-fg)',
    fontWeight: 600,
  },
  secondaryButton: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
  },
  hotkeyButton: {
    flex: 1,
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
};
