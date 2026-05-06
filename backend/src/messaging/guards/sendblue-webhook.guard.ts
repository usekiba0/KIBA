import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SendBlueWebhookGuard implements CanActivate {
  private readonly logger = new Logger(SendBlueWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    this.logger.log(`[SendBlue] Inbound webhook from ${request.ip} headers: ${JSON.stringify(request.headers)}`);
    return true;
  }
}
