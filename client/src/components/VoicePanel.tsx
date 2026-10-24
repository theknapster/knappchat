import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { fetchVoiceToken } from '../lib/api';
import {
  formatHotkey,
  hasCommandModifier,
  matchesHotkey,
  type Hotkey,
} from '../lib/hotkey';

interface Participant {
  identity: string;
  name: string;
  isLocal: boolean;
}

type Status = 'idle' | 'connecting' | 'connected';

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

export default function VoicePanel({ muteHotkey }: { muteHotkey: Hotkey | null }) {
  const [status, setStatus] = useState<Status>('idle');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  useEffect(() => {
    if (!muteHotkey) return;
    const hotkey = muteHotkey;
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || !roomRef.current || !matchesHotkey(e, hotkey)) return;
      if (!hasCommandModifier(hotkey) && isEditable(e.target)) return;
      e.preventDefault();
      void toggleMute();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [muteHotkey]);

  function syncParticipants(room: Room) {
    const remote: Participant[] = Array.from(
      room.remoteParticipants.values()
    ).map((p: RemoteParticipant) => ({
      identity: p.identity,
      name: p.name || p.identity,
      isLocal: false,
    }));
    setParticipants([
      {
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || room.localParticipant.identity,
        isLocal: true,
      },
      ...remote,
    ]);
  }

  async function join() {
    setError(null);
    setStatus('connecting');
    try {
      const { token, url } = await fetchVoiceToken();
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => syncParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room));
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: RemoteTrackPublication) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            audioContainerRef.current?.appendChild(el);
          }
        }
      );
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      });
      room.on(RoomEvent.Disconnected, () => {
        setStatus('idle');
        setParticipants([]);
        roomRef.current = null;
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      syncParticipants(room);
      setStatus('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join voice');
      setStatus('idle');
    }
  }

  async function leave() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus('idle');
    setParticipants([]);
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    // read from the room rather than `muted` state so the hotkey listener
    // never acts on a stale value
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    setMuted(enabled);
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={{ fontWeight: 600 }}>Voice — main</span>
        {status === 'idle' && (
          <button style={styles.joinButton} onClick={join}>
            Join
          </button>
        )}
        {status === 'connecting' && <span>Connecting…</span>}
        {status === 'connected' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={styles.smallButton}
              onClick={toggleMute}
              title={muteHotkey ? `Hotkey: ${formatHotkey(muteHotkey)}` : undefined}
            >
              {muted ? 'Unmute' : 'Mute'}
              {muteHotkey && (
                <span style={styles.hotkeyHint}> {formatHotkey(muteHotkey)}</span>
              )}
            </button>
            <button style={styles.leaveButton} onClick={leave}>
              Leave
            </button>
          </div>
        )}
      </div>
      {error && <p style={{ color: 'var(--danger)', margin: '4px 0' }}>{error}</p>}
      <ul style={styles.participantList}>
        {participants.map((p) => (
          <li key={p.identity}>
            {p.name}
            {p.isLocal ? ' (you)' : ''}
          </li>
        ))}
      </ul>
      <div ref={audioContainerRef} hidden />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    borderBottom: '1px solid var(--border)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  joinButton: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-fg)',
    fontWeight: 600,
  },
  smallButton: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text)',
  },
  leaveButton: {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--danger)',
    color: '#fff',
  },
  hotkeyHint: { fontSize: 12, color: 'var(--text-muted)' },
  participantList: { margin: 0, paddingLeft: 20, color: 'var(--text-muted)' },
};
