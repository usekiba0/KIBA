import { Controller, Post, Param, Body, HttpCode, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { SafetyService } from './safety.service';

@Controller('safety')
@UseGuards(InternalApiKeyGuard)
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('alerts/:alertId/resolve')
  @HttpCode(200)
  async resolveAlert(
    @Param('alertId') alertId: string,
    @Body('resolved_by') resolvedBy: string,
  ) {
    await this.safetyService.resolveAlert(alertId, resolvedBy ?? 'coach');
    return { resolved: true };
  }
}
