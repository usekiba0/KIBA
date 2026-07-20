'use client';
import { useEffect, useState, useRef, Fragment } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

type Tab = 'dashboard' | 'users' | 'crisis' | 'corrections' | 'referrals' | 'settings';
type CorrectionStatus = 'pending' | 'accepted' | 'appended' | 'rejected';
type UserStatus = 'trial' | 'active' | 'paused' | 'cancelled';
type SubStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';
type AlertStatus = 'open' | 'acknowledged' | 'resolved';

interface AdminUserSub { id: string; plan: string; status: SubStatus; trial_end: string; current_period_end: string | null; }
interface AdminUser { id: string; name: string; phone_number: string; coaching_focus: string; goals: string; status: UserStatus; crisis_hold: boolean; last_active_at: string | null; registered_at: string; subscription: AdminUserSub | null; execution_score: number | null; strike_count: number; plan_status: string; }
interface CoachSettings { coach_alert_phone: string; coach_alert_email: string; }
interface Message { id: string; session_id: string; role: 'user' | 'ai'; content: string; media_url: string | null; media_content_type: string | null; created_at: string; token_count: number | null; flagged: boolean; flag_reason: string | null; message_type: string; is_checkin_prompt: boolean; is_proof_submission: boolean; }
interface UserSubDetail { subscription: { stripe_customer_id: string; stripe_subscription_id: string; plan: string; status: string; trial_start: string; trial_end: string; current_period_end: string | null; created_at: string; } | null; stats: { total_messages: number; user_messages: number; ai_messages: number; flagged_messages: number; total_tokens_used: number; first_message_at: string | null; last_message_at: string | null; }; }
interface DashStats { total_users: number; active_users: number; trial_users: number; paused_users: number; cancelled_users: number; crisis_hold_count: number; active_subs: number; trialing_subs: number; past_due_subs: number; cancelled_subs: number; trial_to_paid_count: number; mrr_cents: number; arr_cents: number; stripe_live_mode: boolean; paying_subs: number; test_mode_subs: number; messages_last_24h: number; messages_last_7d: number; flagged_messages_total: number; open_alerts: number; acknowledged_alerts: number; alerts_last_30d: number; }
interface CrisisAlert { id: string; user_id: string; user_name: string; user_phone: string; detection_method: string; confidence_score: number | null; coach_alerted: boolean; coach_alerted_at: string | null; coach_alert_channel: string | null; holding_message_sent: boolean; status: AlertStatus; resolved_by: string | null; resolved_at: string | null; created_at: string; }
interface Correction { id: string; user_id: string; triggering_message_id: string | null; correction_text: string; ai_analysis: string | null; ai_validity_score: number | null; ai_suggested_knowledge: string | null; status: CorrectionStatus; knowledge_id: string | null; admin_note: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string; }
interface Knowledge { id: string; title: string; content: string; source_correction_id: string | null; active: boolean; created_by: string; created_at: string; updated_at: string; }
interface ReferralCode { id: string; code: string; owner: string; trial_days: number; max_redemptions: number | null; times_redeemed: number; active: boolean; created_at: string; signups: number; paid: number; }

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

// Mirrors the backend canonicalization: uppercase, whitespace + dashes stripped.
function canonCode(raw: string) {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function fmtMsgTime(iso: string) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + time;
}

function fmtSessionDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function groupBySession(msgs: Message[]) {
  const groups: { sessionId: string; msgs: Message[] }[] = [];
  for (const msg of msgs) {
    const last = groups[groups.length - 1];
    if (last && last.sessionId === msg.session_id) {
      last.msgs.push(msg);
    } else {
      groups.push({ sessionId: msg.session_id, msgs: [msg] });
    }
  }
  return groups;
}

