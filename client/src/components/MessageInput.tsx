import { useState } from 'react';

export default function MessageInput({
  onSend,
}: {
  onSend: (body: string) => void;
}) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = value.trim();
    if (!body) return;
    onSend(body);
    setValue('');
  }

  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      <input
        style={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Message #main"
        maxLength={2000}
      />
      <button style={styles.button} type="submit">
        Send
      </button>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--border)' },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-subtle)',
    color: 'var(--text)',
  },
  button: {
    padding: '10px 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-fg)',
    fontWeight: 600,
  },
};
