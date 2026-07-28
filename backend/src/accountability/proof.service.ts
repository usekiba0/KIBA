import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proof, ProofType, ProofValidationStatus } from '../data/entities/proof.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { User } from '../data/entities/user.entity';
import { PsychologicalProfile } from '../data/entities/psychological-profile.entity';
import { AntiGhostService } from './anti-ghost.service';
import { ScoreService } from './score.service';
import { MessagingService } from '../messaging/messaging.service';
import { OutboundRecorderService } from '../data/outbound-recorder.service';
import { buildMilestoneMessage, pickMilestone } from '../ai/prompts/milestone.prompt';
import { structuredLog } from '../common/logger';

export interface SubmitProofDto {
  userId: string;
  taskId: string;
  type: ProofType;
  mediaUrl?: string;
  content?: string;
}

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);

  constructor(
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PsychologicalProfile) private readonly profileRepo: Repository<PsychologicalProfile>,
    private readonly antiGhostService: AntiGhostService,
    private readonly scoreService: ScoreService,
    private readonly messagingService: MessagingService,
    private readonly recorder: OutboundRecorderService,
    private readonly config: ConfigService,
  ) {}

  async submitProof(dto: SubmitProofDto): Promise<Proof> {
    const task = await this.taskRepo.findOne({ where: { id: dto.taskId, user_id: dto.userId } });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found for user ${dto.userId}`);

    const proof = await this.proofRepo.save(
      this.proofRepo.create({
        task_id: dto.taskId,
        user_id: dto.userId,
        proof_type: dto.type,
        media_url: dto.mediaUrl ?? null,
        content: dto.content ?? null,
        validation_status: ProofValidationStatus.ACCEPTED,
        validated_at: new Date(),
      }),
    );

    task.status = TaskStatus.COMPLETED;
    task.proof_id = proof.id;
    task.completion_timestamp = new Date();
    await this.taskRepo.save(task);

    await this.antiGhostService.onUserResponse(dto.userId);
    await this.scoreService.updateScore(dto.userId);

    // Streak milestone auto-fire (V5 PART 6). Counts consecutive completed
    // tasks ending today. Only fires if the streak crosses 3/7/14/30 AND
    // exceeds the user's last_milestone_hit so we don't double-celebrate
    // when the same streak length holds across multiple proof submissions.
    // Best-effort: a failure here must not block proof acceptance.
    try {
      await this.fireMilestoneIfDue(dto.userId);
    } catch (err) {
      this.logger.warn(`milestone check failed for ${dto.userId}: ${(err as Error).message}`);
    }

    // One-time housekeeping asks (save the contact / pin the chat), fired on the
    // FIRST accepted proof rather than on the payment webhook. Best-effort.
    try {
      await this.maybeSendActivationAsks(dto.userId);
    } catch (err) {
      this.logger.warn(`activation asks failed for ${dto.userId}: ${(err as Error).message}`);
    }

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'proof_submitted',
      userId: dto.userId,
      taskId: dto.taskId,
      proofType: dto.type,
    });

    return proof;
  }

  /**
   * The one-time "save my contact" + "pin our chat" asks, fired ONCE, on the
   * user's first accepted proof.
   *
   * These used to fire from the Stripe webhook the instant payment cleared,
   * which broke two rules at once (Training Doc v2, section 4):
   *   - "Message stacking on payment. Doc v1 said one message then wait." The
   *     activation text + contact card + pin nudge landed as three back-to-back
   *     texts at the highest-emotion moment in the funnel.
   *   - "Pin ask timing. Doc v1 said pin ask fires AFTER first completed
   *     check-in. T1 fired it immediately after payment."
   *
   * Asking a favour right after someone pays reads transactional. Asking it
   * right after they've DONE something reads like a friend who plans to stick
   * around. Both sends are best-effort and no-op until their URLs are set.
   */
  private async maybeSendActivationAsks(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;
    // Already sent — this is the first-proof moment only, never a repeat.
    if (user.intake_data?.activation_asks_sent_at) return;

    const contactCardUrl = this.config.get<string>('CONTACT_CARD_URL');
    const pinMediaUrl =
      this.config.get<string>('PIN_CHAT_MEDIA_URL') ??
      this.config.get<string>('PIN_CHAT_IMAGE_URL');
    // Nothing configured — don't burn the one-shot flag, so the asks still go
    // out on a later proof once the URLs are live.
    if (!contactCardUrl && !pinMediaUrl) return;

    // Stamp BEFORE sending. A send that throws mid-flight must not re-fire the
    // whole pair on the next proof; a missed one-time nudge is far cheaper than
    // spamming a paying user.
    await this.userRepo.update(userId, {
      intake_data: { ...(user.intake_data ?? {}), activation_asks_sent_at: new Date().toISOString() },
    });

    // Apple-masking Path B (launch call 2026-07-10): the saved contact IS the
    // branding — Apple has no native branding for a business that texts first,
    // and a saved contact also defeats iOS "Screen Unknown Senders". The .vcf
    // carries BOTH the SendBlue (iMessage) and Twilio (SMS) numbers so one save
    // brands both threads. Sent BEFORE the pin nudge — save first, then pin.
    if (contactCardUrl) {
      try {
        await this.messagingService.send(
          user.phone_number,
          'that\'s one. quick thing while you\'re here — save my contact so i always show up as KIBA in your texts 📲',
          contactCardUrl,
        );
      } catch (err) {
        this.logger.warn(`contact-card send failed for ${userId}: ${(err as Error).message}`);
      }
    }

    // Retention nudge: a one-time "pin our chat" how-to so KIBA stays at the top
    // of their messages. The media may be an image, GIF, or video — the send path
    // hands the URL straight to SendBlue (media_url) / Twilio (mediaUrl). Keep it
    // small: iMessage handles video natively but Android/MMS caps size, so a short
    // GIF or a compressed <~1MB mp4 is safest cross-platform.
    if (pinMediaUrl) {
      // Log the URL we hand the provider. When this broke in prod (Karibi
      // 2026-07-28) the TEXT arrived and only the attachment vanished — the
      // provider accepted the payload and dropped the media on its own side, so
      // nothing threw and nothing was logged. Likeliest cause is a wrong
      // Content-Type (raw.githubusercontent.com returns application/octet-stream
      // for .mp4). Without this line only a device test can tell them apart.
      structuredLog(this.logger, 'log', {
        service: 'accountability',
        operation: 'pin_chat_media_send',
        userId,
        mediaUrl: pinMediaUrl,
      });
      try {
        await this.messagingService.send(
          user.phone_number,
          // Karibi's wording (2026-07-28). Covers BOTH asks in one message — pin
          // the chat AND save the contact — which matters because the separate
          // .vcf send is a no-op while CONTACT_CARD_URL is unset, so this is
          // currently the only prompt to save the number.
          'to make sure i\'m always in your corner, pin our chat and add me to your contacts. just long press our chat and hit pin, then tap our number up top and save it as a contact!',
          pinMediaUrl,
        );
      } catch (err) {
        this.logger.warn(`pin-chat media send failed for ${userId}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Count the user's current completed-task streak (going backwards from today)
   * and fire the milestone message if we just crossed 3/7/14/30. Updates
   * `user.last_milestone_hit` so the same crossing doesn't double-fire.
   *
   * The streak is "consecutive days ending today with a completed task." A day
   * with NO task counts as a break (the user has to be actively grinding for
   * the streak to hold).
   */
  private async fireMilestoneIfDue(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const streak = await this.computeCurrentStreak(userId);
    const milestone = pickMilestone(streak, user.last_milestone_hit);
    if (!milestone) return;

    const profile = await this.profileRepo.findOne({ where: { user_id: userId } });
    const message = buildMilestoneMessage(milestone, user.name ?? '', profile);
    if (!message) return;

    await this.messagingService.send(user.phone_number, message);
    // Visible to the live coaching layer + admin API (Retraining doc B1).
    await this.recorder.record(userId, message, 'milestone');
    await this.userRepo.update(userId, { last_milestone_hit: milestone });

    structuredLog(this.logger, 'log', {
      service: 'accountability', operation: 'milestone_fired',
      userId, milestone, streak,
    });
  }

  /**
   * Consecutive completed days ending today. Walks backwards from today
   * looking for the first day that is NOT completed (either missed or no task
   * at all) and returns the run length.
   *
   * Pulled inline rather than reusing ScoreService.calcStreakBonus because we
   * need the raw day count, not the normalized bonus value.
   */
  private async computeCurrentStreak(userId: string): Promise<number> {
    const tasks = await this.taskRepo.find({
      where: { user_id: userId },
      order: { scheduled_date: 'DESC' },
      take: 60,
    });
    if (tasks.length === 0) return 0;

    // Bucket tasks by ISO date so multiple tasks-per-day still count as one day.
    const byDate = new Map<string, TaskStatus>();
    for (const t of tasks) {
      const key = new Date(t.scheduled_date).toISOString().slice(0, 10);
      // If any task that day was COMPLETED, the day counts as complete.
      const existing = byDate.get(key);
      if (t.status === TaskStatus.COMPLETED || !existing) {
        byDate.set(key, t.status);
      }
    }

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = 0; d < 60; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      const key = day.toISOString().slice(0, 10);
      const status = byDate.get(key);
      if (status === TaskStatus.COMPLETED) {
        streak++;
      } else {
        // First non-complete day ends the streak. The walk stops here.
        // Exception: TODAY (d=0) with no task yet — that's not a break, it's a
        // pending day. We only break if the most recent NON-empty day failed.
        if (d === 0 && status === undefined) continue;
        break;
      }
    }
    return streak;
  }
}
