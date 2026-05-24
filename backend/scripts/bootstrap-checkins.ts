/**
 * One-off: enqueue a daily check-in Bull job for every COMPLETE user that
 * doesn't currently have one in flight. Run AFTER the
 * BackfillNullCheckinTimeTo9am migration has set checkin_time for legacy rows.
 *
 * The migration alone only sets the field; without an enqueued send-checkin
 * job nothing fires. After the first job runs, the processor self-reschedules
 * so this script only needs to run once per cohort.
 *
 * Safe to re-run: scheduleCheckin uses a deterministic jobId (userId+target-
 * minute), so Bull rejects duplicate enqueues for the same user/time bucket.
 *
 * Usage (from backend/):
 *   npx ts-node scripts/bootstrap-checkins.ts
 *
 * Optional env:
 *   DRY_RUN=1            -> log who would be scheduled, don't enqueue
 *   USER_ID=<uuid>       -> bootstrap only this user (debugging)
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '../src/app.module';
import { CheckinService } from '../src/accountability/checkin.service';
import { User, OnboardingStage, UserStatus } from '../src/data/entities/user.entity';

async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const singleUserId = process.env.USER_ID ?? null;

  const log = new Logger('bootstrap-checkins');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    const checkinService = app.get(CheckinService);

    const where = singleUserId
      ? { id: singleUserId }
      : { onboarding_stage: OnboardingStage.COMPLETE };
    const users = await userRepo.find({ where });

    log.log(`Found ${users.length} candidate user(s)${dryRun ? ' (DRY RUN)' : ''}`);

    let scheduled = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      // Mirror the runtime guards in the processor so we don't bootstrap users
      // who'd immediately be no-op'd anyway.
      if (user.status === UserStatus.CANCELLED) { skipped++; continue; }
      if (user.onboarding_stage !== OnboardingStage.COMPLETE) { skipped++; continue; }
      if (!user.checkin_time) { skipped++; continue; }

      if (dryRun) {
        log.log(`would schedule ${user.id} ${user.phone_number} checkin_time=${user.checkin_time} utc_offset=${user.utc_offset_minutes ?? 'null'}`);
        scheduled++;
        continue;
      }

      try {
        await checkinService.scheduleCheckin(user);
        scheduled++;
      } catch (err) {
        failed++;
        log.error(`schedule failed for ${user.id}: ${(err as Error).message}`);
      }
    }

    log.log(`done — scheduled:${scheduled} skipped:${skipped} failed:${failed}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
