import { Controller, Get, Delete, Param, HttpCode, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { DataRightsService } from './data-rights.service';

@Controller('users')
@UseGuards(InternalApiKeyGuard)
export class DataRightsController {
  constructor(private readonly dataRightsService: DataRightsService) {}

  @Get(':userId/export')
  async exportData(@Param('userId') userId: string) {
    return this.dataRightsService.exportUserData(userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async deleteData(@Param('userId') userId: string) {
    await this.dataRightsService.deleteUserData(userId);
  }
}
