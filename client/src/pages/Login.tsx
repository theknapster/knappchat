import { useState } from 'react';
import { requestLoginLink } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestLoginLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Check your email</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            We sent a login link to <strong>{email}</strong>. It expires in 15
            minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.heading}>Sign in to knappchat</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          Enter your email and we'll send you a login link.
        </p>
        <input
          style={styles.input}
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button style={styles.button} type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send login link'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 24,
    background: 'var(--bg-subtle)',
  },
  heading: { margin: '0 0 8px', fontSize: 22 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    marginBottom: 12,
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  button: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-fg)',
    fontWeight: 600,
  },
};
