import { Injectable } from '@nestjs/common';
import { AntiGhostService } from './anti-ghost.service';
import { GhostState } from '../data/entities/anti-ghost-state.entity';

export enum MessageRoute {
  PROOF = 'proof',
  CHECKIN_RESPONSE = 'checkin_response',
  COACHING = 'coaching',
}

export interface RouteContext {
  userId: string;
  hasMedia: boolean;
  body: string;
}

@Injectable()
export class MessageRouterService {
  constructor(private readonly antiGhostService: AntiGhostService) {}

  async route(ctx: RouteContext): Promise<MessageRoute> {
    if (ctx.hasMedia) return MessageRoute.PROOF;

    const ghostState = await this.antiGhostService.getState(ctx.userId);
    if (ghostState !== GhostState.ACTIVE) return MessageRoute.CHECKIN_RESPONSE;

    return MessageRoute.COACHING;
  }
}
