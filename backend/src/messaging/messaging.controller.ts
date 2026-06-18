import { Controller, Post, Body, UseGuards, Res, Logger, HttpCode, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwilioWebhookGuard } from './guards/twilio-webhook.guard';
import { SendBlueWebhookGuard } from './guards/sendblue-webhook.guard';
import { TwilioWebhookDto } from './dto/twilio-webhook.dto';
import { MessageDebouncerService } from './message-debouncer.service';
import { MessagingService } from './messaging.service';
import { isInboundReaction } from './inbound-reaction';
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
    private readonly debouncer: MessageDebouncerService,
    private readonly messagingService: MessagingService,
  ) {}

  @Post('sms')
  @UseGuards(TwilioWebhookGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async handleTwilioSms(@Body() body: TwilioWebhookDto, @Res() res: Response) {
    res.type('text/xml').send('');

    // Idempotency: skip if already processed (debouncer also dedupes by SID
    // in-memory, but this catches webhook retries that arrive after the buffer
    // has already flushed and a Message row exists for the SID).
    if (body.SmsMessageSid) {
      const existing = await this.messageRepo.findOne({ where: { twilio_sid: body.SmsMessageSid } });
      if (existing) return;
    }

    const mediaUrls = this.extractMediaUrls(body);

    // Drop iMessage tapbacks that fell back to SMS/RCS as literal `Liked "..."`
    // text. They carry no new intent and would otherwise trigger a real AI turn.
    if (mediaUrls.length === 0 && isInboundReaction(body.Body)) {
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'inbound_reaction_ignored',
        from: body.From,
      });
      return;
    }

    this.debouncer.push({
      from: body.From,
      text: body.Body ?? '',
      twilioSid: body.SmsMessageSid ?? null,
      mediaUrls,
      mediaContentTypes: mediaUrls.map((_, i) => body[`MediaContentType${i}`] ?? ''),
      channel: 'sms',
      // Twilio webhooks have no client-side timestamp; receipt order is the best
      // proxy and is usually correct for SMS (no multi-part bursts like iMessage).
      dateSent: Date.now(),
      uniqueId: body.SmsMessageSid ?? null,
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
  async handleSendBlueWebhook(@Body() body: Record<string, unknown>) {
    this.logger.log(`[SendBlue] Raw webhook payload: ${JSON.stringify(body)}`);

    const from = ((body.number || body.from_number || body.sender) as string) || '';
    const content = ((body.content || body.body || body.text || '') as string);
    const mediaUrl = ((body.media_url || body.mediaUrl || body.attachment_url) as string) || undefined;
    const messageHandle = (body.message_handle as string) || null;
    const dateSentIso = (body.date_sent as string) || '';
    const dateSent = dateSentIso ? Date.parse(dateSentIso) || Date.now() : Date.now();

    if (!from || (!content && !mediaUrl)) {
      this.logger.warn(`[SendBlue] Missing from or content/media — from:${from}`);
      return { received: true };
    }

    // Send a read receipt back so the user sees "Read" in iMessage immediately —
    // makes KIBA feel present instead of leaving messages stuck on "Delivered"
    // for however long the AI takes to reply. Fire-and-forget: never block the
    // webhook ack on this. Internal errors get logged but don't bubble — read
    // receipts are best-effort UX, not correctness.
    setImmediate(() => {
      this.messagingService.sendReadReceipt(from).catch((err) => {
        this.logger.warn(`[SendBlue] Read receipt error for ${from}: ${(err as Error).message}`);
      });
    });

    // Drop iMessage tapbacks (Liked "...", Loved "...", Removed a heart from "...").
    // SendBlue forwards them as normal inbound text with no structured flag, so we
    // detect the reaction wording. Reactions never carry media, so gate on its
    // absence to avoid ever dropping a real photo + caption.
    if (!mediaUrl && isInboundReaction(content)) {
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'inbound_reaction_ignored',
        from,
      });
      return { received: true };
    }

    const mediaUrls = mediaUrl ? [mediaUrl] : [];
    const mediaContentTypes = mediaUrl ? [this.guessContentType(mediaUrl)] : [];
    this.debouncer.push({
      from,
      text: content,
      twilioSid: null,
      mediaUrls,
      mediaContentTypes,
      channel: 'imessage',
      dateSent,
      uniqueId: messageHandle,
    });

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

  private guessContentType(url: string): string {
    // SendBlue forwards iMessage attachments through a generic CDN URL with the
    // original filename preserved. Voice notes land as `.caf` (iOS Core Audio),
    // video as `.mov`, etc. We MUST detect by extension — defaulting unknowns to
    // image/jpeg routed an audio file into vision and produced the
    // "couldn't read that photo" loop Karibi hit on 5/26.
    const lower = url.toLowerCase().split('?')[0];
    // Image
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    // Audio (iMessage voice notes most commonly arrive as .caf or .m4a)
    if (lower.endsWith('.caf')) return 'audio/x-caf';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.amr')) return 'audio/amr';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.wav')) return 'audio/wav';
    // Video
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    // Unknown — let downstream decide rather than assuming image
    return 'application/octet-stream';
  }
}
