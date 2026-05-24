import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { User, UserStatus } from '../data/entities/user.entity';
import { structuredLog } from '../common/logger';

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('accountability') private readonly queue: Queue,
  ) {}

  computeDelayMs(checkinTime: string, utcOffsetMinutes = 0): number {
    const [hours, minutes] = checkinTime.split(':').map(Number);

    // Convert user's local time → UTC by subtracting their offset
    const localTotalMins = hours * 60 + minutes;
    const utcTotalMins = ((localTotalMins - utcOffsetMinutes) % 1440 + 1440) % 1440;
    const utcH = Math.floor(utcTotalMins / 60);
    const utcM = utcTotalMins % 60;

    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(utcH, utcM, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  async scheduleCheckin(user: User): Promise<any> {
    if (!user.checkin_time) return undefined;

    // Pass the user's offset so the delay targets THEIR 09:00, not server UTC 09:00.
    // Without this, US-Eastern users were getting check-ins at 04:00–05:00 local.
    const delay = this.computeDelayMs(user.checkin_time, user.utc_offset_minutes ?? 0);
    const job = await this.queue.add(
      'send-checkin',
      { userId: user.id },
      { delay },
    );

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'checkin_scheduled',
      userId: user.id,
      delayMs: delay,
    });

    return job;
  }

  async scheduleOneShot(userId: string, delayMs: number): Promise<void> {
    await this.queue.add('send-checkin', { userId }, { delay: delayMs });
    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'oneshot_scheduled',
      userId,
      delayMs,
    });
  }

  async scheduleAllCheckins(): Promise<void> {
    const users = await this.userRepo.find({
      where: [
        { status: UserStatus.ACTIVE },
        { status: UserStatus.TRIAL },
      ],
    });

    for (const user of users) {
      await this.scheduleCheckin(user);
    }
  }
}
