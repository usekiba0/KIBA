import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
// heic-convert is CommonJS with no ESM default export — import=require is correct.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import heicConvert = require('heic-convert');
import { User } from './entities/user.entity';
import { Message } from './entities/message.entity';
import { Subscription } from './entities/subscription.entity';
import { CrisisAlert, AlertStatus } from './entities/crisis-alert.entity';
import { ConversationSession } from './entities/conversation-session.entity';
import { DataRightsService } from './data-rights.service';
import { DEFAULT_LEGAL, LegalSlug } from './legal-content';

const PLAN_PRICE_CENTS: Record<string, number> = {
  individual: 2000,
  coach_pro: 9900,
  coach_elite: 19900,
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectRepository(ConversationSession) private readonly sessionRepo: Repository<ConversationSession>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly dataRightsService: DataRightsService,
  ) {}

  async getDashboardStats() {
    // Real MRR must reflect real money only. A subscription counts toward MRR
    // when it is `active`, belongs to a non-cancelled user, AND is live-mode
    // (real Stripe money). `livemode = null` rows are legacy (pre-tracking) and
    // are trusted only when the app itself runs on a LIVE Stripe key — a test-key
    // deployment reports $0 real MRR (Karibi 2026-07-08: $60 was test conversions).
    const stripeLiveMode = (this.configService.get<string>('STRIPE_SECRET_KEY') || '').startsWith('sk_live_');

    const [userRow, subRows, msgRow, crisisRow, mrrRows] = await Promise.all([
      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
          COUNT(*) FILTER (WHERE status = 'trial')::int AS trial_users,
          COUNT(*) FILTER (WHERE status = 'paused')::int AS paused_users,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_users,
          COUNT(*) FILTER (WHERE crisis_hold = true)::int AS crisis_hold_count
        FROM users
      `),
      this.dataSource.query(`
        SELECT plan, status, COUNT(*)::int AS cnt FROM subscriptions GROUP BY plan, status
      `),
      this.dataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
          COUNT(*) FILTER (WHERE flagged = true)::int AS flagged_total
        FROM messages
      `),
      this.dataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_alerts,
          COUNT(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged_alerts,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d
        FROM crisis_alerts
      `),
      // Real-money MRR: active subs on non-cancelled users, live-mode only.
      this.dataSource.query(
        `
        SELECT s.plan, COUNT(*)::int AS cnt
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.status = 'active'
          AND u.status <> 'cancelled'
          AND (s.livemode = true OR (s.livemode IS NULL AND $1 = true))
        GROUP BY s.plan
      `,
        [stripeLiveMode],
      ),
    ]);

    const u = userRow[0];
    const m = msgRow[0];
    const c = crisisRow[0];

    // Subscription status breakdown (raw row counts, all modes).
    let activeSubs = 0;
    let trialingSubs = 0;
    let pastDueSubs = 0;
    let cancelledSubs = 0;

    for (const row of subRows) {
      if (row.status === 'active') activeSubs += row.cnt;
      if (row.status === 'trialing') trialingSubs += row.cnt;
      if (row.status === 'past_due') pastDueSubs += row.cnt;
      if (row.status === 'cancelled') cancelledSubs += row.cnt;
    }

    // Real MRR — only live-money active subs on non-cancelled users (mrrRows is
    // already filtered). Everything else counted as `active` is test money or a
    // stale row on a cancelled user, surfaced separately so it's transparent,
    // never silently folded into revenue.
    let mrrCents = 0;
    let payingSubs = 0;
    for (const row of mrrRows) {
      mrrCents += row.cnt * (PLAN_PRICE_CENTS[row.plan] ?? 0);
      payingSubs += row.cnt;
    }
    const trialToPaid = payingSubs; // real conversions = real paying subs
    const testModeSubs = Math.max(0, activeSubs - payingSubs);

    return {
      total_users: u.total_users,
      active_users: u.active_users,
      trial_users: u.trial_users,
      paused_users: u.paused_users,
      cancelled_users: u.cancelled_users,
      crisis_hold_count: u.crisis_hold_count,
      active_subs: activeSubs,
      trialing_subs: trialingSubs,
      past_due_subs: pastDueSubs,
      cancelled_subs: cancelledSubs,
      trial_to_paid_count: trialToPaid,
      mrr_cents: mrrCents,
      arr_cents: mrrCents * 12,
      // Transparency: whether the app is on a live Stripe key, and how many
      // active subs were EXCLUDED from MRR as test-mode / cancelled-user rows.
      stripe_live_mode: stripeLiveMode,
      paying_subs: payingSubs,
      test_mode_subs: testModeSubs,
      messages_last_24h: m.last_24h,
      messages_last_7d: m.last_7d,
      flagged_messages_total: m.flagged_total,
      open_alerts: c.open_alerts,
      acknowledged_alerts: c.acknowledged_alerts,
      alerts_last_30d: c.last_30d,
    };
  }

  async listUsers() {
    const rows = await this.dataSource.query(`
      SELECT
        u.id, u.name, u.phone_number, u.coaching_focus, u.goals, u.status,
        u.crisis_hold, u.last_active_at, u.registered_at,
        u.onboarding_stage, u.payment_link_sent_at, u.dunning_nudges_sent,
        s.id AS sub_id, s.plan AS sub_plan, s.status AS sub_status,
        s.trial_end, s.current_period_end,
        es.current_score AS execution_score,
        COALESCE(sk.strike_count, 0)::int AS strike_count,
        CASE WHEN g.action_plan IS NOT NULL THEN 'generated' ELSE 'pending' END AS plan_status
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT current_score FROM execution_scores
        WHERE user_id = u.id ORDER BY snapshot_date DESC LIMIT 1
      ) es ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS strike_count FROM strikes
        WHERE user_id = u.id AND created_at >= NOW() - INTERVAL '7 days'
      ) sk ON true
      LEFT JOIN LATERAL (
        SELECT action_plan FROM goals WHERE user_id = u.id
        ORDER BY is_anchor DESC, created_at DESC LIMIT 1
      ) g ON true
      ORDER BY u.last_active_at DESC NULLS LAST
    `);

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      phone_number: r.phone_number,
      coaching_focus: r.coaching_focus,
      goals: r.goals,
      status: r.status,
      crisis_hold: r.crisis_hold,
      last_active_at: r.last_active_at,
      registered_at: r.registered_at,
      onboarding_stage: r.onboarding_stage,
      payment_link_sent_at: r.payment_link_sent_at,
      dunning_nudges_sent: r.dunning_nudges_sent ?? 0,
      execution_score: r.execution_score ?? null,
      strike_count: r.strike_count ?? 0,
      plan_status: r.plan_status ?? 'pending',
      subscription: r.sub_id
        ? { id: r.sub_id, plan: r.sub_plan, status: r.sub_status, trial_end: r.trial_end, current_period_end: r.current_period_end }
        : null,
    }));
  }

  async getUserDetail(userId: string) {
    const [userRows, profileRows, goalRows, taskRows, scoreRows, strikeRows] = await Promise.all([
      this.dataSource.query(
        `SELECT u.*, s.id AS sub_id, s.plan AS sub_plan, s.status AS sub_status, s.trial_end, s.current_period_end
         FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id = $1`, [userId],
      ),
      this.dataSource.query(`SELECT * FROM psychological_profiles WHERE user_id = $1`, [userId]),
      this.dataSource.query(`SELECT * FROM goals WHERE user_id = $1 ORDER BY is_anchor DESC, created_at DESC LIMIT 1`, [userId]),
      this.dataSource.query(
        `SELECT * FROM daily_tasks WHERE user_id = $1 ORDER BY scheduled_date DESC LIMIT 30`, [userId],
      ),
      this.dataSource.query(
        `SELECT current_score, snapshot_date FROM execution_scores WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 14`, [userId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM strikes WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`, [userId],
      ),
    ]);

    const u = userRows[0];
    return {
      user: u ? {
        id: u.id, name: u.name, phone_number: u.phone_number,
        status: u.status, crisis_hold: u.crisis_hold,
        checkin_time: u.checkin_time, last_active_at: u.last_active_at,
        registered_at: u.registered_at,
        utc_offset_minutes: u.utc_offset_minutes,
        onboarding_stage: u.onboarding_stage,
        intake_data: u.intake_data ?? {},
        payment_link_sent_at: u.payment_link_sent_at,
        sample_coaching_given: u.sample_coaching_given,
        dunning_nudges_sent: u.dunning_nudges_sent ?? 0,
        subscription: u.sub_id
          ? { id: u.sub_id, plan: u.sub_plan, status: u.sub_status, trial_end: u.trial_end, current_period_end: u.current_period_end }
          : null,
      } : null,
      psychological_profile: profileRows[0] ?? null,
      goal: goalRows[0] ?? null,
      recent_tasks: taskRows,
      score_history: scoreRows,
      strike_count_7d: parseInt(strikeRows[0]?.count ?? '0', 10),
    };
  }

  private async ensureSettingsTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  /**
   * Public legal documents, editable from the admin panel.
   *
   * Reuses the existing `app_settings` key/value table rather than adding an
   * entity + migration for two rows of prose. Keyed `legal:<slug>`.
   *
   * ALWAYS returns a document: an unedited slug falls back to the compiled-in
   * default in legal-content.ts. These pages are read by carrier reviewers
   * during A2P registration, so "blank because nobody saved it yet" is a
   * failure mode worth designing out entirely.
   */
  async getLegalDoc(slug: LegalSlug): Promise<{ slug: LegalSlug; title: string; body: string; updated_at: string | null; customised: boolean }> {
    await this.ensureSettingsTable();
    const rows: { value: string; updated_at: string }[] = await this.dataSource.query(
      `SELECT value, updated_at FROM app_settings WHERE key = $1`,
      [`legal:${slug}`],
    );
    const fallback = DEFAULT_LEGAL[slug];
    if (!rows.length) {
      return { slug, title: fallback.title, body: fallback.body, updated_at: null, customised: false };
    }
    try {
      const parsed = JSON.parse(rows[0].value) as { title?: string; body?: string };
      return {
        slug,
        title: parsed.title?.trim() || fallback.title,
        body: parsed.body?.trim() || fallback.body,
        updated_at: rows[0].updated_at,
        customised: true,
      };
    } catch {
      // A corrupted row must not take the page down — serve the default and
      // log, rather than throwing on a public, unauthenticated endpoint.
      this.logger.error(`[Legal] Malformed stored document for ${slug}; serving default`);
      return { slug, title: fallback.title, body: fallback.body, updated_at: null, customised: false };
    }
  }

  async updateLegalDoc(slug: LegalSlug, input: { title?: string; body?: string }) {
    const body = input.body?.trim();
    if (!body) throw new BadRequestException('body is required');
    // Guard against an accidental wipe: these are public legal pages, and an
    // empty or near-empty save would silently gut the page rather than error.
    if (body.length < 200) {
      throw new BadRequestException('body looks too short for a legal document — refusing to publish (minimum 200 characters)');
    }
    await this.ensureSettingsTable();
    const title = input.title?.trim() || DEFAULT_LEGAL[slug].title;
    await this.dataSource.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`legal:${slug}`, JSON.stringify({ title, body })],
    );
    return this.getLegalDoc(slug);
  }

  /** Drop the override so the page reverts to the compiled-in default. */
  async resetLegalDoc(slug: LegalSlug) {
    await this.ensureSettingsTable();
    await this.dataSource.query(`DELETE FROM app_settings WHERE key = $1`, [`legal:${slug}`]);
    return this.getLegalDoc(slug);
  }

  async getSettings() {
    await this.ensureSettingsTable();
    const rows: { key: string; value: string }[] = await this.dataSource.query(`SELECT key, value FROM app_settings`);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      coach_alert_phone: map['coach_alert_phone'] ?? this.configService.get<string>('CRISIS_COACH_ALERT_PHONE') ?? '',
      coach_alert_email: map['coach_alert_email'] ?? this.configService.get<string>('CRISIS_COACH_ALERT_EMAIL') ?? '',
    };
  }

  async updateSettings(settings: { coach_alert_phone?: string; coach_alert_email?: string }) {
    await this.ensureSettingsTable();
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await this.dataSource.query(
          `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, value],
        );
      }
    }
    return this.getSettings();
  }

  async getUserMessages(userId: string) {
    return this.messageRepo.find({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
      select: ['id', 'session_id', 'role', 'content', 'media_url', 'media_content_type', 'created_at', 'token_count', 'flagged', 'flag_reason', 'message_type', 'is_checkin_prompt', 'is_proof_submission'],
    });
  }

  /**
   * Proxy + transcode an inbound media URL for admin display. iPhone/iMessage
   * photos arrive as HEIC (image/heic), which Chrome/Firefox can't render in an
   * <img>, so the admin saw blank/broken images. We fetch the file server-side
   * and transcode HEIC -> JPEG (reusing the same path the vision pipeline uses),
   * returning browser-displayable bytes. Locked to known inbound media hosts so
   * this can't be turned into an open SSRF proxy.
   */
  async getProxiedMedia(rawUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('invalid url');
    }
    const host = parsed.hostname.toLowerCase();
    const allowed =
      parsed.protocol === 'https:' &&
      (host.endsWith('googleapis.com') || // SendBlue inbound-file-store (iMessage)
        host.endsWith('sendblue.co') ||
        host.endsWith('twilio.com') || // Twilio MMS
        host.endsWith('cloudfront.net'));
    if (!allowed) {
      throw new BadRequestException('media host not allowed');
    }

    let resp;
    try {
      resp = await axios.get<ArrayBuffer>(rawUrl, { responseType: 'arraybuffer', timeout: 15_000 });
    } catch (err) {
      this.logger.warn(`[AdminMedia] fetch failed for ${rawUrl}: ${(err as Error).message}`);
      throw new BadRequestException('could not fetch media');
    }

    let buffer = Buffer.from(resp.data);
    let contentType = String(resp.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const urlLower = rawUrl.toLowerCase().split('?')[0];
    const isHeic =
      contentType === 'image/heic' || contentType === 'image/heif' ||
      urlLower.endsWith('.heic') || urlLower.endsWith('.heif');

    if (isHeic) {
      try {
        const jpeg = await heicConvert({ buffer: resp.data, format: 'JPEG', quality: 0.9 });
        buffer = Buffer.from(jpeg);
        contentType = 'image/jpeg';
      } catch (err) {
        this.logger.warn(`[AdminMedia] HEIC transcode failed for ${rawUrl}: ${(err as Error).message}`);
        throw new BadRequestException('could not convert image');
      }
    }

    if (!contentType.startsWith('image/')) contentType = 'application/octet-stream';
    return { buffer, contentType };
  }

  async getUserSubscriptionDetail(userId: string) {
    const [subscription, statsRow] = await Promise.all([
      this.subRepo.findOne({ where: { user_id: userId } }),
      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE role = 'user')::int AS user_messages,
          COUNT(*) FILTER (WHERE role = 'ai')::int AS ai_messages,
          COUNT(*) FILTER (WHERE flagged = true)::int AS flagged_messages,
          COALESCE(SUM(token_count), 0)::int AS total_tokens_used,
          MIN(created_at) AS first_message_at,
          MAX(created_at) AS last_message_at
        FROM messages WHERE user_id = $1
      `, [userId]),
    ]);

    return { subscription, stats: statsRow[0] };
  }

  async updateUserOffset(userId: string, utcOffsetMinutes: number) {
    await this.userRepo.update(userId, { utc_offset_minutes: utcOffsetMinutes });
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    return { user_id: user.id, utc_offset_minutes: user.utc_offset_minutes };
  }

  async updateUserStatus(userId: string, status: 'active' | 'paused' | 'cancelled') {
    const subStatus = status === 'active' ? 'active' : status === 'paused' ? 'past_due' : 'cancelled';
    await this.dataSource.transaction(async (em) => {
      await em.query(`UPDATE users SET status = $1 WHERE id = $2`, [status, userId]);
      await em.query(`UPDATE subscriptions SET status = $1 WHERE user_id = $2`, [subStatus, userId]);
    });
    return { user_id: userId, user_status: status, subscription_status: subStatus };
  }

  async flagMessage(messageId: string, flagged: boolean, flagReason?: string) {
    await this.messageRepo.update(messageId, {
      flagged,
      flag_reason: flagged ? (flagReason ?? null) : null,
    });
    return this.messageRepo.findOne({ where: { id: messageId } });
  }

  async listCrisisAlerts(includeResolved: boolean) {
    const statusFilter = includeResolved
      ? `alert.status IN ('open', 'acknowledged', 'resolved')`
      : `alert.status IN ('open', 'acknowledged')`;

    return this.dataSource.query(`
      SELECT
        alert.id, alert.user_id, u.name AS user_name, u.phone_number AS user_phone,
        alert.triggering_message_id, alert.detection_method, alert.confidence_score,
        alert.coach_alerted, alert.coach_alerted_at, alert.coach_alert_channel,
        alert.holding_message_sent, alert.status,
        alert.resolved_by, alert.resolved_at, alert.created_at
      FROM crisis_alerts alert
      JOIN users u ON u.id = alert.user_id
      WHERE ${statusFilter}
      ORDER BY alert.created_at DESC
    `);
  }

  async deleteUserByPhone(phone: string) {
    const user = await this.userRepo.findOne({ where: { phone_number: phone } });
    if (!user) return { deleted: false, message: `No user found with phone ${phone}` };
    // Full cascading wipe (all user-scoped tables + Stripe sub cancel) so a
    // re-test from the same number comes in genuinely clean, with no orphans.
    await this.dataRightsService.deleteUserData(user.id);
    return { deleted: true, user_id: user.id, name: user.name, phone_number: phone };
  }

  async resolveAlert(alertId: string, resolvedBy: string) {
    const alert = await this.alertRepo.findOneOrFail({ where: { id: alertId } });
    await this.alertRepo.update(alertId, {
      status: AlertStatus.RESOLVED,
      resolved_by: resolvedBy,
      resolved_at: new Date(),
    });
    await this.userRepo.update(alert.user_id, { crisis_hold: false });
    await this.dataSource.query(
      `UPDATE conversation_sessions SET status = 'active' WHERE user_id = $1 AND status = 'crisis_hold'`,
      [alert.user_id],
    );
    return { alert_id: alertId, status: 'resolved', resolved_by: resolvedBy, resolved_at: new Date().toISOString() };
  }
}
