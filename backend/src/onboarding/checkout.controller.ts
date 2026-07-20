import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { CheckoutService, PlanId } from './checkout.service';

class CreateSessionDto {
  @IsString() @MinLength(1) @MaxLength(500) t: string;
  @IsIn(['monthly', 'yearly']) plan: PlanId;
}

/**
 * Public endpoints behind the texted plan-selection link. Unguarded by design —
 * the lead taps this from their phone with no account and no session. The link
 * token IS the credential: HMAC-signed, expiring, and scoped to one user id.
 *
 * Nothing sensitive is exposed even if a link leaks: a first name, the public
 * prices, and the ability to start a checkout that can only ever attach to that
 * one user's subscription.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('plans')
  async getPlans(@Query('t') token: string) {
    const result = await this.checkoutService.getPlans(token ?? '');
    // Errors come back in the body with HTTP 200 so the page can render a
    // friendly "this link expired, text KIBA for a new one" state instead of a
    // browser error screen.
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, ...result.payload };
  }

  @Post('session')
  @HttpCode(200)
  async createSession(@Body() dto: CreateSessionDto) {
    const result = await this.checkoutService.createSession(dto.t, dto.plan);
    if (!result.ok) return { ok: false, error: result.reason };
    return { ok: true, url: result.url };
  }
}
