import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Message } from './entities/message.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
  ) {}

  async listUsers() {
    return this.userRepo.find({
      select: ['id', 'name', 'phone_number', 'status', 'crisis_hold', 'last_active_at', 'registered_at'],
      order: { last_active_at: 'DESC' },
    });
  }

  async getUserMessages(userId: string) {
    return this.messageRepo.find({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
      select: ['id', 'session_id', 'role', 'content', 'created_at', 'token_count', 'flagged', 'flag_reason', 'message_type'],
    });
  }

  async flagMessage(messageId: string, flagged: boolean, flagReason?: string) {
    await this.messageRepo.update(messageId, {
      flagged,
      flag_reason: flagged ? (flagReason ?? null) : null,
    });
    return this.messageRepo.findOne({ where: { id: messageId } });
  }
}
