import { Controller, Get, Patch, Post, Delete, Param, Body, Query, UseGuards, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { AdminService } from './admin.service';
import { isLegalSlug } from './legal-content';
import { CorrectionService } from './correction.service';
import { ReferralService } from './referral.service';
import { ScheduleService } from '../accountability/schedule.service';
import { CheckinService } from '../accountability/checkin.service';
import { UserStatus, OnboardingStage } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

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

class CreateReferralCodeDto {
  // Codes are canonicalized (uppercase, whitespace/dashes stripped) before
  // storage, so validate loosely here and let the service do the narrowing.
  @IsString() @MinLength(3) @MaxLength(32) code: string;
  @IsString() @MinLength(1) @MaxLength(120) owner: string;
  // 1 year is a deliberate ceiling: a typo'd 3650 would hand out a decade of
  // free product with no way to claw it back from an already-created Stripe sub.
  @IsInt() @Min(1) @Max(365) trial_days: number;
  @IsOptional() @IsInt() @Min(1) @Max(100000) max_redemptions?: number;
}

class ToggleReferralCodeDto {
  @IsBoolean() active: boolean;
}

@Controller('admin')
@UseGuards(InternalApiKeyGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly correctionService: CorrectionService,
    private readonly scheduleService: ScheduleService,
    private readonly checkinService: CheckinService,
    private readonly referralService: ReferralService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  @Get('referral-codes')
  listReferralCodes() {
    return this.referralService.listCodes();
  }

  @Post('referral-codes')
  async createReferralCode(@Body() dto: CreateReferralCodeDto) {
    const created = await this.referralService.createCode({
      code: dto.code,
      owner: dto.owner,
      trialDays: dto.trial_days,
      maxRedemptions: dto.max_redemptions ?? null,
    });
    // Matches the rest of this controller: report the conflict in the body
    // rather than throwing, so the dashboard can show it inline.
    if (!created) return { ok: false, error: 'that code already exists' };
    return { ok: true, code: created };
  }

  @Patch('referral-codes/:id/active')
  async toggleReferralCode(@Param('id') id: string, @Body() dto: ToggleReferralCodeDto) {
    const ok = await this.referralService.setActive(id, dto.active);
    return ok ? { ok: true } : { ok: false, error: 'code not found' };
  }

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // Legal documents. Reads are also exposed PUBLICLY via LegalController — a
  // carrier reviewer has no credentials — but edits stay behind the key.
  @Get('legal/:slug')
  getLegalDoc(@Param('slug') slug: string) {
    if (!isLegalSlug(slug)) throw new BadRequestException('unknown document');
    return this.adminService.getLegalDoc(slug);
  }

  @Patch('legal/:slug')
  updateLegalDoc(@Param('slug') slug: string, @Body() body: { title?: string; body?: string }) {
    if (!isLegalSlug(slug)) throw new BadRequestException('unknown document');
    return this.adminService.updateLegalDoc(slug, body);
  }

  @Delete('legal/:slug')
  resetLegalDoc(@Param('slug') slug: string) {
    if (!isLegalSlug(slug)) throw new BadRequestException('unknown document');
    return this.adminService.resetLegalDoc(slug);
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

  // Proxy + transcode inbound media (HEIC -> JPEG) so iPhone photos render in the
  // admin chat view. Guarded by the same internal-key guard as the rest of /admin.
  @Get('media')
  async getMedia(@Query('url') url: string, @Res() res: Response) {
    const { buffer, contentType } = await this.adminService.getProxiedMedia(url);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
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

  /**
   * Manually trigger today's check-in for a single user. Diagnostic only —
   * confirms the Bull queue is consuming + the send pipeline works without
   * waiting for the user's actual check-in time. Idempotent against tomorrow's
   * scheduled job (different jobId minute).
   *
   * Returns 404 for unknown user, 409 if the user can't receive check-ins
   * (cancelled / not onboarded), 200 with { enqueued: true } on success.
   */
  @Post('users/:userId/trigger-checkin')
  async triggerCheckin(@Param('userId') userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return { ok: false, error: 'user not found' };
    if (user.status === UserStatus.CANCELLED) return { ok: false, error: 'user cancelled' };
    if (user.onboarding_stage !== OnboardingStage.COMPLETE) return { ok: false, error: 'user not onboarded' };
    // 1s delay so the round-trip still goes through the worker (vs an inline
    // send), which is what we're actually trying to test.
    await this.checkinService.scheduleOneShot(userId, 1_000);
    return { ok: true, enqueued: true, fire_at_iso: new Date(Date.now() + 1_000).toISOString() };
  }
}
