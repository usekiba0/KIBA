'use client';
import { useEffect, useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

interface User {
  id: string;
  name: string;
  phone_number: string;
  status: string;
  crisis_hold: boolean;
  last_active_at: string | null;
  registered_at: string;
}

interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'ai';
  content: string;
  created_at: string;
  token_count: number | null;
  flagged: boolean;
  flag_reason: string | null;
  message_type: string;
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('adminKey') : '';
    if (saved) { setKey(saved); loadUsers(saved); }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function apiFetch(path: string, opts: RequestInit = {}, apiKey = key) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-internal-key': apiKey, ...opts.headers },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async function loadUsers(apiKey: string) {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/users', {}, apiKey);
      setUsers(data);
    } catch {
      setKeyError('Invalid key or server error');
      localStorage.removeItem('adminKey');
      setKey('');
    }
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setKeyError('');
    localStorage.setItem('adminKey', keyInput);
    setKey(keyInput);
    await loadUsers(keyInput);
  }

  async function selectUser(user: User) {
    setSelectedUser(user);
    setMessages([]);
    const data = await apiFetch(`/admin/users/${user.id}/messages`);
    setMessages(data);
  }

  async function toggleFlag(msg: Message) {
    const newFlagged = !msg.flagged;
    const reason = flagInputs[msg.id] ?? msg.flag_reason ?? '';
    const updated = await apiFetch(`/admin/messages/${msg.id}/flag`, {
      method: 'PATCH',
      body: JSON.stringify({ flagged: newFlagged, flag_reason: reason || undefined }),
    });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...updated } : m));
  }

  if (!key) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 16, padding: 40, width: 340 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>RYKE Admin</div>
          <div style={{ fontSize: 13, color: '#71717a', marginBottom: 24 }}>Enter your internal API key to continue</div>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Internal API key"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
          />
          {keyError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{keyError}</div>}
          <button type="submit" style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'linear-gradient(135deg,#e11d48,#8b5cf6)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}>
            Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', color: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid #27272a', background: '#111113' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>RYKE <span style={{ color: '#e11d48' }}>Admin</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#71717a' }}>{users.length} users</span>
          <button onClick={() => { localStorage.removeItem('adminKey'); setKey(''); setUsers([]); setSelectedUser(null); }}
            style={{ fontSize: 13, color: '#71717a', background: 'none', border: '1px solid #3f3f46', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* User list */}
        <div style={{ width: 260, borderRight: '1px solid #27272a', overflowY: 'auto', background: '#0d0d10' }}>
          <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>Users</div>
          {loading && <div style={{ padding: '12px 16px', color: '#71717a', fontSize: 13 }}>Loading...</div>}
          {users.map(u => (
            <div key={u.id} onClick={() => selectUser(u)}
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #1f1f23', background: selectedUser?.id === u.id ? '#18181b' : 'transparent', transition: 'background 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.crisis_hold ? '#ef4444' : '#22c55e', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: '#fafafa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {u.crisis_hold && <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>CRISIS</span>}
              </div>
              <div style={{ fontSize: 12, color: '#71717a', paddingLeft: 16 }}>{u.phone_number}</div>
              <div style={{ fontSize: 11, color: '#52525b', paddingLeft: 16, marginTop: 2 }}>{timeAgo(u.last_active_at)}</div>
            </div>
          ))}
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedUser ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: 14 }}>
              Select a user to view their conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #27272a', background: '#111113' }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedUser.name}</div>
                <div style={{ fontSize: 12, color: '#71717a' }}>{selectedUser.phone_number} · {selectedUser.status} · last active {timeAgo(selectedUser.last_active_at)}</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                      <div style={{
                        maxWidth: 480, padding: '10px 14px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: msg.role === 'user' ? '#e11d48' : msg.flagged ? '#2d1a1a' : '#1f1f23',
                        border: msg.flagged ? '1px solid #7f1d1d' : 'none',
                        color: '#fafafa', fontSize: 14, lineHeight: 1.5,
                      }}>
                        {msg.content}
                      </div>
                      {msg.role === 'ai' && (
                        <button onClick={() => toggleFlag(msg)} title={msg.flagged ? 'Unflag' : 'Flag bad response'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: msg.flagged ? 1 : 0.3, transition: 'opacity 0.2s', padding: 4 }}>
                          {msg.flagged ? '🚩' : '⚑'}
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#52525b', paddingLeft: msg.role === 'user' ? 0 : 8, paddingRight: msg.role === 'user' ? 8 : 0 }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.token_count ? ` · ${msg.token_count} tokens` : ''}
                    </div>
                    {msg.role === 'ai' && msg.flagged && (
                      <div style={{ paddingLeft: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={flagInputs[msg.id] ?? msg.flag_reason ?? ''}
                          onChange={e => setFlagInputs(prev => ({ ...prev, [msg.id]: e.target.value }))}
                          placeholder="Reason for flagging (optional)"
                          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #7f1d1d', background: '#1a0a0a', color: '#fca5a5', width: 280 }}
                        />
                        <button onClick={() => toggleFlag({ ...msg, flagged: true })}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#7f1d1d', color: '#fca5a5', border: 'none', cursor: 'pointer' }}>
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
