import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsPhoneNumber, IsString, MaxLength } from 'class-validator';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { AdminService } from './admin.service';

class FlagMessageDto {
  @IsBoolean()
  flagged: boolean;

  @IsOptional()
  @IsString()
  flag_reason?: string;
}

class UpdateUserStatusDto {
  @IsEnum(['active', 'paused', 'cancelled'])
  status: 'active' | 'paused' | 'cancelled';
}

class ResolveAlertDto {
  @IsString()
  @MaxLength(100)
  resolved_by: string;
}

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  coach_alert_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coach_alert_email?: string;
}

@Controller('admin')
@UseGuards(InternalApiKeyGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.adminService.updateSettings(dto);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('users/:userId')
  getUserDetail(@Param('userId') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Get('users/:userId/messages')
  getUserMessages(@Param('userId') userId: string) {
    return this.adminService.getUserMessages(userId);
  }

  @Get('users/:userId/subscription')
  getUserSubscription(@Param('userId') userId: string) {
    return this.adminService.getUserSubscriptionDetail(userId);
  }

  @Patch('users/:userId/status')
  updateUserStatus(@Param('userId') userId: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(userId, dto.status);
  }

  @Patch('messages/:messageId/flag')
  flagMessage(@Param('messageId') messageId: string, @Body() dto: FlagMessageDto) {
    return this.adminService.flagMessage(messageId, dto.flagged, dto.flag_reason);
  }

  @Get('crisis-alerts')
  listCrisisAlerts(@Query('include_resolved') includeResolved?: string) {
    return this.adminService.listCrisisAlerts(includeResolved === 'true');
  }

  @Patch('crisis-alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string, @Body() dto: ResolveAlertDto) {
    return this.adminService.resolveAlert(alertId, dto.resolved_by);
  }
}
