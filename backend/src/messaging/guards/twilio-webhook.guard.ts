import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class TwilioWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.header('X-Twilio-Signature');
    if (!signature) throw new UnauthorizedException('Missing X-Twilio-Signature');

    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');

    // Use APP_BASE_URL to reconstruct the correct full URL.
    // request.protocol is unreliable behind TLS-terminating proxies (returns 'http').
    // APP_BASE_URL must be the public-facing HTTPS base URL, e.g. https://api.ryke.ai
    const baseUrl = this.config.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');
    const url = `${baseUrl}${request.originalUrl}`;

    const isValid = twilio.validateRequest(authToken, signature, url, request.body);

    if (!isValid) throw new UnauthorizedException('Invalid Twilio signature');
    return true;
  }
}
