import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Message, MessageRole } from './entities/message.entity';

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class SessionCacheService {
  private readonly logger = new Logger(SessionCacheService.name);
  private readonly WINDOW_SIZE = 20;
  private readonly KEY_PREFIX = 'session:';

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    private readonly config: ConfigService,
  ) {}

  private getTTL(): number {
    return this.config.get<number>('SESSION_TIMEOUT_HOURS', 4) * 3600;
  }

  async getSessionWindow(userId: string): Promise<{ messages: SessionMessage[]; source: 'redis' | 'postgres' }> {
    const key = `${this.KEY_PREFIX}${userId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return { messages: JSON.parse(cached), source: 'redis' };
    }

    const dbMessages = await this.messageRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: this.WINDOW_SIZE,
    });

    const messages: SessionMessage[] = dbMessages.reverse().map(m => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: m.content,
    }));

    if (messages.length > 0) {
      await this.redis.setex(key, this.getTTL(), JSON.stringify(messages));
    }

    return { messages, source: 'postgres' };
  }

  async addMessage(userId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const key = `${this.KEY_PREFIX}${userId}`;
    const cached = await this.redis.get(key);

    // Always upsert — create the window if key was evicted or never set
    const messages: SessionMessage[] = cached ? JSON.parse(cached) : [];
    messages.push({ role, content });
    if (messages.length > this.WINDOW_SIZE) messages.shift();
    await this.redis.setex(key, this.getTTL(), JSON.stringify(messages));
  }

  async invalidateSession(userId: string): Promise<void> {
    await this.redis.del(`${this.KEY_PREFIX}${userId}`);
  }
}
