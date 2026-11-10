import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
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
import { desktop } from '../lib/desktop';
import { playSound, unlockSounds } from '../lib/sounds';
import {
  NOISE_SAMPLE_RATE,
  RnnoiseProcessor,
  loadNoiseSuppression,
  onNoiseSuppressionChange,
} from '../lib/noise';

interface Participant {
  identity: string;
  name: string;
  isLocal: boolean;
}

type Status = 'idle' | 'connecting' | 'connected';

// a participant who drops and rejoins within this window (a brief network
// blip) plays no leave/join sounds
const LEAVE_SOUND_DELAY_MS = 1500;

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
  // serializes mic changes so a fast push-to-talk press/release can't race
  const micQueueRef = useRef<Promise<void>>(Promise.resolve());
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const pendingLeavesRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // runs the noise suppression worklet; created on Join (a user gesture)
  const noiseContextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  // apply the Settings toggle to a call in progress
  useEffect(
    () =>
      onNoiseSuppressionChange((enabled) => {
        void queueMic((room) => applyNoiseSuppression(room, enabled));
      }),
    []
  );

  // in the desktop app the global hotkeys take over (they also fire while
  // the window is focused, so the in-page one would double-toggle)
  useEffect(() => {
    if (!desktop) return;
    return desktop.onHotkey((event) => {
      if (event === 'toggle') void toggleMute();
      else setMic(event === 'ptt-down');
    });
  }, []);

  useEffect(() => {
    if (!muteHotkey || desktop) return;
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
    // inside the click handler, so the browser lets sounds play from now on
    unlockSounds();
    noiseContextRef.current ??= new AudioContext({ sampleRate: NOISE_SAMPLE_RATE });
    setError(null);
    setStatus('connecting');
    try {
      const { token, url } = await fetchVoiceToken();
      const room = new Room();
      roomRef.current = room;

      const pendingLeaves = pendingLeavesRef.current;
      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        syncParticipants(room);
        const pending = pendingLeaves.get(p.identity);
        if (pending) {
          clearTimeout(pending);
          pendingLeaves.delete(p.identity);
        } else {
          playSound('join');
        }
      });
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        syncParticipants(room);
        pendingLeaves.set(
          p.identity,
          setTimeout(() => {
            pendingLeaves.delete(p.identity);
            playSound('leave');
          }, LEAVE_SOUND_DELAY_MS)
        );
      });
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
        pendingLeaves.forEach(clearTimeout);
        pendingLeaves.clear();
        playSound('leave');
        void noiseContextRef.current?.close();
        noiseContextRef.current = null;
        setStatus('idle');
        setParticipants([]);
        roomRef.current = null;
      });

      await room.connect(url, token);
      // publish the mic up front (permission prompt, device open) so
      // push-to-talk only has to unmute
      await room.localParticipant.setMicrophoneEnabled(true);
      await applyNoiseSuppression(room, loadNoiseSuppression());
      const pushToTalk = desktop
        ? await desktop.getHotkeys().then((h) => h.ptt !== null, () => false)
        : false;
      if (pushToTalk) await room.localParticipant.setMicrophoneEnabled(false);
      setMuted(pushToTalk);
      syncParticipants(room);
      setStatus('connected');
      playSound('join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to join voice');
      void noiseContextRef.current?.close();
      noiseContextRef.current = null;
      setStatus('idle');
    }
  }

  async function applyNoiseSuppression(room: Room, enabled: boolean) {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.audioTrack as LocalAudioTrack | undefined;
    if (!track || enabled === Boolean(track.getProcessor())) return;
    try {
      if (enabled) {
        noiseContextRef.current ??= new AudioContext({ sampleRate: NOISE_SAMPLE_RATE });
        track.setAudioContext(noiseContextRef.current);
        await track.setProcessor(new RnnoiseProcessor());
      } else {
        await track.stopProcessor();
      }
    } catch (err) {
      // the browser's built-in suppression still applies
      console.warn('noise suppression unavailable:', err);
    }
  }

  async function leave() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus('idle');
    setParticipants([]);
  }

  function queueMic(change: (room: Room) => Promise<void>) {
    micQueueRef.current = micQueueRef.current.then(async () => {
      const room = roomRef.current;
      if (room) await change(room).catch(() => undefined);
    });
    return micQueueRef.current;
  }

  function setMic(enabled: boolean) {
    void queueMic(async (room) => {
      if (room.localParticipant.isMicrophoneEnabled === enabled) return;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMuted(!enabled);
      playSound(enabled ? 'unmute' : 'mute', { pushToTalk: true });
    });
  }

  function toggleMute() {
    // read from the room rather than `muted` state so hotkey listeners
    // never act on a stale value
    return queueMic(async (room) => {
      const enabled = room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(!enabled);
      setMuted(enabled);
      playSound(enabled ? 'mute' : 'unmute');
    });
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
              title={muteHotkey && !desktop ? `Hotkey: ${formatHotkey(muteHotkey)}` : undefined}
            >
              {muted ? 'Unmute' : 'Mute'}
              {muteHotkey && !desktop && (
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
