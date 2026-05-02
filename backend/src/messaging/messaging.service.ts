import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as twilio from 'twilio';
import axios from 'axios';
import { structuredLog } from '../common/logger';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly twilioClient: twilio.Twilio;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('messaging') private readonly messagingQueue: Queue,
  ) {
    this.twilioClient = twilio(
      config.getOrThrow('TWILIO_ACCOUNT_SID'),
      config.getOrThrow('TWILIO_AUTH_TOKEN'),
    );
  }

  async queueMessage(to: string, body: string): Promise<void> {
    this.logger.log(`[Queue] Adding send-message job for ${to}`);
    await this.messagingQueue.add(
      'send-message',
      { to, body },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );
    this.logger.log(`[Queue] Job added for ${to}`);
  }

  async send(to: string, body: string): Promise<void> {
    const sendBlueKeyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const sendBlueSecret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');

    if (sendBlueKeyId && sendBlueSecret) {
      this.logger.log(`[Send] Checking SendBlue capability for ${to}`);
      const supported = await this.isSendBlueCapable(to, sendBlueKeyId, sendBlueSecret);
      if (supported) {
        this.logger.log(`[Send] Using SendBlue (iMessage) for ${to}`);
        await this.sendViaSendBlue(to, body, sendBlueKeyId, sendBlueSecret);
        return;
      }
      this.logger.log(`[Send] SendBlue not supported for ${to}, falling back to Twilio`);
    } else {
      this.logger.log(`[Send] No SendBlue credentials — using Twilio for ${to}`);
    }

    await this.sendViaTwilio(to, body);
  }

  private async isSendBlueCapable(to: string, keyId: string, secret: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://api.sendblue.co/api/evaluate-service`, {
        params: { number: to },
        headers: { 'sb-api-key-id': keyId, 'sb-api-secret-key': secret },
        timeout: 3000,
      });
      const result = response.data?.service === 'iMessage';
      this.logger.log(`[SendBlue] Capability check for ${to}: ${response.data?.service ?? 'unknown'}`);
      return result;
    } catch (err) {
      this.logger.warn(`[SendBlue] Capability check failed for ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  async sendViaSendBlue(to: string, body: string, keyId: string, secret: string): Promise<void> {
    try {
      const response = await axios.post(
        'https://api.sendblue.co/api/send-message',
        { number: to, content: body },
        { headers: { 'sb-api-key-id': keyId, 'sb-api-secret-key': secret } },
      );
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'send_imessage',
        to,
        messageHandle: response.data?.message_handle,
      });
    } catch (err) {
      this.logger.error(`[SendBlue] Send failed to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendViaTwilio(to: string, body: string): Promise<void> {
    const from = this.config.getOrThrow('TWILIO_PHONE_NUMBER');
    this.logger.log(`[Twilio] Sending from ${from} to ${to}`);
    try {
      const message = await this.twilioClient.messages.create({ from, to, body });
      structuredLog(this.logger, 'log', {
        service: 'messaging',
        operation: 'send_sms',
        to,
        sid: message.sid,
        status: message.status,
      });
      this.logger.log(`[Twilio] Message SID: ${message.sid} status: ${message.status}`);
    } catch (err) {
      this.logger.error(`[Twilio] Send FAILED to ${to} from ${from}: ${(err as Error).message}`);
      throw err;
    }
  }
}