function StatCard({ label, value, sub, highlight, large }: { label: string; value: string | number; sub?: string; highlight?: 'red' | 'amber' | 'green'; large?: boolean }) {
  const borderColor = highlight === 'red' ? '#ef4444' : highlight === 'amber' ? '#f59e0b' : highlight === 'green' ? '#22c55e' : '#1a2d45';
  const bg = highlight === 'red' ? 'linear-gradient(135deg,#1a0a0a,#0f0505)' : highlight === 'amber' ? 'linear-gradient(135deg,#1a1200,#0f0b00)' : highlight === 'green' ? 'linear-gradient(135deg,#0a1a0e,#050f08)' : 'linear-gradient(135deg,#0c1829,#081422)';
  return (
    <div style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: 12, padding: large ? '22px 24px' : '14px 18px', position: 'relative', overflow: 'hidden' }}>
      {highlight && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: borderColor, opacity: 0.6 }} />}
      <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: large ? 34 : 24, fontWeight: 700, color: highlight === 'green' ? '#4ade80' : highlight === 'red' ? '#f87171' : highlight === 'amber' ? '#fbbf24' : '#fafafa', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#3a6080', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = { individual: 'IND', coach_pro: 'PRO', coach_elite: 'ELITE' };
  return <span style={{ fontSize: 10, background: '#1a2d45', color: '#7eb4cc', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>{labels[plan] ?? plan.toUpperCase()}</span>;
}

function SubStatusBadge({ status }: { status: SubStatus }) {
  if (status === 'past_due') return <span style={{ fontSize: 10, background: '#431407', color: '#fb923c', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>PAST DUE</span>;
  if (status === 'cancelled') return <span style={{ fontSize: 10, background: '#1a0a0a', color: '#f87171', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>CANCELLED</span>;
  if (status === 'trialing') return <span style={{ fontSize: 10, background: '#0a1628', color: '#60a5fa', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>TRIAL</span>;
  return null;
}

// Inbound photos (esp. iPhone HEIC) can't render in a plain <img>, and the media
// endpoint needs the internal-key header an <img> can't send. So fetch it through
// the auth'd proxy (which transcodes HEIC->JPEG), turn it into a blob URL, render.
function MediaImage({ url, apiKey }: { url: string; apiKey: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(`${API}/admin/media?url=${encodeURIComponent(url)}`, {
          headers: { 'x-internal-key': apiKey },
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setSrc(objUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [url, apiKey]);

  if (failed) return <a href={url} target="_blank" rel="noreferrer" style={{ color: '#7eb4cc' }}>📷 open photo</a>;
  if (!src) return <span style={{ color: '#7eb4cc', fontSize: 12 }}>loading photo…</span>;
  return <img src={src} alt="user photo" style={{ maxWidth: 280, maxHeight: 280, borderRadius: 8, display: 'block' }} />;
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
  const [coachSettings, setCoachSettings] = useState<CoachSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<CoachSettings>({ coach_alert_phone: '', coach_alert_email: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [correctionsLoaded, setCorrectionsLoaded] = useState(false);
  const [showReviewedCorrections, setShowReviewedCorrections] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [correctionDraft, setCorrectionDraft] = useState<Record<string, { title: string; content: string }>>({});
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const [referralsLoaded, setReferralsLoaded] = useState(false);
  const [referralForm, setReferralForm] = useState({ code: '', owner: '', trial_days: '30', max_redemptions: '' });
  const [referralError, setReferralError] = useState('');
  const [referralCreating, setReferralCreating] = useState(false);
  const [referralTogglingId, setReferralTogglingId] = useState<string | null>(null);
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

  async function deleteUser(user: AdminUser) {
    if (!confirm(`Delete ${user.name} (${user.phone_number})? This cannot be undone.`)) return;
    try {
      const encoded = encodeURIComponent(user.phone_number);
      await fetch(`${API}/admin/users/by-phone/${encoded}`, { method: 'DELETE', headers: { 'x-internal-key': key } });
      setUsers(prev => prev.filter(u => u.id !== user.id));
      if (selectedUser?.id === user.id) setSelectedUser(null);
    } catch (err) {
      alert(`Failed to delete user: ${err instanceof Error ? err.message : 'Server error'}`);
    }
  }

  async function toggleUserStatus(user: AdminUser) {
    setTogglingUserId(user.id);
    const isBlocking = user.status === 'active' || user.status === 'trial';
    const newStatus = isBlocking ? 'paused' : 'active';
    try {
      await apiFetch(`/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus as UserStatus } : u));
      if (selectedUser?.id === user.id) setSelectedUser(u => u ? { ...u, status: newStatus as UserStatus } : u);
    } catch (err) {
      alert(`Failed to update user status: ${err instanceof Error ? err.message : 'Server error'}`);
    }
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
    if (t === 'settings' && !coachSettings) {
      const data = await apiFetch('/admin/settings');
      setCoachSettings(data);
      setSettingsForm(data);
    }
    if (t === 'corrections' && !correctionsLoaded) await loadCorrections(showReviewedCorrections);
    if (t === 'referrals' && !referralsLoaded) await loadReferralCodes();
  }

  async function loadReferralCodes() {
    try {
      const data = await apiFetch('/admin/referral-codes');
      setReferralCodes(data);
      setReferralsLoaded(true);
    } catch (err) {
      setReferralError(`Failed to load referral codes: ${err instanceof Error ? err.message : 'server error'}`);
    }
  }

  async function createReferralCode(e: React.FormEvent) {
    e.preventDefault();
    setReferralError('');
    const code = canonCode(referralForm.code);
    const owner = referralForm.owner.trim();
    const trialDays = Number(referralForm.trial_days);
    const maxRaw = referralForm.max_redemptions.trim();
    const maxRedemptions = maxRaw ? Number(maxRaw) : undefined;

    if (code.length < 3 || code.length > 32) { setReferralError('Code must be 3-32 characters (after stripping spaces and dashes).'); return; }
    if (owner.length < 1 || owner.length > 120) { setReferralError('Owner must be 1-120 characters.'); return; }
    if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365) { setReferralError('Trial days must be a whole number between 1 and 365.'); return; }
    if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 100000)) {
      setReferralError('Max redemptions must be a whole number between 1 and 100000, or blank for unlimited.');
      return;
    }

    setReferralCreating(true);
    try {
      const res = await apiFetch('/admin/referral-codes', {
        method: 'POST',
        body: JSON.stringify({ code, owner, trial_days: trialDays, ...(maxRedemptions !== undefined ? { max_redemptions: maxRedemptions } : {}) }),
      });
      if (!res.ok) {
        setReferralError(res.error ?? 'Could not create code');
      } else {
        setReferralCodes(prev => [res.code as ReferralCode, ...prev]);
        setReferralForm({ code: '', owner: '', trial_days: '30', max_redemptions: '' });
      }
    } catch (err) {
      setReferralError(`Create failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
    setReferralCreating(false);
  }

  async function toggleReferralActive(rc: ReferralCode) {
    setReferralTogglingId(rc.id);
    setReferralError('');
    try {
      const res = await apiFetch(`/admin/referral-codes/${rc.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rc.active }),
      });
      if (!res.ok) {
        setReferralError(res.error ?? 'Could not update code');
      } else {
        setReferralCodes(prev => prev.map(x => x.id === rc.id ? { ...x, active: !x.active } : x));
      }
    } catch (err) {
      setReferralError(`Toggle failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
    setReferralTogglingId(null);
  }

  async function loadCorrections(includeReviewed: boolean) {
    const [c, k] = await Promise.all([
      apiFetch(`/admin/corrections${includeReviewed ? '?include_reviewed=true' : ''}`),
      apiFetch('/admin/knowledge'),
    ]);
    setCorrections(c);
    setKnowledge(k);
    setCorrectionsLoaded(true);
    // Seed drafts from AI suggestion so admin can edit-then-accept
    const seed: Record<string, { title: string; content: string }> = {};
    for (const row of c as Correction[]) {
      seed[row.id] = {
        title: row.ai_analysis ? row.ai_analysis.slice(0, 80) : row.correction_text.slice(0, 80),
        content: row.ai_suggested_knowledge ?? row.correction_text,
      };
    }
    setCorrectionDraft(seed);
  }

  async function toggleShowReviewedCorrections() {
    const next = !showReviewedCorrections;
    setShowReviewedCorrections(next);
    await loadCorrections(next);
  }

  async function acceptCorrection(c: Correction) {
    const draft = correctionDraft[c.id];
    if (!reviewerName.trim() || !draft?.title.trim() || !draft?.content.trim()) return;
    setCorrectingId(c.id);
    try {
      await apiFetch(`/admin/corrections/${c.id}/accept`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewed_by: reviewerName.trim(), title: draft.title.trim(), content: draft.content.trim() }),
      });
      await loadCorrections(showReviewedCorrections);
    } catch (err) {
      alert(`Accept failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
    setCorrectingId(null);
  }

  async function appendCorrection(c: Correction, knowledgeId: string) {
    const draft = correctionDraft[c.id];
    if (!reviewerName.trim() || !knowledgeId || !draft?.content.trim()) return;
    setCorrectingId(c.id);
    try {
      await apiFetch(`/admin/corrections/${c.id}/append`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewed_by: reviewerName.trim(), knowledge_id: knowledgeId, appended_content: draft.content.trim() }),
      });
      await loadCorrections(showReviewedCorrections);
    } catch (err) {
      alert(`Append failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
    setCorrectingId(null);
  }

  async function rejectCorrection(c: Correction) {
    if (!reviewerName.trim()) return;
    setCorrectingId(c.id);
    try {
      await apiFetch(`/admin/corrections/${c.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewed_by: reviewerName.trim() }),
      });
      await loadCorrections(showReviewedCorrections);
    } catch (err) {
      alert(`Reject failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
    setCorrectingId(null);
  }

  async function toggleKnowledgeActive(k: Knowledge) {
    try {
      await apiFetch(`/admin/knowledge/${k.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !k.active }),
      });
      setKnowledge(prev => prev.map(x => x.id === k.id ? { ...x, active: !x.active } : x));
    } catch (err) {
      alert(`Toggle failed: ${err instanceof Error ? err.message : 'server error'}`);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    const data = await apiFetch('/admin/settings', { method: 'PATCH', body: JSON.stringify(settingsForm) });
    setCoachSettings(data);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
    setSettingsSaving(false);
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
      <div style={{ minHeight: '100vh', background: '#050d1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ background: '#0c1829', border: '1px solid #27272a', borderRadius: 16, padding: 40, width: 340 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f0f9ff', marginBottom: 8 }}>KIBA <span style={{ color: '#38bdf8' }}>Admin</span></div>
          <div style={{ fontSize: 13, color: '#3a6080', marginBottom: 24 }}>Enter your internal API key to continue</div>
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Internal API key"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />
          {keyError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{keyError}</div>}
          <button type="submit" style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#10b981)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}>
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const openAlertCount = dashStats?.open_alerts ?? 0;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#050d1a', color: '#f0f9ff', fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid #27272a', background: '#0c1829', height: 52, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>KIBA <span style={{ color: '#38bdf8' }}>Admin</span></div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dashboard', 'users', 'crisis', 'corrections', 'referrals', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: tab === t ? 600 : 400, background: tab === t ? '#1a2d45' : 'transparent', color: tab === t ? '#fafafa' : '#71717a', position: 'relative' }}>
              {t === 'crisis' ? 'Crisis Alerts' : t === 'corrections' ? 'Corrections' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'crisis' && openAlertCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              )}
            </button>
          ))}
        </div>
        <button onClick={() => { localStorage.removeItem('adminKey'); setKey(''); setUsers([]); setSelectedUser(null); setCrisisLoaded(false); }}
          style={{ fontSize: 13, color: '#3a6080', background: 'none', border: '1px solid #1a2d45', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#050d1a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f9ff' }}>Overview</div>
              <div style={{ fontSize: 13, color: '#3a6080', marginTop: 2 }}>Real-time metrics from your database</div>
            </div>
            <button onClick={() => init(key)} style={{ fontSize: 12, color: '#7eb4cc', background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#3a6080', fontSize: 14 }}>
              <div style={{ width: 16, height: 16, border: '2px solid #27272a', borderTopColor: '#0ea5e9', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Loading...
            </div>
          )}

          {dashStats && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Hero row — Revenue */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <StatCard
                  label="MRR"
                  value={money(dashStats.mrr_cents)}
                  sub={
                    dashStats.stripe_live_mode === false
                      ? 'TEST MODE — $0 real revenue'
                      : dashStats.test_mode_subs > 0
                        ? `real revenue · ${dashStats.test_mode_subs} test/excluded sub${dashStats.test_mode_subs === 1 ? '' : 's'} not counted`
                        : 'monthly recurring revenue'
                  }
                  highlight={dashStats.mrr_cents > 0 ? 'green' : undefined}
                  large
                />
                <StatCard label="ARR" value={money(dashStats.arr_cents)} sub="annual run rate" large />
                <StatCard label="Total Users" value={dashStats.total_users} sub="all time" large />
                <StatCard label="Paid Subscribers" value={dashStats.paying_subs} sub={dashStats.test_mode_subs > 0 ? `live billing · ${dashStats.active_subs} active rows` : 'active billing'} highlight={dashStats.paying_subs > 0 ? 'green' : undefined} large />
              </div>

              {/* Users + Subscriptions row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* User breakdown card */}
                <div style={{ background: 'linear-gradient(135deg,#0c1829,#081422)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 20 }}>User Breakdown</div>
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
                      {dashStats.cancelled_users > 0 && <div style={{ flex: dashStats.cancelled_users, background: '#1a2d45' }} />}
                    </div>
                  )}
                  {dashStats.crisis_hold_count > 0 && (
                    <div style={{ marginTop: 14, padding: '8px 12px', background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>⚠</span> {dashStats.crisis_hold_count} user{dashStats.crisis_hold_count > 1 ? 's' : ''} in crisis hold
                    </div>
                  )}
                </div>

                {/* Subscription health card */}
                <div style={{ background: 'linear-gradient(135deg,#0c1829,#081422)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 20 }}>Subscription Health</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Trialing', value: dashStats.trialing_subs, color: '#60a5fa' },
                      { label: 'Active (Paid)', value: dashStats.active_subs, color: '#4ade80' },
                      { label: 'Past Due', value: dashStats.past_due_subs, color: '#fbbf24' },
                      { label: 'Cancelled', value: dashStats.cancelled_subs, color: '#3a6080' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 13, color: '#7eb4cc' }}>{row.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: row.color }}>{row.value}</div>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #1f1f23', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#3a6080' }}>Trial → Paid conversions</span>
                      <span style={{ color: '#f0f9ff', fontWeight: 600 }}>{dashStats.trial_to_paid_count}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity + Crisis row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div style={{ background: 'linear-gradient(135deg,#0c1829,#081422)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>Message Activity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#3a6080' }}>Last 24 hours</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#f0f9ff' }}>{dashStats.messages_last_24h}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#3a6080' }}>Last 7 days</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: '#f0f9ff' }}>{dashStats.messages_last_7d}</span>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'linear-gradient(135deg,#0c1829,#081422)', border: '1px solid #27272a', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>AI Quality</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: dashStats.flagged_messages_total > 0 ? '#fbbf24' : '#4ade80' }}>{dashStats.flagged_messages_total}</div>
                    <div style={{ fontSize: 13, color: '#3a6080' }}>flagged responses</div>
                    {dashStats.flagged_messages_total === 0 && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>All clear</div>}
                  </div>
                </div>

                <div style={{ background: dashStats.open_alerts > 0 ? 'linear-gradient(135deg,#1a0a0a,#0f0505)' : 'linear-gradient(135deg,#0c1829,#081422)', border: `1px solid ${dashStats.open_alerts > 0 ? '#7f1d1d' : '#1a2d45'}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                  {dashStats.open_alerts > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#ef4444' }} />}
                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>Crisis Alerts</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#3a6080' }}>Open</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: dashStats.open_alerts > 0 ? '#f87171' : '#52525b' }}>{dashStats.open_alerts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#3a6080' }}>Acknowledged</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: dashStats.acknowledged_alerts > 0 ? '#fbbf24' : '#52525b' }}>{dashStats.acknowledged_alerts}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1f1f23', paddingTop: 10 }}>
                      <span style={{ fontSize: 13, color: '#3a6080' }}>Last 30 days</span>
                      <span style={{ fontSize: 13, color: '#7eb4cc' }}>{dashStats.alerts_last_30d}</span>
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
          <div style={{ width: 260, borderRight: '1px solid #27272a', overflowY: 'auto', background: '#081422', flexShrink: 0 }}>
            <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1 }}>
              Users ({users.length})
            </div>
            {loading && <div style={{ padding: '12px 16px', color: '#3a6080', fontSize: 13 }}>Loading...</div>}
            {users.map(u => (
              <div key={u.id} style={{ borderBottom: '1px solid #1f1f23', background: selectedUser?.id === u.id ? '#0d1e30' : 'transparent' }}>
                <div onClick={() => selectUser(u)} style={{ padding: '12px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: u.crisis_hold ? '#ef4444' : u.status === 'active' ? '#22c55e' : '#52525b', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#f0f9ff' }}>{u.name}</span>
                    {u.subscription && <PlanBadge plan={u.subscription.plan} />}
                    {u.subscription && <SubStatusBadge status={u.subscription.status} />}
                    {u.crisis_hold && <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>CRISIS</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#3a6080', paddingLeft: 13 }}>{u.phone_number}</div>
                  {u.goals && <div style={{ fontSize: 11, color: '#3a6080', paddingLeft: 13, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }} title={u.goals}>{u.goals}</div>}
                  <div style={{ fontSize: 11, color: '#3f3f46', paddingLeft: 13, marginTop: 2 }}>{timeAgo(u.last_active_at)}</div>
                </div>
                <div style={{ padding: '0 16px 10px 16px', display: 'flex', gap: 6 }}>
                  <button onClick={() => selectUser(u)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #27272a', background: 'transparent', color: '#7eb4cc', cursor: 'pointer' }}>
                    View Chat
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleUserStatus(u); }} disabled={togglingUserId === u.id}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600,
                      background: u.status === 'active' || u.status === 'trial' ? '#3b0a0a' : '#0a1a0e',
                      color: u.status === 'active' || u.status === 'trial' ? '#f87171' : '#4ade80' }}>
                    {togglingUserId === u.id ? '...' : u.status === 'active' || u.status === 'trial' ? 'Block' : 'Unblock'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteUser(u); }}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600, background: '#1a0a0a', color: '#f87171' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Conversation panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selectedUser ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a6080', fontSize: 14 }}>
                Select a user to view their conversation
              </div>
            ) : (
              <>
                {/* User header */}
                <div style={{ padding: '14px 24px', borderBottom: '1px solid #27272a', background: '#0c1829', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedUser.name}</div>
                      <div style={{ fontSize: 12, color: '#3a6080', marginTop: 2 }}>
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
                    <div style={{ marginTop: 12, padding: '10px 14px', background: '#18181b', borderRadius: 8, border: '1px solid #27272a', fontSize: 12, color: '#7eb4cc', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      {userSubDetail.subscription ? (
                        <>
                          <span><span style={{ color: '#3a6080' }}>Plan</span> {userSubDetail.subscription.plan}</span>
                          <span><span style={{ color: '#3a6080' }}>Status</span> {userSubDetail.subscription.status}</span>
                          <span><span style={{ color: '#3a6080' }}>Trial ends</span> {fmt(userSubDetail.subscription.trial_end)}</span>
                          <span><span style={{ color: '#3a6080' }}>Period end</span> {fmt(userSubDetail.subscription.current_period_end)}</span>
                        </>
                      ) : <span style={{ color: '#3a6080' }}>No subscription</span>}
                      <span style={{ marginLeft: 'auto' }}>
                        <span style={{ color: '#3a6080' }}>Messages</span> {userSubDetail.stats.total_messages}
                        {' · '}
                        <span style={{ color: '#3a6080' }}>Tokens</span> {userSubDetail.stats.total_tokens_used.toLocaleString()}
                        {userSubDetail.stats.flagged_messages > 0 && (
                          <span style={{ color: '#f87171' }}> · {userSubDetail.stats.flagged_messages} flagged</span>
                        )}
                        {selectedUser.execution_score != null && (
                          <> · <span style={{ color: '#3a6080' }}>Score</span> {selectedUser.execution_score}%</>
                        )}
                        {selectedUser.strike_count > 0 && (
                          <span style={{ color: '#f87171' }}> · {selectedUser.strike_count} strike{selectedUser.strike_count !== 1 ? 's' : ''}/wk</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {groupBySession(messages).map(({ sessionId, msgs: sessionMsgs }) => (
                    <Fragment key={sessionId}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                        <div style={{ flex: 1, height: 1, background: '#1a2d45' }} />
                        <div style={{ fontSize: 10, color: '#3a6080', whiteSpace: 'nowrap', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          Session · {fmtSessionDate(sessionMsgs[0].created_at)}
                        </div>
                        <div style={{ flex: 1, height: 1, background: '#1a2d45' }} />
                      </div>
                      {sessionMsgs.map(msg => (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                          {msg.is_checkin_prompt && (
                            <div style={{ fontSize: 10, color: '#60a5fa', paddingLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Check-in Prompt</div>
                          )}
                          {msg.is_proof_submission && (
                            <div style={{ fontSize: 10, color: '#a78bfa', paddingRight: 8, textAlign: 'right', letterSpacing: 0.5, textTransform: 'uppercase' }}>Proof Submission</div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                            <div style={{
                              maxWidth: 480, padding: '10px 14px',
                              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: msg.role === 'user' ? '#0ea5e9' : msg.flagged ? '#2d1a1a' : '#152035',
                              border: msg.flagged ? '1px solid #7f1d1d' : 'none',
                              color: '#f0f9ff', fontSize: 14, lineHeight: 1.5,
                            }}>
                              {msg.media_url ? (
                                <>
                                  <MediaImage url={msg.media_url} apiKey={key} />
                                  {msg.content && msg.content !== '[image]' && (
                                    <div style={{ marginTop: 6 }}>{msg.content}</div>
                                  )}
                                </>
                              ) : msg.content}
                            </div>
                            {msg.role === 'ai' && (
                              <button onClick={() => toggleFlag(msg)} title={msg.flagged ? 'Unflag' : 'Flag bad response'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: msg.flagged ? 1 : 0.3, padding: 4 }}>
                                {msg.flagged ? '🚩' : '⚑'}
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#3a6080', paddingLeft: msg.role === 'user' ? 0 : 8, paddingRight: msg.role === 'user' ? 8 : 0 }}>
                            {fmtMsgTime(msg.created_at)}
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
                    </Fragment>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3a6080', cursor: 'pointer' }}>
              <input type="checkbox" checked={showResolved} onChange={toggleShowResolved} />
              Show resolved
            </label>
          </div>
          {crisisAlerts.length === 0 && <div style={{ color: '#3a6080', fontSize: 14 }}>No alerts{showResolved ? '' : ' — toggle "Show resolved" to see history'}.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {crisisAlerts.map(alert => {
              const borderColor = alert.status === 'open' ? '#ef4444' : alert.status === 'acknowledged' ? '#f59e0b' : '#1a2d45';
              const resolved = alert.status === 'resolved';
              return (
                <div key={alert.id} style={{ background: '#0c1829', border: `1px solid ${borderColor}`, borderLeft: `4px solid ${borderColor}`, borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{alert.user_name}</span>
                      <span style={{ fontSize: 13, color: '#3a6080', marginLeft: 8 }}>{alert.user_phone}</span>
                      <span style={{ fontSize: 11, marginLeft: 8, padding: '2px 8px', borderRadius: 4, background: borderColor + '33', color: borderColor, textTransform: 'uppercase', fontWeight: 600 }}>{alert.status}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#3a6080' }}>{timeAgo(alert.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#3a6080', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
                        style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', width: 220 }}
                      />
                      <button onClick={() => resolveAlert(alert)} disabled={resolvingAlertId === alert.id || !resolveInputs[alert.id]?.trim()}
                        style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#14532d', color: '#86efac', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {resolvingAlertId === alert.id ? '...' : 'Resolve'}
                      </button>
                    </div>
                  )}
                  {resolved && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#3a6080' }}>
                      Resolved by <span style={{ color: '#7eb4cc' }}>{alert.resolved_by}</span> on {fmt(alert.resolved_at)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Corrections Tab */}
      {tab === 'corrections' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Corrections</div>
              <div style={{ fontSize: 13, color: '#3a6080', marginTop: 2 }}>User-submitted #kibi corrections — accept to inject into all users&apos; AI context</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                value={reviewerName}
                onChange={e => setReviewerName(e.target.value)}
                placeholder="Your name (required to review)"
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', width: 220 }}
              />
              <button onClick={toggleShowReviewedCorrections}
                style={{ fontSize: 12, color: '#7eb4cc', background: '#18181b', border: '1px solid #27272a', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                {showReviewedCorrections ? 'Pending only' : 'Show reviewed'}
              </button>
            </div>
          </div>

          {/* Knowledge entries panel */}
          <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
              Live Knowledge ({knowledge.filter(k => k.active).length} active / {knowledge.length} total)
            </div>
            {knowledge.length === 0 && <div style={{ fontSize: 13, color: '#3a6080' }}>No knowledge entries yet — accept a correction to add one.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {knowledge.map(k => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: '1px solid #1e3a5f' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: k.active ? '#f0f9ff' : '#52525b' }}>{k.title}</div>
                    <div style={{ fontSize: 12, color: '#7eb4cc', marginTop: 2, whiteSpace: 'pre-wrap' }}>{k.content}</div>
                    <div style={{ fontSize: 11, color: '#3a6080', marginTop: 4 }}>by {k.created_by} · {fmt(k.created_at)}</div>
                  </div>
                  <button onClick={() => toggleKnowledgeActive(k)}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600,
                      background: k.active ? '#0a1a0e' : '#27272a', color: k.active ? '#4ade80' : '#a1a1aa' }}>
                    {k.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {corrections.length === 0 && <div style={{ color: '#3a6080', fontSize: 14 }}>No corrections{showReviewedCorrections ? '' : ' pending'}.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {corrections.map(c => {
              const isPending = c.status === 'pending';
              const score = c.ai_validity_score;
              const scoreColor = score == null ? '#52525b' : score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171';
              const statusColor = c.status === 'accepted' ? '#22c55e' : c.status === 'appended' ? '#0ea5e9' : c.status === 'rejected' ? '#71717a' : '#f59e0b';
              const draft = correctionDraft[c.id] ?? { title: '', content: '' };
              return (
                <div key={c.id} style={{ background: '#0c1829', border: `1px solid ${isPending ? statusColor : '#27272a'}`, borderLeft: `4px solid ${statusColor}`, borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusColor + '33', color: statusColor, textTransform: 'uppercase', fontWeight: 600 }}>{c.status}</span>
                      {score != null && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: scoreColor + '22', color: scoreColor }}>AI validity {score}/100</span>
                      )}
                      <span style={{ fontSize: 12, color: '#3a6080' }}>from user {c.user_id.slice(0, 8)}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#3a6080' }}>{timeAgo(c.created_at)}</span>
                  </div>

                  <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>User said</div>
                  <div style={{ fontSize: 13, color: '#f0f9ff', background: '#081422', borderRadius: 6, padding: '8px 12px', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{c.correction_text}</div>

                  {c.ai_analysis && (
                    <>
                      <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>AI analysis</div>
                      <div style={{ fontSize: 13, color: '#7eb4cc', marginBottom: 12 }}>{c.ai_analysis}</div>
                    </>
                  )}

                  {isPending ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Knowledge title (for Accept)</label>
                        <input
                          value={draft.title}
                          onChange={e => setCorrectionDraft(prev => ({ ...prev, [c.id]: { ...draft, title: e.target.value } }))}
                          placeholder="Short title for this knowledge entry"
                          style={{ width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Knowledge content (injected into AI prompt for all users)</label>
                        <textarea
                          value={draft.content}
                          onChange={e => setCorrectionDraft(prev => ({ ...prev, [c.id]: { ...draft, content: e.target.value } }))}
                          rows={3}
                          style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => acceptCorrection(c)} disabled={correctingId === c.id || !reviewerName.trim() || !draft.title.trim() || !draft.content.trim()}
                          style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#14532d', color: '#86efac', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          {correctingId === c.id ? '...' : '✓ Accept (new entry)'}
                        </button>
                        {knowledge.length > 0 && (
                          <select
                            onChange={e => { if (e.target.value) appendCorrection(c, e.target.value); e.currentTarget.value = ''; }}
                            disabled={correctingId === c.id || !reviewerName.trim() || !draft.content.trim()}
                            defaultValue=""
                            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, background: '#1e3a5f', color: '#93c5fd', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            <option value="">+ Append to…</option>
                            {knowledge.map(k => (
                              <option key={k.id} value={k.id}>{k.title}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => rejectCorrection(c)} disabled={correctingId === c.id || !reviewerName.trim()}
                          style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: '#3b0a0a', color: '#f87171', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          ✕ Reject
                        </button>
                      </div>
                      {!reviewerName.trim() && (
                        <div style={{ fontSize: 12, color: '#fbbf24' }}>Enter your name above to enable review actions.</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#3a6080' }}>
                      Reviewed by <span style={{ color: '#7eb4cc' }}>{c.reviewed_by}</span> on {fmt(c.reviewed_at)}
                      {c.admin_note && <div style={{ marginTop: 4 }}>Note: {c.admin_note}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Referrals Tab */}
      {tab === 'referrals' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Referrals</div>
            <div style={{ fontSize: 13, color: '#3a6080', marginTop: 2 }}>Affiliate codes — new signups who text a code get the trial length below</div>
          </div>

          {/* Create form */}
          <form onSubmit={createReferralCode} style={{ background: '#0c1829', border: '1px solid #27272a', borderRadius: 12, padding: '18px 20px', marginBottom: 22 }}>
            <div style={{ fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600, marginBottom: 14 }}>New Code</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 0.8fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 6 }}>Code</label>
                <input
                  value={referralForm.code}
                  onChange={e => setReferralForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="COACHJEN"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 6 }}>Owner</label>
                <input
                  value={referralForm.owner}
                  onChange={e => setReferralForm(f => ({ ...f, owner: e.target.value }))}
                  placeholder="Jen — IG @coachjen"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 6 }}>Trial days</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={referralForm.trial_days}
                  onChange={e => setReferralForm(f => ({ ...f, trial_days: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#3a6080', display: 'block', marginBottom: 6 }}>Max redemptions</label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={referralForm.max_redemptions}
                  onChange={e => setReferralForm(f => ({ ...f, max_redemptions: e.target.value }))}
                  placeholder="unlimited"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <button type="submit" disabled={referralCreating}
                style={{ padding: '9px 20px', borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#10b981)', color: '#fff', fontWeight: 600, border: 'none', cursor: referralCreating ? 'default' : 'pointer', fontSize: 13, opacity: referralCreating ? 0.6 : 1 }}>
                {referralCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
            {referralForm.code.trim() && canonCode(referralForm.code) !== referralForm.code && (
              <div style={{ fontSize: 12, color: '#7eb4cc', marginTop: 10 }}>
                Will be saved as <span style={{ color: '#f0f9ff', fontWeight: 600 }}>{canonCode(referralForm.code)}</span>
              </div>
            )}
            {referralError && <div style={{ fontSize: 13, color: '#f87171', marginTop: 10 }}>{referralError}</div>}
          </form>

          {/* Code list */}
          {referralCodes.length === 0 && <div style={{ color: '#3a6080', fontSize: 14 }}>No referral codes yet — create one above.</div>}

          {referralCodes.length > 0 && (
            <div style={{ background: '#0c1829', border: '1px solid #27272a', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 0.7fr 0.9fr 0.6fr 0.6fr 0.9fr auto', gap: 12, padding: '10px 20px', fontSize: 11, color: '#3a6080', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, borderBottom: '1px solid #1f1f23' }}>
                <div>Code</div>
                <div>Owner</div>
                <div>Trial</div>
                <div>Redeemed</div>
                <div>Signups</div>
                <div>Paid</div>
                <div>Created</div>
                <div style={{ width: 92 }} />
              </div>
              {referralCodes.map(rc => (
                <div key={rc.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 0.7fr 0.9fr 0.6fr 0.6fr 0.9fr auto', gap: 12, padding: '12px 20px', alignItems: 'center', borderTop: '1px solid #1f1f23', fontSize: 13, opacity: rc.active ? 1 : 0.55 }}>
                  <div style={{ fontWeight: 700, color: '#f0f9ff', letterSpacing: 0.5 }}>{rc.code}</div>
                  <div style={{ color: '#7eb4cc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rc.owner}>{rc.owner}</div>
                  <div style={{ color: '#7eb4cc' }}>{rc.trial_days}d</div>
                  <div style={{ color: '#f0f9ff' }}>
                    {rc.times_redeemed}{rc.max_redemptions != null ? <span style={{ color: '#3a6080' }}> / {rc.max_redemptions}</span> : ''}
                  </div>
                  <div style={{ color: '#f0f9ff' }}>{rc.signups}</div>
                  <div style={{ color: rc.paid > 0 ? '#4ade80' : '#52525b', fontWeight: rc.paid > 0 ? 600 : 400 }}>{rc.paid}</div>
                  <div style={{ color: '#3a6080', fontSize: 12 }}>{fmt(rc.created_at)}</div>
                  <button onClick={() => toggleReferralActive(rc)} disabled={referralTogglingId === rc.id}
                    style={{ width: 92, fontSize: 11, padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600,
                      background: rc.active ? '#0a1a0e' : '#27272a', color: rc.active ? '#4ade80' : '#a1a1aa' }}>
                    {referralTogglingId === rc.id ? '...' : rc.active ? 'Active' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Settings</div>
          <div style={{ fontSize: 13, color: '#3a6080', marginBottom: 28 }}>Configure who gets alerted when a crisis is detected</div>

          <form onSubmit={saveSettings} style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: '#0c1829', border: '1px solid #27272a', borderRadius: 12, padding: '24px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f9ff', marginBottom: 4 }}>Crisis Coach Contact</div>
              <div style={{ fontSize: 12, color: '#3a6080', marginBottom: 20 }}>
                When a user sends a distress message, KIBA immediately texts and emails this person.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#3a6080', display: 'block', marginBottom: 6 }}>Coach Phone Number (E.164 format, e.g. +12125551234)</label>
                  <input
                    value={settingsForm.coach_alert_phone}
                    onChange={e => setSettingsForm(f => ({ ...f, coach_alert_phone: e.target.value }))}
                    placeholder="+12125551234"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#3a6080', display: 'block', marginBottom: 6 }}>Coach Email Address</label>
                  <input
                    type="email"
                    value={settingsForm.coach_alert_email}
                    onChange={e => setSettingsForm(f => ({ ...f, coach_alert_email: e.target.value }))}
                    placeholder="coach@yourcompany.com"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1a2d45', background: '#18181b', color: '#f0f9ff', fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 12, padding: '16px 20px', fontSize: 13, color: '#93c5fd', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>How crisis alerts work</div>
              When KIBA detects a distress message, it:<br />
              1. Sends an SMS to the coach phone number above<br />
              2. Sends an email to the coach email above<br />
              3. The coach can view the full conversation in the <strong>Users</strong> tab<br />
              4. The coach contacts the user directly from their own phone<br />
              5. Once resolved, mark the alert as resolved in the <strong>Crisis Alerts</strong> tab
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" disabled={settingsSaving}
                style={{ padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#10b981)', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 14 }}>
                {settingsSaving ? 'Saving...' : 'Save Settings'}
              </button>
              {settingsSaved && <span style={{ fontSize: 13, color: '#4ade80' }}>✓ Saved</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
