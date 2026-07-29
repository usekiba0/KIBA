import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { SafetyProcessor } from '../../src/safety/safety.processor';
import { CrisisAlert } from '../../src/data/entities/crisis-alert.entity';
import { User } from '../../src/data/entities/user.entity';
import { Message } from '../../src/data/entities/message.entity';
import { MessagingService } from '../../src/messaging/messaging.service';

/**
 * The crisis alert must survive a broken email leg (2026-07-29).
 *
 * Prod had CRISIS_COACH_ALERT_EMAIL set but SMTP_HOST missing — only SMTP_PASS
 * was configured. sendEmailAlert was awaited un-guarded BEFORE the
 * coach_alerted update, so every crisis alert would have: thrown after the SMS
 * had already gone out, skipped the DB update and the SLA log, and been retried
 * by Bull (attempts: 3) — re-texting the coach each time while the admin Crisis
 * tab still showed the alert as un-alerted.
 */
describe('SafetyProcessor — coach alert delivery', () => {
  let processor: SafetyProcessor;
  let alertRepo: { findOne: jest.Mock; update: jest.Mock };
  let messaging: { sendViaTwilio: jest.Mock };
  let config: { get: jest.Mock };

  const job = {
    data: { alertId: 'a-1', userId: 'u-1', createdAt: new Date() },
  } as Job<{ alertId: string; userId: string; createdAt: Date }>;

  async function build(env: Record<string, string | undefined>) {
    alertRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'a-1', coach_alerted: false }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    messaging = { sendViaTwilio: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => env[key] ?? fallback),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyProcessor,
        { provide: getRepositoryToken(CrisisAlert), useValue: alertRepo },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue({ name: 'Bianca', phone_number: '+1' }) },
        },
        { provide: getRepositoryToken(Message), useValue: { findOne: jest.fn() } },
        { provide: MessagingService, useValue: messaging },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    processor = mod.get(SafetyProcessor);
  }

  it('still texts the coach and marks the alert when SMTP is not configured', async () => {
    await build({
      CRISIS_COACH_ALERT_PHONE: '+15550001111',
      CRISIS_COACH_ALERT_EMAIL: 'coach@usekiba.ai',
      // SMTP_HOST deliberately absent — prod's actual state on 2026-07-29.
      SMTP_PASS: 'set-but-useless-on-its-own',
    });

    await expect(processor.handleCoachAlert(job)).resolves.not.toThrow();

    expect(messaging.sendViaTwilio).toHaveBeenCalledTimes(1);
    // The DB update is what stops Bull retrying and re-texting the coach.
    expect(alertRepo.update).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ coach_alerted: true }),
    );
  });

  it('marks the alert even when the mail server itself fails', async () => {
    await build({
      CRISIS_COACH_ALERT_PHONE: '+15550001111',
      CRISIS_COACH_ALERT_EMAIL: 'coach@usekiba.ai',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
    });
    jest
      .spyOn(
        processor as unknown as { sendEmailAlert: (...a: unknown[]) => Promise<void> },
        'sendEmailAlert',
      )
      .mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(processor.handleCoachAlert(job)).resolves.not.toThrow();

    expect(messaging.sendViaTwilio).toHaveBeenCalledTimes(1);
    expect(alertRepo.update).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ coach_alerted: true }),
    );
  });
});
