import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConversationSession, SessionStatus } from './entities/conversation-session.entity';
import { SessionCacheService } from './session-cache.service';
import { structuredLog } from '../common/logger';

export interface SessionBoundary {
  sessionId: string;
  isNewSession: boolean;
  minutesSinceLastMessage: number;
  shouldSummarise: boolean;
  /**
   * The session that was JUST closed by this boundary (only set when
   * shouldSummarise is true). `sessionId` above is the fresh, empty session —
   * summarisation and relationship-memory must run against THIS id, not that one.
   * (Before this field, summarisation ran against the empty new session and
   * silently produced nothing — fixed 2026-06-24.)
   */
  closedSessionId?: string;
}

@Injectable()
export class SessionBoundaryService {
  private readonly logger = new Logger(SessionBoundaryService.name);
  private readonly MESSAGE_COUNT_THRESHOLD = 30;

  constructor(
    @InjectRepository(ConversationSession) private readonly sessionRepo: Repository<ConversationSession>,
    private readonly config: ConfigService,
    private readonly sessionCache: SessionCacheService,
  ) {}

  async checkAndHandle(userId: string): Promise<SessionBoundary> {
    const timeoutHours = this.config.get<number>('SESSION_TIMEOUT_HOURS', 4);
    const activeSession = await this.sessionRepo.findOne({
      where: { user_id: userId, status: SessionStatus.ACTIVE },
      order: { started_at: 'DESC' },
    });

    if (!activeSession) {
      const newSession = await this.sessionRepo.save({ user_id: userId });
      return { sessionId: newSession.id, isNewSession: true, minutesSinceLastMessage: 999, shouldSummarise: false };
    }

    const now = new Date();
    const lastMsg = activeSession.last_message_at ?? activeSession.started_at;
    const minutesElapsed = (now.getTime() - lastMsg.getTime()) / 60000;
    const isExpired = minutesElapsed > timeoutHours * 60;
    const overMessageThreshold = activeSession.message_count >= this.MESSAGE_COUNT_THRESHOLD;

    if (isExpired || overMessageThreshold) {
      const trigger = isExpired ? 'session_expiry' : 'message_count';
      await this.sessionRepo.update(activeSession.id, {
        status: SessionStatus.COMPLETED,
        ended_at: now,
      });
      await this.sessionCache.invalidateSession(userId);
      const newSession = await this.sessionRepo.save({ user_id: userId });

      structuredLog(this.logger, 'log', {
        service: 'session', operation: 'session_boundary',
        userId, trigger, minutesElapsed,
      });

      return { sessionId: newSession.id, isNewSession: true, minutesSinceLastMessage: minutesElapsed, shouldSummarise: true, closedSessionId: activeSession.id };
    }

    return { sessionId: activeSession.id, isNewSession: false, minutesSinceLastMessage: minutesElapsed, shouldSummarise: false };
  }

  async recordMessage(sessionId: string): Promise<void> {
    await this.sessionRepo.increment({ id: sessionId }, 'message_count', 1);
    await this.sessionRepo.update(sessionId, { last_message_at: new Date() });
  }
}
