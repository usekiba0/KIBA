import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};
    let status = 'ok';

    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
      status = 'degraded';
    }

    try {
      await this.redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      status = 'degraded';
    }

    return { status, checks, timestamp: new Date().toISOString() };
  }
}

/**
 * Lightweight deploy probe — answers "what commit is actually running right now?"
 * Render auto-injects RENDER_GIT_COMMIT into every deploy's environment, so this
 * lets us confirm a push has gone live without opening the dashboard. No auth:
 * it leaks nothing but the commit SHA, and it has to be hittable by a bare curl.
 */
@Controller('version')
export class VersionController {
  @Get()
  version() {
    const commit = process.env.RENDER_GIT_COMMIT ?? 'unknown';
    return {
      commit,
      short: commit === 'unknown' ? 'unknown' : commit.slice(0, 7),
      branch: process.env.RENDER_GIT_BRANCH ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }
}
