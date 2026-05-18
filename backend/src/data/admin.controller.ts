import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { AdminService } from './admin.service';
import { CorrectionService } from './correction.service';
import { ScheduleService } from '../accountability/schedule.service';

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

class AcceptCorrectionDto {
  @IsString() @MinLength(1) @MaxLength(100) reviewed_by: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsString() @MinLength(1) content: string;
}

class AppendCorrectionDto {
  @IsString() @MinLength(1) @MaxLength(100) reviewed_by: string;
  @IsString() knowledge_id: string;
  @IsString() @MinLength(1) appended_content: string;
}

class RejectCorrectionDto {
  @IsString() @MinLength(1) @MaxLength(100) reviewed_by: string;
  @IsOptional() @IsString() note?: string;
}

class ToggleKnowledgeDto {
  @IsBoolean() active: boolean;
}

class UpdateUserOffsetDto {
  @IsInt() @Min(-720) @Max(840) utc_offset_minutes: number;
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
  constructor(
    private readonly adminService: AdminService,
    private readonly correctionService: CorrectionService,
    private readonly scheduleService: ScheduleService,
  ) {}

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

  @Delete('users/by-phone/:phone')
  deleteUserByPhone(@Param('phone') phone: string) {
    return this.adminService.deleteUserByPhone(decodeURIComponent(phone));
  }

  @Get('corrections')
  listCorrections(@Query('include_reviewed') includeReviewed?: string) {
    return this.correctionService.listCorrections(includeReviewed === 'true');
  }

  @Patch('corrections/:id/accept')
  acceptCorrection(@Param('id') id: string, @Body() dto: AcceptCorrectionDto) {
    return this.correctionService.accept({
      correctionId: id,
      reviewedBy: dto.reviewed_by,
      title: dto.title,
      content: dto.content,
    });
  }

  @Patch('corrections/:id/append')
  appendCorrection(@Param('id') id: string, @Body() dto: AppendCorrectionDto) {
    return this.correctionService.append({
      correctionId: id,
      reviewedBy: dto.reviewed_by,
      knowledgeId: dto.knowledge_id,
      appendedContent: dto.appended_content,
    });
  }

  @Patch('corrections/:id/reject')
  rejectCorrection(@Param('id') id: string, @Body() dto: RejectCorrectionDto) {
    return this.correctionService.reject({
      correctionId: id,
      reviewedBy: dto.reviewed_by,
      note: dto.note,
    });
  }

  @Get('knowledge')
  listKnowledge() {
    return this.correctionService.listKnowledge();
  }

  @Patch('knowledge/:id/active')
  toggleKnowledge(@Param('id') id: string, @Body() dto: ToggleKnowledgeDto) {
    return this.correctionService.setKnowledgeActive(id, dto.active);
  }

  @Get('users/:userId/reminders')
  listUserReminders(@Param('userId') userId: string) {
    return this.scheduleService.listForUser(userId);
  }

  @Delete('reminders/:reminderId')
  async cancelReminder(@Param('reminderId') reminderId: string) {
    const reminder = await this.scheduleService.cancel(reminderId);
    if (!reminder) return { cancelled: false, message: 'reminder not found' };
    return { cancelled: true, reminder };
  }

  @Patch('users/:userId/timezone')
  updateUserTimezone(@Param('userId') userId: string, @Body() dto: UpdateUserOffsetDto) {
    return this.adminService.updateUserOffset(userId, dto.utc_offset_minutes);
  }
}
