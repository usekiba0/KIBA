import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { AdminService } from './admin.service';

class FlagMessageDto {
  @IsBoolean()
  flagged: boolean;

  @IsOptional()
  @IsString()
  flag_reason?: string;
}

@Controller('admin')
@UseGuards(InternalApiKeyGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('users/:userId/messages')
  getUserMessages(@Param('userId') userId: string) {
    return this.adminService.getUserMessages(userId);
  }

  @Patch('messages/:messageId/flag')
  flagMessage(
    @Param('messageId') messageId: string,
    @Body() dto: FlagMessageDto,
  ) {
    return this.adminService.flagMessage(messageId, dto.flagged, dto.flag_reason);
  }
}
