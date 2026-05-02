import { Process, Processor, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MessagingService } from './messaging.service';

@Processor('messaging')
export class MessagingProcessor {
  private readonly logger = new Logger(MessagingProcessor.name);

  constructor(private readonly messagingService: MessagingService) {}

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`[Queue] Processing job ${job.id} — to: ${job.data.to} type: ${job.data.type ?? 'sms'}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`[Queue] Job ${job.id} FAILED after ${job.attemptsMade} attempts — ${err.message}`, err.stack);
  }

  @Process('send-message')
  async handleSendMessage(job: Job<{ to: string; body: string; type?: string }>) {
    try {
      this.logger.log(`[SMS] Sending to ${job.data.to}`);
      await this.messagingService.send(job.data.to, job.data.body);
      this.logger.log(`[SMS] Sent successfully to ${job.data.to}`);
    } catch (err) {
      this.logger.error(`[SMS] Failed to send to ${job.data.to}: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }
}
