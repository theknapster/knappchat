import type { OnlineUser } from '../lib/api';

export default function OnlineList({
  users,
  selfId,
}: {
  users: OnlineUser[];
  selfId: string;
}) {
  return (
    <aside className="online-list" style={styles.aside}>
      <h2 style={styles.heading}>Online — {users.length}</h2>
      <ul style={styles.list}>
        {users.map((u) => (
          <li key={u.userId} style={styles.item} title={u.name}>
            <span style={styles.dot} />
            <span style={styles.name}>{u.name}</span>
            {u.userId === selfId && <span style={styles.you}>(you)</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  aside: {
    width: 220,
    flexShrink: 0,
    borderLeft: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    padding: 16,
    overflowY: 'auto',
  },
  heading: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-muted)',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--online)', flexShrink: 0 },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  you: { color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 },
};
