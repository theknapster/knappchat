import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, OnlineUser, SessionUser } from '../lib/api';
import { displayName, logout } from '../lib/api';
import { ChatSocket } from '../lib/ws';
import { loadMuteHotkey, saveMuteHotkey, type Hotkey } from '../lib/hotkey';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import VoicePanel from '../components/VoicePanel';
import OnlineList from '../components/OnlineList';
import SettingsDialog from '../components/SettingsDialog';

export default function ChatRoom({
  user,
  onUserChange,
  onLoggedOut,
}: {
  user: SessionUser;
  onUserChange: (user: SessionUser) => void;
  onLoggedOut: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muteHotkey, setMuteHotkey] = useState<Hotkey | null>(loadMuteHotkey);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting'
  );
  const socketRef = useRef<ChatSocket | null>(null);

  useEffect(() => {
    const socket = new ChatSocket({
      onHistory: setMessages,
      onMessage: (message) => setMessages((prev) => [...prev, message]),
      onPresence: setOnline,
      onRenamed: (userId, name) =>
        setMessages((prev) =>
          prev.map((m) => (m.author_id === userId ? { ...m, author_name: name } : m))
        ),
      onStatusChange: setStatus,
    });
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, []);

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  function changeMuteHotkey(hotkey: Hotkey | null) {
    saveMuteHotkey(hotkey);
    setMuteHotkey(hotkey);
  }

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <span>#main</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {status === 'open' ? 'connected' : status} · {displayName(user)}
          </span>
          <button style={styles.headerButton} onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button style={styles.headerButton} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <div style={styles.body}>
        <main style={styles.main}>
          <VoicePanel muteHotkey={muteHotkey} />
          <MessageList messages={messages} />
          <MessageInput onSend={(body) => socketRef.current?.send(body)} />
        </main>
        <OnlineList users={online} selfId={user.userId} />
      </div>
      {settingsOpen && (
        <SettingsDialog
          user={user}
          muteHotkey={muteHotkey}
          onNicknameSaved={(nickname) => onUserChange({ ...user, nickname })}
          onMuteHotkeyChange={changeMuteHotkey}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { height: '100svh', display: 'flex', flexDirection: 'column' },
  body: { flex: 1, display: 'flex', minHeight: 0 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
  },
  headerButton: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 13,
  },
};
