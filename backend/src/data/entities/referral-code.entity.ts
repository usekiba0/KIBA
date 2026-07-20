import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * An affiliate / referral code an admin mints and hands to a partner, and a lead
 * redeems over SMS to unlock a longer free trial (Karibi 2026-07-20, for the
 * 20-user beta).
 *
 * Deliberately NOT a Stripe promotion code. Checkout already sets
 * `allow_promotion_codes: true`, so a Stripe coupon would work for the discount
 * alone — but the ask is an ADMIN-panel feature with attribution: who handed out
 * the code, how many leads each partner brought in. Stripe promo codes can't be
 * minted or counted from our dashboard, and they only apply once the lead is
 * already on the checkout page (our leads redeem mid-SMS, before they ever see
 * it). So the code lives here and only its EFFECT — the trial length — is handed
 * to Stripe.
 */
@Entity('referral_codes')
export class ReferralCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The redeemable token, stored UPPERCASE and without whitespace. Users text it
   * in whatever case they like; `normalizeReferralCode` canonicalizes on both the
   * write and the lookup so "kiba20", "KIBA20" and " Kiba20 " are one code.
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  /** Who this code belongs to — the affiliate/partner name, for attribution. */
  @Column({ type: 'varchar', length: 120 })
  owner: string;

  /**
   * Free trial length granted on redemption, in days. Per-code rather than a
   * global constant so a beta code (30) and a normal partner code (14) can
   * coexist without a deploy.
   */
  @Column({ type: 'smallint', default: 30 })
  trial_days: number;

  /**
   * Redemption cap. NULL = unlimited. Checked against `times_redeemed` at
   * redemption time so a code handed to a big audience can't run away.
   */
  @Column({ type: 'int', nullable: true })
  max_redemptions: number | null;

  @Column({ type: 'int', default: 0 })
  times_redeemed: number;

  /** Revoke switch — an inactive code stops redeeming but keeps its history. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/**
 * Canonical form of a referral code: trimmed, inner whitespace and dashes
 * stripped, uppercased. Applied on BOTH mint and redeem so a lead who texts
 * "kiba-20" hits the code an admin created as "KIBA20". Returns '' for input
 * that has no code-ish characters at all.
 */
export function normalizeReferralCode(raw: string): string {
  return (raw ?? '').replace(/[\s-]+/g, '').toUpperCase().slice(0, 32);
}
