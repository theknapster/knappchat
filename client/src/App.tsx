import { useEffect, useState } from 'react';
import type { SessionUser } from './lib/api';
import { fetchMe } from './lib/api';
import Login from './pages/Login';
import ChatRoom from './pages/ChatRoom';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((res) => setUser(res.user))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!user) return <Login />;

  return <ChatRoom user={user} onUserChange={setUser} onLoggedOut={() => setUser(null)} />;
}
