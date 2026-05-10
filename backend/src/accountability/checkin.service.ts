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

  computeDelayMs(checkinTime: string): number {
    const [hours, minutes] = checkinTime.split(':').map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  async scheduleCheckin(user: User): Promise<any> {
    if (!user.checkin_time) return undefined;

    const delay = this.computeDelayMs(user.checkin_time);
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
