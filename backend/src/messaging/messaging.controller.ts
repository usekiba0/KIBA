import { Controller, Post, Body, UseGuards, Res, Logger, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { SendBlueWebhookGuard } from './guards/sendblue-webhook.guard';
import { TwilioWebhookDto } from './dto/twilio-webhook.dto';
import { SendBlueWebhookDto } from './dto/sendblue-webhook.dto';
import { Message } from '../data/entities/message.entity';
import { ConversationSession } from '../data/entities/conversation-session.entity';
import { User } from '../data/entities/user.entity';
import { structuredLog } from '../common/logger';

@Controller('webhooks')
export class MessagingController {
  private readonly logger = new Logger(MessagingController.name);

  constructor(
    @InjectRepository(Message) private readonly messageRepo: Repository<Message>,
    @InjectRepository(ConversationSession)
    private readonly sessionRepo: Repository<ConversationSession>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectQueue('coaching') private readonly coachingQueue: Queue,
  ) {}

  @Post('sms')
  @UseGuards(TwilioWebhookGuard)
  async handleTwilioSms(@Body() body: TwilioWebhookDto, @Res() res: Response) {
    res.type('text/xml').send('');

    // Idempotency: skip if already processed
    const existing = await this.messageRepo.findOne({ where: { twilio_sid: body.SmsMessageSid } });
    if (existing) return;

    const mediaUrls = this.extractMediaUrls(body);
    await this.coachingQueue.add('process-coaching-message', {
      from: body.From,
      body: body.Body,
      twilioSid: body.SmsMessageSid,
      numMedia: parseInt(body.NumMedia || '0'),
      mediaUrls,
      mediaContentTypes: mediaUrls.map((_, i) => body[`MediaContentType${i}`] ?? ''),
      channel: 'sms',
    });

    structuredLog(this.logger, 'log', {
      service: 'messaging',
      operation: 'inbound_sms',
      from: body.From,
    });
  }

  @Post('imsg')
  @UseGuards(SendBlueWebhookGuard)
  @HttpCode(200)
  async handleSendBlueWebhook(@Body() body: SendBlueWebhookDto) {
    await this.coachingQueue.add('process-coaching-message', {
      from: body.number,
      body: body.content,
      twilioSid: null,
      numMedia: 0,
      mediaUrls: [],
      mediaContentTypes: [],
      channel: 'imessage',
    });

    structuredLog(this.logger, 'log', {
      service: 'messaging',
      operation: 'inbound_imessage',
      from: body.number,
    });
    return { received: true };
  }

  private extractMediaUrls(body: TwilioWebhookDto): string[] {
    const num = parseInt(body.NumMedia || '0');
    return Array.from({ length: num }, (_, i) => body[`MediaUrl${i}`]).filter(Boolean) as string[];
  }
}
