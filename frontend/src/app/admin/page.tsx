'use client';
import { useEffect, useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

type Tab = 'dashboard' | 'users' | 'crisis';
type UserStatus = 'trial' | 'active' | 'paused' | 'cancelled';
type SubStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';
type AlertStatus = 'open' | 'acknowledged' | 'resolved';

interface AdminUserSub { id: string; plan: string; status: SubStatus; trial_end: string; current_period_end: string | null; }
interface AdminUser { id: string; name: string; phone_number: string; coaching_focus: string; status: UserStatus; crisis_hold: boolean; last_active_at: string | null; registered_at: string; subscription: AdminUserSub | null; }
interface Message { id: string; session_id: string; role: 'user' | 'ai'; content: string; created_at: string; token_count: number | null; flagged: boolean; flag_reason: string | null; message_type: string; }
interface UserSubDetail { subscription: { stripe_customer_id: string; stripe_subscription_id: string; plan: string; status: string; trial_start: string; trial_end: string; current_period_end: string | null; created_at: string; } | null; stats: { total_messages: number; user_messages: number; ai_messages: number; flagged_messages: number; total_tokens_used: number; first_message_at: string | null; last_message_at: string | null; }; }
interface DashStats { total_users: number; active_users: number; trial_users: number; paused_users: number; cancelled_users: number; crisis_hold_count: number; active_subs: number; trialing_subs: number; past_due_subs: number; cancelled_subs: number; trial_to_paid_count: number; mrr_cents: number; arr_cents: number; messages_last_24h: number; messages_last_7d: number; flagged_messages_total: number; open_alerts: number; acknowledged_alerts: number; alerts_last_30d: number; }
interface CrisisAlert { id: string; user_id: string; user_name: string; user_phone: string; detection_method: string; confidence_score: number | null; coach_alerted: boolean; coach_alerted_at: string | null; coach_alert_channel: string | null; holding_message_sent: boolean; status: AlertStatus; resolved_by: string | null; resolved_at: string | null; created_at: string; }

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

function fmt(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function money(cents: number) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function StatCard({ label, value, sub, highlight, large }: { label: string; value: string | number; sub?: string; highlight?: 'red' | 'amber' | 'green'; large?: boolean }) {
  const borderColor = highlight === 'red' ? '#ef4444' : highlight === 'amber' ? '#f59e0b' : highlight === 'green' ? '#22c55e' : '#27272a';
  const bg = highlight === 'red' ? 'linear-gradient(135deg,#1a0a0a,#0f0505)' : highlight === 'amber' ? 'linear-gradient(135deg,#1a1200,#0f0b00)' : highlight === 'green' ? 'linear-gradient(135deg,#0a1a0e,#050f08)' : 'linear-gradient(135deg,#111113,#0d0d10)';
  return (
    <div style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: large ? '22px 24px' : '14px 18px', position: 'relative', overflow: 'hidden' }}>
      {highlight && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: borderColor, opacity: 0.6 }} />}
      <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: large ? 34 : 24, fontWeight: 700, color: highlight === 'green' ? '#4ade80' : highlight === 'red' ? '#f87171' : highlight === 'amber' ? '#fbbf24' : '#fafafa', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#52525b', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = { individual: 'IND', coach_pro: 'PRO', coach_elite: 'ELITE' };
  return <span style={{ fontSize: 10, background: '#27272a', color: '#a1a1aa', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>{labels[plan] ?? plan.toUpperCase()}</span>;
}

function SubStatusBadge({ status }: { status: SubStatus }) {
  if (status === 'past_due') return <span style={{ fontSize: 10, background: '#431407', color: '#fb923c', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>PAST DUE</span>;
  if (status === 'cancelled') return <span style={{ fontSize: 10, background: '#1a0a0a', color: '#f87171', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>CANCELLED</span>;
  if (status === 'trialing') return <span style={{ fontSize: 10, background: '#0a1628', color: '#60a5fa', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>TRIAL</span>;
  return null;
}

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userSubDetail, setUserSubDetail] = useState<UserSubDetail | null>(null);
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [dashStats, setDashStats] = useState<DashStats | null>(null);
  const [crisisAlerts, setCrisisAlerts] = useState<CrisisAlert[]>([]);
  const [crisisLoaded, setCrisisLoaded] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({});
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('adminKey') : '';
    if (saved) { setKey(saved); init(saved); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function apiFetch(path: string, opts: RequestInit = {}, apiKey = key) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-internal-key': apiKey, ...opts.headers },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  async function init(apiKey: string) {
    setLoading(true);
    try {
      const [usersData, dash] = await Promise.all([
        apiFetch('/admin/users', {}, apiKey),
        apiFetch('/admin/dashboard', {}, apiKey),
      ]);
      setUsers(usersData);
      setDashStats(dash);
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
    await init(keyInput);
  }

  async function selectUser(user: AdminUser) {
    setSelectedUser(user);
    setMessages([]);
    setUserSubDetail(null);
    const [msgs, subDetail] = await Promise.all([
      apiFetch(`/admin/users/${user.id}/messages`),
      apiFetch(`/admin/users/${user.id}/subscription`),
    ]);
    setMessages(msgs);
    setUserSubDetail(subDetail);
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

  async function toggleUserStatus(user: AdminUser) {
    setTogglingUserId(user.id);
    const newStatus = user.status === 'active' ? 'paused' : 'active';
    try {
      await apiFetch(`/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus as UserStatus } : u));
      if (selectedUser?.id === user.id) setSelectedUser(u => u ? { ...u, status: newStatus as UserStatus } : u);
    } catch { /* ignore */ }
    setTogglingUserId(null);
  }

  async function loadCrisisAlerts(resolved: boolean) {
    const data = await apiFetch(`/admin/crisis-alerts${resolved ? '?include_resolved=true' : ''}`);
    setCrisisAlerts(data);
    setCrisisLoaded(true);
  }

  async function handleTabChange(t: Tab) {
    setTab(t);
    if (t === 'crisis' && !crisisLoaded) await loadCrisisAlerts(showResolved);
  }

  async function toggleShowResolved() {
    const next = !showResolved;
    setShowResolved(next);
    await loadCrisisAlerts(next);
  }

  async function resolveAlert(alert: CrisisAlert) {
    const name = resolveInputs[alert.id]?.trim();
    if (!name) return;
    setResolvingAlertId(alert.id);
    try {
      await apiFetch(`/admin/crisis-alerts/${alert.id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolved_by: name }) });
      setCrisisAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: 'resolved' as AlertStatus, resolved_by: name, resolved_at: new Date().toISOString() } : a));
      setUsers(prev => prev.map(u => u.id === alert.user_id ? { ...u, crisis_hold: false } : u));
      if (dashStats) setDashStats({ ...dashStats, open_alerts: Math.max(0, dashStats.open_alerts - 1), crisis_hold_count: Math.max(0, dashStats.crisis_hold_count - 1) });
    } catch { /* ignore */ }
    setResolvingAlertId(null);
  }

  if (!key) {
    return (
      <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 16, padding: 40, width: 340 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>RYKE <span style={{ color: '#e11d48' }}>Admin</span></div>
          <div style={{ fontSize: 13, color: '#71717a', marginBottom: 24 }}>Enter your internal API key to continue</div>
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Internal API key"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />
          {keyError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{keyError}</div>}
          <button type="submit" style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'linear-gradient(135deg,#e11d48,#8b5cf6)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}>
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const openAlertCount = dashStats?.open_alerts ?? 0;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#09090b', color: '#fafafa', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid #27272a', background: '#111113', height: 52, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>RYKE <span style={{ color: '#e11d48' }}>Admin</span></div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dashboard', 'users', 'crisis'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: tab === t ? 600 : 400, background: tab === t ? '#27272a' : 'transparent', color: tab === t ? '#fafafa' : '#71717a', position: 'relative' }}>
              {t === 'crisis' ? 'Crisis Alerts' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'crisis' && openAlertCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              )}
            </button>
          ))}
        </div>
        <button onClick={() => { localStorage.removeItem('adminKey'); setKey(''); setUsers([]); setSelectedUser(null); setCrisisLoaded(false); }}
          style={{ fontSize: 13, color: '#71717a', background: 'none', border: '1px solid #3f3f46', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#09090b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fafafa' }}>Overview</div>
              <div style={{ fontSize: 13, color: '#52525b', marginTop: 2 }}>Real-time metrics from your database</div>
            </div>
            <button onClick={() => init(key)} style={{ fontSize: 12, color: '#a1a1aa', background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#52525b', fontSize: 14 }}>
              <div style={{ width: 16, height: 16, border: '2px solid #27272a', borderTopColor: '#e11d48', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Loading...
            </div>
          )}

          {dashStats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Hero row — Revenue */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <StatCard label="MRR" value={money(dashStats.mrr_cents)} sub="monthly recurring revenue" highlight={dashStats.mrr_cents > 0 ? 'green' : undefined} large />
                <StatCard label="ARR" value={money(dashStats.arr_cents)} sub="annual run rate" large />
                <StatCard label="Total Users" value={dashStats.total_users} sub="all time" large />
                <StatCard label="Paid Subscribers" value={dashStats.active_subs} sub="active billing" highlight={dashStats.active_subs > 0 ? 'green' : undefined} large />
              </div>

              {/* Users + Subscriptions row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* User breakdown card */}
                <div style={{ background: 'linear-gradient(135deg,#111113,#0d0d10)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 20 }}>User Breakdown</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
                    <MiniStat label="Active" value={dashStats.active_users} color="#4ade80" />
                    <MiniStat label="Trial" value={dashStats.trial_users} color="#60a5fa" />
                    <MiniStat label="Paused" value={dashStats.paused_users} color="#a1a1aa" />
                    <MiniStat label="Cancelled" value={dashStats.cancelled_users} color="#52525b" />
                  </div>
                  {/* Distribution bar */}
                  {dashStats.total_users > 0 && (
                    <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                      {dashStats.active_users > 0 && <div style={{ flex: dashStats.active_users, background: '#22c55e' }} />}
                      {dashStats.trial_users > 0 && <div style={{ flex: dashStats.trial_users, background: '#3b82f6' }} />}
                      {dashStats.paused_users > 0 && <div style={{ flex: dashStats.paused_users, background: '#71717a' }} />}
                      {dashStats.cancelled_users > 0 && <div style={{ flex: dashStats.cancelled_users, background: '#27272a' }} />}
                    </div>
                  )}
                  {dashStats.crisis_hold_count > 0 && (
                    <div style={{ marginTop: 14, padding: '8px 12px', background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>⚠</span> {dashStats.crisis_hold_count} user{dashStats.crisis_hold_count > 1 ? 's' : ''} in crisis hold
                    </div>
                  )}
                </div>

                {/* Subscription health card */}
                <div style={{ background: 'linear-gradient(135deg,#111113,#0d0d10)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 20 }}>Subscription Health</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Trialing', value: dashStats.trialing_subs, color: '#60a5fa' },
                      { label: 'Active (Paid)', value: dashStats.active_subs, color: '#4ade80' },
                      { label: 'Past Due', value: dashStats.past_due_subs, color: '#fbbf24' },
                      { label: 'Cancelled', value: dashStats.cancelled_subs, color: '#52525b' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, color: '#a1a1aa' }}>{row.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: row.color }}>{row.value}</div>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #1f1f23', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#52525b' }}>Trial → Paid conversions</span>
                      <span style={{ color: '#fafafa', fontWeight: 600 }}>{dashStats.trial_to_paid_count}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity + Crisis row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div style={{ background: 'linear-gradient(135deg,#111113,#0d0d10)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>Message Activity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#71717a' }}>Last 24 hours</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#fafafa' }}>{dashStats.messages_last_24h}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#71717a' }}>Last 7 days</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#fafafa' }}>{dashStats.messages_last_7d}</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'linear-gradient(135deg,#111113,#0d0d10)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>AI Quality</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: dashStats.flagged_messages_total > 0 ? '#fbbf24' : '#4ade80' }}>{dashStats.flagged_messages_total}</div>
                    <div style={{ fontSize: 13, color: '#52525b' }}>flagged responses</div>
                    {dashStats.flagged_messages_total === 0 && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>All clear</div>}
                  </div>
                </div>

                <div style={{ background: dashStats.open_alerts > 0 ? 'linear-gradient(135deg,#1a0a0a,#0f0505)' : 'linear-gradient(135deg,#111113,#0d0d10)', border: `1px solid ${dashStats.open_alerts > 0 ? '#7f1d1d' : '#27272a'}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                  {dashStats.open_alerts > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#ef4444' }} />}
                  <div style={{ fontSize: 11, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>Crisis Alerts</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#71717a' }}>Open</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: dashStats.open_alerts > 0 ? '#f87171' : '#52525b' }}>{dashStats.open_alerts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#71717a' }}>Acknowledged</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: dashStats.acknowledged_alerts > 0 ? '#fbbf24' : '#52525b' }}>{dashStats.acknowledged_alerts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1f1f23', paddingTop: 10 }}>
                      <span style={{ fontSize: 13, color: '#52525b' }}>Last 30 days</span>
                      <span style={{ fontSize: 13, color: '#a1a1aa' }}>{dashStats.alerts_last_30d}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* User list */}
          <div style={{ width: 260, borderRight: '1px solid #27272a', overflowY: 'auto', background: '#0d0d10', flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>
              Users ({users.length})
            </div>
            {loading && <div style={{ padding: '12px 16px', color: '#71717a', fontSize: 13 }}>Loading...</div>}
            {users.map(u => (
              <div key={u.id} onClick={() => selectUser(u)}
                style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #1f1f23', background: selectedUser?.id === u.id ? '#18181b' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: u.crisis_hold ? '#ef4444' : u.status === 'active' ? '#22c55e' : '#52525b', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#fafafa' }}>{u.name}</span>
                  {u.subscription && <PlanBadge plan={u.subscription.plan} />}
                  {u.subscription && <SubStatusBadge status={u.subscription.status} />}
                  {u.crisis_hold && <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>CRISIS</span>}
                </div>
                <div style={{ fontSize: 12, color: '#71717a', paddingLeft: 13 }}>{u.phone_number}</div>
                <div style={{ fontSize: 11, color: '#52525b', paddingLeft: 13, marginTop: 2 }}>{timeAgo(u.last_active_at)}</div>
              </div>
            ))}
          </div>

          {/* Conversation panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedUser ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: 14 }}>
                Select a user to view their conversation
              </div>
            ) : (
              <>
                {/* User header */}
                <div style={{ padding: '14px 24px', borderBottom: '1px solid #27272a', background: '#111113', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedUser.name}</div>
                      <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>
                        {selectedUser.phone_number} · {selectedUser.status} · last active {timeAgo(selectedUser.last_active_at)}
                      </div>
                    </div>
                    <button onClick={() => toggleUserStatus(selectedUser)} disabled={togglingUserId === selectedUser.id}
                      style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600,
                        background: selectedUser.status === 'active' ? '#7f1d1d' : '#14532d',
                        color: selectedUser.status === 'active' ? '#fca5a5' : '#86efac' }}>
                      {togglingUserId === selectedUser.id ? '...' : selectedUser.status === 'active' ? 'Disable User' : 'Enable User'}
                    </button>
                  </div>

                  {/* Subscription detail */}
                  {userSubDetail && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#18181b', borderRadius: 8, border: '1px solid #27272a', fontSize: 12, color: '#a1a1aa', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {userSubDetail.subscription ? (
                        <>
                          <span><span style={{ color: '#52525b' }}>Plan</span> {userSubDetail.subscription.plan}</span>
                          <span><span style={{ color: '#52525b' }}>Status</span> {userSubDetail.subscription.status}</span>
                          <span><span style={{ color: '#52525b' }}>Trial ends</span> {fmt(userSubDetail.subscription.trial_end)}</span>
                          <span><span style={{ color: '#52525b' }}>Period end</span> {fmt(userSubDetail.subscription.current_period_end)}</span>
                        </>
                      ) : <span style={{ color: '#52525b' }}>No subscription</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        <span style={{ color: '#52525b' }}>Messages</span> {userSubDetail.stats.total_messages}
                        {' · '}
                        <span style={{ color: '#52525b' }}>Tokens</span> {userSubDetail.stats.total_tokens_used.toLocaleString()}
                        {userSubDetail.stats.flagged_messages > 0 && (
                          <span style={{ color: '#f87171' }}> · {userSubDetail.stats.flagged_messages} flagged</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{
                          maxWidth: 480, padding: '10px 14px',
                          borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: msg.role === 'user' ? '#e11d48' : msg.flagged ? '#2d1a1a' : '#1f1f23',
                          border: msg.flagged ? '1px solid #7f1d1d' : 'none',
                          color: '#fafafa', fontSize: 14, lineHeight: 1.5,
                        }}>{msg.content}</div>
                        {msg.role === 'ai' && (
                          <button onClick={() => toggleFlag(msg)} title={msg.flagged ? 'Unflag' : 'Flag bad response'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: msg.flagged ? 1 : 0.3, padding: 4 }}>
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
                          <input value={flagInputs[msg.id] ?? msg.flag_reason ?? ''} onChange={e => setFlagInputs(prev => ({ ...prev, [msg.id]: e.target.value }))}
                            placeholder="Reason for flagging (optional)"
                            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #7f1d1d', background: '#1a0a0a', color: '#fca5a5', width: 280 }} />
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
      )}

      {/* Crisis Alerts Tab */}
      {tab === 'crisis' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Crisis Alerts</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#71717a', cursor: 'pointer' }}>
              <input type="checkbox" checked={showResolved} onChange={toggleShowResolved} />
              Show resolved
            </label>
          </div>
          {crisisAlerts.length === 0 && <div style={{ color: '#52525b', fontSize: 14 }}>No alerts{showResolved ? '' : ' — toggle "Show resolved" to see history'}.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {crisisAlerts.map(alert => {
              const borderColor = alert.status === 'open' ? '#ef4444' : alert.status === 'acknowledged' ? '#f59e0b' : '#27272a';
              const resolved = alert.status === 'resolved';
              return (
                <div key={alert.id} style={{ background: '#111113', border: `1px solid ${borderColor}`, borderLeft: `4px solid ${borderColor}`, borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{alert.user_name}</span>
                      <span style={{ fontSize: 13, color: '#71717a', marginLeft: 8 }}>{alert.user_phone}</span>
                      <span style={{ fontSize: 11, marginLeft: 8, padding: '2px 8px', borderRadius: 4, background: borderColor + '33', color: borderColor, textTransform: 'uppercase', fontWeight: 600 }}>{alert.status}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#52525b' }}>{timeAgo(alert.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#71717a', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>{alert.detection_method.replace('_', ' ')} {alert.confidence_score != null ? `· ${Math.round(alert.confidence_score * 100)}% confidence` : ''}</span>
                    {alert.coach_alerted && <span>coach alerted via {alert.coach_alert_channel ?? 'unknown'} at {fmt(alert.coach_alerted_at)}</span>}
                    {alert.holding_message_sent && <span>holding message sent</span>}
                  </div>
                  {!resolved && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={resolveInputs[alert.id] ?? ''}
                        onChange={e => setResolveInputs(prev => ({ ...prev, [alert.id]: e.target.value }))}
                        placeholder="Your name to resolve..."
                        style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #3f3f46', background: '#18181b', color: '#fafafa', width: 220 }}
                      />
                      <button onClick={() => resolveAlert(alert)} disabled={resolvingAlertId === alert.id || !resolveInputs[alert.id]?.trim()}
                        style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#14532d', color: '#86efac', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {resolvingAlertId === alert.id ? '...' : 'Resolve'}
                      </button>
                    </div>
                  )}
                  {resolved && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#52525b' }}>
                      Resolved by <span style={{ color: '#a1a1aa' }}>{alert.resolved_by}</span> on {fmt(alert.resolved_at)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
