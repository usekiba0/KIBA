import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class SendBlueWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKeyId = request.header('sb-api-key-id');
    const providedSecret = request.header('sb-api-secret-key');

    const expectedKeyId = this.config.get<string>('SENDBLUE_API_KEY_ID');
    const expectedSecret = this.config.get<string>('SENDBLUE_API_SECRET_KEY');

    // If SendBlue is not configured, reject all iMessage webhooks
    if (!expectedKeyId || !expectedSecret) {
      throw new UnauthorizedException('SendBlue not configured');
    }

    // Use timing-safe comparison to prevent timing attacks
    const keyIdValid = providedKeyId
      ? crypto.timingSafeEqual(Buffer.from(providedKeyId), Buffer.from(expectedKeyId))
      : false;
    const secretValid = providedSecret
      ? crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret))
      : false;

    if (!keyIdValid || !secretValid) {
      throw new UnauthorizedException('Invalid SendBlue webhook credentials');
    }
    return true;
  }
}
