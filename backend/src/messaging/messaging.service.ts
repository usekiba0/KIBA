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
    await this.messagingQueue.add('send-message', { to, body }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    });
  }

  async send(to: string, body: string): Promise<void> {
    const sendBlueKeyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const sendBlueSecret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');

    if (sendBlueKeyId && sendBlueSecret) {
      const supported = await this.isSendBlueCapable(to, sendBlueKeyId, sendBlueSecret);
      if (supported) {
        await this.sendViaSendBlue(to, body, sendBlueKeyId, sendBlueSecret);
        return;
      }
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
      return response.data?.service === 'iMessage';
    } catch {
      return false;
    }
  }

  async sendViaSendBlue(to: string, body: string, keyId: string, secret: string): Promise<void> {
    const response = await axios.post(
      'https://api.sendblue.co/api/send-message',
      { number: to, content: body },
      { headers: { 'sb-api-key-id': keyId, 'sb-api-secret-key': secret } },
    );
    structuredLog(this.logger, 'log', {
      service: 'messaging', operation: 'send_imessage', to,
      messageHandle: response.data?.message_handle,
    });
  }

  async sendViaTwilio(to: string, body: string): Promise<void> {
    const message = await this.twilioClient.messages.create({
      from: this.config.getOrThrow('TWILIO_PHONE_NUMBER'),
      to,
      body,
    });
    structuredLog(this.logger, 'log', {
      service: 'messaging', operation: 'send_sms', to, sid: message.sid,
    });
  }
}
