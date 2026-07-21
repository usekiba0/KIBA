import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { isLegalSlug } from './legal-content';

/**
 * PUBLIC legal document endpoint — deliberately unauthenticated.
 *
 * The privacy policy and SMS terms have to be readable by anyone, including a
 * carrier reviewer during A2P registration who will not have credentials. This
 * is the one admin-adjacent surface that must NOT sit behind InternalApiKeyGuard.
 *
 * Read-only. Writes live on AdminController behind the key.
 */
@Controller('legal')
export class LegalController {
  constructor(private readonly adminService: AdminService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    if (!isLegalSlug(slug)) {
      // Explicit allow-list, so this endpoint can never be walked to read
      // arbitrary app_settings keys.
      throw new NotFoundException('unknown document');
    }
    return this.adminService.getLegalDoc(slug);
  }
}
