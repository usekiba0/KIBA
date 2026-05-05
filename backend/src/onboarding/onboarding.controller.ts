import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OnboardingService } from './onboarding.service';
import { OnboardingFormDto, SetupIntentDto } from './dto/onboarding-form.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // Strict rate limit: max 10 requests per minute per IP (prevents Stripe customer creation abuse)
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  @Post('setup-intent')
  @HttpCode(200)
  async createSetupIntent(@Body() dto: SetupIntentDto) {
    return this.onboardingService.createSetupIntent(dto.name, dto.phone_number);
  }

  @Throttle({ strict: { limit: 20, ttl: 60000 } })
  @Get('check-phone')
  async checkPhone(@Query('phone') phone: string) {
    return this.onboardingService.checkPhone(phone);
  }

  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @Post('submit')
  async submit(@Body() dto: OnboardingFormDto) {
    return this.onboardingService.submit(dto);
  }
}
