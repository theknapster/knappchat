import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../lib/api';

export default function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div style={styles.list}>
      {messages.map((m) => (
        <div key={m.id} style={styles.row}>
          <span style={styles.author} title={m.author_name}>
            {m.author_name}
          </span>
          <span style={styles.time}>
            {new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <div style={styles.body}>{m.body}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  // author + time stay on the left; the body wraps in its own column
  row: { display: 'flex', columnGap: 8, alignItems: 'baseline' },
  author: {
    fontWeight: 600,
    flexShrink: 0,
    maxWidth: '35%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  time: { fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 },
  body: { flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};
