import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guards admin-only endpoints (data export, deletion, crisis alert resolution)
 * using a shared internal API key. In production, restrict these endpoints to
 * your internal network or a dedicated admin service.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.header('x-internal-key');
    const expected = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing internal API key');
    }
    return true;
  }
}
