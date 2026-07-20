import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReferralCode, normalizeReferralCode } from './entities/referral-code.entity';
import { User } from './entities/user.entity';
import { structuredLog } from '../common/logger';

/**
 * Why a redemption was refused. The caller turns this into KIBA-voice copy —
 * the service stays silent about tone so the same reasons can be reused by the
 * SMS path and (later) the web form.
 */
export type RedeemFailure = 'unknown' | 'inactive' | 'exhausted' | 'already_redeemed';

export type RedeemResult =
  | { ok: true; code: string; owner: string; trialDays: number }
  | { ok: false; reason: RedeemFailure };

export interface ReferralCodeRow {
  id: string;
  code: string;
  owner: string;
  trial_days: number;
  max_redemptions: number | null;
  times_redeemed: number;
  active: boolean;
  created_at: Date;
  /** Leads currently attributed to this code — counted live from `users`. */
  signups: number;
  /** Of those, how many made it past checkout. */
  paid: number;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(ReferralCode)
    private readonly codeRepo: Repository<ReferralCode>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Redeem a code for a user. Idempotent per user: re-texting the SAME code they
   * already hold succeeds without double-counting, so a lead repeating themselves
   * doesn't burn a redemption slot or get an error they can't act on.
   *
   * The counter bump and the user write share a transaction, and the cap is
   * re-checked inside it against a locked row, so two leads redeeming the last
   * slot of a capped code can't both win.
   */
  async redeem(userId: string, rawCode: string): Promise<RedeemResult> {
    const code = normalizeReferralCode(rawCode);
    if (!code) return { ok: false, reason: 'unknown' };

    return this.dataSource.transaction(async (em) => {
      const row = await em.findOne(ReferralCode, {
        where: { code },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) return { ok: false, reason: 'unknown' as const };
      if (!row.active) return { ok: false, reason: 'inactive' as const };

      const user = await em.findOne(User, { where: { id: userId } });
      if (!user) return { ok: false, reason: 'unknown' as const };

      // Already on this exact code — report success, change nothing. Any OTHER
      // code is refused: a lead can't stack codes or trade up mid-intake.
      if (user.referral_code) {
        if (user.referral_code === code) {
          return {
            ok: true as const,
            code,
            owner: row.owner,
            trialDays: user.referral_trial_days ?? row.trial_days,
          };
        }
        return { ok: false, reason: 'already_redeemed' as const };
      }

      if (row.max_redemptions !== null && row.times_redeemed >= row.max_redemptions) {
        return { ok: false, reason: 'exhausted' as const };
      }

      await em.update(User, userId, {
        referral_code: code,
        // Freeze the promised length — see User.referral_trial_days.
        referral_trial_days: row.trial_days,
      });
      await em.increment(ReferralCode, { id: row.id }, 'times_redeemed', 1);

      structuredLog(this.logger, 'log', {
        service: 'referral',
        operation: 'code_redeemed',
        userId,
        code,
        owner: row.owner,
        trialDays: row.trial_days,
      });

      return { ok: true as const, code, owner: row.owner, trialDays: row.trial_days };
    });
  }

  /**
   * Trial length to hand Stripe for this user: the frozen referral grant if they
   * redeemed a code, otherwise the configured default. Single source of truth so
   * the SMS checkout path and the web form can't drift apart.
   */
  trialDaysFor(user: Pick<User, 'referral_trial_days'>, defaultDays: number): number {
    const granted = user.referral_trial_days;
    return granted && granted > 0 ? granted : defaultDays;
  }

  /** Admin list, newest first, with live signup/paid attribution per code. */
  async listCodes(): Promise<ReferralCodeRow[]> {
    return this.dataSource.query(`
      SELECT c."id", c."code", c."owner", c."trial_days", c."max_redemptions",
             c."times_redeemed", c."active", c."created_at",
             COUNT(u."id")::int AS "signups",
             COUNT(u."id") FILTER (WHERE u."onboarding_stage" = 'complete')::int AS "paid"
      FROM "referral_codes" c
      LEFT JOIN "users" u ON u."referral_code" = c."code"
      GROUP BY c."id"
      ORDER BY c."created_at" DESC
    `);
  }

  /**
   * Mint a code. Returns null if the (canonicalized) code already exists so the
   * controller can answer 409 instead of leaking a DB constraint error.
   */
  async createCode(input: {
    code: string;
    owner: string;
    trialDays: number;
    maxRedemptions: number | null;
  }): Promise<ReferralCode | null> {
    const code = normalizeReferralCode(input.code);
    if (!code) return null;
    const existing = await this.codeRepo.findOne({ where: { code } });
    if (existing) return null;
    return this.codeRepo.save(
      this.codeRepo.create({
        code,
        owner: input.owner.trim(),
        trial_days: input.trialDays,
        max_redemptions: input.maxRedemptions,
      }),
    );
  }

  /** Revoke / restore a code. History and attribution survive either way. */
  async setActive(id: string, active: boolean): Promise<boolean> {
    const result = await this.codeRepo.update(id, { active });
    return (result.affected ?? 0) > 0;
  }
}
