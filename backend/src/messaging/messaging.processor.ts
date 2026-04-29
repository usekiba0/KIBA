import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MessagingService } from './messaging.service';

@Processor('messaging')
export class MessagingProcessor {
  private readonly logger = new Logger(MessagingProcessor.name);

  constructor(private readonly messagingService: MessagingService) {}

  @Process('send-message')
  async handleSendMessage(job: Job<{ to: string; body: string }>) {
    await this.messagingService.send(job.data.to, job.data.body);
  }
}
