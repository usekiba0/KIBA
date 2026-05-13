import { Controller, Post, Body, UseGuards, Res, Logger, HttpCode, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { SendBlueWebhookGuard } from './guards/sendblue-webhook.guard';
import { TwilioWebhookDto } from './dto/twilio-webhook.dto';
import { SendBlueWebhookDto } from './dto/sendblue-webhook.dto';
import { CoachingProcessor } from './coaching.processor';
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
    private readonly coachingProcessor: CoachingProcessor,
  ) {}

  @Post('sms')
  @UseGuards(TwilioWebhookGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async handleTwilioSms(@Body() body: TwilioWebhookDto, @Res() res: Response) {
    res.type('text/xml').send('');

    // Idempotency: skip if already processed
    const existing = await this.messageRepo.findOne({ where: { twilio_sid: body.SmsMessageSid } });
    if (existing) return;

    const mediaUrls = this.extractMediaUrls(body);
    const smsData = {
      from: body.From,
      body: body.Body ?? '',
      twilioSid: body.SmsMessageSid ?? null,
      numMedia: parseInt(body.NumMedia || '0'),
      mediaUrls,
      mediaContentTypes: mediaUrls.map((_, i) => body[`MediaContentType${i}`] ?? ''),
      channel: 'sms' as const,
    };
    // Process directly — Bull/Upstash blocking connections are unreliable on Render
    this.coachingProcessor.process(smsData).catch((err) =>
      this.logger.error(`[SMS] Processing failed for ${body.From}: ${(err as Error).message}\n${(err as Error).stack}`),
    );

    structuredLog(this.logger, 'log', {
      service: 'messaging',
      operation: 'inbound_sms',
      from: body.From,
    });
  }

  @Post('imsg')
  @UseGuards(SendBlueWebhookGuard)
  @HttpCode(200)
  async handleSendBlueWebhook(@Body() body: Record<string, unknown>) {
    this.logger.log(`[SendBlue] Raw webhook payload: ${JSON.stringify(body)}`);

    const from = (body.number ?? body.from_number ?? body.sender) as string;
    const content = (body.content ?? body.body ?? body.text ?? '') as string;
    const mediaUrl = (body.media_url ?? body.mediaUrl ?? body.attachment_url) as string | undefined;

    if (!from || (!content && !mediaUrl)) {
      this.logger.warn(`[SendBlue] Missing from or content/media — from:${from}`);
      return { received: true };
    }

    const mediaUrls = mediaUrl ? [mediaUrl] : [];
    const mediaContentTypes = mediaUrl ? ['image/jpeg'] : [];
    const imsgData = {
      from,
      body: content || '[image]',
      twilioSid: null,
      numMedia: mediaUrl ? 1 : 0,
      mediaUrls,
      mediaContentTypes,
      channel: 'imessage' as const,
    };
    // Process directly — Bull/Upstash blocking connections are unreliable on Render
    this.coachingProcessor.process(imsgData).catch((err) =>
      this.logger.error(`[iMsg] Processing failed for ${from}: ${(err as Error).message}\n${(err as Error).stack}`),
    );

    structuredLog(this.logger, 'log', {
      service: 'messaging',
      operation: 'inbound_imessage',
      from,
      hasMedia: !!mediaUrl,
    });
    return { received: true };
  }

  private extractMediaUrls(body: TwilioWebhookDto): string[] {
    const num = parseInt(body.NumMedia || '0');
    return Array.from({ length: num }, (_, i) => body[`MediaUrl${i}`]).filter(Boolean) as string[];
  }
}
