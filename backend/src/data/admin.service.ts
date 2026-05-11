import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Message } from './entities/message.entity';
import { Subscription } from './entities/subscription.entity';
import { CrisisAlert, AlertStatus } from './entities/crisis-alert.entity';
import { ConversationSession } from './entities/conversation-session.entity';

const PLAN_PRICE_CENTS: Record<string, number> = {
  individual: 2000,
  coach_pro: 9900,
  coach_elite: 19900,
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(CrisisAlert) private readonly alertRepo: Repository<CrisisAlert>,
    @InjectRepository(ConversationSession) private readonly sessionRepo: Repository<ConversationSession>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async getDashboardStats() {
    const [userRow, subRows, msgRow, crisisRow] = await Promise.all([
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
    ]);

    const u = userRow[0];
    const m = msgRow[0];
    const c = crisisRow[0];

    // MRR — only active subs
    let mrrCents = 0;
    let activeSubs = 0;
    let trialingSubs = 0;
    let pastDueSubs = 0;
    let cancelledSubs = 0;
    let trialToPaid = 0;

    for (const row of subRows) {
      if (row.status === 'active') {
        activeSubs += row.cnt;
        mrrCents += row.cnt * (PLAN_PRICE_CENTS[row.plan] ?? 0);
        trialToPaid += row.cnt; // active = converted from trial
      }
      if (row.status === 'trialing') trialingSubs += row.cnt;
      if (row.status === 'past_due') pastDueSubs += row.cnt;
      if (row.status === 'cancelled') cancelledSubs += row.cnt;
    }

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
        SELECT action_plan FROM goals WHERE user_id = u.id LIMIT 1
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
      this.dataSource.query(`SELECT * FROM goals WHERE user_id = $1 LIMIT 1`, [userId]),
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
      select: ['id', 'session_id', 'role', 'content', 'media_url', 'created_at', 'token_count', 'flagged', 'flag_reason', 'message_type'],
    });
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
